import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

const root = findPiPackageRoot(); assert.ok(root);
const { SessionManager } = await import(pathToFileURL(join(root, "dist/index.js")).href);
const { fauxAssistantMessage } = await import(pathToFileURL(join(root, "../pi-ai/dist/index.js")).href);
const scratch = mkdtempSync(join(tmpdir(), "suggestions-tui-"));
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const binDir = join(scratch, "bin"); mkdirSync(binDir); symlinkSync(join(root, "dist/bundle/cli.js"), join(binDir, "pi"));
const env = { ...process.env, PATH: binDir + ":" + process.env.PATH, PI_PACKAGE_DIR: root };
after(() => { if (process.env.TUI_CHECK_KEEP_TEST_RUNS === "1") console.log(`Prompt suggestions TUI evidence: ${scratch}`); else rmSync(scratch, { recursive: true, force: true }); });
const skip = !findAgentTty() ? "agent-tty not found" : false;

function setup(name, mode, delayed = false, { savedStartup = false, tabShortcut = false } = {}) {
 const dir = join(scratch, name); mkdirSync(dir);
 const scenario = join(dir, "scenario.json"); writeFileSync(scenario, JSON.stringify({ responses: [{ text: "FIRST-DONE; verification remains." }, { text: "SECOND-DONE" }, { text: "THIRD-DONE" }], whenExhausted: "END-DONE" }));
 const config = join(dir, "prompt-suggestions.json"); writeFileSync(config, JSON.stringify({ models: ["suggest-fixture/luna"], timeoutMs: 10000 }));
 const provider = join(dir, "provider.ts"); writeFileSync(provider, `
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { registerFauxProvider, getApiProvider } from "@earendil-works/pi-ai/compat";
export default function(pi) {
 const faux = registerFauxProvider({ provider: "suggest-fixture", models: [{ id: "luna" }] });
 const delegate = getApiProvider(faux.api).streamSimple;
 const model = faux.getModel();
 pi.registerProvider(model.provider, { baseUrl: model.baseUrl, apiKey: "offline-test", api: faux.api,
 models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
 streamSimple(m, context, options) {
  appendFileSync(join(process.cwd(), "suggestion-calls.jsonl"), JSON.stringify({ model: m.id, context }) + "\\n");
  faux.appendResponses([async () => {
   ${delayed ? 'while (!options.signal?.aborted && !existsSync(join(process.cwd(), "release"))) await new Promise((resolve) => setTimeout(resolve, 20));' : ''}
   return options.signal?.aborted ? fauxAssistantMessage("", {stopReason:"aborted"}) : fauxAssistantMessage('{"suggestion":"검증 결과를 요약해주세요."}');
  }]);
  return delegate(m, context, options);
 }
 });
 pi.registerShortcut("ctrl+alt+h", { description: "Capture synthetic editor history", handler: async (ctx) => {
  appendFileSync(join(process.cwd(), "history-captures.jsonl"), JSON.stringify(ctx.ui.getEditorText()) + "\\n");
 } });
 ${tabShortcut ? 'pi.registerShortcut("tab", { description: "Synthetic Tab override", handler: async (ctx) => { appendFileSync(join(process.cwd(), "tab-shortcuts.txt"), "handled\\n"); ctx.ui.notify("TAB-SHORTCUT-HANDLED", "info"); } });' : ''}
 pi.on("session_shutdown", () => faux.unregister());
}
`);
 const out = join(dir, "run"); let savedPath;
 if (savedStartup) {
  mkdirSync(join(out, "work"), { recursive: true });
  const saved = SessionManager.create(join(out, "work"), join(dir, "saved-sessions"));
  for (const text of ["HISTORY-FIRST", "HISTORY-SECOND"]) { saved.appendMessage({ role: "user", content: text, timestamp: Date.now() }); saved.appendMessage(fauxAssistantMessage(`${text}-DONE`)); }
  savedPath = saved.getSessionFile();
 }
 const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario,
  "--extension", fileURLToPath(new URL("../extensions/prompt-suggestions/index.ts", import.meta.url)), "--extension", provider,
  "--agent-file", `prompt-suggestions.json=${config}`, "--pi-arg", "--tui-mode", "--pi-arg", mode, "--cols", mode === "regular" ? "40" : "100", "--out", out, ...(savedPath ? ["--pi-arg", "--session", "--pi-arg", savedPath] : [])], { encoding: "utf8", env });
 const run = JSON.parse(started.stdout); assert.equal(run.ok, true, JSON.stringify(run));
 const call = (args) => { const value = agentTty(run.agentTty.bin, run.ttyHome, args); assert.equal(value.ok, true, JSON.stringify(value)); return value; };
 const snapshot = () => String(call(["snapshot", run.sessionId, "--format", "text"]).result.text);
 const parents = () => existsSync(run.modelLog) ? readFileSync(run.modelLog, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
 const command = (s) => { call(["send-keys", run.sessionId, "Escape"]); call(["wait", run.sessionId, "--screen-stable-ms", "200"]); call(["send-keys", run.sessionId, "Ctrl+U"]); call(["type", run.sessionId, s]); call(["wait", run.sessionId, "--screen-stable-ms", "300"]); call(["send-keys", run.sessionId, "Escape", "Enter"]); };
 return { run, out, call, snapshot, parents, command, finish() { const r = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8", env }); const value = JSON.parse(r.stdout); assert.equal(value.piExited, true, JSON.stringify(value)); assert.equal(value.ttySessionDestroyed, true, JSON.stringify(value)); } };
}
for (const mode of ["fullscreen", "regular"]) test(`isolated ${mode}: ghost → Tab → edit → Enter, completion and off/on`, { skip, timeout: 120000 }, () => {
 const p = setup(mode, mode); const sid = p.run.sessionId;
 try {
  p.call(["type", sid, "Explain the remaining verification."]); p.call(["send-keys", sid, "Enter"]);
  p.call(["wait", sid, "--text", "검증 결과를 요약해주세요.", "--timeout", "30000"]);
  const ghost = p.snapshot(); assert.match(ghost, /tab accept/); writeFileSync(join(p.out, "ghost-screen.txt"), ghost);
  const before = p.parents().length; p.call(["send-keys", sid, "Tab"]); p.call(["wait", sid, "--screen-stable-ms", "300"]);
  assert.equal(p.parents().length, before, "Tab never calls main model"); assert.doesNotMatch(p.snapshot().split("FIRST-DONE").at(-1), /tab accept/);
  p.call(["type", sid, " 자세히."]); p.call(["send-keys", sid, "Enter"]); p.call(["wait", sid, "--text", "SECOND-DONE", "--timeout", "30000"]);
  const calls = p.parents(); assert.ok(calls.length > before); assert.match(JSON.stringify(calls.at(-1).messages), /검증 결과를 요약해주세요\. 자세히\./);
  // A second ghost must disappear on actual text input, not reappear after clearing.
  p.call(["wait", sid, "--text", "tab accept", "--timeout", "30000"]); p.call(["type", sid, "/prompt-sug"]);
  p.call(["send-keys", sid, "Tab"]); p.call(["wait", sid, "--screen-stable-ms", "300"]);
  assert.match(p.snapshot(), /\/prompt-suggestions/); // Native slash autocomplete, not ghost acceptance.
  p.call(["send-keys", sid, "Escape", "Ctrl+C"]);
  p.command("/prompt-suggestions off"); assert.match(p.snapshot(), /Prompt suggestions: off/);
  p.command("/prompt-suggestions on"); assert.match(p.snapshot(), /Prompt suggestions: idle/);
  p.call(["send-keys", sid, "Up"]); p.call(["wait", sid, "--screen-stable-ms", "300"]); assert.match(p.snapshot(), /prompt-suggestions on/);
  p.call(["send-keys", sid, "Ctrl+C"]);
  writeFileSync(join(p.out, "final-screen.txt"), p.snapshot());
 } finally { p.finish(); }
});
test("isolated pending request: Escape discards delayed result and allows new typing", { skip, timeout: 120000 }, () => {
 const p = setup("pending", "fullscreen", true); const sid = p.run.sessionId;
 try {
  p.call(["type", sid, "Explain next verification."]); p.call(["send-keys", sid, "Enter"]); p.call(["wait", sid, "--text", "suggesting…", "--timeout", "30000"]);
  p.call(["send-keys", sid, "Escape"]); writeFileSync(join(p.run.workDir, "release"), "release");
  p.call(["type", sid, "USER-TYPING"]); p.call(["wait", sid, "--screen-stable-ms", "500"]); assert.doesNotMatch(p.snapshot(), /검증 결과를 요약/); assert.match(p.snapshot(), /USER-TYPING/);
  p.call(["send-keys", sid, "Ctrl+C"]); p.command("/prompt-suggestions off");
 } finally { p.finish(); }
});
test("isolated saved-session startup does not duplicate Up history", { skip, timeout: 120000 }, () => {
 const p = setup("saved-startup", "fullscreen", false, { savedStartup: true }); const sid = p.run.sessionId;
 try {
  const capture = () => { p.call(["send-keys", sid, "Ctrl+Alt+H"]); p.call(["wait", sid, "--screen-stable-ms", "200"]); };
  for (let i = 0; i < 3; i++) { p.call(["send-keys", sid, "Up"]); capture(); }
  const texts = readFileSync(join(p.run.workDir, "history-captures.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(texts, ["HISTORY-SECOND", "HISTORY-FIRST", "HISTORY-FIRST"]);
  assert.equal(p.parents().length, 0, "Restoring history never generates a suggestion");
  p.call(["send-keys", sid, "Ctrl+C"]);
 } finally { p.finish(); }
});
test("isolated registered Tab override wins over visible ghost", { skip, timeout: 120000 }, () => {
 const p = setup("tab-override", "fullscreen", false, { tabShortcut: true }); const sid = p.run.sessionId;
 try {
  p.call(["type", sid, "Explain the remaining verification."]); p.call(["send-keys", sid, "Enter"]);
  p.call(["wait", sid, "--text", "tab accept", "--timeout", "30000"]); const before = p.parents().length;
  p.call(["send-keys", sid, "Tab"]); p.call(["wait", sid, "--text", "TAB-SHORTCUT-HANDLED", "--timeout", "30000"]);
  p.call(["send-keys", sid, "Ctrl+Alt+H"]); p.call(["wait", sid, "--screen-stable-ms", "200"]);
  assert.equal(readFileSync(join(p.run.workDir, "tab-shortcuts.txt"), "utf8"), "handled\n");
  assert.equal(JSON.parse(readFileSync(join(p.run.workDir, "history-captures.jsonl"), "utf8").trim()), "");
  assert.equal(p.parents().length, before, "Shortcut neither accepts nor submits the ghost");
 } finally { p.finish(); }
});
