/**
 * Path handling for the plan-mode write guard and plan file naming.
 *
 * `resolveToolPath` mirrors pi 1.1.0's `resolveToCwd` (`src/utils/paths.ts`
 * `normalizePath` + `resolvePath` with `normalizeUnicodeSpaces` and
 * `stripAtPrefix`), which built-in `edit`/`write` use but pi does not export.
 * tests/plan-mode.integration.test.mjs compares both to detect drift.
 *
 * `canonicalPath` follows symlinks through the nearest existing ancestor so a
 * symlink inside the plans directory cannot redirect writes elsewhere.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/** Expand a leading `~` or `~/` (and `~\` on Windows). */
export function expandHome(input: string, home: string = homedir()): string {
	if (input === "~") return home;
	if (input.startsWith("~/") || (process.platform === "win32" && input.startsWith("~\\"))) {
		return join(home, input.slice(2));
	}
	return input;
}

/** Convert Git Bash/MSYS/Cygwin/WSL drive paths, as pi does on Windows. */
function normalizeWindowsShellPath(filePath: string): string {
	if (!filePath.startsWith("/") || filePath.startsWith("//") || filePath.includes("\\")) return filePath;
	const match = filePath.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
	if (!match) return filePath;
	const suffix = match[2]?.replaceAll("/", "\\");
	return `${match[1].toUpperCase()}:\\${suffix ?? ""}`;
}

function normalizeInput(input: string, home: string, toolInput: boolean): string {
	let value = input;
	if (toolInput) {
		value = value.replace(UNICODE_SPACES, " ");
		if (value.startsWith("@")) value = value.slice(1);
	}
	if (process.platform === "win32") value = normalizeWindowsShellPath(value);
	const expanded = expandHome(value, home);
	if (expanded !== value) return expanded;
	if (/^file:\/\//.test(value)) return fileURLToPath(value);
	return value;
}

/** Absolute path the built-in edit/write tools will use for `input` in `cwd`. */
export function resolveToolPath(input: string, cwd: string, home: string = homedir()): string {
	const normalized = normalizeInput(input, home, true);
	const base = normalizeInput(cwd, home, false);
	return isAbsolute(normalized) ? resolve(normalized) : resolve(base, normalized);
}

/** Real path of `path`, resolving symlinks in its nearest existing ancestor. */
export function canonicalPath(path: string): string {
	const absolute = resolve(path);
	const missing: string[] = [];
	let current = absolute;
	for (;;) {
		try {
			return join(realpathSync(current), ...missing.reverse());
		} catch {
			const parent = dirname(current);
			if (parent === current) return absolute;
			missing.push(basename(current));
			current = parent;
		}
	}
}

/** Whether a tool's `path` argument targets exactly `planFile` after resolution. */
export function targetsFile(input: string, cwd: string, planFile: string, home: string = homedir()): boolean {
	return canonicalPath(resolveToolPath(input, cwd, home)) === canonicalPath(planFile);
}

const ADJECTIVES = [
	"amber", "bold", "brave", "bright", "calm", "clever", "crisp", "eager", "fair", "gentle",
	"glad", "keen", "lively", "lucky", "mellow", "nimble", "noble", "quiet", "rapid", "steady",
	"sunny", "swift", "tidy", "vivid", "warm", "wise", "witty", "young", "zesty", "plain",
];
const NOUNS = [
	"badger", "beacon", "brook", "cedar", "comet", "falcon", "fern", "harbor", "heron", "lantern",
	"maple", "meadow", "otter", "pebble", "pine", "quill", "raven", "river", "robin", "sparrow",
	"summit", "thicket", "tide", "willow", "wren", "atlas", "canyon", "delta", "ember", "grove",
];

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** `<plansDir>/<YYYYMMDD-HHmmss>-<adjective>-<noun>.md` in local time. */
export function createPlanFilePath(plansDir: string, now: Date = new Date(), random: () => number = Math.random): string {
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const pick = (words: readonly string[]) => words[Math.floor(random() * words.length) % words.length];
	return join(plansDir, `${stamp}-${pick(ADJECTIVES)}-${pick(NOUNS)}.md`);
}
