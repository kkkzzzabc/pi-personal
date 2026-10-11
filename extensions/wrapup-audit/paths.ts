/** Tracks files changed by built-in write/edit during one user request, limited to the project root. */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
export const TRACKED_TOOLS: ReadonlySet<string> = new Set(["write", "edit"]);

/** Absolute path the built-in edit/write tools use for `input` (leading `@`, `~`, `file://` URLs, Unicode spaces). */
export function resolveToolPath(input: string, cwd: string, home: string = homedir()): string {
	let value = input.replace(UNICODE_SPACES, " ");
	if (value.startsWith("@")) value = value.slice(1);
	if (value === "~") value = home;
	else if (value.startsWith("~/")) value = join(home, value.slice(2));
	else if (/^file:\/\//.test(value)) value = fileURLToPath(value);
	return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

/** Real path, resolving symlinks through the nearest existing ancestor. */
export function canonicalPath(path: string): string {
	const missing: string[] = [];
	let current = resolve(path);
	for (;;) {
		try { return join(realpathSync(current), ...missing.reverse()); }
		catch {
			const parent = dirname(current);
			if (parent === current) return resolve(path);
			missing.push(basename(current)); current = parent;
		}
	}
}

/** Git top level of `cwd`, else `cwd`; canonicalized. */
export function projectRoot(cwd: string): string {
	try {
		const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", timeout: 2000 });
		if (r.status === 0 && r.stdout.trim()) return canonicalPath(r.stdout.trim());
	} catch { /* Not a Git checkout. */ }
	return canonicalPath(cwd);
}

/** Repository-relative POSIX path, or undefined when outside `root`. */
export function relativeTo(root: string, absolute: string): string | undefined {
	const rel = relative(root, canonicalPath(absolute));
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return undefined;
	return rel.split(sep).join("/");
}

export interface Changed { path: string; created: boolean }

export class ChangeTracker {
	private pending = new Map<string, { path: string; existed: boolean }>();
	private changed = new Map<string, boolean>(); // repo-relative path → created this request
	private root: string;
	private exists: (path: string) => boolean;
	constructor(root: string, exists: (path: string) => boolean = existsSync) { this.root = root; this.exists = exists; }

	reset(): void { this.pending.clear(); this.changed.clear(); }
	call(toolCallId: string, toolName: string, input: unknown, cwd: string): void {
		if (!TRACKED_TOOLS.has(toolName)) return;
		const raw = (input as any)?.path;
		if (typeof raw !== "string" || !raw.trim()) return;
		const path = relativeTo(this.root, resolveToolPath(raw, cwd));
		if (!path) return;
		this.pending.set(toolCallId, { path, existed: this.exists(join(this.root, path)) });
	}
	result(toolCallId: string, isError: boolean): void {
		const p = this.pending.get(toolCallId);
		if (!p) return;
		this.pending.delete(toolCallId);
		// The first successful change decides whether the file was created during this request.
		if (!isError && !this.changed.has(p.path)) this.changed.set(p.path, !p.existed);
	}
	list(): Changed[] { return [...this.changed].map(([path, created]) => ({ path, created })); }
}
