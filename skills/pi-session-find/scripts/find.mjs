#!/usr/bin/env node
/**
 * pi-session-find: list, search, and inspect local pi sessions. Read-only; prints to stdout.
 *
 *   node find.mjs list   [filters] [--limit N]
 *   node find.mjs search <query> [filters] [--regex] [--role user|assistant|all] [--include tools] [--max-per-session N]
 *   node find.mjs show   <id|prefix|path> [--full] [--query q] [--sessions-dir D]
 *
 * Filters: --since 7d|ISO  --until 7d|ISO  --cwd substr  --provider substr  --model substr  --sessions-dir D  --json
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	discoverSessionFiles, excerpt, fmtBytes, fmtDuration, fmtLocal, fmtTime, iterateTexts, loadSessions, makeMatcher, matchesFilters,
	messageText, parseWhen, readSession, resolveSessionsDir, shortCwd, summarizeSession, table, truncate,
} from "../../../lib/pi-sessions.mjs";

const VALUED = new Set(["since", "until", "cwd", "provider", "model", "sessions-dir", "limit", "role", "include", "max-per-session", "query"]);
const FLAGS = new Set(["json", "regex", "full", "help"]);

export function parseArgs(argv) {
	const options = { positional: [] };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg.startsWith("--")) {
			options.positional.push(arg);
			continue;
		}
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

// ---------------------------------------------------------------------------

export function listSessions(dir, options, now = Date.now()) {
	const loaded = loadSessions(dir, filtersFrom(options, now));
	const limit = options.limit === undefined ? 30 : Number(options.limit);
	const shown = loaded.slice(0, limit).map(({ summary }) => summary);
	if (options.json) return JSON.stringify({ shown: shown.length, matched: loaded.length, sessions: shown }, null, 2);
	const rows = shown.map((s) => ({
		id: s.id.slice(0, 8),
		started: fmtLocal(s.startedAt),
		dur: fmtDuration(s.durationMs),
		cwd: shortCwd(s.cwd),
		model: s.models.length ? `${s.models[s.models.length - 1].model}${s.models.length > 1 ? ` +${s.models.length - 1}` : ""}` : "-",
		msg: `${s.userCount}/${s.assistantCount}`,
		tools: s.toolErrorCount ? `${s.toolCallCount} !${s.toolErrorCount}` : String(s.toolCallCount),
		size: fmtBytes(s.bytes),
		first: truncate(s.firstUserText, 60),
	}));
	const out = table(rows, [
		{ key: "id", title: "ID" }, { key: "started", title: "STARTED" }, { key: "dur", title: "DUR", align: "right" }, { key: "cwd", title: "CWD" },
		{ key: "model", title: "MODEL" }, { key: "msg", title: "MSG", align: "right" }, { key: "tools", title: "TOOLS", align: "right" },
		{ key: "size", title: "SIZE", align: "right" }, { key: "first", title: "FIRST USER MESSAGE" },
	]);
	return `${out}\n\n${shown.length} sessions shown of ${loaded.length} matched (${dir})`;
}

export function searchSessions(dir, query, options, now = Date.now()) {
	const matcher = makeMatcher(query, { regex: Boolean(options.regex) });
	const roles = options.role === "user" ? ["user"] : options.role === "assistant" ? ["assistant"] : ["user", "assistant"];
	const includeTools = options.include === "tools" || options.include === "all";
	const maxPerSession = options["max-per-session"] === undefined ? 5 : Number(options["max-per-session"]);
	const results = [];
	let totalMatches = 0;
	for (const { session, summary } of loadSessions(dir, filtersFrom(options, now))) {
		const hits = [];
		for (const item of iterateTexts(session, { roles, includeTools })) {
			const match = matcher(item.text);
			if (!match) continue;
			hits.push({ entryIndex: item.entryIndex, entryId: item.entryId, role: item.role, kind: item.kind, excerpt: excerpt(item.text, match.index, match.length) });
		}
		if (hits.length === 0) continue;
		totalMatches += hits.length;
		results.push({ id: summary.id, startedAt: summary.startedAt, cwd: summary.cwd, path: summary.path, matches: hits.length, hits: hits.slice(0, maxPerSession) });
	}
	if (options.json) return JSON.stringify({ query, sessions: results.length, matches: totalMatches, results }, null, 2);
	const blocks = results.map((r) => {
		const lines = [`${r.id.slice(0, 8)}  ${fmtLocal(r.startedAt)}  ${shortCwd(r.cwd)}  (${r.matches} match${r.matches === 1 ? "" : "es"})`];
		for (const hit of r.hits) lines.push(`  #${hit.entryIndex} ${hit.kind === "toolCall" ? "assistant/toolCall" : hit.role}  ${truncate(hit.excerpt, 160)}`);
		if (r.matches > r.hits.length) lines.push(`  … ${r.matches - r.hits.length} more`);
		return lines.join("\n");
	});
	return `${blocks.join("\n\n")}${blocks.length ? "\n\n" : ""}${results.length} sessions, ${totalMatches} matches for "${query}"`;
}

export function resolveSessionPath(dir, idOrPath) {
	if (idOrPath.endsWith(".jsonl") && existsSync(idOrPath)) return resolve(idOrPath);
	const files = discoverSessionFiles(dir);
	const exact = files.filter((f) => f.id === idOrPath);
	if (exact.length === 1) return exact[0].path;
	const prefixed = files.filter((f) => f.id.startsWith(idOrPath));
	if (prefixed.length === 1) return prefixed[0].path;
	if (prefixed.length > 1) throw new Error(`Ambiguous id prefix "${idOrPath}": ${prefixed.map((f) => f.id).join(", ")}`);
	throw new Error(`No session matches "${idOrPath}" in ${dir}`);
}

export function showSession(dir, idOrPath, options) {
	const path = resolveSessionPath(dir, idOrPath);
	const session = readSession(path);
	const summary = summarizeSession(session);
	const matcher = options.query ? makeMatcher(options.query, { regex: Boolean(options.regex) }) : null;
	const textLimit = options.full ? Infinity : 200;
	const replyLimit = options.full ? Infinity : 120;

	const timeline = [];
	session.entries.forEach((entry, index) => {
		const time = entry.message?.timestamp ?? entry.timestamp;
		const at = typeof time === "number" ? time : Date.parse(time);
		if (entry.type === "model_change") {
			timeline.push({ index, at, kind: "model", text: `${entry.provider}/${entry.modelId}` });
		} else if (entry.type === "thinking_level_change") {
			timeline.push({ index, at, kind: "thinking", text: entry.thinkingLevel });
		} else if (entry.type === "compaction") {
			timeline.push({ index, at, kind: "compaction", text: `tokensBefore=${entry.tokensBefore} ${truncate(entry.summary ?? "", 100)}` });
		} else if (entry.type === "message" && entry.message.role === "user") {
			timeline.push({ index, at, kind: "user", text: messageText(entry.message) });
		} else if (entry.type === "message" && entry.message.role === "assistant") {
			const m = entry.message;
			const tools = new Map();
			for (const block of m.content ?? []) if (block?.type === "toolCall") tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
			timeline.push({ index, at, kind: "assistant", model: m.model, durationMs: m.durationMs, text: messageText(m), tools: [...tools].map(([name, count]) => `${name} x${count}`), error: m.errorMessage });
		}
	});
	const shownTimeline = matcher ? timeline.filter((item) => matcher(item.text ?? "")) : timeline;

	if (options.json) return JSON.stringify({ summary, timeline: shownTimeline }, null, 2);

	const header = [
		`session   ${summary.id}`,
		`path      ${summary.path}`,
		`cwd       ${summary.cwd}${summary.parentSession ? `  (parent ${summary.parentSession.slice(0, 8)})` : ""}`,
		`time      ${fmtLocal(summary.startedAt)} → ${fmtLocal(summary.endedAt)}  (${fmtDuration(summary.durationMs)})`,
		`models    ${summary.models.map((m) => `${m.provider}/${m.model} x${m.calls}`).join(", ") || "-"}`,
		`counts    entries ${summary.entryCount}, user ${summary.userCount}, assistant ${summary.assistantCount}, tool calls ${summary.toolCallCount}, tool errors ${summary.toolErrorCount}, compactions ${summary.compactions}, branches ${summary.branchCount}${summary.malformedLines ? `, malformed lines ${summary.malformedLines}` : ""}`,
		`cost      $${summary.cost.toFixed(4)}`,
		`subagents ${summary.subagentFiles.length ? `${summary.subagentFiles.length}: ${summary.subagentFiles.join(", ")}` : "none"}`,
	];
	const lines = shownTimeline.map((item) => {
		const stamp = `#${String(item.index).padStart(3)} ${fmtTime(item.at)}`;
		switch (item.kind) {
			case "user":
				return `U ${stamp}  ${truncate(item.text, textLimit)}`;
			case "assistant": {
				const parts = [`A ${stamp}  ${item.model ?? "-"}  ${fmtDuration(item.durationMs ?? 0)}`];
				if (item.text) parts.push(truncate(item.text, replyLimit));
				if (item.tools.length) parts.push(`tools: ${item.tools.join(", ")}`);
				if (item.error) parts.push(`[error: ${truncate(item.error, 80)}]`);
				return parts.join("  ");
			}
			default:
				return `- ${stamp}  ${item.kind}: ${item.text}`;
		}
	});
	return `${header.join("\n")}\n\n${lines.join("\n")}${matcher ? `\n\n${shownTimeline.length} of ${timeline.length} timeline entries match "${options.query}"` : ""}`;
}

// ---------------------------------------------------------------------------

const HELP = `pi-session-find (read-only)
  list   [filters] [--limit N]
  search <query> [filters] [--regex] [--role user|assistant|all] [--include tools] [--max-per-session N]
  show   <id|prefix|path> [--full] [--query q] [--regex]
filters: --since 7d|ISO --until 7d|ISO --cwd substr --provider substr --model substr --sessions-dir D --json`;

export function main(argv) {
	const options = parseArgs(argv);
	const [command, ...rest] = options.positional;
	if (options.help || !command) return HELP;
	const dir = resolveSessionsDir({ sessionsDir: options["sessions-dir"] });
	switch (command) {
		case "list":
			return listSessions(dir, options);
		case "search":
			if (!rest[0]) throw new Error("search needs a query");
			return searchSessions(dir, rest.join(" "), options);
		case "show":
			if (!rest[0]) throw new Error("show needs a session id, prefix, or path");
			return showSession(dir, rest[0], options);
		default:
			throw new Error(`Unknown command "${command}"\n${HELP}`);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
	try {
		process.stdout.write(`${main(process.argv.slice(2))}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
