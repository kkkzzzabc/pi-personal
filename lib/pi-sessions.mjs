/**
 * Read-only access to local pi session files (JSONL, format v3).
 *
 * Shared by the pi-session-find and pi-session-stats skills. Nothing here writes to disk:
 * functions read files and return plain objects. Parsing is tolerant so that format drift
 * degrades the output instead of failing: malformed lines are counted and unknown entry
 * types are kept.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export const ENV_SESSION_DIR = "PI_CODING_AGENT_SESSION_DIR";
export const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";
const SESSION_FILE = /^(\d{4}-\d{2}-\d{2}T[\d-]+Z)_([0-9a-f-]{36})\.jsonl$/;
/** User messages injected by the host rather than typed by the user. */
const INJECTED_USER_PREFIXES = ["<skill ", "<system-reminder", "<available_skills"];

// ---------------------------------------------------------------------------
// Discovery

/** Mirrors the fork's config.ts precedence; `options.sessionsDir` wins. */
export function resolveSessionsDir(options = {}, env = process.env, home = homedir()) {
	if (options.sessionsDir) return resolve(expandTilde(options.sessionsDir, home));
	if (env[ENV_SESSION_DIR]) return resolve(expandTilde(env[ENV_SESSION_DIR], home));
	if (env[ENV_AGENT_DIR]) return join(resolve(expandTilde(env[ENV_AGENT_DIR], home)), "sessions");
	return join(home, ".pi", "agent", "sessions");
}

function expandTilde(path, home) {
	return path === "~" || path.startsWith("~/") ? join(home, path.slice(1)) : path;
}

/** Lists session files from names alone (no file reads). Newest first by file timestamp. */
export function discoverSessionFiles(dir) {
	if (!existsSync(dir)) return [];
	const files = [];
	for (const cwdDir of readdirSync(dir, { withFileTypes: true })) {
		if (!cwdDir.isDirectory()) continue;
		const cwdPath = join(dir, cwdDir.name);
		for (const entry of readdirSync(cwdPath, { withFileTypes: true })) {
			const match = entry.isFile() ? SESSION_FILE.exec(entry.name) : null;
			if (!match) continue;
			files.push({ path: join(cwdPath, entry.name), cwdDirName: cwdDir.name, fileTimestamp: match[1], id: match[2] });
		}
	}
	return files.sort((a, b) => (a.fileTimestamp < b.fileTimestamp ? 1 : a.fileTimestamp > b.fileTimestamp ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Parsing

/** Reads one session file. `header` may be null when the first line is missing or broken. */
export function readSession(path) {
	const raw = readFileSync(path, "utf8");
	const entries = [];
	let header = null;
	let malformedLines = 0;
	for (const line of raw.split("\n")) {
		if (line.trim() === "") continue;
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			malformedLines++;
			continue;
		}
		if (parsed && parsed.type === "session" && header === null) header = parsed;
		else if (parsed && typeof parsed === "object") entries.push(parsed);
		else malformedLines++;
	}
	const subagentsDir = path.replace(/\.jsonl$/, "") + "/subagents";
	const subagentFiles = existsSync(subagentsDir) ? readdirSync(subagentsDir).filter((name) => !name.startsWith(".")).sort() : [];
	return { path, header, entries, malformedLines, bytes: Buffer.byteLength(raw), subagentFiles };
}

/** Plain text of a user or assistant message (text blocks only; thinking is excluded). */
export function messageText(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block && block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

export function isInjectedUserText(text) {
	return INJECTED_USER_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function toolCalls(message) {
	return Array.isArray(message?.content) ? message.content.filter((block) => block && block.type === "toolCall") : [];
}

function entryTime(entry) {
	const value = entry?.message?.timestamp ?? entry?.timestamp;
	const time = typeof value === "number" ? value : Date.parse(value);
	return Number.isFinite(time) ? time : undefined;
}

function usageCost(usage) {
	return typeof usage?.cost?.total === "number" ? usage.cost.total : 0;
}

export function argumentBytes(toolCall) {
	try {
		return Buffer.byteLength(JSON.stringify(toolCall.arguments ?? {}));
	} catch {
		return 0;
	}
}

export function resultBytes(message) {
	return Buffer.byteLength(messageText(message)) + (message.content ?? []).reduce((sum, block) => sum + (typeof block?.data === "string" ? block.data.length : 0), 0);
}

// ---------------------------------------------------------------------------
// Summaries

export function summarizeSession(session) {
	const { header, entries } = session;
	const models = new Map();
	const children = new Map();
	let firstUserText = "";
	let firstAnyUserText = "";
	let userCount = 0;
	let assistantCount = 0;
	let toolCallCount = 0;
	let toolErrorCount = 0;
	let compactions = 0;
	let cost = 0;
	let startedAt = header ? Date.parse(header.timestamp) : undefined;
	let endedAt = startedAt;
	for (const entry of entries) {
		const time = entryTime(entry);
		if (time !== undefined) {
			if (startedAt === undefined || time < startedAt) startedAt = time;
			if (endedAt === undefined || time > endedAt) endedAt = time;
		}
		if (entry.parentId) children.set(entry.parentId, (children.get(entry.parentId) ?? 0) + 1);
		if (entry.type === "compaction") {
			compactions++;
			cost += usageCost(entry.usage);
		} else if (entry.type === "usage") {
			cost += usageCost(entry.usage);
		} else if (entry.type === "message") {
			const message = entry.message;
			if (message.role === "user") {
				const text = messageText(message);
				if (!firstAnyUserText) firstAnyUserText = text;
				// Host-injected user messages (skill bodies, reminders) are not user turns.
				if (!isInjectedUserText(text)) {
					userCount++;
					if (!firstUserText) firstUserText = text;
				}
			} else if (message.role === "assistant") {
				assistantCount++;
				toolCallCount += toolCalls(message).length;
				cost += usageCost(message.usage);
				const key = `${message.provider}/${message.model}`;
				const model = models.get(key) ?? { provider: message.provider, model: message.model, calls: 0 };
				model.calls++;
				models.set(key, model);
			} else if (message.role === "toolResult" && message.isError) {
				toolErrorCount++;
			}
		}
	}
	let branchCount = 0;
	for (const count of children.values()) if (count > 1) branchCount += count - 1;
	return {
		id: header?.id ?? basename(session.path).replace(/\.jsonl$/, "").split("_")[1] ?? "",
		path: session.path,
		cwd: header?.cwd ?? "",
		parentSession: header?.parentSession,
		startedAt,
		endedAt,
		durationMs: startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : 0,
		firstUserText: firstUserText || firstAnyUserText,
		userCount,
		assistantCount,
		toolCallCount,
		toolErrorCount,
		models: [...models.values()],
		entryCount: entries.length,
		malformedLines: session.malformedLines,
		bytes: session.bytes,
		compactions,
		branchCount,
		subagentFiles: session.subagentFiles,
		cost,
	};
}

// ---------------------------------------------------------------------------
// Filters

/** Accepts `7d`, `12h`, `30m`, or a date/time string; returns epoch ms. */
export function parseWhen(value, now = Date.now()) {
	const relative = /^(\d+)([mhdw])$/.exec(value);
	if (relative) {
		const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[relative[2]];
		return now - Number(relative[1]) * unit;
	}
	const absolute = Date.parse(value);
	if (!Number.isFinite(absolute)) throw new Error(`Cannot parse time "${value}"; use 7d, 12h, or an ISO date`);
	return absolute;
}

/** Filters: { since?, until? (epoch ms), cwd?, provider?, model? (case-insensitive substrings) }. */
export function matchesFilters(summary, filters = {}) {
	if (filters.since !== undefined && (summary.endedAt ?? 0) < filters.since) return false;
	if (filters.until !== undefined && (summary.startedAt ?? Infinity) > filters.until) return false;
	if (filters.cwd && !summary.cwd.toLowerCase().includes(filters.cwd.toLowerCase())) return false;
	if (filters.provider && !summary.models.some((m) => (m.provider ?? "").toLowerCase().includes(filters.provider.toLowerCase()))) return false;
	if (filters.model && !summary.models.some((m) => (m.model ?? "").toLowerCase().includes(filters.model.toLowerCase()))) return false;
	return true;
}

/** Reads, summarizes and filters every discovered session. */
export function loadSessions(dir, filters = {}) {
	const sessions = [];
	for (const file of discoverSessionFiles(dir)) {
		const session = readSession(file.path);
		const summary = summarizeSession(session);
		if (matchesFilters(summary, filters)) sessions.push({ session, summary });
	}
	return sessions;
}

// ---------------------------------------------------------------------------
// Text iteration (search)

/**
 * Yields searchable texts. Default roles: user and assistant text. With `includeTools`,
 * also tool-call arguments (JSON) and tool results.
 */
export function* iterateTexts(session, { roles = ["user", "assistant"], includeTools = false } = {}) {
	const roleSet = new Set(roles);
	for (let entryIndex = 0; entryIndex < session.entries.length; entryIndex++) {
		const entry = session.entries[entryIndex];
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "user" && roleSet.has("user")) {
			yield* one(entryIndex, entry.id, "user", "text", messageText(message));
		} else if (message.role === "assistant" && roleSet.has("assistant")) {
			yield* one(entryIndex, entry.id, "assistant", "text", messageText(message));
			if (includeTools) {
				for (const call of toolCalls(message)) {
					yield* one(entryIndex, entry.id, "assistant", "toolCall", `${call.name} ${safeStringify(call.arguments)}`);
				}
			}
		} else if (message.role === "toolResult" && includeTools) {
			yield* one(entryIndex, entry.id, "toolResult", "toolResult", `${message.toolName} ${messageText(message)}`);
		}
	}
}

function* one(entryIndex, entryId, role, kind, text) {
	if (text) yield { entryIndex, entryId, role, kind, text };
}

function safeStringify(value) {
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return "";
	}
}

/** Builds a matcher from a query; `regex` makes it a case-insensitive JS regex. */
export function makeMatcher(query, { regex = false } = {}) {
	if (regex) {
		const pattern = new RegExp(query, "i");
		return (text) => {
			const match = pattern.exec(text);
			return match ? { index: match.index, length: match[0].length || 1 } : null;
		};
	}
	const needle = query.toLowerCase();
	return (text) => {
		const index = text.toLowerCase().indexOf(needle);
		return index === -1 ? null : { index, length: needle.length };
	};
}

export function excerpt(text, index, length, context = 40) {
	const start = Math.max(0, index - context);
	const end = Math.min(text.length, index + length + context);
	return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

// ---------------------------------------------------------------------------
// Statistics

/** Aggregates across `[{ session, summary }]`. All entries in each file count, branches included. */
export function collectStats(loaded) {
	const models = new Map();
	const tools = new Map();
	const pendingCalls = new Map();
	const workload = {
		largestToolCallArgs: new Map(),
		largestToolResult: new Map(),
		longestSessionByEntries: null,
		longestSessionByBytes: null,
		largestAssistantText: null,
		sessionsWithCompaction: [],
	};
	let nonMessageUsageCost = 0;
	let nonMessageUsageCount = 0;
	const totals = { sessions: loaded.length, userTurns: 0, assistantMessages: 0, toolCalls: 0, toolErrors: 0, cost: 0, tokens: 0, first: undefined, last: undefined };

	for (const { session, summary } of loaded) {
		totals.userTurns += summary.userCount;
		totals.assistantMessages += summary.assistantCount;
		totals.toolCalls += summary.toolCallCount;
		totals.toolErrors += summary.toolErrorCount;
		totals.cost += summary.cost;
		if (summary.startedAt !== undefined && (totals.first === undefined || summary.startedAt < totals.first)) totals.first = summary.startedAt;
		if (summary.endedAt !== undefined && (totals.last === undefined || summary.endedAt > totals.last)) totals.last = summary.endedAt;
		if (!workload.longestSessionByEntries || summary.entryCount > workload.longestSessionByEntries.entryCount) workload.longestSessionByEntries = summary;
		if (!workload.longestSessionByBytes || summary.bytes > workload.longestSessionByBytes.bytes) workload.longestSessionByBytes = summary;
		if (summary.compactions > 0) workload.sessionsWithCompaction.push({ id: summary.id, compactions: summary.compactions });

		pendingCalls.clear();
		for (const entry of session.entries) {
			if (entry.type === "usage" || entry.type === "compaction") {
				nonMessageUsageCost += usageCost(entry.usage);
				nonMessageUsageCount++;
				totals.tokens += entry.usage?.totalTokens ?? 0;
				continue;
			}
			if (entry.type !== "message") continue;
			const message = entry.message;
			if (message.role === "assistant") {
				const key = `${message.provider}/${message.model}`;
				const model = models.get(key) ?? { provider: message.provider, model: message.model, calls: 0, errors: 0, durations: [], tokensPerSecond: [], cacheRead: 0, input: 0, output: 0, cost: 0 };
				model.calls++;
				if (message.stopReason === "error" || message.errorMessage) model.errors++;
				if (typeof message.durationMs === "number") model.durations.push(message.durationMs);
				const usage = message.usage ?? {};
				if (typeof message.durationMs === "number" && message.durationMs > 0 && typeof usage.output === "number") {
					model.tokensPerSecond.push((usage.output / message.durationMs) * 1000);
				}
				model.cacheRead += usage.cacheRead ?? 0;
				model.input += usage.input ?? 0;
				model.output += usage.output ?? 0;
				model.cost += usageCost(usage);
				totals.tokens += usage.totalTokens ?? 0;
				models.set(key, model);

				const text = messageText(message);
				const textBytes = Buffer.byteLength(text);
				if (!workload.largestAssistantText || textBytes > workload.largestAssistantText.bytes) {
					workload.largestAssistantText = { bytes: textBytes, sessionId: summary.id, entryId: entry.id };
				}
				for (const call of toolCalls(message)) {
					pendingCalls.set(call.id, { name: call.name, startedAt: entryTime(entry) });
					const bytes = argumentBytes(call);
					const current = workload.largestToolCallArgs.get(call.name);
					if (!current || bytes > current.bytes) workload.largestToolCallArgs.set(call.name, { tool: call.name, bytes, sessionId: summary.id, entryId: entry.id });
				}
			} else if (message.role === "toolResult") {
				const name = message.toolName ?? pendingCalls.get(message.toolCallId)?.name ?? "unknown";
				const tool = tools.get(name) ?? { tool: name, calls: 0, errors: 0, durations: [], resultBytes: [] };
				tool.calls++;
				if (message.isError) tool.errors++;
				if (typeof message.durationMs === "number") tool.durations.push(message.durationMs);
				const bytes = resultBytes(message);
				tool.resultBytes.push(bytes);
				tools.set(name, tool);
				const current = workload.largestToolResult.get(name);
				if (!current || bytes > current.bytes) workload.largestToolResult.set(name, { tool: name, bytes, sessionId: summary.id, entryId: entry.id });
			}
		}
	}

	const modelRows = [...models.values()]
		.map((m) => ({
			provider: m.provider,
			model: m.model,
			calls: m.calls,
			errors: m.errors,
			durationP50: percentile(m.durations, 50),
			durationP95: percentile(m.durations, 95),
			durationMax: m.durations.length ? Math.max(...m.durations) : 0,
			outputTokensPerSecondMedian: percentile(m.tokensPerSecond, 50),
			cacheReadRatio: m.input + m.cacheRead > 0 ? m.cacheRead / (m.input + m.cacheRead) : 0,
			inputTokens: m.input,
			outputTokens: m.output,
			cost: m.cost,
		}))
		.sort((a, b) => b.calls - a.calls);
	const toolRows = [...tools.values()]
		.map((t) => ({
			tool: t.tool,
			calls: t.calls,
			errors: t.errors,
			durationP50: percentile(t.durations, 50),
			durationP95: percentile(t.durations, 95),
			durationMax: t.durations.length ? Math.max(...t.durations) : 0,
			resultBytesMedian: percentile(t.resultBytes, 50),
			resultBytesMax: t.resultBytes.length ? Math.max(...t.resultBytes) : 0,
		}))
		.sort((a, b) => b.calls - a.calls);
	const topSessions = loaded
		.map(({ summary }) => summary)
		.sort((a, b) => b.cost - a.cost);

	return {
		overview: { ...totals, nonMessageUsageCost, nonMessageUsageCount },
		models: modelRows,
		tools: toolRows,
		workload: {
			largestToolCallArgs: [...workload.largestToolCallArgs.values()].sort((a, b) => b.bytes - a.bytes),
			largestToolResult: [...workload.largestToolResult.values()].sort((a, b) => b.bytes - a.bytes),
			longestSessionByEntries: pick(workload.longestSessionByEntries, ["id", "entryCount", "bytes", "cwd"]),
			longestSessionByBytes: pick(workload.longestSessionByBytes, ["id", "entryCount", "bytes", "cwd"]),
			largestAssistantText: workload.largestAssistantText,
			sessionsWithCompaction: workload.sessionsWithCompaction,
		},
		topSessions,
	};
}

function pick(object, keys) {
	if (!object) return null;
	const out = {};
	for (const key of keys) out[key] = object[key];
	return out;
}

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[rank];
}

// ---------------------------------------------------------------------------
// Formatting

export function truncate(text, max) {
	const line = text.replace(/\s+/g, " ").trim();
	return line.length <= max ? line : `${line.slice(0, Math.max(0, max - 1))}…`;
}

export function fmtDuration(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return "0s";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
}

export function fmtBytes(bytes) {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function fmtCost(cost) {
	return `$${cost.toFixed(cost >= 10 ? 2 : 3)}`;
}

export function fmtLocal(epochMs) {
	if (epochMs === undefined) return "-";
	const d = new Date(epochMs);
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtTime(epochMs) {
	return epochMs === undefined ? "--:--" : fmtLocal(epochMs).slice(11);
}

/** Last `n` path segments, for compact cwd display. */
export function shortCwd(cwd, n = 2) {
	const parts = cwd.split(/[\\/]/).filter(Boolean);
	return parts.slice(-n).join("/") || cwd;
}

/**
 * Renders rows as an aligned table. `columns`: [{ key, title, align?: "right" }].
 * Cell values are stringified; undefined becomes "-".
 */
export function table(rows, columns) {
	const cells = rows.map((row) => columns.map((col) => (row[col.key] === undefined || row[col.key] === null ? "-" : String(row[col.key]))));
	const widths = columns.map((col, i) => Math.max(col.title.length, ...cells.map((row) => row[i].length)));
	const line = (values) => values.map((value, i) => (columns[i].align === "right" ? value.padStart(widths[i]) : value.padEnd(widths[i]))).join("  ").trimEnd();
	return [line(columns.map((col) => col.title)), line(widths.map((w) => "-".repeat(w))), ...cells.map(line)].join("\n");
}
