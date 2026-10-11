import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, loadConfig, validateConfig } from "../extensions/turn-summary/config.ts";
import { buildContext, generateSummary, parseSummary, SYSTEM_PROMPT } from "../extensions/turn-summary/summary.ts";
import { SummaryController } from "../extensions/turn-summary/controller.ts";
import { createTurnSummaryExtension } from "../extensions/turn-summary/extension.ts";
import { createWidget, summaryLines } from "../extensions/turn-summary/widget.ts";

const conf = (v = {}) => ({ ...DEFAULTS, models: ["test/luna", "test/haiku"], ...v });
let n = 0;
const entry = (message) => ({ type: "message", id: `e${++n}`, message });
const user = (t) => entry({ role: "user", content: t });
const reply = (t, stopReason = "stop", extra = []) => entry({ role: "assistant", stopReason, content: [{ type: "thinking", thinking: "THINK_SECRET" }, ...extra, { type: "text", text: t }] });
const call = (id, name, args) => entry({ role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id, name, arguments: args }] });
const result = (id, ok, body = "RESULT_SECRET") => entry({ role: "toolResult", toolCallId: id, toolName: "x", isError: !ok, content: [{ type: "text", text: body }] });
const branch = () => [user("실패 테스트 2개 고쳐주세요"), reply("원인을 찾았습니다."), user("첫 번째를 고쳐주세요"),
	call("c1", "edit", { path: "src/a.ts", oldText: "ARG_SECRET" }), result("c1", true), call("c2", "bash", { command: "npm test SECRET_CMD" }), result("c2", false), reply("첫 번째를 고쳤고 테스트 하나가 아직 실패합니다.")];
const json = (v) => ({ stopReason: "stop", content: [{ type: "text", text: JSON.stringify(v) }], usage: { input: 20, output: 9, cost: { total: 0.002 } } });
const good = { summary: { done: "첫 번째 테스트 수정", open: "테스트 하나 실패", next: "남은 실패 원인 확인" } };
function registry(responses = [json(good)], auth = true) {
	const calls = []; let i = 0;
	return { calls, find: (p, id) => id === "missing" ? undefined : { provider: p, id, maxTokens: 4096 }, hasConfiguredAuth: () => auth,
		streamSimple(model, context, options) { calls.push({ model, context, options }); const r = responses[i++]; return { result: () => typeof r === "function" ? r(options) : Promise.resolve(r) }; } };
}

for (const data of [null, [], { x: 1 }, { enabled: 1 }, { models: [] }, { models: ["a/b", "a/b"] }, { models: ["a/b", "c/d", "e/f"] }, { models: ["nope"] }, { maxLineChars: 10 }, { maxToolTrace: -1 }, { timeoutMs: 0 }, { toString: "x" }])
	test(`invalid config ${JSON.stringify(data)}`, () => assert.throws(() => validateConfig(data)));
test("config: defaults, trusted override, fail-closed without echo", () => {
	assert.deepEqual(DEFAULTS.models, ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5"]);
	const read = (f) => f.includes("/.pi/") ? JSON.stringify({ enabled: false }) : JSON.stringify({ maxToolTrace: 5 });
	assert.equal(loadConfig("/a", "/r", true, read).config.enabled, false);
	assert.equal(loadConfig("/a", "/r", false, read).config.enabled, true);
	const bad = loadConfig("/a", "/r", false, () => "PRIVATE"); assert.equal(bad.config.enabled, false); assert.doesNotMatch(bad.error, /PRIVATE/);
});

test("scope C context: goal, current turn, bounded recent, trace without secrets", () => {
	const c = buildContext(branch(), conf());
	assert.equal(c.sessionGoal, "실패 테스트 2개 고쳐주세요");
	assert.equal(c.currentTurn.request, "첫 번째를 고쳐주세요");
	assert.match(c.currentTurn.response, /아직 실패/);
	assert.deepEqual(c.currentTurn.tools, [{ tool: "edit", ok: true, path: "src/a.ts" }, { tool: "bash", ok: false }]);
	assert.equal(c.recent.length, 2);
	assert.doesNotMatch(JSON.stringify(c), /SECRET/);
});
test("no context for error/length/aborted/tool-only endings or missing user", () => {
	for (const reason of ["error", "length", "aborted"]) assert.equal(buildContext([user("u"), reply("a", reason)], conf()), undefined);
	assert.equal(buildContext([user("u"), call("c", "read", {})], conf()), undefined);
	assert.equal(buildContext([reply("a")], conf()), undefined);
});
test("caps: tool trace limit flagged, long text truncated within budget", () => {
	const calls = Array.from({ length: 5 }, (_, i) => [call(`k${i}`, "read", { path: `f${i}` }), result(`k${i}`, true)]).flat();
	const c = buildContext([user("x".repeat(30000)), ...calls, reply("y".repeat(30000))], conf({ maxToolTrace: 3 }));
	assert.equal(c.currentTurn.tools.length, 3); assert.equal(c.currentTurn.toolsTruncated, true);
	assert.ok(JSON.stringify(c).length < DEFAULTS.maxContextChars * 1.2); assert.match(c.currentTurn.response, /truncated/);
});
test("total serialized context stays within maxContextChars, keeping failed tools first", () => {
	const long = "p".repeat(200);
	const calls = Array.from({ length: 40 }, (_, i) => [call(`b${i}`, "read", { path: `${long}${i}` }), result(`b${i}`, i !== 7)]).flat();
	for (const budget of [1000, 12000]) {
		const c = buildContext([user("목표 ".repeat(5000)), reply("앞선 답 ".repeat(3000)), user("요청 ".repeat(5000)), ...calls, reply("결과 ".repeat(9000))], conf({ maxContextChars: budget, maxToolTrace: 100 }), { done: "d".repeat(120), open: "o".repeat(120), next: "n".repeat(120) });
		assert.ok(JSON.stringify(c).length <= budget, `budget ${budget}: ${JSON.stringify(c).length}`);
		assert.equal(c.currentTurn.toolsTruncated, true);
		assert.ok(c.currentTurn.tools.some((t) => !t.ok), "the failed tool is retained");
		assert.ok(c.currentTurn.response.length > 0);
	}
});
test("a steering message mid-run stays in the same turn with its earlier tool failures", () => {
	const steered = [user("목표"), reply("시작합니다."), user("테스트를 고쳐주세요"), call("s1", "bash", { command: "npm test" }), result("s1", false),
		user("README도 같이 고쳐주세요"), call("s2", "edit", { path: "README.md" }), result("s2", true), reply("README를 고쳤습니다.")];
	const c = buildContext(steered, conf());
	assert.deepEqual(c.currentTurn.tools.map((t) => [t.tool, t.ok]), [["bash", false], ["edit", true]]);
	assert.match(c.currentTurn.request, /테스트를 고쳐주세요/); assert.match(c.currentTurn.request, /README도 같이/);
});
test("previous summary is labeled unverified", () => {
	const c = buildContext(branch(), conf(), { done: "OLD", open: null, next: null });
	assert.equal(c.previousSummary.done, "OLD"); assert.match(c.previousSummary.note, /Unverified/);
	assert.match(SYSTEM_PROMPT, /never call unfinished, failed, or unverified work done/i);
});

for (const out of ["{}", '{"summary":1}', '{"summary":{"done":""}}', '{"summary":{"done":"a\\nb"}}', '{"summary":{"done":"\\u001b[2J"}}', '{"summary":{"done":"/commit"}}', '{"summary":{"done":"ok","extra":1}}', '{"summary":null,"x":1}', "not json", '{"summary":{"done":"끝"}}', '{"summary":{"done":"끝","open":null}}', '{"summary":{"open":null,"next":null}}'])
	test(`reject output ${out}`, () => assert.throws(() => parseSummary(out, 120)));
test("accept full, partial, and abstained summaries; enforce code-point length", () => {
	assert.deepEqual(parseSummary(JSON.stringify(good), 120), good.summary);
	assert.deepEqual(parseSummary('{"summary":{"done":"끝","open":null,"next":null}}', 120), { done: "끝", open: null, next: null });
	assert.equal(parseSummary('{"summary":null}', 120), null);
	assert.throws(() => parseSummary(JSON.stringify({ summary: { done: "가".repeat(41), open: null, next: null } }), 40));
});

const gen = (r, c = conf(), signal = new AbortController().signal) => generateSummary(r, buildContext(branch(), c), c, signal);
test("primary success: one call, no tools, usage recorded", async () => {
	const r = registry(); const g = await gen(r); assert.equal(g.outcome, "ready"); assert.equal(r.calls.length, 1);
	assert.equal(r.calls[0].context.tools, undefined); assert.equal(g.attempts[0].cost, 0.002);
});
test("provider error falls back once; malformed and abstain do not", async () => {
	const r = registry([{ stopReason: "error", errorMessage: "TOKEN_SECRET" }, json(good)]); const g = await gen(r);
	assert.deepEqual(g.attempts.map((a) => a.outcome), ["provider-error", "success"]); assert.doesNotMatch(JSON.stringify(g), /SECRET/);
	for (const first of [json({ summary: null }), { stopReason: "stop", content: [{ type: "text", text: "nope" }] }]) {
		const r2 = registry([first, json(good)]); await gen(r2); assert.equal(r2.calls.length, 1);
	}
});
test("unavailable and strict model; deadline; cancellation", async () => {
	const r = registry(); const g = await gen(r, conf({ models: ["test/missing", "test/haiku"] })); assert.equal(g.attempts[0].outcome, "unavailable"); assert.equal(r.calls[0].model.id, "haiku");
	const strict = registry(); assert.equal((await gen(strict, conf({ models: ["test/missing"] }))).outcome, "failed"); assert.equal(strict.calls.length, 0);
	const slow = registry([() => new Promise(() => {}), json(good)]); const t = await gen(slow, conf({ timeoutMs: 100 })); assert.equal(t.attempts[0].outcome, "timeout"); assert.equal(t.outcome, "ready");
	const abort = new AbortController(); const p = gen(registry([() => new Promise(() => {})]), conf(), abort.signal); abort.abort(); assert.equal((await p).outcome, "cancelled");
});
test("controller discards stale results", async () => {
	const c = new SummaryController(); let done; const p = c.run(() => new Promise((r) => { done = r; }), () => true, () => {});
	c.invalidate(); done({ outcome: "ready", summary: good.summary, attempts: [], elapsedMs: 1 }); await p; assert.equal(c.summary, undefined);
	const d = new SummaryController(); await d.run(async () => ({ outcome: "ready", summary: good.summary, attempts: [], elapsedMs: 1 }), () => false, () => {}); assert.equal(d.state, "discarded");
});
test("thrown generation error does not reuse the previous result's attempts", async () => {
	const c = new SummaryController(); await c.run(async () => ({ outcome: "ready", summary: good.summary, attempts: [{ model: "m", outcome: "success" }], elapsedMs: 1 }), () => true, () => {});
	await c.run(async () => { throw new Error("lookup failed"); }, () => true, () => {});
	assert.equal(c.state, "failed"); assert.equal(c.last, undefined);
});
test("widget renders labeled lines within width and omits null fields", () => {
	const lib = { truncateToWidth: (s, w, e) => [...s].length > w ? [...s].slice(0, w - 1).join("") + e : s };
	const w = createWidget(lib, () => ({ done: "a".repeat(200), open: null, next: "n" }))({}, { fg: (_, s) => s });
	const lines = w.render(40); assert.equal(lines.length, 2); assert.ok(lines.every((l) => [...l].length <= 40)); assert.match(lines[1], /^▏Next/);
	assert.deepEqual(summaryLines({ done: "d", open: "o", next: null }).map((r) => r[0]), ["Done", "Open"]);
});

function harness({ mode = "tui", reg = registry() } = {}) {
	const handlers = new Map(); const commands = new Map(); const widgets = new Map(); const statuses = new Map(); const notices = [];
	let leaf = "L1"; let session = "S1"; let b = branch(); let idle = true; let pending = false;
	const ctx = { mode, cwd: "/r", isProjectTrusted: () => true, modelRegistry: reg, isIdle: () => idle, hasPendingMessages: () => pending,
		sessionManager: { getBranch: () => b, getSessionId: () => session, getLeafId: () => leaf },
		ui: { setWidget: (k, v, o) => { if (v) widgets.set(k, { v, o }); else widgets.delete(k); }, setStatus: (k, v) => statuses.set(k, v), notify: (m) => notices.push(m) } };
	createTurnSummaryExtension({ agentDir: () => "/a", lowestThinking: () => undefined, load: () => ({ config: conf() }), widget: (get) => ({ get }) })({ on: (e, f) => handlers.set(e, f), registerCommand: (k, c) => commands.set(k, c) });
	handlers.get("session_start")({ reason: "startup" }, ctx);
	return { ctx, reg, widgets, statuses, notices, commands, emit: (e, d = {}) => handlers.get(e)?.(d, ctx),
		set: (v) => { if (v.leaf) leaf = v.leaf; if (v.session) session = v.session; if (v.branch) b = v.branch; if ("idle" in v) idle = v.idle; if ("pending" in v) pending = v.pending; } };
}
const drain = () => new Promise((r) => setImmediate(r));
test("settled turn shows above-editor widget; new turn clears it; typing hook absent", async () => {
	const h = harness(); h.emit("agent_settled", { aborted: false }); await drain();
	const w = h.widgets.get("turn-summary"); assert.equal(w.o.placement, "aboveEditor"); assert.deepEqual(w.v.get(), good.summary);
	assert.equal(h.statuses.get("turn-summary"), undefined);
	h.emit("input"); assert.equal(h.widgets.has("turn-summary"), false);
});
for (const mode of ["rpc", "json", "print"]) test(`no inference or widget in ${mode}`, async () => {
	const h = harness({ mode }); h.emit("agent_settled", {}); await drain(); assert.equal(h.reg.calls.length, 0); assert.equal(h.widgets.size, 0);
});
test("no inference when aborted, busy, queued, or disabled", async () => {
	const h = harness(); h.emit("agent_settled", { aborted: true }); h.set({ idle: false }); h.emit("agent_settled", {}); h.set({ idle: true, pending: true }); h.emit("agent_settled", {});
	h.set({ pending: false }); await h.commands.get("turn-summary").handler("off", h.ctx); h.emit("agent_settled", {}); await drain(); assert.equal(h.reg.calls.length, 0);
});
for (const event of ["input", "agent_start", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact", "session_shutdown"]) test(`pending result discarded on ${event}`, async () => {
	let done; const reg = registry([() => new Promise((r) => { done = r; })]); const h = harness({ reg });
	h.emit("agent_settled", {}); assert.equal(h.statuses.get("turn-summary"), "summarizing…"); h.emit(event); done(json(good)); await drain();
	assert.equal(h.widgets.has("turn-summary"), false);
});
test("a new message before completion discards the result", async () => {
	let done; const reg = registry([() => new Promise((r) => { done = r; })]); const h = harness({ reg });
	h.emit("agent_settled", {}); h.set({ branch: [...branch(), user("새 메시지")], leaf: "L2" }); done(json(good)); await drain(); assert.equal(h.widgets.has("turn-summary"), false);
});
test("model and thinking-level change entries keep the summary visible, pending or shown", async () => {
	let done; const reg = registry([() => new Promise((r) => { done = r; })]); const h = harness({ reg }); const b = branch();
	h.set({ branch: b, leaf: b.at(-1).id }); h.emit("agent_settled", {});
	const withModel = [...b, { type: "model_change", id: "m1", provider: "p", modelId: "x" }]; h.set({ branch: withModel, leaf: "m1" });
	done(json(good)); await drain(); assert.deepEqual(h.widgets.get("turn-summary").v.get(), good.summary);
	h.set({ branch: [...withModel, { type: "thinking_level_change", id: "t1", thinkingLevel: "low" }], leaf: "t1" });
	assert.deepEqual(h.widgets.get("turn-summary").v.get(), good.summary);
});
test("previous summary sent only for an ancestor leaf in the same session", async () => {
	const reg = registry([json(good), json(good), json(good)]); const h = harness({ reg }); const b1 = branch();
	h.set({ branch: b1, leaf: b1.at(-1).id }); h.emit("agent_settled", {}); await drain();
	const b2 = [...b1, user("다음"), reply("완료")]; h.set({ branch: b2, leaf: b2.at(-1).id }); h.emit("agent_settled", {}); await drain();
	assert.match(reg.calls[1].context.messages[0].content[0].text, /previousSummary/);
	const other = [user("다른 분기"), reply("응답")]; h.set({ branch: other, leaf: other.at(-1).id }); h.emit("agent_settled", {}); await drain();
	assert.doesNotMatch(reg.calls[2].context.messages[0].content[0].text, /previousSummary/);
});
test("identical failures warn once; success resets", async () => {
	const reg = registry([json(good)], false); const h = harness({ reg }); const warn = () => h.notices.filter((m) => /^Turn summary: unavailable/.test(m)).length;
	h.emit("agent_settled", {}); await drain(); h.emit("agent_start"); h.emit("agent_settled", {}); await drain(); assert.equal(warn(), 1);
	assert.equal(h.statuses.get("turn-summary"), "summary failed");
	reg.hasConfiguredAuth = () => true; h.emit("agent_start"); h.emit("agent_settled", {}); await drain(); assert.ok(h.widgets.has("turn-summary"));
	reg.hasConfiguredAuth = () => false; h.emit("agent_start"); h.emit("agent_settled", {}); await drain(); assert.equal(warn(), 2);
});
test("status command shows current summary and separate usage", async () => {
	const h = harness(); h.emit("agent_settled", {}); await drain(); await h.commands.get("turn-summary").handler("", h.ctx);
	assert.match(h.notices.at(-1), /Done: 첫 번째 테스트 수정/); assert.match(h.notices.at(-1), /not the main agent's native total/);
});
