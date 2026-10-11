/**
 * Read-only access to pi-perf-log records (`<perfDir>/<sessionId>.jsonl`, schema v1 in
 * extensions/pi-perf-log/SCHEMA.md). Used by the pi-session-stats skill.
 *
 * Depends only on the documented JSONL contract, not on the extension's code or config.
 * Parsing is tolerant: malformed lines and other schema versions are counted and skipped,
 * unknown record types are ignored, and missing fields count as unmeasured.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { ENV_AGENT_DIR, maxOf, percentile } from "./pi-sessions.mjs";

const SAFE_ID = /^[\w-]+$/;

/** `--perf-dir`, else `PI_CODING_AGENT_DIR/perf`, else `~/.pi/agent/perf`. */
export function resolvePerfDir(options = {}, env = process.env, home = homedir()) {
	const expand = (path) => (path === "~" || path.startsWith("~/") ? join(home, path.slice(1)) : path);
	if (options.perfDir) return resolve(expand(options.perfDir));
	if (env[ENV_AGENT_DIR]) return join(resolve(expand(env[ENV_AGENT_DIR])), "perf");
	return join(home, ".pi", "agent", "perf");
}

/**
 * Reads the perf files of the given session ids only. Returns turn records (v1) and counts of
 * skipped lines; files of sessions outside the scope are never opened.
 */
export function loadPerfRecords(dir, sessionIds) {
	const turns = [];
	const sessionsWithRecords = new Set();
	let malformedLines = 0;
	let otherVersions = 0;
	// Several session files can share a header id; read each perf file once.
	for (const id of new Set(sessionIds)) {
		if (!SAFE_ID.test(id)) continue;
		const path = join(dir, `${id}.jsonl`);
		if (!existsSync(path)) continue;
		for (const line of readFileSync(path, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			let record;
			try {
				record = JSON.parse(line);
			} catch {
				malformedLines++;
				continue;
			}
			if (!record || typeof record !== "object") {
				malformedLines++;
				continue;
			}
			if (record.v !== 1) {
				otherVersions++;
				continue;
			}
			sessionsWithRecords.add(id);
			if (record.type === "turn") turns.push({ ...record, sessionId: id });
		}
	}
	return { dir, turns, sessionsWithRecords: sessionsWithRecords.size, malformedLines, otherVersions };
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const values = (turns, pick) => turns.map(pick).filter((value) => value !== undefined);
const p50p95 = (list) => ({ p50: percentile(list, 50), p95: percentile(list, 95), n: list.length });
const FRAME_FIELDS = ["count", "totalMs", "maxMs", "p95Ms", "over16Ms"];
/** Frame statistics count as measured only when every documented field is a finite number. */
const hasFrames = (t) => Boolean(t.frames) && typeof t.frames === "object" && FRAME_FIELDS.every((field) => num(t.frames[field]) !== undefined);

/**
 * Aggregates turn records into the Client timing model. Null when the scope has no perf data at
 * all; when only skipped lines exist (for example a newer schema), returns coverage alone.
 * `loaded` is the in-scope session list from loadSessions (used to join by messageEntryId).
 */
export function collectClientTiming(perf, loaded, { top = 10 } = {}) {
	const { turns } = perf;
	const baseCoverage = { sessionsWithRecords: perf.sessionsWithRecords, sessionsInScope: loaded.length, malformedLines: perf.malformedLines, otherVersions: perf.otherVersions };
	if (turns.length === 0) {
		if (perf.malformedLines === 0 && perf.otherVersions === 0) return null;
		return { perfDir: perf.dir, coverage: { ...baseCoverage, turns: 0, joined: 0, turnEndMissing: 0, withFrames: 0 }, models: [], tools: null, frames: null, memory: [], slowest: { overhead: [], frame: [] } };
	}
	const entryIds = new Map();
	for (const { session, summary } of loaded) {
		const ids = entryIds.get(summary.id) ?? new Set();
		for (const entry of session.entries) ids.add(entry.id);
		entryIds.set(summary.id, ids);
	}
	const joined = turns.filter((t) => typeof t.messageEntryId === "string" && entryIds.get(t.sessionId)?.has(t.messageEntryId)).length;

	const byModel = new Map();
	for (const turn of turns) {
		const key = turn.provider && turn.model ? `${turn.provider}/${turn.model}` : "(no model)";
		const list = byModel.get(key) ?? [];
		list.push(turn);
		byModel.set(key, list);
	}
	const models = [...byModel.entries()]
		.map(([model, list]) => {
			const overhead = values(list, (t) => num(t.overheadMs));
			return {
				model,
				turns: list.length,
				connect: p50p95(values(list, (t) => num(t.connectMs))),
				ttft: p50p95(values(list, (t) => num(t.ttftMs))),
				overhead: { ...p50p95(overhead), max: maxOf(overhead) },
			};
		})
		.sort((a, b) => b.turns - a.turns);

	const withTools = turns.filter((t) => num(t.toolCount) > 0);
	// Compare sum and span over the same turns: older records have no span.
	const spanned = withTools.filter((t) => num(t.toolSpanMs) !== undefined);
	const tools = {
		turns: withTools.length,
		spannedTurns: spanned.length,
		toolMs: spanned.reduce((sum, t) => sum + (num(t.toolMs) ?? 0), 0),
		toolSpanMs: spanned.reduce((sum, t) => sum + t.toolSpanMs, 0),
		withoutSpan: withTools.length - spanned.length,
	};

	const measured = turns.filter(hasFrames);
	const rendered = measured.filter((t) => t.frames.count > 0);
	const frameCount = rendered.reduce((sum, t) => sum + t.frames.count, 0);
	const frameTotalMs = rendered.reduce((sum, t) => sum + t.frames.totalMs, 0);
	const over16 = rendered.reduce((sum, t) => sum + t.frames.over16Ms, 0);
	const turnP95 = rendered.map((t) => t.frames.p95Ms);
	const frames = {
		measuredTurns: measured.length,
		renderedTurns: rendered.length,
		unmeasuredTurns: turns.length - measured.length,
		frames: frameCount,
		meanFrameMs: frameCount > 0 ? frameTotalMs / frameCount : 0,
		turnP95: p50p95(turnP95),
		maxFrameMs: maxOf(rendered.map((t) => t.frames.maxMs)),
		over16Share: frameCount > 0 ? over16 / frameCount : 0,
	};

	const bySession = new Map();
	for (const turn of turns) {
		const list = bySession.get(turn.sessionId) ?? [];
		list.push(turn);
		bySession.set(turn.sessionId, list);
	}
	const memory = [...bySession.entries()]
		.map(([sessionId, list]) => {
			const sampled = list.filter((t) => num(t.rss) !== undefined);
			return {
				sessionId,
				turns: list.length,
				firstRss: sampled.length ? sampled[0].rss : 0,
				lastRss: sampled.length ? sampled[sampled.length - 1].rss : 0,
				maxRss: maxOf(values(sampled, (t) => num(t.rss))),
				maxHeapUsed: maxOf(values(list, (t) => num(t.heapUsed))),
			};
		})
		.sort((a, b) => b.maxRss - a.maxRss)
		.slice(0, top);

	const ref = (t, value) => ({ sessionId: t.sessionId, messageEntryId: t.messageEntryId ?? null, model: t.model ?? null, value });
	const largest = (list, pick) =>
		list
			.filter((t) => pick(t) !== undefined)
			.sort((a, b) => pick(b) - pick(a))
			.slice(0, top)
			.map((t) => ref(t, pick(t)));

	return {
		perfDir: perf.dir,
		coverage: {
			...baseCoverage,
			turns: turns.length,
			joined,
			turnEndMissing: turns.filter((t) => t.turnEndMissing === true).length,
			withFrames: measured.length,
		},
		models,
		tools,
		frames,
		memory,
		slowest: {
			overhead: largest(turns, (t) => num(t.overheadMs)),
			frame: largest(rendered, (t) => t.frames.maxMs),
		},
	};
}
