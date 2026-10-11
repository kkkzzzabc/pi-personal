import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { countOption, filtersFrom, listSessions, main, parseArgs, resolveSessionPath, searchSessions, showSession } from "../skills/pi-session-find/scripts/find.mjs";

const DIR = join(import.meta.dirname, "fixtures", "pi-sessions");
const S1 = "11111111-1111-4111-8111-111111111111";
const S3 = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-04T00:00:00Z");

describe("parseArgs", () => {
	test("positionals, valued options, flags, inline values", () => {
		const o = parseArgs(["search", "two words", "--since", "7d", "--json", "--limit=5", "--include", "tools"]);
		assert.deepEqual(o.positional, ["search", "two words"]);
		assert.equal(o.since, "7d");
		assert.equal(o.json, true);
		assert.equal(o.limit, "5");
		assert.equal(o.include, "tools");
	});
	test("rejects unknown options and missing values, including a following flag", () => {
		assert.throws(() => parseArgs(["--bogus"]), /Unknown option --bogus/);
		assert.throws(() => parseArgs(["--since"]), /--since needs a value/);
		assert.throws(() => parseArgs(["--limit", "--json"]), /--limit needs a value/);
	});
	test("countOption accepts non-negative integers only", () => {
		assert.equal(countOption({}, "limit", 30), 30);
		assert.equal(countOption({ limit: "0" }, "limit", 30), 0);
		assert.throws(() => countOption({ limit: "-1" }, "limit", 30), /--limit must be a non-negative integer/);
		assert.throws(() => countOption({ limit: "1.5" }, "limit", 30), /--limit must be/);
		assert.throws(() => listSessions(DIR, { limit: "abc" }, NOW), /--limit must be/);
	});
	test("filtersFrom converts times and passes substrings", () => {
		const f = filtersFrom({ since: "1d", cwd: "alpha" }, NOW);
		assert.equal(f.since, NOW - 86_400_000);
		assert.equal(f.cwd, "alpha");
		assert.equal(f.until, undefined);
	});
});

describe("list", () => {
	test("newest first, bounded by limit, footer counts", () => {
		const out = listSessions(DIR, { limit: "2" }, NOW);
		const lines = out.split("\n");
		assert.match(lines[0], /^ID\s+STARTED\s+DUR\s+CWD\s+MODEL\s+MSG\s+TOOLS\s+SIZE\s+FIRST USER MESSAGE$/);
		assert.match(lines[2], /^33333333 .*work\/beta .*glm-c .*Rename the config key/);
		assert.match(lines[3], /^22222222 .* 4\/2 .*Summarize the design/);
		assert.equal(lines.length, 6);
		assert.match(out, /2 sessions shown of 3 matched/);
	});
	test("--limit 0 prints only the header and footer", () => {
		const out = listSessions(DIR, { limit: "0" }, NOW);
		assert.equal(out.split("\n").length, 4);
		assert.match(out, /0 sessions shown of 3 matched/);
	});
	test("shows model count suffix and tool error marker", () => {
		const out = listSessions(DIR, { cwd: "alpha", since: "2026-10-01", until: "2026-10-01T23:00:00Z" }, NOW);
		assert.match(out, /11111111 .* gpt-b \+1 .* 2\/4 .* 3 !1 /);
		assert.match(out, /1 sessions shown of 1 matched/);
	});
	test("json shape", () => {
		const data = JSON.parse(listSessions(DIR, { json: true }, NOW));
		assert.equal(data.matched, 3);
		assert.deepEqual(Object.keys(data.sessions[0]).slice(0, 3), ["id", "path", "cwd"]);
	});
});

describe("search", () => {
	test("default scope: user and assistant text only", () => {
		assert.match(searchSessions(DIR, "throttle", {}, NOW), /22222222 .*\(2 matches\)\n  #1 user  Explain the throttle design\n  #2 assistant  The throttle/);
		assert.match(searchSessions(DIR, "ZEBRA", {}, NOW), /^0 sessions, 0 matches/);
	});
	test("--include tools reaches tool arguments and results", () => {
		const out = searchSessions(DIR, "zebra_token", { include: "tools" }, NOW);
		assert.match(out, /33333333 .*\(2 matches\)/);
		assert.match(out, /#1 assistant\/toolCall  edit \{"path":"config.json"/);
		assert.match(out, /#2 toolResult  edit Edited config.json: ZEBRA_TOKEN_RESULT/);
	});
	test("--role and --regex and per-session cap", () => {
		assert.match(searchSessions(DIR, "throttle", { role: "user" }, NOW), /\(1 match\)\n  #1 user/);
		assert.match(searchSessions(DIR, "thr.ttle", { regex: true, role: "assistant" }, NOW), /\(1 match\)\n  #2 assistant/);
		const capped = searchSessions(DIR, "throttle", { "max-per-session": "1" }, NOW);
		assert.match(capped, /\(2 matches\)\n  #1 user .*\n  … 1 more/);
	});
	test("json result has excerpts and entry ids", () => {
		const data = JSON.parse(searchSessions(DIR, "parser", { json: true }, NOW));
		assert.equal(data.sessions, 1);
		assert.equal(data.results[0].id, S1);
		assert.ok(data.results[0].hits.every((h) => typeof h.entryId === "string" && h.excerpt.includes("parser")));
	});
});

describe("show", () => {
	test("resolves full id, unique prefix, and path; rejects ambiguity", () => {
		const path = resolveSessionPath(DIR, S3);
		assert.equal(resolveSessionPath(DIR, "3333"), path);
		assert.equal(resolveSessionPath(DIR, path), path);
		assert.throws(() => resolveSessionPath(DIR, ""), /Ambiguous id prefix/);
		assert.throws(() => resolveSessionPath(DIR, "9999"), /No session matches/);
	});
	test("header and timeline for session 1", () => {
		const out = showSession(DIR, "1111", {});
		assert.match(out, /^session   11111111-1111/m);
		assert.match(out, /models    anthropic\/claude-a x2, openai\/gpt-b x2/);
		assert.match(out, /counts    entries 14, user 2, assistant 4, tool calls 3, tool errors 1, compactions 1, branches 0, malformed lines 2/);
		assert.match(out, /subagents 1: 20261001-100500-000-reviewer-1.md/);
		assert.match(out, /^U # {2}2 \d\d:\d\d {2}Please refactor the parser module$/m);
		assert.match(out, /^A # {2}5 \d\d:\d\d {2}claude-a {2}30s {2}Writing the new parser\. {2}tools: write x1$/m);
		assert.match(out, /^- # {2}9 .*model: openai\/gpt-b$/m);
		assert.match(out, /^- # 12 .*compaction: tokensBefore=90000/m);
		assert.match(out, /\[error: rate limited\]$/m);
	});
	test("--query filters the timeline; --json returns summary and timeline", () => {
		const out = showSession(DIR, "1111", { query: "tests" });
		assert.match(out, /4 of 10 timeline entries match "tests"/);
		assert.doesNotMatch(out, /Please refactor/);
		const data = JSON.parse(showSession(DIR, "1111", { json: true }));
		assert.equal(data.summary.id, S1);
		assert.equal(data.timeline.length, 10);
	});
	test("--full prints long text untruncated; parent shown as the id parsed from its path", () => {
		const text = showSession(DIR, "2222", { full: true });
		assert.match(text, /At 1 KB it parses every delta; at 8 KB only after 1 KB more arrives\./);
		assert.match(text, /^cwd       \/Users\/me\/work\/alpha  \(parent 11111111\)$/m);
	});
});

describe("main", () => {
	test("help, unknown command, missing query", () => {
		assert.match(main([]), /^pi-session-find \(read-only\)/);
		assert.throws(() => main(["frob", "--sessions-dir", DIR]), /Unknown command "frob"/);
		assert.throws(() => main(["search", "--sessions-dir", DIR]), /search needs a query/);
	});
	test("dispatches list with sessions dir", () => {
		assert.match(main(["list", "--sessions-dir", DIR, "--limit", "1"]), /1 sessions shown of 3 matched/);
	});
	test("show rejects session filters", () => {
		assert.throws(() => main(["show", "3333", "--cwd", "alpha", "--sessions-dir", DIR]), /show does not take session filters/);
	});
});

describe("entry point", () => {
	const scratch = mkdtempSync(join(tmpdir(), "pi personal "));
	after(() => rmSync(scratch, { recursive: true, force: true }));

	test("runs when invoked through a symlink in a directory with a space", () => {
		const link = join(scratch, "find.mjs");
		symlinkSync(join(import.meta.dirname, "..", "skills", "pi-session-find", "scripts", "find.mjs"), link);
		const run = spawnSync(process.execPath, [link, "list", "--sessions-dir", DIR, "--limit", "1"], { encoding: "utf8" });
		assert.equal(run.status, 0, run.stderr);
		assert.match(run.stdout, /1 sessions shown of 3 matched/);
	});
});
