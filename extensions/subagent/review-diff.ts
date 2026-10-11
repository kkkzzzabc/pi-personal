/**
 * `review_diff`: a read-only diff tool registered only in reviewer children.
 *
 * Shows staged and unstaged changes against the HEAD captured when the child
 * launched, plus untracked file paths. Committed ranges are unsupported.
 * Git runs with fixed arguments through execFile, never through a shell.
 * Modeled on pi-subagents' `watchdog_diff`; see
 * docs/plans/2026-10-11-subagent-extension.md §4.
 */
import { execFile, execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REVIEW_DIFF_TOOL = "review_diff";
export const REVIEW_DIFF_MAX_CHARS = 24_000;
export const MAX_UNTRACKED_FILES = 50;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

export const NO_BASELINE_TEXT =
	"review_diff unavailable: this directory has no Git repository with a HEAD commit. Inspect the files named in the task with read instead.";
export const HEAD_MOVED_TEXT =
	"HEAD changed since this reviewer started. Committed changes are not supported; ask the parent to relaunch the reviewer or supply a diff file.";

export interface DiffBaseline {
	root: string;
	head: string;
}

/** Repository root and HEAD at child launch, or undefined outside a repository with commits. */
export function captureBaseline(cwd: string): DiffBaseline | undefined {
	try {
		const out = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
		const lines = out.trim().split(/\r?\n/);
		const head = lines.pop();
		const root = lines.join("\n");
		return root && head && /^[0-9a-f]{40,64}$/.test(head) ? { root, head } : undefined;
	} catch {
		return undefined;
	}
}

/** Validate an optional repository-relative path filter. Throws with a reason. */
export function validateDiffPath(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") throw new Error("review_diff path must be a string.");
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith("-")) throw new Error("review_diff path must not start with '-'.");
	if (trimmed.startsWith(":")) throw new Error("review_diff path must not use Git pathspec magic (':').");
	if (isAbsolute(trimmed)) throw new Error("review_diff path must be relative to the repository root.");
	if (trimmed.split(/[\\/]/).includes("..")) throw new Error("review_diff path must not contain '..'.");
	return trimmed;
}

export function boundDiffText(text: string, max: number = REVIEW_DIFF_MAX_CHARS): string {
	if (text.length <= max) return text;
	const marker = `\n\n[... ${text.length - max} characters omitted; call review_diff again with a narrower path ...]`;
	return `${text.slice(0, max - marker.length)}${marker}`;
}

async function git(root: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
		encoding: "utf8",
		maxBuffer: GIT_MAX_BUFFER,
		windowsHide: true,
	});
	return stdout;
}

/** Compute the tool output for a baseline and parameters. */
export async function reviewDiffText(baseline: DiffBaseline | undefined, params: { path?: unknown; stat?: unknown }): Promise<string> {
	if (!baseline) return NO_BASELINE_TEXT;
	const pathFilter = validateDiffPath(params.path);
	const current = (await git(baseline.root, ["rev-parse", "HEAD"])).trim();
	if (current !== baseline.head) return HEAD_MOVED_TEXT;
	const pathArgs = pathFilter ? ["--", pathFilter] : [];
	const diff = await git(baseline.root, [
		"diff", "--no-color", "--no-ext-diff", ...(params.stat === true ? ["--stat"] : []), baseline.head, ...pathArgs,
	]);
	const untracked = (await git(baseline.root, ["ls-files", "--others", "--exclude-standard", "-z", ...pathArgs]))
		.split("\0")
		.filter(Boolean);
	const sections = [diff.trimEnd()];
	if (untracked.length > 0) {
		const shown = untracked.slice(0, MAX_UNTRACKED_FILES);
		sections.push(["Untracked files (inspect with read):", ...shown.map((file) => `  ${file}`)].join("\n"));
		if (untracked.length > shown.length) sections.push(`... ${untracked.length - shown.length} more untracked files`);
	}
	const text = sections.filter(Boolean).join("\n\n");
	return text ? boundDiffText(text) : `No working-tree changes against HEAD ${baseline.head.slice(0, 12)}. Committed changes are not included.`;
}

export const REVIEW_DIFF_PARAMETERS = {
	type: "object",
	properties: {
		path: { type: "string", description: "Restrict the diff to one file or directory, relative to the repository root." },
		stat: { type: "boolean", description: "Return per-file change counts instead of the full diff." },
	},
	additionalProperties: false,
} as const;

/** Tool definition for registration in a reviewer child (inline extension factory). */
export function createReviewDiffTool(baseline: DiffBaseline | undefined) {
	return {
		name: REVIEW_DIFF_TOOL,
		label: "Review diff",
		description: baseline
			? "Show the current staged and unstaged changes against the HEAD at reviewer launch, plus untracked file paths. Edits by other sessions in this checkout also appear. Committed ranges are not included. Optional path narrows it; stat: true returns per-file counts only."
			: "Report that no Git diff is available in this directory.",
		parameters: REVIEW_DIFF_PARAMETERS,
		annotations: { readOnlyHint: true },
		async execute(_toolCallId: string, params: { path?: string; stat?: boolean }) {
			const text = await reviewDiffText(baseline, params);
			return { content: [{ type: "text" as const, text }], details: { chars: text.length } };
		},
	};
}
