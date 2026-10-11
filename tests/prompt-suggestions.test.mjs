import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, loadConfig, modelRef, validateConfig } from "../extensions/prompt-suggestions/config.ts";
import { buildConversation, generateSuggestion, parseSuggestion, SYSTEM_PROMPT } from "../extensions/prompt-suggestions/suggestion.ts";
import { SuggestionController } from "../extensions/prompt-suggestions/controller.ts";
import { createSuggestionsExtension } from "../extensions/prompt-suggestions/extension.ts";

const conf = (value = {}) => ({ ...DEFAULTS, models: ["test/luna", "test/haiku"], ...value });
const entry = (role, content, stopReason = "stop") => ({ type: "message", message: { role, content: typeof content === "string" ? [{ type: "text", text: content }] : content, stopReason } });
const branch = () => [entry("user", "실패 원인을 설명해주세요."), entry("assistant", "원인을 확인했고 아직 수정하지 않았습니다.")];
const response = (suggestion, extra = {}) => ({ stopReason: "stop", content: [{ type: "text", text: JSON.stringify({ suggestion }) }], usage: { input: 10, output: 3, cost: { total: 0.001 } }, ...extra });
function registry(responses = [response("원인을 더 자세히 설명해주세요.")], auth = true) {
 const calls = []; let i = 0;
 return { calls, find(provider, id) { return id === "missing" ? undefined : { provider, id, maxTokens: 4096 }; }, hasConfiguredAuth() { return auth; }, streamSimple(model, context, options) {
  calls.push({ model, context, options }); const r = responses[i++]; return { result: () => typeof r === "function" ? r(options, context) : Promise.resolve(r) };
 } };
}
const generate = (r, config = conf(), signal = new AbortController().signal) => generateSuggestion(r, buildConversation(branch(), config), config, signal);

for (const data of [null, [], { bogus: true }, { toString: "invalid" }, { enabled: "yes" }, { models: [] }, { models: ["luna"] }, { models: ["p/m", "p/m"] }, { models: ["p/m", "p/n", "p/o"] }, { models: ["p/\x1bmodel"] }, { timeoutMs: 0 }, { maxChars: 1 }, { maxTokens: 10 }, { maxMessages: 1 }, { maxContextChars: 999999 }]) test(`invalid config ${JSON.stringify(data)}`, () => assert.throws(() => validateConfig(data)));
test("defaults are independent exact allowed models", () => { assert.deepEqual(DEFAULTS.models, ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5"]); assert.ok(modelRef("openai/gpt-6-luna")); });
test("trusted project config overrides global; untrusted never reads it", () => {
 const reads = []; const read = (f) => { reads.push(f); return JSON.stringify(f.endsWith("/.pi/prompt-suggestions.json") ? { enabled: false } : { models: ["p/luna"] }); };
 assert.equal(loadConfig("/agent", "/repo", true, read).config.enabled, false);
 reads.length = 0; assert.deepEqual(loadConfig("/agent", "/repo", false, read).config.models, ["p/luna"]); assert.equal(reads.length, 1);
});
test("missing config uses defaults, invalid JSON is fail-closed and does not echo contents", () => {
 assert.deepEqual(loadConfig("/a", "/r", false, () => { throw Object.assign(new Error(), { code: "ENOENT" }); }).config, DEFAULTS);
 const r = loadConfig("/a", "/r", false, () => "PRIVATE_CONFIG_BODY"); assert.equal(r.config.enabled, false); assert.doesNotMatch(r.error, /PRIVATE/);
});
test("bounded active-branch text excludes thinking/images/system/tools/custom entries", () => {
 const b = [{ type: "custom", data: "CUSTOM_SECRET" }, entry("system", "SYSTEM_SECRET"), entry("user", [{ type: "text", text: "VISIBLE_USER" }, { type: "image", data: "IMAGE_SECRET" }]), entry("toolResult", "TOOL_SECRET"), entry("assistant", [{ type: "thinking", thinking: "THINK_SECRET" }, { type: "text", text: "VISIBLE_REPLY" }])];
 const context = buildConversation(b, conf()); assert.match(JSON.stringify(context), /VISIBLE/); assert.doesNotMatch(JSON.stringify(context), /SECRET/);
 const large = Array.from({ length: 10 }, (_, i) => entry(i % 2 ? "assistant" : "user", String(i) + "x".repeat(9000)));
 const c = buildConversation(large, conf()); assert.equal(c.length, 6); assert.ok(c.reduce((n, m) => n + m.text.length, 0) <= DEFAULTS.maxContextChars); assert.match(c.at(-1).text, /truncated/);
});
for (const reason of ["error", "length", "aborted", "toolUse"]) test(`no context after ${reason}`, () => assert.deepEqual(buildConversation([entry("user", "U"), entry("assistant", "A", reason)], conf()), []));
test("no suggestion from assistant-only or tool-only endings", () => { assert.deepEqual(buildConversation([entry("assistant", "A")], conf()), []); assert.deepEqual(buildConversation([entry("user", "U"), entry("assistant", [{ type: "toolCall", name: "read" }])], conf()), []); });
for (const output of ['{}', '{"suggestion":42}', '{"suggestion":""}', '{"suggestion":"/commit"}', '{"suggestion":"!rm -rf x"}', '{"suggestion":"a\\nb"}', '{"suggestion":"\\u001b[2J"}', '```json\n{"suggestion":null}\n```', '{"suggestion":null,"reason":"x"}']) test(`reject unsafe/non-contract output ${output}`, () => assert.throws(() => parseSuggestion(output, 240)));
test("accept Korean and explicit abstention; enforce Unicode length", () => { assert.equal(parseSuggestion('{"suggestion":"자세히 설명해주세요."}', 20), "자세히 설명해주세요."); assert.equal(parseSuggestion('{"suggestion":null}', 20), null); assert.throws(() => parseSuggestion(JSON.stringify({ suggestion: "한".repeat(21) }), 20)); });
test("primary succeeds without calling fallback; payload has no tools and reports usage", async () => {
 const r = registry(); const got = await generate(r); assert.equal(got.outcome, "ready"); assert.equal(r.calls.length, 1); assert.equal(got.attempts[0].input, 10); assert.equal(got.attempts[0].cost, 0.001);
 assert.equal(r.calls[0].context.tools, undefined); assert.equal(r.calls[0].context.systemPrompt, SYSTEM_PROMPT); assert.equal(r.calls[0].options.apiKey, undefined);
});
test("provider error falls back once; never includes raw error diagnostics", async () => {
 const r = registry([response(null, { stopReason: "error", errorMessage: "TOKEN_SECRET" }), response("추가로 설명해주세요.")]); const got = await generate(r);
 assert.equal(got.outcome, "ready"); assert.deepEqual(got.attempts.map((a) => a.outcome), ["provider-error", "success"]); assert.equal(r.calls.length, 2); assert.doesNotMatch(JSON.stringify(got), /SECRET/);
});
test("unavailable primary advances but strict model never chooses another", async () => {
 const r = registry(); const got = await generate(r, conf({ models: ["test/missing", "test/haiku"] })); assert.equal(got.attempts[0].outcome, "unavailable"); assert.equal(r.calls[0].model.id, "haiku");
 const strict = registry(); assert.equal((await generate(strict, conf({ models: ["test/missing"] }))).outcome, "failed"); assert.equal(strict.calls.length, 0);
});
test("valid abstention and malformed output do not escalate", async () => {
 for (const first of [response(null), response("x", { content: [{ type: "text", text: "not JSON" }] }), response("x", { stopReason: "length" })]) {
  const r = registry([first, response("more")]); const got = await generate(r); assert.equal(r.calls.length, 1); assert.ok(["abstained", "failed"].includes(got.outcome));
 }
});
test("deadline bounds a hung provider and leaves time for fallback", async () => {
 const r = registry([() => new Promise(() => {}), response("追加説明をお願いします。")]); const got = await generate(r, conf({ timeoutMs: 100 }));
 assert.equal(got.outcome, "ready"); assert.equal(got.attempts[0].outcome, "timeout"); assert.ok(got.elapsedMs < 1000);
});
test("cancellation aborts whole chain even if provider ignores signal", async () => {
 const abort = new AbortController(); const r = registry([() => new Promise(() => {})]); const p = generate(r, conf(), abort.signal); abort.abort();
 const got = await p; assert.equal(got.outcome, "cancelled"); assert.equal(r.calls.length, 1);
});
test("no auth means no request and no main-model fallback", async () => { const r = registry([], false); assert.equal((await generate(r)).outcome, "failed"); assert.equal(r.calls.length, 0); });
test("controller discards stale output while retaining only aggregate usage", async () => {
 const c = new SuggestionController(); let done; const p = c.run(() => new Promise((resolve) => { done = resolve; }), () => true, () => {});
 c.invalidate(); done({ outcome: "ready", suggestion: "STALE", attempts: [{ model: "p/m", outcome: "success", input: 4 }], elapsedMs: 1 }); await p;
 assert.equal(c.suggestion, undefined); assert.equal(c.input, 4); assert.equal(c.last, undefined);
});

test("controller marks an implicit identity change as discarded, not perpetually generating", async () => {
 const c = new SuggestionController(); await c.run(async () => ({ outcome: "ready", suggestion: "STALE", attempts: [], elapsedMs: 1 }), () => false, () => {});
 assert.equal(c.state, "discarded"); assert.equal(c.suggestion, undefined);
});

class FakeEditor {
 focused = true; text = ""; constructor(tui, theme, keys) { this.keys = keys; }
 history = [];
 getText() { return this.text; } setText(v) { this.text = v; } isShowingAutocomplete() { return false; } addToHistory(v) { this.history.push(v); } refresh() {}
}
function harness({ mode = "tui", loaded = conf(), otherEditor = false, reason = "startup", savedBranch = branch() } = {}) {
 const handlers = new Map(); const commands = new Map(); let installed = otherEditor ? () => {} : undefined; let component; let leaf = "one"; let session = "s1"; let pending = false; let idle = true;
 const r = registry(); const notices = []; const statuses = new Map(); const ctx = { mode, cwd: "/repo", isProjectTrusted: () => true, modelRegistry: r, isIdle: () => idle, hasPendingMessages: () => pending,
 sessionManager: { getBranch: () => savedBranch, getSessionId: () => session, getLeafId: () => leaf }, ui: { theme: { fg: (_, s) => s }, getEditorComponent: () => installed, getEditorText: () => component?.text ?? "", setEditorComponent(f) { installed = f; if (f) component = f({}, {}, {}); }, onTerminalInput: () => () => {}, setStatus: (key, value) => statuses.set(key, value), notify: (s) => notices.push(s) } };
 createSuggestionsExtension({ agentDir: () => "/agent", lowestThinking: () => undefined, load: () => ({ config: { ...loaded, models: [...loaded.models] } }), editor: () => FakeEditor })({ on: (e, fn) => handlers.set(e, fn), registerCommand: (n, c) => commands.set(n, c) });
 handlers.get("session_start")({ reason }, ctx);
 return { ctx, r, handlers, commands, notices, statuses, get component() { return component; }, setLeaf: (v) => { leaf = v; }, setSession: (v) => { session = v; }, setPending: (v) => { pending = v; }, setIdle: (v) => { idle = v; }, emit: (event, data = {}) => handlers.get(event)?.(data, ctx) };
}
const drain = () => new Promise((resolve) => setImmediate(resolve));
for (const mode of ["rpc", "json", "print"]) test(`no editor or inference in ${mode}`, async () => { const h = harness({ mode }); h.emit("agent_settled", { aborted: false }); await drain(); assert.equal(h.r.calls.length, 0); assert.equal(h.component, undefined); h.emit("session_shutdown"); });
test("settled handler returns promptly and no inference after aborted/busy/queued/nonempty", async () => {
 const h = harness(); assert.equal(h.emit("agent_settled", { aborted: true }), undefined); h.setPending(true); h.emit("agent_settled"); h.setPending(false); h.setIdle(false); h.emit("agent_settled"); h.setIdle(true); h.component.text = "TYPED"; h.emit("agent_settled"); await drain(); assert.equal(h.r.calls.length, 0);
});
test("custom-editor conflict preserves existing factory and makes zero requests", async () => { const h = harness({ otherEditor: true }); const original = h.ctx.ui.getEditorComponent(); h.emit("agent_settled"); await drain(); assert.equal(h.r.calls.length, 0); assert.equal(h.ctx.ui.getEditorComponent(), original); assert.match(h.notices[0], /another custom editor/); });
test("session controls are strict, do not write settings or change parent model", async () => {
 const h = harness(); const cmd = h.commands.get("prompt-suggestions"); await cmd.handler("off", h.ctx); h.emit("agent_settled"); await drain(); assert.equal(h.r.calls.length, 0);
 await cmd.handler("on", h.ctx); await cmd.handler("model test/haiku", h.ctx); h.emit("agent_settled"); await drain(); assert.equal(h.r.calls.length, 1); assert.equal(h.r.calls[0].model.id, "haiku"); await cmd.handler("", h.ctx); assert.match(h.notices.at(-1), /reported input\/output/);
});
for (const event of ["input", "agent_start", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact", "model_select", "ui_prompt_start", "session_shutdown"]) test(`pending result discarded on ${event}`, async () => {
 const h = harness(); let done; h.r.streamSimple = () => ({ result: () => new Promise((resolve) => { done = resolve; }) }); h.emit("agent_settled"); h.emit(event); done(response("STALE")); await drain();
 assert.ok(!h.notices.some((s) => s.includes("STALE"))); if (event !== "session_shutdown") { await h.commands.get("prompt-suggestions").handler("", h.ctx); assert.doesNotMatch(h.notices.at(-1), /: ready/); }
});
test("startup leaves history population to the host; reload and resume seed the new editor", () => {
 const saved = [entry("user", "FIRST"), entry("assistant", "First done"), entry("user", "SECOND"), entry("assistant", "Second done")];
 assert.deepEqual(harness({ reason: "startup", savedBranch: saved }).component.history, []);
 for (const reason of ["reload", "resume", "fork"]) assert.deepEqual(harness({ reason, savedBranch: saved }).component.history, ["FIRST", "SECOND"]);
});
test("identical failures warn once across turns; successful inference resets dedupe", async () => {
 const h = harness(); const warnings = () => h.notices.filter((s) => /^Prompt suggestions: unavailable\./.test(s));
 const turn = async () => { h.emit("agent_start"); h.emit("agent_settled"); await drain(); };
 h.r.hasConfiguredAuth = () => false; await turn(); await turn(); assert.equal(warnings().length, 1);
 h.r.hasConfiguredAuth = () => true; await turn(); h.r.hasConfiguredAuth = () => false; await turn(); assert.equal(warnings().length, 2);
});
test("explicit model change resets failure warning dedupe", async () => {
 const h = harness(); h.r.hasConfiguredAuth = () => false; h.emit("agent_settled"); await drain();
 await h.commands.get("prompt-suggestions").handler("model test/haiku", h.ctx); h.emit("agent_settled"); await drain();
 assert.equal(h.notices.filter((s) => /^Prompt suggestions: unavailable\./.test(s)).length, 2);
});
for (const ending of ["completion", "off"]) test(`ownership swap clears this extension's generating status on ${ending}`, async () => {
 const h = harness(); let finish; h.r.streamSimple = () => ({ result: () => new Promise((resolve) => { finish = resolve; }) });
 h.emit("agent_settled"); assert.equal(h.statuses.get("prompt-suggestions"), "suggesting…");
 const replacement = () => new FakeEditor({}, {}, {}); h.ctx.ui.setEditorComponent(replacement);
 if (ending === "off") await h.commands.get("prompt-suggestions").handler("off", h.ctx);
 finish(response(null)); await drain();
 assert.equal(h.statuses.get("prompt-suggestions"), undefined); assert.equal(h.ctx.ui.getEditorComponent(), replacement);
});
