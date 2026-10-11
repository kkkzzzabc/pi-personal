import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
	collectStats, discoverSessionFiles, excerpt, iterateTexts, loadSessions, makeMatcher, matchesFilters, parseWhen, percentile,
	maxOf, readSession, resolveSessionsDir, sessionIdFromPath, summarizeSession, table, truncate, typedUserText,
} from "../lib/pi-sessions.mjs";

const FIXTURES = join(import.meta.dirname, "fixtures", "pi-sessions");
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";

describe("resolveSessionsDir", () => {
	test("option, then session env, then agent env, then default", () => {
		const home = "/home/u";
		assert.equal(resolveSessionsDir({ sessionsDir: "/opt/s" }, { PI_CODING_AGENT_SESSION_DIR: "/env/s" }, home), "/opt/s");
		assert.equal(resolveSessionsDir({}, { PI_CODING_AGENT_SESSION_DIR: "/env/s", PI_CODING_AGENT_DIR: "/env/agent" }, home), "/env/s");
		assert.equal(resolveSessionsDir({}, { PI_CODING_AGENT_DIR: "/env/agent" }, home), "/env/agent/sessions");
		assert.equal(resolveSessionsDir({}, {}, home), "/home/u/.pi/agent/sessions");
		assert.equal(resolveSessionsDir({ sessionsDir: "~/x" }, {}, home), "/home/u/x");
	});
});

describe("discoverSessionFiles", () => {
	test("lists jsonl files newest first with ids from names", () => {
		const files = discoverSessionFiles(FIXTURES);
		assert.deepEqual(files.map((f) => f.id), [S3, S2, S1]);
		assert.equal(files[2].cwdDirName, "--Users-me-work-alpha--");
	});
	test("missing dir yields empty list", () => {
		assert.deepEqual(discoverSessionFiles("/nonexistent/dir"), []);
	});
});

describe("readSession and summarizeSession", () => {
	const files = discoverSessionFiles(FIXTURES);
	const byId = Object.fromEntries(files.map((f) => [f.id, readSession(f.path)]));

	test("tolerates broken JSON and message entries without a role; finds subagent files", () => {
		assert.equal(byId[S1].malformedLines, 2);
		assert.ok(byId[S1].entries.every((e) => e.id !== "bad1"));
		assert.equal(byId[S1].header.id, S1);
		assert.deepEqual(byId[S1].subagentFiles, ["20261001-100500-000-reviewer-1.md"]);
		assert.deepEqual(byId[S3].subagentFiles, []);
	});

	test("summary counts for session 1", () => {
		const s = summarizeSession(byId[S1]);
		assert.equal(s.cwd, "/Users/me/work/alpha");
		assert.equal(s.firstUserText, "Please refactor the parser module");
		assert.equal(s.userCount, 2);
		assert.equal(s.assistantCount, 4);
		assert.equal(s.toolCallCount, 3);
		assert.equal(s.toolErrorCount, 1);
		assert.equal(s.compactions, 1);
		assert.deepEqual(s.models.map((m) => `${m.provider}/${m.model}:${m.calls}`), ["anthropic/claude-a:2", "openai/gpt-b:2"]);
		// 0.0023 + 0.003 + 0.003 + 0.003 (messages) + 0.01 (cache_warm) + 0.055 (compaction)
		assert.ok(Math.abs(s.cost - 0.0763) < 1e-9, `cost ${s.cost}`);
		assert.equal(s.durationMs, 40_000);
		assert.equal(s.branchCount, 0);
	});

	test("summary uses the typed part of a skill command, counts a branch, parses the parent path", () => {
		const s = summarizeSession(byId[S2]);
		assert.equal(s.firstUserText, "Summarize the design");
		assert.equal(s.userCount, 4, "a /skill: command with arguments is a user turn");
		assert.equal(s.branchCount, 1);
		assert.match(s.parentSession, /_11111111-1111-4111-8111-111111111111\.jsonl$/);
		assert.equal(s.parentSessionId, S1);
	});

	test("lastModel is the most recent assistant model; endedAt uses the later of entry and message time", () => {
		const t0 = Date.parse("2026-10-05T10:00:00Z");
		const assistant = (id, model, entryMs, messageMs) => ({
			type: "message", id, parentId: null, timestamp: new Date(entryMs).toISOString(),
			message: { role: "assistant", content: [{ type: "text", text: "x" }], provider: "p", model, durationMs: 1000, timestamp: messageMs },
		});
		const session = {
			path: "/x/2026-10-05T10-00-00-000Z_44444444-4444-4444-8444-444444444444.jsonl",
			header: { type: "session", id: "44444444-4444-4444-8444-444444444444", cwd: "/w", timestamp: new Date(t0).toISOString() },
			entries: [assistant("a1", "A", t0 + 1000, t0 + 1000), assistant("a2", "B", t0 + 2000, t0 + 2000), assistant("a3", "A", t0 + 20_000, t0 + 10_000)],
			malformedLines: 0, bytes: 10, subagentFiles: [],
		};
		const s = summarizeSession(session);
		assert.deepEqual(s.models.map((m) => m.model), ["A", "B"]);
		assert.equal(s.lastModel.model, "A");
		assert.equal(s.endedAt, t0 + 20_000, "entry timestamp (end of reply) wins over message timestamp (start)");
		assert.equal(s.durationMs, 20_000);
		assert.equal(summarizeSession(byId[S1]).lastModel.model, "gpt-b");
	});

	test("typedUserText and sessionIdFromPath", () => {
		assert.equal(typedUserText("plain question"), "plain question");
		assert.equal(typedUserText("<skill name=\"x\">body</skill>"), "");
		assert.equal(typedUserText("<skill name=\"x\">body</skill>\n\n  do this  "), "do this");
		assert.equal(typedUserText("<system-reminder>r</system-reminder>"), "");
		assert.equal(sessionIdFromPath(`/a/b/2026-10-01T10-00-00-000Z_${S1}.jsonl`), S1);
		assert.equal(sessionIdFromPath("/a/b/not-a-session.txt"), undefined);
		assert.equal(sessionIdFromPath(undefined), undefined);
	});
});

describe("filters", () => {
	test("parseWhen handles relative and absolute values", () => {
		const now = Date.parse("2026-10-10T00:00:00Z");
		assert.equal(parseWhen("7d", now), now - 7 * 86_400_000);
		assert.equal(parseWhen("12h", now), now - 12 * 3_600_000);
		assert.equal(parseWhen("2026-10-01", now), Date.parse("2026-10-01"));
		assert.throws(() => parseWhen("yesterday", now), /Cannot parse time/);
	});

	test("matchesFilters by time, cwd, provider, model", () => {
		const loaded = loadSessions(FIXTURES);
		const s1 = loaded.find((l) => l.summary.id === S1).summary;
		assert.equal(matchesFilters(s1, { cwd: "ALPHA" }), true);
		assert.equal(matchesFilters(s1, { cwd: "beta" }), false);
		assert.equal(matchesFilters(s1, { provider: "openai" }), true);
		assert.equal(matchesFilters(s1, { model: "glm" }), false);
		assert.equal(matchesFilters(s1, { since: Date.parse("2026-10-01T10:00:30Z") }), true);
		assert.equal(matchesFilters(s1, { since: Date.parse("2026-10-01T11:00:00Z") }), false);
		assert.equal(matchesFilters(s1, { until: Date.parse("2026-10-01T09:00:00Z") }), false);
		assert.deepEqual(loadSessions(FIXTURES, { cwd: "beta" }).map((l) => l.summary.id), [S3]);
	});
});

describe("iterateTexts and matching", () => {
	const s3 = readSession(discoverSessionFiles(FIXTURES).find((f) => f.id === S3).path);

	test("default scope excludes tool arguments and results", () => {
		const texts = [...iterateTexts(s3)].map((t) => t.text).join("\n");
		assert.match(texts, /Rename the config key/);
		assert.match(texts, /Renaming\./);
		assert.doesNotMatch(texts, /ZEBRA_TOKEN/);
	});

	test("includeTools adds tool calls and results with kinds", () => {
		const items = [...iterateTexts(s3, { includeTools: true })];
		assert.deepEqual(items.map((t) => t.kind), ["text", "text", "toolCall", "toolResult"]);
		assert.match(items[2].text, /^edit .*ZEBRA_TOKEN_OLD/);
		assert.match(items[3].text, /^edit .*ZEBRA_TOKEN_RESULT/);
	});

	test("roles narrows the scope", () => {
		assert.deepEqual([...iterateTexts(s3, { roles: ["user"] })].map((t) => t.role), ["user"]);
	});

	test("matcher is case-insensitive; regex mode; excerpt bounds", () => {
		assert.deepEqual(makeMatcher("CONFIG")("Rename the config key"), { index: 11, length: 6 });
		assert.equal(makeMatcher("nope")("text"), null);
		assert.deepEqual(makeMatcher("c.nfig", { regex: true })("Rename the config key"), { index: 11, length: 6 });
		const text = `${"a".repeat(100)}HIT${"b".repeat(100)}`;
		const ex = excerpt(text, 100, 3, 10);
		assert.equal(ex, `…${"a".repeat(10)}HIT${"b".repeat(10)}…`);
	});
});

describe("collectStats", () => {
	const stats = collectStats(loadSessions(FIXTURES));

	test("overview totals", () => {
		assert.equal(stats.overview.sessions, 3);
		assert.equal(stats.overview.userTurns, 2 + 4 + 1);
		assert.equal(stats.overview.assistantMessages, 4 + 2 + 1);
		assert.equal(stats.overview.toolCalls, 3 + 0 + 1);
		assert.equal(stats.overview.toolErrors, 1);
		assert.equal(stats.overview.nonMessageUsageCount, 2);
		assert.ok(Math.abs(stats.overview.nonMessageUsageCost - 0.065) < 1e-9);
	});

	test("model rows with percentiles, errors, cache ratio", () => {
		const claude = stats.models.find((m) => m.model === "claude-a");
		assert.equal(claude.calls, 4);
		assert.equal(claude.errors, 0);
		assert.deepEqual([claude.durationP50, claude.durationP95, claude.durationMax], [4000, 30_000, 30_000]);
		// one call had cacheRead 3000 and cacheWrite 500 with input 1000; others input 1000 each
		assert.ok(Math.abs(claude.cacheReadRatio - 3000 / (4000 + 3000 + 500)) < 1e-9);
		const gpt = stats.models.find((m) => m.model === "gpt-b");
		assert.equal(gpt.errors, 1);
	});

	test("tool rows and workload maxima point at the right sessions", () => {
		const bash = stats.tools.find((t) => t.tool === "bash");
		assert.equal(bash.calls, 1);
		assert.equal(bash.errors, 1);
		assert.equal(bash.durationMax, 3900);
		const write = stats.workload.largestToolCallArgs.find((w) => w.tool === "write");
		assert.ok(write.bytes > 50_000);
		assert.equal(write.sessionId, S1);
		assert.equal(stats.workload.largestToolResult[0].tool, "bash");
		assert.equal(stats.workload.longestSessionByEntries.id, S1);
		assert.deepEqual(stats.workload.sessionsWithCompaction, [{ id: S1, compactions: 1 }]);
		assert.equal(stats.topSessions[0].id, S1);
		assert.deepEqual(Object.keys(stats.topSessions[0]), ["id", "startedAt", "cwd", "cost", "userCount", "assistantCount", "models"]);
	});
});

describe("formatting", () => {
	test("maxOf handles empty and very large arrays", () => {
		assert.equal(maxOf([]), 0);
		assert.equal(maxOf([3, 9, 2]), 9);
		assert.equal(maxOf([-5, -2]), -2);
		assert.equal(maxOf(new Array(300_000).fill(1)), 1);
	});
	test("percentile uses nearest rank", () => {
		assert.equal(percentile([], 50), 0);
		assert.equal(percentile([5, 1, 3], 50), 3);
		assert.equal(percentile([1, 2, 3, 4], 95), 4);
	});
	test("truncate collapses whitespace and marks cuts", () => {
		assert.equal(truncate("a  b\n c", 10), "a b c");
		assert.equal(truncate("abcdefghij", 5), "abcd…");
	});
	test("table aligns columns", () => {
		const out = table([{ a: "x", n: 1 }, { a: "long", n: 22 }], [{ key: "a", title: "A" }, { key: "n", title: "N", align: "right" }]);
		assert.equal(out, ["A      N", "----  --", "x      1", "long  22"].join("\n"));
	});
});
