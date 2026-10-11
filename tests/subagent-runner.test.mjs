import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createChildRunner, diagnostic, requestFailurePhase } from "../extensions/subagent/runner.ts";
import { createSubagentExtension } from "../extensions/subagent/extension.ts";
import { loadRoles } from "../extensions/subagent/agents.ts";

const scratch = mkdtempSync(join(tmpdir(), "subagent-runner-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const parseFrontmatter = (text) => {
 const [, fm, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
 return { frontmatter: Object.fromEntries(fm.split("\n").map((l) => l.split(/:\s*/, 2))), body };
};
const rolesDir = new URL("../extensions/subagent/agents/", import.meta.url).pathname;
const roles = loadRoles(rolesDir, parseFrontmatter);
let serial = 0;
const usage = { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: { total: 0.5 } };
const answer = (text = "DONE", extra = {}) => ({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop", usage, ...extra });

/** No network or real credentials: exercise actual runner/orchestrator with a small SDK boundary fixture. */
function fixture({ config, behavior = {}, hooks = {}, specs = ["p/a", "p/b", "p/c", "p/d"] } = {}) {
 const dir = join(scratch, `case-${++serial}`); mkdirSync(dir);
 if (config) writeFileSync(join(dir, "subagent.json"), JSON.stringify(config));
 const sessions = [], prompts = [], loads = [];
 const models = new Map(specs.map((spec) => { const [provider, id] = spec.split("/"); return [spec, { provider, id, reasoning: true, contextWindow: 1234, maxTokens: 100 }]; }));
 const runtime = { getModel: (p, m) => models.get(`${p}/${m}`), refresh: async () => {}, registerProvider() {}, registerNativeProvider() {} };
 const sdk = {
  parseFrontmatter, getAgentDir: () => dir,
  SettingsManager: { create: () => ({}) }, SessionManager: { inMemory: () => ({}) },
  DefaultResourceLoader: class { constructor(opts) { this.opts = opts; loads.push(opts); } async reload() { await hooks.reload?.(); } },
  resolveCliModel({ cliModel }) {
   const [spec, thinkingLevel] = cliModel.split(":");
   const model = models.get(spec === "alias" ? "p/a" : spec);
   return model ? { model, thinkingLevel } : { error: "not found" };
  },
  async createAgentSession(opts) {
   await hooks.create?.(opts);
   const session = {
    opts, model: opts.model, messages: [], disposed: false, aborts: 0, tools: [], listener: undefined,
    subscribe(listener) { this.listener = listener; return () => { this.listener = undefined; }; },
    async bindExtensions() {
     for (const f of opts.resourceLoader.opts.extensionFactories) f.factory({ registerTool: (tool) => this.tools.push(tool) });
     await hooks.bind?.(this);
    },
    getActiveToolNames: () => hooks.toolNames ?? opts.tools,
    async prompt(text) {
     this.messages.push({ role: "user", content: text }); prompts.push({ model: `${this.model.provider}/${this.model.id}`, text, session: this });
     const fn = behavior[`${this.model.provider}/${this.model.id}`];
     const result = fn ? await fn(this) : answer();
     if (result) this.messages.push(result);
    },
    async abort() { this.aborts++; },
    dispose() { this.disposed = true; },
   };
   sessions.push(session); return { session };
  },
 };
 const parent = { modelRegistry: { getRegisteredProviderIds: () => [] }, model: models.get("p/a"), thinkingLevel: "high", sessionFile: undefined, contextFiles: [] };
 const options = { sdk, agentDir: () => dir, createModelRuntime: async () => runtime,
  saveOutput: hooks.saveOutput ?? ((path, text) => ({ path, bytes: text.length, lines: 1 })) };
 const runner = createChildRunner(options);
 let tool;
 createSubagentExtension({ ...options, rolesDir })({ on() {}, registerTool(t) { tool = t; }, getThinkingLevel: () => "high" });
 const ctx = { ...parent, cwd: dir, sessionManager: { getSessionFile: () => undefined } };
 const request = { role: roles.explorer, task: "ORIGINAL-TASK", model: "p/a:high", cwd: dir, index: 1 };
 return { runner, parent, request, sessions, prompts, loads, tool, ctx, dir };
}
const errorAnswer = (errorMessage) => answer("", { stopReason: "error", errorMessage });

test("fallback restarts original task, sums failed-attempt costs/tools, disposes before next model", async () => {
 const f = fixture({ behavior: {
  "p/a": (session) => { session.messages.push(answer("intermediate")); session.listener({ type: "tool_execution_start", toolName: "read" }); return errorAnswer("HTTP 503 overloaded"); },
  "p/b": (session) => { assert.equal(f.sessions[0].disposed, true); assert.equal(session.messages.length, 1); return answer("BACKUP"); },
 } });
 const candidates = await f.runner.prepareChain(["p/a:high", "p/b:high"], f.parent);
 const events = [];
 const result = await f.runner.runChain(f.request, f.parent, candidates, undefined, (e) => events.push(e));
 assert.equal(result.status, "completed"); assert.equal(result.model, "p/b"); assert.equal(result.output, "BACKUP");
 assert.equal(result.toolCalls, 1); assert.equal(result.usage.cost, 1.5); assert.equal(result.attempts.length, 2);
 assert.equal(result.attempts[0].phase, "model"); assert.equal(result.attempts[1].thinkingLevel, "high");
 assert.deepEqual(f.prompts.map((p) => p.text), ["Task: ORIGINAL-TASK", "Task: ORIGINAL-TASK"]);
 assert.ok(f.sessions.every((s) => s.disposed)); assert.ok(events.some((e) => e.type === "fallback" && e.reason.includes("503")));
 assert.equal(f.sessions[1].opts.model.contextWindow, 1234, "Pi model metadata is not overridden");
});

for (const error of ["invalid API key", "HTTP 401 unauthorized", "rate limit", "quota exceeded", "network connection failed", "HTTP 500 server failure"]) {
 test(`terminal model error falls back: ${error}`, async () => {
  const f = fixture({ behavior: { "p/a": () => errorAnswer(error) } });
  const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
  assert.equal(result.model, "p/b"); assert.equal(result.status, "completed");
 });
}
for (const [name, error, expected] of [["context", "context length exceeded", "input"], ["input", "input too long", "input"], ["unknown throw", "unexpected local failure", "setup"]]) {
 test(`no fallback for ${name}`, async () => {
  const f = fixture({ behavior: { "p/a": () => { if (expected === "setup") throw new Error(error); return errorAnswer(error); } } });
  const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
  assert.equal(result.phase, expected); assert.equal(result.status, "failed"); assert.equal(f.sessions.length, 1); assert.ok(f.sessions[0].disposed);
 });
}
for (const [name, hooks] of [["reload", { reload: () => { throw new Error("load failed"); } }], ["bind", { bind: () => { throw new Error("bind failed"); } }], ["tool mismatch", { toolNames: ["write"] }], ["creation", { create: () => { throw new Error("creation failed"); } }]]) {
 test(`no fallback for setup ${name}, disposes created sessions`, async () => {
  const f = fixture({ hooks });
  const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
  assert.equal(result.phase, "setup"); assert.equal(result.attempts.length, 1); assert.ok(f.sessions.every((s) => s.disposed));
 });
}
test("empty answer stops without fallback; task/tool errors are not model errors", async () => {
 const f = fixture({ behavior: { "p/a": () => answer("") } });
 const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
 assert.equal(result.phase, "task"); assert.equal(f.sessions.length, 1);
 const g = fixture({ behavior: { "p/a": (s) => { s.messages.push({ role: "toolResult", isError: true, content: "cannot read" }); return answer("Cannot inspect requested file."); } } });
 assert.equal((await g.runner.runChain(g.request, g.parent, await g.runner.prepareChain(["p/a", "p/b"], g.parent))).status, "completed");
 assert.equal(g.sessions.length, 1);
});
test("output-save error preserves whole output without fallback", async () => {
 const f = fixture({ hooks: { saveOutput: () => { throw new Error("disk full"); } }, behavior: { "p/a": () => answer("x".repeat(3000)) } });
 const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
 assert.equal(result.status, "completed"); assert.equal(result.preview.length, 3000); assert.match(result.warnings[0], /disk full/); assert.equal(f.sessions.length, 1);
});
test("resolution failures are skipped; aliases deduplicate by identity/thinking; all failures summarize", async () => {
 const f = fixture({ behavior: { "p/a": () => errorAnswer("quota exceeded") } });
 const list = await f.runner.prepareChain(["missing/model", "p/a:high", "alias:high", "p/b:high"], f.parent);
 assert.equal(list.length, 3);
 const result = await f.runner.runChain(f.request, f.parent, list);
 assert.equal(result.status, "completed"); assert.equal(result.attempts[0].phase, "resolution"); assert.equal(f.prompts.length, 2);
 const failed = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["missing/1", "missing/2"], f.parent));
 assert.equal(failed.status, "failed"); assert.match(failed.error, /All configured model candidates failed/); assert.match(failed.error, /missing\/2/);
 assert.equal((await f.runner.prepareChain(["p/a:high", "alias:low"], f.parent)).length, 2);
});
for (const point of ["before", "during", "between", "bind", "create"]) {
 test(`cancellation ${point} prevents a backup and disposes sessions`, async () => {
  const c = new AbortController();
  const f = fixture({ behavior: { "p/a": () => { if (point === "during") c.abort(); return errorAnswer("503"); } },
   hooks: { ...(point === "bind" ? { bind: () => c.abort() } : {}), ...(point === "create" ? { create: () => c.abort() } : {}) } });
  const list = await f.runner.prepareChain(["p/a", "p/b"], f.parent); if (point === "before") c.abort();
  const result = await f.runner.runChain(f.request, f.parent, list, c.signal, (event) => { if (point === "between" && event.type === "fallback") c.abort(); });
  assert.equal(result.status, "aborted"); assert.ok(f.prompts.length <= 1); assert.ok(f.sessions.every((s) => s.disposed));
 });
}
test("strict explicit explorer model does not use configured fallbacks", async () => {
 const f = fixture({ config: { agents: { explorer: { model: "p/a", fallbackModels: ["p/b"] } } }, behavior: { "p/a": () => errorAnswer("quota exceeded") } });
 const result = await f.tool.execute("id", { agent: "explorer", task: "strict", model: "p/a" }, undefined, undefined, f.ctx);
 assert.equal(result.details.children[0].status, "failed"); assert.equal(f.sessions.length, 1);
 const updates = [];
 const fallback = await f.tool.execute("id", { agent: "explorer", task: "default" }, undefined, (u) => updates.push(u), f.ctx);
 assert.equal(fallback.details.children[0].model, "p/b"); assert.equal(fallback.details.children[0].attempts.length, 2);
 assert.match(fallback.content[0].text, /Tried p\/b — previous model attempt failed: quota exceeded/);
 assert.ok(updates.some((u) => u.content[0].text.includes("Trying p/b — previous model attempt failed: quota exceeded")));
 assert.ok(fallback.details.children[0].transitions[0].startsWith("Tried p/b — previous model attempt failed:"));
});

test("four-model roster gives each a complete shared brief; one fails without replacement; visible partial coverage", async () => {
 const f = fixture({ config: { review: { models: ["p/a:high", "p/b:high", "p/c:high", "p/d:high"] } }, behavior: { "p/b": () => errorAnswer("unauthorized") } });
 const updates = [];
 const result = await f.tool.execute("id", { review: { task: "FULL-REVIEW-BRIEF" } }, undefined, (u) => updates.push(u), f.ctx);
 assert.equal(result.isError, undefined); assert.equal(result.details.review.coverage, "partial"); assert.equal(result.details.review.succeeded, 3);
 assert.deepEqual(f.prompts.map((p) => p.model).sort(), ["p/a", "p/b", "p/c", "p/d"]);
 assert.ok(f.prompts.every((p) => p.text === "Task: FULL-REVIEW-BRIEF")); assert.equal(f.sessions.length, 4);
 assert.equal(result.details.children[1].requestedModel, "p/b:high"); assert.match(result.details.children[1].error, /unauthorized/);
 assert.ok(updates.every((u) => u.details.review.total === 4)); assert.match(result.content[0].text, /Review incomplete/);
 assert.equal(result.details.usage.cost, 2); assert.ok(f.sessions.every((s) => s.disposed));
 assert.ok(f.loads.every((l) => l.noExtensions && l.noSkills && l.noPromptTemplates));
});
test("roster resolution failure does not block healthy slots, all-unresolved has no verdict", async () => {
 for (const all of [false, true]) {
  const models = all ? ["missing/1", "missing/2", "missing/3", "missing/4"] : ["p/a", "missing/1", "p/c", "p/d"];
  const f = fixture({ config: { review: { models } } });
  const r = await f.tool.execute("id", { review: { task: "review" } }, undefined, undefined, f.ctx);
  assert.equal(r.details.review.succeeded, all ? 0 : 3); assert.equal(f.sessions.length, all ? 0 : 3);
  if (all) { assert.equal(r.isError, true); assert.match(r.content[0].text, /No review verdict/); }
 }
});
test("roster duplicate identities with different thinking fail before any launch", async () => {
 const f = fixture({ config: { review: { models: ["p/a:high", "alias:low", "p/c", "p/d"] } } });
 await assert.rejects(f.tool.execute("id", { review: { task: "review" } }, undefined, undefined, f.ctx), /duplicate model identities/);
 assert.equal(f.sessions.length, 0);
});
test("missing roster fails rather than spawning inherited reviewers", async () => {
 const f = fixture();
 await assert.rejects(f.tool.execute("id", { review: { task: "review" } }, undefined, undefined, f.ctx), /Configure review.models/);
 assert.equal(f.sessions.length, 0);
});
test("roster cancellation is explicit, without replacements", async () => {
 const c = new AbortController(); c.abort();
 const f = fixture({ config: { review: { models: ["p/a", "p/b", "p/c", "p/d"] } } });
 const r = await f.tool.execute("id", { review: { task: "review" } }, c.signal, undefined, f.ctx);
 assert.equal(r.details.review.aborted, 4); assert.equal(r.isError, true); assert.equal(f.sessions.length, 0);
 assert.match(r.content[0].text, /4 aborted/);
});
test("unknown shared setup errors are not treated as four model failures", async () => {
 const f = fixture({ config: { review: { models: ["p/a", "p/b", "p/c", "p/d"] } } });
 f.ctx.modelRegistry.getRegisteredProviderIds = () => { throw new Error("shared provider registry failed"); };
 await assert.rejects(f.tool.execute("id", { review: { task: "review" } }, undefined, undefined, f.ctx), /shared provider registry failed/);
 assert.equal(f.sessions.length, 0);
});
test("bounded diagnostics redact credentials and exclude local exceptions from fallback", () => {
 const raw = 'Authorization: Bearer secret-token api_key="supersecret" sk-ant-abcdefghij https://user:pass@example.org\u001b[31m';
 const out = diagnostic(raw); assert.doesNotMatch(out, /secret-token|supersecret|abcdefghij|user:pass|\u001b/);
 assert.equal(diagnostic("x".repeat(2000)).length, 1000);
 assert.equal(requestFailurePhase("No API key found for provider x", false), "model");
 assert.equal(requestFailurePhase("tool setup failed", false), "setup");
 assert.equal(requestFailurePhase('Authentication failed for "anthropic". Credentials may have expired.', false), "model");
});
test("host credential preflight exception permits explorer fallback without an assistant message", async () => {
 const f = fixture({ behavior: { "p/a": () => { throw new Error("No API key found for p. Use /login"); } } });
 const result = await f.runner.runChain(f.request, f.parent, await f.runner.prepareChain(["p/a", "p/b"], f.parent));
 assert.equal(result.status, "completed"); assert.equal(result.model, "p/b"); assert.equal(result.attempts[0].phase, "model");
});
test("message-end accounting preserves host-retry costs removed from the final transcript", async () => {
 const f = fixture({ behavior: { "p/a": (session) => {
  session.listener({ type: "message_end", message: errorAnswer("503") });
  const success = answer("HOST-RETRY-RECOVERED");
  session.listener({ type: "message_end", message: success });
  return success;
 } } });
 const result = await f.runner.run(f.request, f.parent);
 assert.equal(result.status, "completed"); assert.equal(result.usage.cost, 1); assert.equal(f.sessions[0].messages.filter((m) => m.role === "assistant").length, 1);
});
test("roster cancellation during a slot stops remaining work without replacement", async () => {
 const c = new AbortController();
 const f = fixture({ config: { review: { models: ["p/a", "p/b", "p/c", "p/d"] } }, behavior: { "p/a": () => { c.abort(); return errorAnswer("503"); } } });
 const r = await f.tool.execute("id", { review: { task: "review" } }, c.signal, undefined, f.ctx);
 assert.equal(r.details.review.aborted, 4); assert.ok(f.prompts.length <= 1); assert.ok(f.sessions.every((s) => s.disposed));
});
