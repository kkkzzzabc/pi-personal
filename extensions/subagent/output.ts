/**
 * Child output files and previews (plan S14).
 *
 * Each child's full final text is saved to a file; the tool result carries the
 * first PREVIEW_CHARS characters plus the file reference. When no file could be
 * written the output stays whole, so no text is lost.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export const PREVIEW_CHARS = 2_000;
const LINE_END_WINDOW = 200;

export interface SavedOutput {
	path: string;
	bytes: number;
	lines: number;
}

function stamp(date: Date): string {
	const pad = (value: number, width = 2) => String(value).padStart(width, "0");
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

/** Directory for child outputs: next to the parent session file, else a per-process temp directory. */
export function outputDir(parentSessionFile: string | undefined, tempRoot: string = tmpdir(), pid: number = process.pid): string {
	if (parentSessionFile) return join(dirname(parentSessionFile), basename(parentSessionFile, ".jsonl"), "subagents");
	return join(tempRoot, `pi-subagent-${pid}`);
}

export function outputFileName(role: string, index: number, date: Date = new Date()): string {
	return `${stamp(date)}-${role}-${index}.md`;
}

export function countLines(text: string): number {
	if (!text) return 0;
	return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function saveOutput(path: string, text: string): SavedOutput {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, "utf8");
	return { path, bytes: Buffer.byteLength(text, "utf8"), lines: countLines(text) };
}

/** First PREVIEW_CHARS characters (cut at a line end when one is near) plus the file reference. */
export function previewOutput(text: string, saved: SavedOutput | undefined, limit: number = PREVIEW_CHARS): string {
	if (text.length <= limit || !saved) return text;
	const lineEnd = text.lastIndexOf("\n", limit);
	let end = lineEnd >= limit - LINE_END_WINDOW ? lineEnd : limit;
	if (/[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) end -= 1;
	const lines = saved.lines === 1 ? "1 line" : `${saved.lines} lines`;
	return `${text.slice(0, end)}\n…\nFull output: ${saved.path} (${formatBytes(saved.bytes)}, ${lines}). Read it if needed.`;
}
