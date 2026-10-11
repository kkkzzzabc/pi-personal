import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { main, parseArgs, renderStats } from "../skills/pi-session-stats/scripts/stats.mjs";

const DIR = join(import.meta.dirname, "fixtures", "pi-sessions");
const NOW = Date.parse("2026-10-04T00:00:00Z");
const S1 = "11111111-1111-4111-8111-111111111111";

describe("parseArgs", () => {
	test("valued options, flags, and errors", () => {
		assert.deepEqual(parseArgs(["--since", "7d", "--top=3", "--json"]), { since: "7d", top: "3", json: true });
		assert.throws(() => parseArgs(["list"]), /Unexpected argument: list/);
		assert.throws(() => parseArgs(["--nope"]), /Unknown option --nope/);
		assert.throws(() => parseArgs(["--top", "--json"]), /--top needs a value/);
		assert.throws(() => main(["--sessions-dir", DIR, "--top", "1.5"], NOW), /--top must be a non-negative integer/);
	});
});

describe("text output", () => {
	const out = main(["--sessions-dir", DIR], NOW);

	test("has every section", () => {
		for (const title of ["## Overview", "## Models", "## Tools", "## Workload sizes", "## Top sessions by cost"]) assert.match(out, new RegExp(`^${title}`, "m"));
	});
	test("overview numbers", () => {
		assert.match(out, /^sessions 3 {2}span 2026-10-01 .* → 2026-10-03/m);
		assert.match(out, /^user turns 7 {2}assistant messages 7 {2}tool calls 4 {2}tool errors 1$/m);
		assert.match(out, /^cost \$0\.085 \(of which \$0\.065 from 2 non-message usage entries/m);
	});
	test("model and tool rows", () => {
		assert.match(out, /^anthropic\/claude-a\s+4\s+0\s+4s\s+30s\s+30s\s+25\.0\s+40%\s+4,000\s+700\s+\$0\.011$/m);
		assert.match(out, /^openai\/gpt-b\s+2\s+1\s+6s\s+14s\s+14s/m);
		assert.match(out, /^bash\s+1\s+1\s+4s\s+4s\s+4s\s+3\.0K\s+3\.0K$/m);
	});
	test("workload entries reference sessions and entries", () => {
		assert.match(out, /^ {2}write\s+48\.9K {2}session 11111111 entry e006$/m);
		assert.match(out, /^longest session by entries: 11111111 {2}14 entries/m);
		assert.match(out, /^sessions with compaction: {3}11111111 \(1\)$/m);
	});
	test("top sessions sorted by cost and footer names the source", () => {
		const top = out.slice(out.indexOf("## Top sessions"));
		assert.ok(top.indexOf("11111111") < top.indexOf("22222222") && top.indexOf("22222222") < top.indexOf("33333333"));
		assert.match(out, /branches included$/);
	});
	test("filters narrow the data", () => {
		const beta = main(["--sessions-dir", DIR, "--cwd", "beta"], NOW);
		assert.match(beta, /^sessions 1 /m);
		assert.doesNotMatch(beta, /claude-a/);
	});
});

describe("json output", () => {
	const data = JSON.parse(main(["--sessions-dir", DIR, "--json", "--top", "2"], NOW));

	test("matches the printed numbers", () => {
		assert.equal(data.overview.sessions, 3);
		assert.equal(data.overview.toolCalls, 4);
		assert.equal(data.models.find((m) => m.model === "claude-a").durationP95, 30_000);
		assert.equal(data.workload.largestToolCallArgs[0].sessionId, S1);
		assert.equal(data.topSessions.length, 2);
		assert.equal(data.sessionsDir, DIR);
	});
	test("contains no conversation text or file paths", () => {
		const raw = main(["--sessions-dir", DIR, "--json"], NOW);
		assert.doesNotMatch(raw, /Please refactor the parser module/);
		assert.doesNotMatch(raw, /Summarize the design/);
		assert.equal(Object.hasOwn(data.topSessions[0], "firstUserText"), false);
		assert.equal(Object.hasOwn(data.topSessions[0], "path"), false);
	});
	test("renderStats accepts the json model", () => {
		assert.match(renderStats(data, { top: 1, dir: "x" }), /## Overview[\s\S]*source x;/);
	});
});

describe("entry point", () => {
	const scratch = mkdtempSync(join(tmpdir(), "pi personal "));
	after(() => rmSync(scratch, { recursive: true, force: true }));

	test("runs when invoked through a symlink in a directory with a space", () => {
		const link = join(scratch, "stats.mjs");
		symlinkSync(join(import.meta.dirname, "..", "skills", "pi-session-stats", "scripts", "stats.mjs"), link);
		const run = spawnSync(process.execPath, [link, "--sessions-dir", DIR, "--top", "1"], { encoding: "utf8" });
		assert.equal(run.status, 0, run.stderr);
		assert.match(run.stdout, /^## Overview/m);
	});
});
