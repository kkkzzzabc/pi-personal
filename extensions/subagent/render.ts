/**
 * Text for the subagent tool's call, progress, and result rows (plan S18).
 *
 * Pure string builders; extension.ts wraps them in TUI components. The theme is
 * pi's interactive theme (only `fg` and `bold` are used).
 */
import type { ChildStatus } from "./runner.ts";

export interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface TaskArgs {
	agent?: unknown;
	task?: unknown;
	model?: unknown;
}

export interface CallArgs extends TaskArgs {
	tasks?: unknown;
	review?: unknown;
}

export interface ReviewSummary {
	coverage: "complete" | "partial" | "none";
	succeeded: number;
	failed: number;
	aborted: number;
	pending: number;
	total: number;
}

export function reviewSummary(rows: readonly ChildRow[]): ReviewSummary {
	const succeeded = rows.filter((r) => r.status === "completed").length;
	return { coverage: succeeded === rows.length ? "complete" : succeeded ? "partial" : "none", succeeded,
		failed: rows.filter((r) => r.status === "failed").length, aborted: rows.filter((r) => r.status === "aborted").length,
		pending: rows.filter((r) => r.status === "starting" || r.status === "running").length, total: rows.length };
}

export function reviewSummaryText(summary: ReviewSummary): string {
	return `Review coverage: ${summary.coverage} (${summary.succeeded}/${summary.total} succeeded, ${summary.failed} failed, ${summary.aborted} aborted, ${summary.pending} pending).`
		+ (summary.pending ? " Review in progress." : summary.succeeded === 0 ? " No review verdict is available." : summary.coverage !== "complete" ? " Review incomplete: not all configured models returned a review. Do not claim agreement across all configured models." : "");
}

export type ProgressStatus = "starting" | "running" | ChildStatus;

/** Per-child row shared by progress updates and final details. */
export interface ChildRow {
	agent: string;
	task: string;
	status: ProgressStatus;
	model?: string;
	requestedModel?: string;
	transitions?: string[];
	toolCalls: number;
	currentTool?: string;
	durationMs?: number;
	outputFile?: string;
	error?: string;
	/** Final result text (preview or error); only on finished rows. */
	text?: string;
}

const TASK_PREVIEW = 80;
const COLLAPSED_LINES = 3;

export function oneLine(text: string, max: number = TASK_PREVIEW): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const ICONS: Record<ProgressStatus, [string, string]> = {
	starting: ["…", "muted"],
	running: ["…", "warning"],
	completed: ["✓", "success"],
	failed: ["✗", "error"],
	aborted: ["■", "muted"],
};

function describeTask(args: TaskArgs, theme: ThemeLike): string {
	const agent = typeof args.agent === "string" ? args.agent : "?";
	const task = typeof args.task === "string" ? oneLine(args.task) : "";
	const model = typeof args.model === "string" && args.model ? theme.fg("muted", ` [${args.model}]`) : "";
	return `${theme.fg("accent", agent)}${model} ${theme.fg("dim", task)}`;
}

export function callText(args: CallArgs, theme: ThemeLike): string {
	const title = theme.fg("toolTitle", theme.bold("subagent"));
	if (args.review !== undefined) {
		const task = (args.review as { task?: unknown })?.task;
		return `${title} ${theme.fg("accent", "configured review")} ${typeof task === "string" ? oneLine(task) : ""}`;
	}
	if (Array.isArray(args.tasks)) {
		const lines = args.tasks.map((item) => `  ${describeTask((item ?? {}) as TaskArgs, theme)}`);
		return [`${title} ${theme.fg("muted", `${args.tasks.length} in parallel`)}`, ...lines].join("\n");
	}
	return `${title} ${describeTask(args, theme)}`;
}

function rowHeader(row: ChildRow, theme: ThemeLike): string {
	const [icon, color] = ICONS[row.status];
	const parts = [theme.fg(color, icon), theme.fg("accent", row.agent)];
	if (row.model) parts.push(theme.fg("muted", row.model));
	const calls = row.toolCalls === 1 ? "1 tool call" : `${row.toolCalls} tool calls`;
	if (row.status === "starting" || row.status === "running") {
		parts.push(theme.fg("dim", row.currentTool ? `${calls} · running ${row.currentTool}` : calls));
	} else {
		parts.push(theme.fg("dim", `${row.status} (${formatDuration(row.durationMs ?? 0)}, ${calls})`));
	}
	return parts.join(" ");
}

export function resultText(rows: readonly ChildRow[], options: { expanded: boolean }, theme: ThemeLike, review?: ReviewSummary): string {
	const lines: string[] = review ? [reviewSummaryText(review)] : [];
	for (const row of rows) {
		lines.push(rowHeader(row, theme));
		if (row.requestedModel && row.status !== "completed") lines.push(theme.fg("muted", `  Requested: ${row.requestedModel}`));
		if (row.transitions?.length) {
			const transitions = options.expanded ? row.transitions : row.transitions.slice(-1);
			lines.push(...transitions.map((text) => theme.fg("warning", `  ${text}`)));
		}
		if (row.text === undefined) continue;
		const body = row.status === "completed" ? row.text : theme.fg("error", row.text);
		const bodyLines = body.split("\n");
		const shown = options.expanded ? bodyLines : bodyLines.slice(0, COLLAPSED_LINES);
		lines.push(...shown.map((line) => `  ${line}`));
		if (!options.expanded && bodyLines.length > shown.length) {
			lines.push(theme.fg("muted", `  … ${bodyLines.length - shown.length} more lines`));
		}
	}
	return lines.join("\n");
}
