#!/usr/bin/env node
/**
 * pi-session-stats: usage, model and tool timing, cost, and workload sizes from local pi sessions.
 * Read-only; prints to stdout.
 *
 *   node stats.mjs [filters] [--top N] [--json]
 *
 * Filters: --since 7d|ISO  --until 7d|ISO  --cwd substr  --provider substr  --model substr  --sessions-dir D
 * Client timing: pi-perf-log records from --perf-dir D (default <agentDir>/perf)
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectClientTiming, loadPerfRecords, resolvePerfDir } from "../../../lib/pi-perf-records.mjs";
import { collectStats, fmtBytes, fmtCost, fmtDuration, fmtLocal, loadSessions, parseWhen, resolveSessionsDir, shortCwd, table } from "../../../lib/pi-sessions.mjs";

const VALUED = new Set(["since", "until", "cwd", "provider", "model", "sessions-dir", "perf-dir", "top"]);
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
			if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
			options[name] = value;
		} else {
			throw new Error(`Unknown option --${name}`);
		}
	}
	return options;
}


/** A non-negative integer option, or `fallback` when absent. */
export function countOption(options, name, fallback) {
	if (options[name] === undefined) return fallback;
	const value = Number(options[name]);
	if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a non-negative integer, got "${options[name]}"`);
	return value;
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

	if (stats.clientTiming) sections.push(renderClientTiming(stats.clientTiming, top));

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

/** Client timings: ms with one decimal below 1 s, seconds with one decimal below 1 min, then fmtDuration. */
function fmtMs(ms) {
	if (!(ms > 0)) return "0ms";
	if (ms < 1000) return `${Number(ms.toFixed(1))}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return fmtDuration(ms);
}
const pct = (share) => `${(share * 100).toFixed(1)}%`;
const sampled = (stat, text) => (stat.n > 0 ? text : "-");

export function renderClientTiming(ct, top = 10) {
	const c = ct.coverage;
	const lines = ["## Client timing (pi-perf-log)"];
	lines.push(`turns ${c.turns}  sessions with records ${c.sessionsWithRecords}/${c.sessionsInScope}  joined to session entries ${c.joined}  turn_end missing ${c.turnEndMissing}  with frames ${c.withFrames}`);
	if (c.malformedLines || c.otherVersions) lines.push(`skipped lines: ${c.malformedLines} malformed, ${c.otherVersions} other schema versions`);
	if (c.turns === 0) {
		lines.push("no schema v1 turn records in scope; check the pi-perf-log schema version");
		return lines.join("\n");
	}
	lines.push(table(
		ct.models.map((m) => ({
			model: m.model,
			turns: m.turns,
			connect: sampled(m.connect, `${fmtMs(m.connect.p50)} / ${fmtMs(m.connect.p95)}`),
			ttft: sampled(m.ttft, `${fmtMs(m.ttft.p50)} / ${fmtMs(m.ttft.p95)}`),
			overhead: sampled(m.overhead, `${fmtMs(m.overhead.p50)} / ${fmtMs(m.overhead.p95)} / ${fmtMs(m.overhead.max)}`),
		})),
		[
			{ key: "model", title: "MODEL" }, { key: "turns", title: "TURNS", align: "right" },
			{ key: "connect", title: "CONNECT P50/P95", align: "right" }, { key: "ttft", title: "TTFT P50/P95", align: "right" },
			{ key: "overhead", title: "OVERHEAD P50/P95/MAX", align: "right" },
		],
	));
	const t = ct.tools;
	lines.push(`tools: ${t.turns} turns with tools  over ${t.spannedTurns} with a span: summed tool time ${fmtMs(t.toolMs)}  wall-clock span ${fmtMs(t.toolSpanMs)}${t.withoutSpan ? `  (${t.withoutSpan} older turns without span excluded)` : ""}`);
	const f = ct.frames;
	if (f.measuredTurns === 0) {
		lines.push(`render frames: not measured (${f.unmeasuredTurns} turns without frames: non-TUI mode or pi without the frame hook)`);
	} else if (f.renderedTurns === 0) {
		lines.push(`render frames: no frames rendered in ${f.measuredTurns} measured turns (${f.unmeasuredTurns} unmeasured)`);
	} else {
		lines.push(`render frames: ${f.frames} frames in ${f.renderedTurns} turns (${f.measuredTurns} measured, ${f.unmeasuredTurns} unmeasured)  mean ${fmtMs(f.meanFrameMs)}  per-turn p95 P50/P95 ${sampled(f.turnP95, `${fmtMs(f.turnP95.p50)} / ${fmtMs(f.turnP95.p95)}`)}  max ${fmtMs(f.maxFrameMs)}  over 16ms ${pct(f.over16Share)}`);
	}
	lines.push("memory by session (highest RSS first):");
	for (const m of ct.memory) {
		lines.push(`  ${m.sessionId.slice(0, 8)}  turns ${String(m.turns).padStart(4)}  rss ${fmtBytes(m.firstRss)} → ${fmtBytes(m.lastRss)} (max ${fmtBytes(m.maxRss)})  heap max ${fmtBytes(m.maxHeapUsed)}`);
	}
	const refs = (title, list) => {
		if (list.length === 0) return;
		lines.push(title);
		for (const r of list.slice(0, top)) lines.push(`  ${fmtMs(r.value).padStart(8)}  session ${r.sessionId.slice(0, 8)} entry ${r.messageEntryId ?? "-"}  ${r.model ?? ""}`.trimEnd());
	};
	refs("largest overhead:", ct.slowest.overhead);
	refs("longest frames:", ct.slowest.frame);
	return lines.join("\n");
}

const HELP = `pi-session-stats (read-only)
  node stats.mjs [--since 7d|ISO] [--until 7d|ISO] [--cwd substr] [--provider substr] [--model substr] [--sessions-dir D] [--perf-dir D] [--top N] [--json]`;

export function main(argv, now = Date.now()) {
	const options = parseArgs(argv);
	if (options.help) return HELP;
	const dir = resolveSessionsDir({ sessionsDir: options["sessions-dir"] });
	const loaded = loadSessions(dir, filtersFrom(options, now));
	const top = countOption(options, "top", 10);
	const perfDir = resolvePerfDir({ perfDir: options["perf-dir"] });
	const perf = loadPerfRecords(perfDir, loaded.map(({ summary }) => summary.id));
	const stats = { ...collectStats(loaded), clientTiming: collectClientTiming(perf, loaded, { top }) };
	if (options.json) return JSON.stringify({ sessionsDir: dir, ...stats, topSessions: stats.topSessions.slice(0, top) }, null, 2);
	return renderStats(stats, { top, dir });
}

function isMainModule() {
	try {
		return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
	} catch {
		return false;
	}
}

if (isMainModule()) {
	try {
		process.stdout.write(`${main(process.argv.slice(2))}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
