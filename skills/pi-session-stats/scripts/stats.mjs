#!/usr/bin/env node
/**
 * pi-session-stats: usage, model and tool timing, cost, and workload sizes from local pi sessions.
 * Read-only; prints to stdout.
 *
 *   node stats.mjs [filters] [--top N] [--json]
 *
 * Filters: --since 7d|ISO  --until 7d|ISO  --cwd substr  --provider substr  --model substr  --sessions-dir D
 */
import { resolve } from "node:path";
import { collectStats, fmtBytes, fmtCost, fmtDuration, fmtLocal, loadSessions, parseWhen, resolveSessionsDir, shortCwd, table } from "../../../lib/pi-sessions.mjs";

const VALUED = new Set(["since", "until", "cwd", "provider", "model", "sessions-dir", "top"]);
const FLAGS = new Set(["json", "help"]);

export function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
		const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
		if (FLAGS.has(name)) {
			options[name] = true;
		} else if (VALUED.has(name)) {
			const value = inline ?? argv[++index];
			if (value === undefined) throw new Error(`--${name} needs a value`);
			options[name] = value;
		} else {
			throw new Error(`Unknown option --${name}`);
		}
	}
	return options;
}

export function filtersFrom(options, now = Date.now()) {
	const filters = {};
	if (options.since) filters.since = parseWhen(options.since, now);
	if (options.until) filters.until = parseWhen(options.until, now);
	for (const key of ["cwd", "provider", "model"]) if (options[key]) filters[key] = options[key];
	return filters;
}

export function renderStats(stats, { top = 10, dir = "" } = {}) {
	const o = stats.overview;
	const sections = [];
	sections.push([
		"## Overview",
		`sessions ${o.sessions}  span ${fmtLocal(o.first)} → ${fmtLocal(o.last)}`,
		`user turns ${o.userTurns}  assistant messages ${o.assistantMessages}  tool calls ${o.toolCalls}  tool errors ${o.toolErrors}`,
		`cost ${fmtCost(o.cost)} (of which ${fmtCost(o.nonMessageUsageCost)} from ${o.nonMessageUsageCount} non-message usage entries: cache warming, compaction)  total tokens incl. cache reads ${o.tokens.toLocaleString("en-US")}`,
	].join("\n"));

	sections.push(`## Models\n${table(
		stats.models.map((m) => ({
			model: `${m.provider}/${m.model}`,
			calls: m.calls,
			err: m.errors,
			p50: fmtDuration(m.durationP50),
			p95: fmtDuration(m.durationP95),
			max: fmtDuration(m.durationMax),
			tps: m.outputTokensPerSecondMedian.toFixed(1),
			cache: `${Math.round(m.cacheReadRatio * 100)}%`,
			in: m.inputTokens.toLocaleString("en-US"),
			out: m.outputTokens.toLocaleString("en-US"),
			cost: fmtCost(m.cost),
		})),
		[
			{ key: "model", title: "MODEL" }, { key: "calls", title: "CALLS", align: "right" }, { key: "err", title: "ERR", align: "right" },
			{ key: "p50", title: "P50", align: "right" }, { key: "p95", title: "P95", align: "right" }, { key: "max", title: "MAX", align: "right" },
			{ key: "tps", title: "OUT TOK/S", align: "right" }, { key: "cache", title: "CACHE", align: "right" },
			{ key: "in", title: "IN TOK", align: "right" }, { key: "out", title: "OUT TOK", align: "right" }, { key: "cost", title: "COST", align: "right" },
		],
	)}`);

	sections.push(`## Tools\n${table(
		stats.tools.map((t) => ({
			tool: t.tool,
			calls: t.calls,
			err: t.errors,
			p50: fmtDuration(t.durationP50),
			p95: fmtDuration(t.durationP95),
			max: fmtDuration(t.durationMax),
			median: fmtBytes(t.resultBytesMedian),
			maxBytes: fmtBytes(t.resultBytesMax),
		})),
		[
			{ key: "tool", title: "TOOL" }, { key: "calls", title: "CALLS", align: "right" }, { key: "err", title: "ERR", align: "right" },
			{ key: "p50", title: "P50", align: "right" }, { key: "p95", title: "P95", align: "right" }, { key: "max", title: "MAX", align: "right" },
			{ key: "median", title: "RESULT MED", align: "right" }, { key: "maxBytes", title: "RESULT MAX", align: "right" },
		],
	)}`);

	const w = stats.workload;
	const workloadLines = ["## Workload sizes (inputs for perf-audit)"];
	workloadLines.push("largest tool-call arguments:");
	for (const item of w.largestToolCallArgs.slice(0, top)) workloadLines.push(`  ${item.tool.padEnd(22)} ${fmtBytes(item.bytes).padStart(8)}  session ${item.sessionId.slice(0, 8)} entry ${item.entryId}`);
	workloadLines.push("largest tool results:");
	for (const item of w.largestToolResult.slice(0, top)) workloadLines.push(`  ${item.tool.padEnd(22)} ${fmtBytes(item.bytes).padStart(8)}  session ${item.sessionId.slice(0, 8)} entry ${item.entryId}`);
	if (w.longestSessionByEntries) workloadLines.push(`longest session by entries: ${w.longestSessionByEntries.id.slice(0, 8)}  ${w.longestSessionByEntries.entryCount} entries  ${fmtBytes(w.longestSessionByEntries.bytes)}  ${shortCwd(w.longestSessionByEntries.cwd)}`);
	if (w.longestSessionByBytes) workloadLines.push(`longest session by bytes:   ${w.longestSessionByBytes.id.slice(0, 8)}  ${w.longestSessionByBytes.entryCount} entries  ${fmtBytes(w.longestSessionByBytes.bytes)}  ${shortCwd(w.longestSessionByBytes.cwd)}`);
	if (w.largestAssistantText) workloadLines.push(`largest assistant text:     ${fmtBytes(w.largestAssistantText.bytes)}  session ${w.largestAssistantText.sessionId.slice(0, 8)} entry ${w.largestAssistantText.entryId}`);
	workloadLines.push(`sessions with compaction:   ${w.sessionsWithCompaction.length ? w.sessionsWithCompaction.map((s) => `${s.id.slice(0, 8)} (${s.compactions})`).join(", ") : "none"}`);
	sections.push(workloadLines.join("\n"));

	sections.push(`## Top sessions by cost\n${table(
		stats.topSessions.slice(0, top).map((s) => ({
			id: s.id.slice(0, 8),
			started: fmtLocal(s.startedAt),
			cwd: shortCwd(s.cwd),
			cost: fmtCost(s.cost),
			turns: s.userCount,
			calls: s.assistantCount,
			models: s.models.map((m) => m.model).join(", "),
		})),
		[
			{ key: "id", title: "ID" }, { key: "started", title: "STARTED" }, { key: "cwd", title: "CWD" }, { key: "cost", title: "COST", align: "right" },
			{ key: "turns", title: "TURNS", align: "right" }, { key: "calls", title: "CALLS", align: "right" }, { key: "models", title: "MODELS" },
		],
	)}`);

	return `${sections.join("\n\n")}\n\nsource ${dir}; all entries in each file are counted, branches included`;
}

const HELP = `pi-session-stats (read-only)
  node stats.mjs [--since 7d|ISO] [--until 7d|ISO] [--cwd substr] [--provider substr] [--model substr] [--sessions-dir D] [--top N] [--json]`;

export function main(argv, now = Date.now()) {
	const options = parseArgs(argv);
	if (options.help) return HELP;
	const dir = resolveSessionsDir({ sessionsDir: options["sessions-dir"] });
	const stats = collectStats(loadSessions(dir, filtersFrom(options, now)));
	const top = options.top === undefined ? 10 : Number(options.top);
	if (options.json) return JSON.stringify({ sessionsDir: dir, ...stats, topSessions: stats.topSessions.slice(0, top) }, null, 2);
	return renderStats(stats, { top, dir });
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
	try {
		process.stdout.write(`${main(process.argv.slice(2))}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
