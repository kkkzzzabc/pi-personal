import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { DEFAULTS, loadConfig, outputDir, validateConfig } from "../extensions/pi-perf-log/config.ts";
import { createPerfLogExtension, PERF_LOG_EVENTS } from "../extensions/pi-perf-log/extension.ts";
import { Recorder } from "../extensions/pi-perf-log/recorder.ts";
import { createWriter } from "../extensions/pi-perf-log/writer.ts";

const scratch = mkdtempSync(join(tmpdir(), "pi-perf-log-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const MEMORY = { rss: 400_000_000, heapUsed: 90_000_000, external: 20_000_000, arrayBuffers: 3_000_000 };
function fakeClock() {
	const clock = { t: 0, now: () => clock.t, wall: () => `2026-10-12T00:00:${String(clock.t / 1000).padStart(6, "0")}Z`, memory: () => ({ ...MEMORY }) };
	return clock;
}
const TURN_KEYS = [
	"v", "at", "sessionId", "pid", "type", "runSeq", "turnIndex", "messageEntryId", "provider", "model", "stopReason", "connectMs", "ttftMs", "firstKind",
	"providerMs", "turnMs", "toolCount", "toolMs", "toolSpanMs", "toolNames", "outputTokens", "overheadMs", "rss", "heapUsed", "external", "arrayBuffers",
	"turnEndMissing", "frames",
];

function fullTurn(recorder, clock) {
	clock.t = 0;
	recorder.turnStart(0);
	clock.t = 400;
	recorder.assistantMessageStart();
	clock.t = 1800;
	recorder.assistantUpdate("thinking_delta");
	clock.t = 1900;
	recorder.assistantUpdate("text_delta");
	recorder.assistantMessageEnd({ provider: "anthropic", model: "claude-a", stopReason: "toolUse", durationMs: 8000, usage: { output: 512 } });
	clock.t = 8100;
	recorder.toolStart();
	clock.t = 8400;
	recorder.toolEnd("read", 300);
	recorder.toolStart();
	clock.t = 9040;
	recorder.toolEnd("edit", 640);
	clock.t = 9300;
	return recorder.turnEnd("entry-1");
}

describe("Recorder", () => {
	test("full turn produces the documented numbers", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "sess-1");
		recorder.agentStart();
		const record = fullTurn(recorder, clock);
		assert.equal(record.type, "turn");
		assert.equal(record.sessionId, "sess-1");
		assert.equal(record.runSeq, 1);
		assert.equal(record.messageEntryId, "entry-1");
		assert.equal(record.connectMs, 400);
		assert.equal(record.ttftMs, 1800);
		assert.equal(record.firstKind, "thinking");
		assert.equal(record.providerMs, 8000);
		assert.equal(record.turnMs, 9300);
		assert.equal(record.toolCount, 2);
		assert.equal(record.toolMs, 940);
		assert.equal(record.toolSpanMs, 940, "sequential tools: span equals the sum");
		assert.deepEqual(record.toolNames, ["read", "edit"]);
		assert.equal(record.outputTokens, 512);
		assert.equal(record.overheadMs, 9300 - 8000 - 940);
		assert.equal(record.turnEndMissing, false);
		assert.equal(record.rss, MEMORY.rss);
		assert.equal(record.arrayBuffers, MEMORY.arrayBuffers);
		assert.equal(record.frames, null);
		assert.deepEqual(Object.keys(record).sort(), [...TURN_KEYS].sort());
		for (const forbidden of ["text", "content", "arguments", "path"]) assert.equal(Object.hasOwn(record, forbidden), false);
	});

	test("a second delta does not move the first-token time", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		clock.t = 500;
		recorder.assistantUpdate("text_delta");
		clock.t = 900;
		recorder.assistantUpdate("text_delta");
		recorder.assistantUpdate("toolcall_delta");
		const record = recorder.turnEnd();
		assert.equal(record.ttftMs, 500);
		assert.equal(record.firstKind, "text");
	});

	test("non-delta events and events outside a turn are ignored", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.assistantUpdate("text_delta");
		recorder.assistantMessageStart();
		recorder.toolEnd("read", 5);
		assert.equal(recorder.turnEnd(), undefined);
		recorder.turnStart(0);
		clock.t = 100;
		recorder.assistantUpdate("text_start");
		recorder.assistantUpdate("thinking_end");
		assert.equal(recorder.turnEnd().ttftMs, null);
	});

	test("a missing turn_end is flushed by the next turn_start, agent_end, session_start, or shutdown", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		clock.t = 50;
		const byTurnStart = recorder.turnStart(1);
		assert.equal(byTurnStart.turnEndMissing, true);
		assert.equal(byTurnStart.flushedBy, "turn_start");
		assert.equal(byTurnStart.turnMs, 50);
		const byAgentEnd = recorder.agentEnd();
		assert.equal(byAgentEnd.flushed.flushedBy, "agent_end");
		assert.equal(byAgentEnd.flushed.turnIndex, 1);
		recorder.turnStart(2);
		assert.equal(recorder.sessionStart("new").flushed.flushedBy, "session_start");
		recorder.turnStart(0);
		assert.equal(recorder.shutdown().flushedBy, "shutdown");
		assert.equal(recorder.shutdown(), undefined);
		assert.equal(fullTurn(recorder, clock).turnEndMissing, false);
	});

	test("an aborted turn without a stream still produces a record with null timings", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		recorder.assistantMessageEnd({ provider: "p", model: "m", stopReason: "aborted" });
		clock.t = 10;
		const record = recorder.turnEnd();
		assert.equal(record.stopReason, "aborted");
		assert.equal(record.connectMs, null);
		assert.equal(record.ttftMs, null);
		assert.equal(record.firstKind, null);
		assert.equal(record.providerMs, null);
		assert.equal(record.overheadMs, null);
		assert.equal(record.outputTokens, null);
	});

	test("runSeq counts agent runs; run records count turns and time; session_start restarts runSeq", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.sessionStart("startup");
		recorder.agentStart();
		recorder.turnStart(0);
		recorder.turnEnd();
		recorder.turnStart(1);
		clock.t = 2500;
		recorder.turnEnd();
		const first = recorder.agentEnd();
		assert.equal(first.flushed, undefined);
		assert.deepEqual([first.run.type, first.run.runSeq, first.run.runMs, first.run.turns], ["run", 1, 2500, 2]);
		recorder.agentStart();
		recorder.turnStart(0);
		const second = recorder.turnEnd();
		assert.equal(second.runSeq, 2);
		assert.equal(second.turnIndex, 0);
		recorder.sessionStart("resume");
		recorder.agentStart();
		recorder.turnStart(0);
		assert.equal(recorder.turnEnd().runSeq, 1, "runSeq restarts after every session_start (documented; not unique per file)");
	});

	test("session id is read at write time", () => {
		const clock = fakeClock();
		let id = "old";
		const recorder = new Recorder(clock, () => id);
		recorder.turnStart(0);
		id = "new";
		assert.equal(recorder.turnEnd().sessionId, "new");
		assert.equal(recorder.sessionStart("new").session.sessionId, "new");
	});

	test("tool end without a duration counts the call only; span still covers it", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		clock.t = 10;
		recorder.toolEnd("bash");
		const record = recorder.turnEnd();
		assert.equal(record.toolCount, 1);
		assert.equal(record.toolMs, 0);
		assert.equal(record.toolSpanMs, 0, "end without start: zero-length span at the end time");
		assert.deepEqual(record.toolNames, ["bash"]);
	});

	test("parallel tools: overhead uses the wall-clock span, not the summed durations", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		recorder.assistantMessageEnd({ provider: "p", model: "m", stopReason: "toolUse", durationMs: 1000 });
		clock.t = 1000;
		recorder.toolStart();
		recorder.toolStart();
		recorder.toolStart();
		clock.t = 2000;
		recorder.toolEnd("a", 1000);
		recorder.toolEnd("b", 1000);
		recorder.toolEnd("c", 1000);
		clock.t = 3200;
		const record = recorder.turnEnd();
		assert.equal(record.toolMs, 3000);
		assert.equal(record.toolSpanMs, 1000);
		assert.equal(record.overheadMs, 1200);
	});

	test("sequential tools with a gap: span covers the gap; no tools: span is zero", () => {
		const clock = fakeClock();
		const recorder = new Recorder(clock, () => "s");
		recorder.turnStart(0);
		recorder.assistantMessageEnd({ provider: "p", model: "m", stopReason: "toolUse", durationMs: 500 });
		clock.t = 600;
		recorder.toolStart();
		clock.t = 700;
		recorder.toolEnd("a", 100);
		clock.t = 1200;
		recorder.toolStart();
		clock.t = 1300;
		recorder.toolEnd("b", 100);
		clock.t = 1400;
		const gap = recorder.turnEnd();
		assert.equal(gap.toolMs, 200);
		assert.equal(gap.toolSpanMs, 700);
		assert.equal(gap.overheadMs, 1400 - 500 - 700);
		recorder.turnStart(1);
		recorder.assistantMessageEnd({ provider: "p", model: "m", stopReason: "stop", durationMs: 300 });
		clock.t = 1900;
		const none = recorder.turnEnd();
		assert.equal(none.toolSpanMs, 0);
		assert.equal(none.overheadMs, 500 - 300);
	});

	test("flushed turns have a null messageEntryId; turn_end carries it", () => {
		const recorder = new Recorder(fakeClock(), () => "s");
		recorder.turnStart(0);
		const flushed = recorder.turnStart(1);
		assert.equal(flushed.messageEntryId, null);
		assert.equal(recorder.turnEnd("abc").messageEntryId, "abc");
		recorder.turnStart(2);
		assert.equal(recorder.turnEnd().messageEntryId, null);
	});
});

describe("writer", () => {
	test("appends one line per record and creates the directory", () => {
		const dir = join(scratch, "nested", "perf");
		const writer = createWriter(() => dir);
		assert.equal(writer.append({ v: 1, type: "session", at: "t", sessionId: "abc", pid: 1, reason: "startup", rss: 1, heapUsed: 1 }), true);
		assert.equal(writer.append({ v: 1, type: "run", at: "t", sessionId: "abc", pid: 1, runSeq: 1, runMs: 5, turns: 1 }), true);
		const lines = readFileSync(join(dir, "abc.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.deepEqual(lines.map((l) => l.type), ["session", "run"]);
	});
	test("skips records without a session id and never throws", () => {
		const blocked = join(scratch, "blocked");
		writeFileSync(blocked, "not a directory");
		const writer = createWriter(() => blocked);
		assert.equal(writer.append({ v: 1, type: "run", at: "t", sessionId: undefined, pid: 1, runSeq: 1, runMs: 5, turns: 1 }), false);
		assert.equal(writer.append({ v: 1, type: "run", at: "t", sessionId: "x", pid: 1, runSeq: 1, runMs: 5, turns: 1 }), false);
	});
});

describe("config", () => {
	test("validateConfig rejects unknown and mistyped fields", () => {
		assert.throws(() => validateConfig({ bogus: 1 }), /Unknown configuration field/);
		assert.throws(() => validateConfig({ enabled: "yes" }), /enabled must be a boolean/);
		assert.throws(() => validateConfig({ dir: 1 }), /dir must be/);
		assert.throws(() => validateConfig({ dir: "" }), /dir must be/);
		assert.throws(() => validateConfig([]), /Expected an object/);
		assert.deepEqual(validateConfig({ enabled: false, dir: null }), { enabled: false, dir: null });
	});
	test("loadConfig merges files, ignores missing ones, and disables on invalid content", () => {
		const missing = () => {
			throw Object.assign(new Error("nope"), { code: "ENOENT" });
		};
		assert.deepEqual(loadConfig("/agent", "/cwd", true, missing).config, DEFAULTS);
		const files = { "/agent/pi-perf-log.json": '{"dir":"/custom"}', "/cwd/.pi/pi-perf-log.json": '{"enabled":false}' };
		const read = (file) => {
			if (!(file in files)) return missing();
			return files[file];
		};
		assert.deepEqual(loadConfig("/agent", "/cwd", true, read).config, { enabled: false, dir: "/custom" });
		assert.deepEqual(loadConfig("/agent", "/cwd", false, read).config, { enabled: true, dir: "/custom" }, "project file needs trust");
		const broken = loadConfig("/agent", "/cwd", false, () => "{secret: oops");
		assert.equal(broken.config.enabled, false);
		assert.match(broken.error, /Invalid or unreadable pi-perf-log configuration/);
		assert.doesNotMatch(broken.error, /secret/);
	});
	test("outputDir defaults under the agent dir", () => {
		assert.equal(outputDir(DEFAULTS, "/agent"), "/agent/perf");
		assert.equal(outputDir({ enabled: true, dir: "/x" }, "/agent"), "/x");
	});
});

function harness({ agentDir, clock = fakeClock(), load, sessionId = "sess-1" } = {}) {
	const handlers = {};
	const pi = { on: (name, handler) => { handlers[name] = handler; } };
	const notifications = [];
	const ctx = {
		cwd: "/cwd",
		hasUI: true,
		ui: { notify: (message, level) => notifications.push({ message, level }) },
		isProjectTrusted: () => false,
		sessionManager: { getSessionId: () => sessionId },
	};
	createPerfLogExtension({ agentDir: () => agentDir, clock, load })(pi);
	const fire = (name, event = {}) => handlers[name]({ type: name, ...event }, ctx);
	return { handlers, fire, clock, notifications, ctx };
}

function perfLines(agentDir, sessionId) {
	try {
		return readFileSync(join(agentDir, "perf", `${sessionId}.jsonl`), "utf8").trim().split("\n").map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

describe("extension wiring", () => {
	test("registers exactly the documented events", () => {
		const h = harness({ agentDir: join(scratch, "a0") });
		assert.deepEqual(Object.keys(h.handlers).sort(), [...PERF_LOG_EVENTS].sort());
	});

	test("writes session, turn, and run lines for a full sequence", () => {
		const agentDir = join(scratch, "a1");
		const h = harness({ agentDir });
		h.fire("session_start", { reason: "startup" });
		h.fire("agent_start");
		h.fire("turn_start", { turnIndex: 0 });
		h.clock.t = 300;
		h.fire("message_start", { message: { role: "user" } });
		h.fire("message_start", { message: { role: "assistant", stopReason: "pending" } });
		h.clock.t = 1200;
		h.fire("message_update", { message: { role: "user" }, assistantMessageEvent: { type: "text_delta" } });
		h.clock.t = 1500;
		h.fire("message_update", { message: { role: "assistant" }, assistantMessageEvent: { type: "text_delta" } });
		h.fire("message_end", { message: { role: "assistant", provider: "p", model: "m", stopReason: "stop", durationMs: 1400, usage: { output: 40 } } });
		h.clock.t = 1600;
		h.fire("tool_execution_start", { toolCallId: "c1", toolName: "read" });
		h.fire("tool_execution_start", { toolCallId: "c1-inner", toolName: "bash", parentToolCallId: "c1" });
		h.fire("tool_execution_end", { toolCallId: "c1-inner", toolName: "bash", durationMs: 5, parentToolCallId: "c1" });
		h.clock.t = 1700;
		h.fire("tool_execution_end", { toolCallId: "c1", toolName: "read", durationMs: 20 });
		h.clock.t = 2000;
		h.fire("turn_end", { turnIndex: 0, messageEntryId: "entry-9" });
		h.fire("agent_end", { messages: [] });
		const lines = perfLines(agentDir, "sess-1");
		assert.deepEqual(lines.map((l) => l.type), ["session", "turn", "run"]);
		assert.equal(lines[0].reason, "startup");
		assert.equal(lines[1].connectMs, 300, "user message_start is ignored; assistant one counts");
		assert.equal(lines[1].ttftMs, 1500, "user-role update is ignored");
		assert.equal(lines[1].providerMs, 1400);
		assert.deepEqual(lines[1].toolNames, ["read"], "nested call with parentToolCallId is not counted");
		assert.equal(lines[1].toolCount, 1);
		assert.equal(lines[1].toolMs, 20);
		assert.equal(lines[1].toolSpanMs, 100);
		assert.equal(lines[1].messageEntryId, "entry-9");
		assert.equal(lines[2].runSeq, 1);
		assert.equal(lines[2].turns, 1);
		assert.equal(h.notifications.length, 0);
	});

	test("a synthetic message_start for an error or aborted message does not set connectMs", () => {
		const agentDir = join(scratch, "a6");
		const h = harness({ agentDir });
		h.fire("session_start", { reason: "startup" });
		h.fire("agent_start");
		h.fire("turn_start", { turnIndex: 0 });
		h.clock.t = 5000;
		h.fire("message_start", { message: { role: "assistant", stopReason: "error", errorMessage: "connection refused" } });
		h.fire("message_end", { message: { role: "assistant", provider: "p", model: "m", stopReason: "error", durationMs: 5000 } });
		h.fire("turn_end", { turnIndex: 0, messageEntryId: "e1" });
		h.fire("turn_start", { turnIndex: 1 });
		h.clock.t = 5100;
		h.fire("message_start", { message: { role: "assistant", stopReason: "aborted" } });
		h.fire("message_end", { message: { role: "assistant", stopReason: "aborted" } });
		h.fire("turn_end", { turnIndex: 1, messageEntryId: "e2" });
		const turns = perfLines(agentDir, "sess-1").filter((l) => l.type === "turn");
		assert.equal(turns.length, 2);
		assert.deepEqual(turns.map((t) => [t.stopReason, t.connectMs, t.ttftMs, t.providerMs]), [["error", null, null, 5000], ["aborted", null, null, null]]);
	});

	test("disabled configuration writes nothing", () => {
		const agentDir = join(scratch, "a2");
		const h = harness({ agentDir, load: () => ({ config: { enabled: false, dir: null } }) });
		h.fire("session_start", { reason: "startup" });
		h.fire("turn_start", { turnIndex: 0 });
		h.fire("turn_end", { turnIndex: 0 });
		assert.deepEqual(perfLines(agentDir, "sess-1"), []);
	});

	test("invalid configuration disables logging and warns once through the UI", () => {
		const agentDir = join(scratch, "a3");
		const h = harness({ agentDir, load: () => ({ config: { enabled: false, dir: null }, error: "Invalid or unreadable pi-perf-log configuration; check documented fields" }) });
		h.fire("session_start", { reason: "startup" });
		assert.equal(h.notifications.length, 1);
		assert.match(h.notifications[0].message, /pi-perf-log: Invalid/);
		assert.deepEqual(perfLines(agentDir, "sess-1"), []);
	});

	test("handler errors never propagate", () => {
		const agentDir = join(scratch, "a4");
		const throwing = { now: () => { throw new Error("clock broken"); }, wall: () => { throw new Error("wall broken"); }, memory: () => { throw new Error("mem broken"); } };
		const h = harness({ agentDir, clock: throwing });
		for (const name of PERF_LOG_EVENTS) assert.doesNotThrow(() => h.fire(name, { reason: "startup", turnIndex: 0, message: { role: "assistant" }, assistantMessageEvent: { type: "text_delta" }, toolName: "x", messages: [] }), name);
	});

	test("an unwritable directory warns once and keeps going", () => {
		const agentDir = join(scratch, "a5");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "perf"), "file in the way");
		const h = harness({ agentDir });
		h.fire("session_start", { reason: "startup" });
		h.fire("turn_start", { turnIndex: 0 });
		h.fire("turn_end", { turnIndex: 0 });
		assert.equal(h.notifications.length, 1);
		assert.match(h.notifications[0].message, /could not write/);
	});
});
