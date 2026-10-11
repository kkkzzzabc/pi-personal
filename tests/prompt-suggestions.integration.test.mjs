import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { findPiPackageRoot } from "./pi-package.mjs";
import { createSuggestionsExtension } from "../extensions/prompt-suggestions/extension.ts";
import { createGhostEditor } from "../extensions/prompt-suggestions/editor.ts";
import { DEFAULTS } from "../extensions/prompt-suggestions/config.ts";

const root = findPiPackageRoot(); assert.ok(root);
const load = (p) => import(pathToFileURL(join(root, p)).href);
const agent = await load("dist/index.js");
const tui = await load("../pi-tui/dist/index.js");
const ai = await load("../pi-ai/dist/index.js");
const compat = await load("../pi-ai/dist/compat.js");
const { AuthStorage } = await load("dist/core/auth-storage.js");
const { KeybindingsManager } = await load("dist/core/keybindings.js");
const { getEditorTheme, theme, initTheme, setTheme } = await load("dist/modes/interactive/theme/theme.js");
initTheme("dark", false);
const scratch = mkdtempSync(join(tmpdir(), "prompt-suggestions-int-"));
const oldOffline = process.env.PI_OFFLINE; process.env.PI_OFFLINE = "1";
after(() => { if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline; rmSync(scratch, { recursive: true, force: true }); });
const drain = () => new Promise((resolve) => setTimeout(resolve, 25));
let sequence = 0;
async function parent({ mode = "tui", delay = false, fallback = false, conflict = false, continuation = false, bindings = {}, suggestion = "검증 결과를 설명해주세요." } = {}) {
 const dir = join(scratch, String(++sequence)); const cwd = join(dir, "work"); const agentDir = join(dir, "agent"); mkdirSync(cwd, { recursive: true }); mkdirSync(agentDir);
 const faux = compat.registerFauxProvider({ provider: `suggest-test-${sequence}`, models: [{ id: "parent", reasoning: true }, { id: "luna", reasoning: true }, { id: "haiku", reasoning: true }] });
 const calls = []; let release;
 faux.setResponses([
  () => ai.fauxAssistantMessage("PARENT-COMPLETED; one verification step remains."),
  async () => { if (delay) await new Promise((r) => { release = r; }); return fallback ? ai.fauxAssistantMessage("", { stopReason: "error", errorMessage: "synthetic authentication failure" }) : ai.fauxAssistantMessage(JSON.stringify({ suggestion })); },
  () => ai.fauxAssistantMessage('{"suggestion":"검증 결과를 설명해주세요."}'),
  () => ai.fauxAssistantMessage("NEXT-PARENT-COMPLETED"),
  () => ai.fauxAssistantMessage('{"suggestion":null}'),
 ]);
 const auth = AuthStorage.inMemory(); await auth.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "offline-test" }));
 const modelRuntime = await agent.ModelRuntime.create({ credentials: auth, modelsPath: join(dir, "models.json") });
 let api; let installed = conflict ? () => {} : undefined; let editor; let rawListener; let submission; const notices = [];
 const keys = new KeybindingsManager(bindings); const terminal = { rows: 40, columns: 100 };
 const build = async ({ cwd: work, sessionManager, sessionStartEvent }) => {
  const services = await agent.createAgentSessionServices({ cwd: work, agentDir, modelRuntime, resourceLoaderOptions: {
   noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
   extensionFactories: [(pi) => {
    api = pi;
    if (continuation) { let continued = false; pi.on("agent_before_settle", () => { if (!continued) { continued = true; return { entries: [{ type: "custom_message", customType: "synthetic-continuation", content: "Explain the remaining fixture step.", display: false }], continue: true }; } }); }
    const delegate = compat.getApiProvider(faux.api).streamSimple;
    const m = faux.getModel();
    pi.registerProvider(m.provider, { baseUrl: m.baseUrl, apiKey: "offline-test", api: faux.api,
     models: faux.models.map((x) => ({ id: x.id, name: x.name, api: x.api, reasoning: x.reasoning, input: x.input, cost: x.cost, contextWindow: x.contextWindow, maxTokens: x.maxTokens })),
     streamSimple(model, context, options) { calls.push({ model: model.id, context }); return delegate(model, context, options); },
    });
    createSuggestionsExtension({ agentDir: () => agentDir, lowestThinking: () => undefined,
     load: () => ({ config: { ...DEFAULTS, models: [m.provider + "/luna", m.provider + "/haiku"] } }),
     editor: (hooks) => createGhostEditor(tui, agent.CustomEditor, hooks),
    })(pi);
   }],
  } });
  return { ...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel("parent") })), services, diagnostics: services.diagnostics };
 };
 const runtime = await agent.createAgentSessionRuntime(build, { cwd, agentDir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")) });
 await runtime.session.bindExtensions({ mode, uiContext: { theme, notify: (m) => notices.push(m), setStatus() {}, getEditorText: () => editor?.getText() ?? "", getEditorComponent: () => installed,
  setEditorComponent(f) { installed = f; if (f) { editor = f({ terminal, requestRender() {} }, getEditorTheme(), keys); editor.focused = true; editor.onSubmit = (s) => { submission = s; }; } },
  onTerminalInput(f) { rawListener = f; return () => { rawListener = undefined; }; },
 } });
 return { runtime, calls, api, notices, terminal, get editor() { return editor; }, get submission() { return submission; }, get factory() { return installed; }, get release() { return release; },
  input(s) { rawListener?.(s); editor.handleInput(s); }, async prompt() { await runtime.session.prompt("Read-only: explain the remaining verification step."); await runtime.session.agent.waitForIdle(); await drain(); },
  async status() { await runtime.session.prompt("/prompt-suggestions status"); return notices.at(-1); },
  async dispose() { release?.(); await runtime.dispose(); faux.unregister(); },
 };
}

test("real host loads only independent suggestion command and handlers", async () => {
 const { loadExtensions } = await load("dist/core/extensions/loader.js"); const r = await loadExtensions([new URL("../extensions/prompt-suggestions/index.ts", import.meta.url).pathname], scratch);
 assert.deepEqual(r.errors, []); assert.deepEqual([...r.extensions[0].commands.keys()], ["prompt-suggestions"]); assert.equal(r.extensions[0].tools.size, 0); assert.ok(r.extensions[0].handlers.has("agent_settled"));
});
test("real settlement calls nested model once without adding messages or continuing parent", async () => {
 const p = await parent(); try {
  await p.prompt(); assert.deepEqual(p.calls.map((x) => x.model), ["parent", "luna"]); assert.match(await p.status(), /: ready/);
  assert.doesNotMatch(JSON.stringify(p.runtime.session.messages), /검증 결과를 설명/); assert.equal(p.runtime.session.model.id, "parent");
  const before = p.calls.length; assert.equal(p.editor.getText(), ""); assert.match(tui.stripTerminalSequences(p.editor.render(100).join("\n")), /검증 결과/);
  p.input("\t"); assert.equal(p.editor.getText(), "검증 결과를 설명해주세요."); assert.equal(p.submission, undefined); assert.equal(p.calls.length, before);
  p.input("\r"); assert.equal(p.submission, "검증 결과를 설명해주세요.");
 } finally { await p.dispose(); }
});
test("Enter on ghost does not submit it; history typing clears it permanently", async () => {
 const p = await parent(); try { await p.prompt(); p.input("\r"); assert.notEqual(p.submission, "검증 결과를 설명해주세요."); assert.equal(p.editor.getText(), ""); assert.doesNotMatch(tui.stripTerminalSequences(p.editor.render(100).join("\n")), /검증 결과/);
  p.editor.addToHistory("HISTORICAL-PROMPT"); p.input("\x1b[A"); assert.equal(p.editor.getText(), "HISTORICAL-PROMPT"); p.editor.setText(""); assert.doesNotMatch(p.editor.render(100).join("\n"), /검증 결과/);
 } finally { await p.dispose(); }
});
test("programmatic paste discards pending suggestion even after text is cleared", async () => {
 const p = await parent({ delay: true }); try { await p.prompt(); assert.ok(p.release); p.editor.insertTextAtCursor("PASTED"); p.editor.setText(""); p.release(); await drain(); assert.doesNotMatch(await p.status(), /: ready/); assert.equal(p.editor.getText(), ""); } finally { await p.dispose(); }
});
test("real fallback reports both exact models", async () => {
 const p = await parent({ fallback: true }); try { await p.prompt(); assert.deepEqual(p.calls.map((x) => x.model), ["parent", "luna", "haiku"]); assert.match(await p.status(), /provider-error.*haiku \(success\)/); } finally { await p.dispose(); }
});
for (const mode of ["rpc", "json", "print"]) test(`real ${mode}: zero nested requests or editor`, async () => { const p = await parent({ mode }); try { await p.prompt(); assert.deepEqual(p.calls.map((x) => x.model), ["parent"]); assert.equal(p.editor, undefined); } finally { await p.dispose(); } });
test("real editor conflict remains untouched", async () => { const p = await parent({ conflict: true }); try { const original = p.factory; await p.prompt(); assert.equal(p.factory, original); assert.deepEqual(p.calls.map((x) => x.model), ["parent"]); } finally { await p.dispose(); } });
test("actual editor uses width-safe cursor marker and theme-aware ghost", async () => {
 const p = await parent(); try { await p.prompt();
  for (const width of [3, 10, 32, 80, 120]) { p.terminal.columns = width; const lines = p.editor.render(width); for (const line of lines) assert.ok(tui.visibleWidth(line) <= width, `${width}: ${line}`); assert.equal(lines.join("").split(tui.CURSOR_MARKER).length - 1, 1); }
  assert.match(p.editor.render(80).join(""), /\x1b\[/);
 } finally { await p.dispose(); }
});
test("disable invalidates delayed result without changing editor", async () => {
 const p = await parent({ delay: true }); try { await p.prompt(); const oldRelease = p.release; await p.runtime.session.prompt("/prompt-suggestions off"); oldRelease(); await drain(); assert.match(await p.status(), /: off/); assert.equal(p.editor.getText(), ""); } finally { await p.dispose(); }
});
test("real session replacement aborts late work and does not infer on restore", async () => {
 const p = await parent({ delay: true }); try {
  await p.prompt(); const sessionId = p.runtime.session.sessionManager.getSessionId(); const oldRelease = p.release; const count = p.calls.length;
  const result = await p.runtime.newSession(); assert.equal(result.cancelled, false); assert.notEqual(p.runtime.session.sessionManager.getSessionId(), sessionId);
  oldRelease(); await drain(); assert.equal(p.calls.length, count); assert.doesNotMatch(JSON.stringify(p.runtime.session.messages), /검증 결과/);
 } finally { await p.dispose(); }
});
test("actual boundary continuation settles before generating one suggestion", async () => {
 const p = await parent({ continuation: true });
 try { await p.prompt(); assert.deepEqual(p.calls.map((x) => x.model), ["parent", "parent", "luna"]); } finally { await p.dispose(); }
});
test("generic blocking UI events invalidate inference without feature-specific imports", async () => {
 const p = await parent({ delay: true }); try {
  await p.prompt(); const runner = p.runtime.session.extensionRunner;
  assert.ok(runner); await runner.emit({ type: "ui_prompt_start", reason: "ui_prompt", kind: "custom" }); p.release(); await drain();
  assert.doesNotMatch(p.editor.render(80).join(""), /검증 결과/);
  await runner.emit({ type: "ui_prompt_end", reason: "ui_prompt", kind: "custom" }); assert.equal(p.calls.length, 2);
 } finally { await p.dispose(); }
});
test("Unicode ghost wraps/truncates through resize and follows theme changes", async () => {
 const p = await parent({ suggestion: "한글 👨‍👩‍👧‍👦 é 다음 설명을 부탁합니다. ".repeat(5) }); try {
  await p.prompt(); for (const width of [4, 12, 32, 100]) { p.terminal.rows = 15; const lines = p.editor.render(width); assert.ok(lines.length <= 6); assert.ok(lines.every((s) => tui.visibleWidth(s) <= width)); }
  const dark = p.editor.render(80).join(""); setTheme("light", false); const light = p.editor.render(80).join(""); assert.notEqual(dark, light); setTheme("dark", false);
  let paste = 0; let escape = 0; let external = 0; let thinking = 0;
  p.editor.onPasteImage = () => { paste++; }; p.editor.onEscape = () => { escape++; };
  p.editor.onAction("app.editor.external", () => { external++; }); p.editor.onAction("app.thinking.cycle", () => { thinking++; });
  p.input("\x16"); p.input("\x1b"); p.input("\x07"); p.input("\x1b[Z");
  assert.deepEqual([paste, escape, external, thinking], [1, 1, 1, 1]);
 } finally { setTheme("dark", false); await p.dispose(); }
});
test("visible ghost gives registered Tab shortcut precedence without double dispatch", async () => {
 const p = await parent(); try {
  await p.prompt(); let handled = 0; let inspected = 0;
  p.editor.onExtensionShortcut = (data) => { inspected++; if (data === "\t") { handled++; return true; } return false; };
  p.input("\t"); assert.equal(handled, 1); assert.equal(inspected, 1); assert.equal(p.editor.getText(), ""); assert.equal(p.submission, undefined);
  p.input("x"); assert.equal(inspected, 2); assert.equal(p.editor.getText(), "x");
 } finally { await p.dispose(); }
});
test("unhandled Tab shortcut is inspected once before normal ghost acceptance", async () => {
 const p = await parent(); try {
  await p.prompt(); let inspected = 0; p.editor.onExtensionShortcut = () => { inspected++; return false; };
  p.input("\t"); assert.equal(inspected, 1); assert.equal(p.editor.getText(), "검증 결과를 설명해주세요."); assert.equal(p.submission, undefined);
 } finally { await p.dispose(); }
});
test("ghost hint uses configured submit keys instead of hard-coded Enter", async () => {
 const p = await parent({ bindings: { "tui.input.submit": ["ctrl+enter", "alt+enter"] } }); try {
  await p.prompt(); const hint = tui.stripTerminalSequences(p.editor.render(100).join("\n"));
  assert.match(hint, /ctrl\+enter\/alt\+enter send/); assert.doesNotMatch(hint, /· Enter send/);
 } finally { await p.dispose(); }
});
