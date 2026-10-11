import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { resolvePerfDir } from "../lib/pi-perf-records.mjs";
import { main, parseArgs, renderStats } from "../skills/pi-session-stats/scripts/stats.mjs";

const DIR = join(import.meta.dirname, "fixtures", "pi-sessions");
const PERF = join(import.meta.dirname, "fixtures", "pi-perf");
const scratchDir = mkdtempSync(join(tmpdir(), "pi-session-stats-test-"));
after(() => rmSync(scratchDir, { recursive: true, force: true }));
const NOW = Date.parse("2026-10-04T00:00:00Z");
const S1 = "11111111-1111-4111-8111-111111111111";

describe("parseArgs", () => {
	test("valued options, flags, and errors", () => {
		assert.deepEqual(parseArgs(["--since", "7d", "--top=3", "--json"]), { since: "7d", top: "3", json: true });
		assert.throws(() => parseArgs(["list"]), /Unexpected argument: list/);
		assert.throws(() => parseArgs(["--nope"]), /Unknown option --nope/);
		assert.throws(() => parseArgs(["--top", "--json"]), /--top needs a value/);
		assert.throws(() => main(["--sessions-dir", DIR, "--perf-dir", PERF, "--top", "1.5"], NOW), /--top must be a non-negative integer/);
	});
});

describe("text output", () => {
	const out = main(["--sessions-dir", DIR, "--perf-dir", PERF], NOW);

	test("has every section", () => {
		for (const title of ["## Overview", "## Models", "## Tools", "## Client timing", "## Workload sizes", "## Top sessions by cost"]) assert.match(out, new RegExp(`^${title}`, "m"));
		assert.ok(out.indexOf("## Tools") < out.indexOf("## Client timing") && out.indexOf("## Client timing") < out.indexOf("## Workload sizes"));
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
		const beta = main(["--sessions-dir", DIR, "--perf-dir", PERF, "--cwd", "beta"], NOW);
		assert.match(beta, /^sessions 1 /m);
		assert.doesNotMatch(beta, /claude-a/);
	});
});

describe("client timing", () => {
	const out = main(["--sessions-dir", DIR, "--perf-dir", PERF], NOW);
	const section = out.slice(out.indexOf("## Client timing"), out.indexOf("## Workload sizes"));

	test("coverage counts joins, missing turn_end, frames, and skipped lines", () => {
		assert.match(section, /^turns 5 {2}sessions with records 2\/3 {2}joined to session entries 3 {2}turn_end missing 1 {2}with frames 3$/m);
		assert.match(section, /^skipped lines: 1 malformed, 1 other schema versions$/m);
	});
	test("per-model connect, TTFT, and overhead percentiles", () => {
		assert.match(section, /^anthropic\/claude-a\s+2\s+400ms \/ 600ms\s+1\.2s \/ 2\.0s\s+10ms \/ 30ms \/ 30ms$/m);
		assert.match(section, /^openai\/gpt-b\s+2\s+800ms \/ 1\.0s\s+900ms \/ 3\.0s\s+5ms \/ 7ms \/ 7ms$/m);
		assert.match(section, /^zai\/glm-c\s+1\s+200ms \/ 200ms\s+500ms \/ 500ms\s+3ms \/ 3ms \/ 3ms$/m);
	});
	test("tool time versus span over the same turns; older records without a span are excluded", () => {
		assert.match(section, /^tools: 4 turns with tools {2}over 3 with a span: summed tool time 520ms {2}wall-clock span 370ms {2}\(1 older turns without span excluded\)$/m);
	});
	test("render frames: frame-weighted mean and share, per-turn p95 distribution, unmeasured turns", () => {
		assert.match(section, /^render frames: 40 frames in 2 turns \(3 measured, 2 unmeasured\) {2}mean 7\.5ms {2}per-turn p95 P50\/P95 6ms \/ 20ms {2}max 40ms {2}over 16ms 7\.5%$/m);
	});
	test("memory per session and slowest turns reference session and entry ids", () => {
		assert.match(section, /^ {2}11111111 {2}turns {4}4 {2}rss 100\.0M \u2192 130\.0M \(max 150\.0M\) {2}heap max 60\.0M$/m);
		assert.ok(section.indexOf("11111111  turns") < section.indexOf("33333333  turns"), "highest RSS first");
		assert.match(section, /largest overhead:\n {6}30ms {2}session 11111111 entry e006 {2}claude-a\n/);
		assert.match(section, /^ {7}7ms {2}session 11111111 entry - {2}gpt-b$/m, "older turn without an entry id");
		assert.match(section, /longest frames:\n {6}40ms {2}session 11111111 entry e006 {2}claude-a\n {7}8ms {2}session 11111111 entry e004 {2}claude-a/);
	});
	test("records of sessions outside the scope are never read", () => {
		assert.doesNotMatch(out, /99999999|of-scope|77777/);
		const beta = main(["--sessions-dir", DIR, "--perf-dir", PERF, "--cwd", "beta"], NOW);
		assert.match(beta, /^turns 1 {2}sessions with records 1\/1 {2}joined to session entries 1 /m);
		assert.match(beta, /^render frames: no frames rendered in 1 measured turns \(0 unmeasured\)$/m);
		assert.doesNotMatch(beta, /claude-a/);
	});
	test("section is omitted and json is null without records; non-TUI-only data says frames were not measured", () => {
		const empty = join(scratchDir, "empty-perf");
		mkdirSync(empty, { recursive: true });
		assert.doesNotMatch(main(["--sessions-dir", DIR, "--perf-dir", empty], NOW), /## Client timing/);
		assert.equal(JSON.parse(main(["--sessions-dir", DIR, "--perf-dir", empty, "--json"], NOW)).clientTiming, null);
		assert.doesNotMatch(main(["--sessions-dir", DIR, "--perf-dir", join(scratchDir, "missing")], NOW), /## Client timing/);
		const noFrames = join(scratchDir, "no-frames");
		mkdirSync(noFrames, { recursive: true });
		writeFileSync(join(noFrames, "33333333-3333-4333-8333-333333333333.jsonl"), `${JSON.stringify({ v: 1, type: "turn", sessionId: "x", provider: "zai", model: "glm-c", overheadMs: 4, frames: null })}\n`);
		assert.match(main(["--sessions-dir", DIR, "--perf-dir", noFrames, "--cwd", "beta"], NOW), /^render frames: not measured \(1 turns without frames/m);
	});
	test("duplicate session ids read the perf file once and join against all their entries", () => {
		const sessions = join(scratchDir, "dup-sessions", "--Users-me-work-beta--");
		mkdirSync(sessions, { recursive: true });
		const source = readFileSync(join(DIR, "--Users-me-work-beta--", "2026-10-03T10-00-00-000Z_33333333-3333-4333-8333-333333333333.jsonl"), "utf8");
		// Newest file first: the copy without e022 is read last, so a last-wins map would lose the join.
		writeFileSync(join(sessions, "2026-10-03T11-00-00-000Z_33333333-3333-4333-8333-333333333333.jsonl"), source);
		writeFileSync(join(sessions, "2026-10-03T10-00-00-000Z_44444444-4444-4444-8444-444444444444.jsonl"), source.replace(/"e022"/g, '"e099"'));
		const out = main(["--sessions-dir", join(scratchDir, "dup-sessions"), "--perf-dir", PERF], NOW);
		assert.match(out, /^turns 1 {2}sessions with records 1\/2 {2}joined to session entries 1 /m);
	});
	test("frame objects with a non-numeric field count as unmeasured", () => {
		const perf = join(scratchDir, "partial-frames");
		mkdirSync(perf, { recursive: true });
		const line = (frames) => JSON.stringify({ v: 1, type: "turn", provider: "zai", model: "glm-c", frames });
		writeFileSync(join(perf, "33333333-3333-4333-8333-333333333333.jsonl"), `${line({ count: 10, totalMs: null, maxMs: 9, p95Ms: 9, over16Ms: "unknown" })}\n${line({ count: 10, totalMs: 100, maxMs: 20, p95Ms: 15, over16Ms: 2 })}\n`);
		const out = main(["--sessions-dir", DIR, "--perf-dir", perf, "--cwd", "beta"], NOW);
		assert.match(out, /^render frames: 10 frames in 1 turns \(1 measured, 1 unmeasured\) {2}mean 10ms .* max 20ms {2}over 16ms 20\.0%$/m);
	});
	test("only skipped lines: coverage alone instead of a missing section", () => {
		const perf = join(scratchDir, "newer-schema");
		mkdirSync(perf, { recursive: true });
		writeFileSync(join(perf, "33333333-3333-4333-8333-333333333333.jsonl"), `${JSON.stringify({ v: 2, type: "turn" })}\nnot json\n`);
		const out = main(["--sessions-dir", DIR, "--perf-dir", perf, "--cwd", "beta"], NOW);
		assert.match(out, /## Client timing \(pi-perf-log\)\nturns 0 {2}sessions with records 0\/1 .*\nskipped lines: 1 malformed, 1 other schema versions\nno schema v1 turn records in scope/);
		assert.equal(JSON.parse(main(["--sessions-dir", DIR, "--perf-dir", perf, "--cwd", "beta", "--json"], NOW)).clientTiming.coverage.otherVersions, 1);
	});
	test("resolvePerfDir: option, then PI_CODING_AGENT_DIR, then ~/.pi/agent", () => {
		assert.equal(resolvePerfDir({ perfDir: "~/p" }, { PI_CODING_AGENT_DIR: "/agent" }, "/home/me"), "/home/me/p");
		assert.equal(resolvePerfDir({}, { PI_CODING_AGENT_DIR: "/agent" }, "/home/me"), "/agent/perf");
		assert.equal(resolvePerfDir({}, {}, "/home/me"), "/home/me/.pi/agent/perf");
	});
});

describe("json output", () => {
	const data = JSON.parse(main(["--sessions-dir", DIR, "--perf-dir", PERF, "--json", "--top", "2"], NOW));

	test("matches the printed numbers", () => {
		assert.equal(data.overview.sessions, 3);
		assert.equal(data.overview.toolCalls, 4);
		assert.equal(data.models.find((m) => m.model === "claude-a").durationP95, 30_000);
		assert.equal(data.workload.largestToolCallArgs[0].sessionId, S1);
		assert.equal(data.topSessions.length, 2);
		assert.equal(data.sessionsDir, DIR);
		const ct = data.clientTiming;
		assert.equal(ct.perfDir, PERF);
		assert.equal(ct.coverage.joined, 3);
		assert.equal(ct.frames.meanFrameMs, 7.5);
		assert.equal(ct.frames.over16Share, 3 / 40);
		assert.deepEqual(ct.models.find((m) => m.model === "anthropic/claude-a").ttft, { p50: 1200, p95: 2000, n: 2 });
		assert.equal(ct.slowest.overhead.length, 2, "--top bounds the slowest lists");
		assert.equal(ct.tools.toolMs, 520);
		const one = JSON.parse(main(["--sessions-dir", DIR, "--perf-dir", PERF, "--json", "--top", "1"], NOW)).clientTiming;
		assert.equal(one.memory.length, 1, "--top bounds the memory list in JSON too");
	});
	test("contains no conversation text or file paths", () => {
		const raw = main(["--sessions-dir", DIR, "--perf-dir", PERF, "--json"], NOW);
		assert.doesNotMatch(raw, /Please refactor the parser module/);
		assert.doesNotMatch(raw, /Summarize the design/);
		assert.equal(Object.hasOwn(data.topSessions[0], "firstUserText"), false);
		assert.equal(Object.hasOwn(data.topSessions[0], "path"), false);
		assert.doesNotMatch(JSON.stringify(data.clientTiming), /\/Users\/me|cwd/);
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
		const run = spawnSync(process.execPath, [link, "--sessions-dir", DIR, "--perf-dir", PERF, "--top", "1"], { encoding: "utf8" });
		assert.equal(run.status, 0, run.stderr);
		assert.match(run.stdout, /^## Overview/m);
	});
});
