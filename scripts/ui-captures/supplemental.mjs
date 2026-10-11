import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditRules, auditJudgments, suggestion } from "./fixtures/nested-data.mjs";
import { toolResponse } from "./fixtures/data.mjs";

const provider = "scripts/ui-captures/fixtures/nested-provider.ts";
const modelConfig = (kind, fallback = false) => ({ models: [`ui-nested/${kind}-primary`, ...(fallback ? [`ui-nested/${kind}-backup`] : [])], timeoutMs: 60000 });
export async function captureSupplemental(group, api) {
 const { run, capture, prompt, keys, type, wait, stable, act, current } = api;
 const screen = () => String(act(["snapshot", current().sessionId, "--format", "text"]).text);
 const parents = () => existsSync(current().modelLog) ? readFileSync(current().modelLog, "utf8").trim().split("\n").filter(Boolean).length : 0;
 const release = () => writeFileSync(join(current().workDir, "release-children"), "release\n");
 const command = (text, expected) => { keys("Ctrl+U"); type(text); stable(); keys("Escape", "Enter"); wait(expected); };
 const note = "Actual production UI; synthetic offline nested-model output, not historical live-provider evidence.";
 const responses = [{ text: "FIRST-DONE: verification remains." }, { text: "SECOND-DONE: new verification step explained." }];
 const shot = (state, tokens, absent = [], detail = note) => capture(group, state, tokens, detail, absent);

 if (group === "prompt-suggestions") {
  const options = (mode = "state", narrow = false) => ({ mode, narrow, extensions: [provider], agentFiles: { "prompt-suggestions.json": modelConfig("suggestion", mode === "fallback") } });
  await run(group, "editor", responses, () => {
   prompt(); wait("tab accept"); shot("ghost", [suggestion, "tab accept"]);
   const before = parents(); keys("Tab"); stable(); assert.equal(parents(), before, "Tab does not submit"); shot("accepted", [suggestion], ["tab accept"]);
   type(" 자세히."); stable(); shot("edited", [suggestion + " 자세히."], ["tab accept"]);
   keys("Enter"); wait("SECOND-DONE"); wait("tab accept");
   type("USER-TYPING"); stable(); shot("dismissed", ["USER-TYPING"], ["tab accept"]);
   keys("Ctrl+C"); command("/prompt-suggestions", "Prompt suggestions: idle"); shot("status", ["Prompt suggestions: idle", "Last attempts:", "success", "reported input/output"]);
   command("/prompt-suggestions off", "Prompt suggestions: off"); shot("off", ["Prompt suggestions: off"], ["tab accept"]);
  }, options());
  await run(group, "pending", responses, () => {
   prompt(); wait("suggesting…"); shot("pending", ["suggesting…"]);
   keys("Escape"); release(); type("USER-TYPING"); stable(); assert.ok(!screen().includes("tab accept"));
  }, options("pending"));
  for (const mode of ["invalid-output", "fallback"]) await run(group, mode, responses, () => {
   prompt(); wait(mode === "fallback" ? "tab accept" : "suggestions failed");
   if (mode === "invalid-output") shot(mode, ["invalid-output", "suggestions failed"]);
   command("/prompt-suggestions", "Prompt suggestions: idle");
   shot(mode === "invalid-output" ? "invalid-output-details" : mode, mode === "fallback" ? ["suggestion-primary (provider-error)", "suggestion-backup (success)"] : ["invalid-output", "Prompt suggestions: idle"], [], note + " Typing the status command dismisses the suggestion state; last-attempt evidence remains.");
  }, options(mode));
  await run(group, "narrow", responses, () => { prompt(); wait("tab accept"); shot("narrow", [suggestion, "tab accept"]); }, options("state", true));
 }
 if (group === "turn-summary") {
  const options = (mode = "state", narrow = false, coexist = false) => ({ mode, narrow, extensions: [provider, ...(coexist ? ["extensions/prompt-suggestions/index.ts"] : [])], agentFiles: { "turn-summary.json": modelConfig("summary", mode === "fallback"), ...(coexist ? { "prompt-suggestions.json": modelConfig("suggestion") } : {}) } });
  await run(group, "widget", responses, () => {
   prompt(); wait("SUMMARY-1"); shot("full", ["▏Done", "▏Open", "▏Next", "SUMMARY-1"]);
   type("COMPOSING-ONLY"); stable(); shot("composing", ["COMPOSING-ONLY", "SUMMARY-1"]);
   keys("Enter"); wait("SECOND-DONE"); wait("SUMMARY-2"); shot("replacement", ["SUMMARY-2"], ["SUMMARY-1"]);
   command("/turn-summary", "Turn summary: ready"); shot("status", ["Turn summary: ready", "Last attempts:", "summary-primary (success)", "reported input/output"]);
   command("/turn-summary off", "Turn summary: off"); shot("off", ["Turn summary: off"], ["▏Done", "▏Open", "▏Next"]);
  }, options());
  await run(group, "partial", responses, () => { prompt(); wait("SUMMARY-1"); shot("partial", ["▏Done", "SUMMARY-1"], ["▏Open", "▏Next"]); }, options("partial"));
  await run(group, "pending", responses, () => { prompt(); wait("summarizing…"); shot("pending", ["summarizing…"]); release(); wait("SUMMARY-1"); }, options("pending"));
  for (const mode of ["invalid-output", "fallback"]) await run(group, mode, responses, () => {
   prompt(); wait(mode === "fallback" ? "SUMMARY-1" : "summary failed");
   command("/turn-summary", mode === "fallback" ? "Turn summary: ready" : "Turn summary: failed");
   shot(mode, mode === "fallback" ? ["summary-primary (provider-error)", "summary-backup (success)", "▏Done"] : ["invalid-output", "summary failed", "Turn summary: failed"]);
  }, options(mode));
  await run(group, "coexistence", responses, () => {
   prompt(); wait("SUMMARY-1"); wait("tab accept"); const s = screen(); assert.ok(s.indexOf("▏Done") < s.lastIndexOf(suggestion), "Summary is above ghost");
   shot("coexistence", ["▏Done", "▏Open", "▏Next", suggestion, "tab accept"]);
  }, options("state", false, true));
  await run(group, "narrow", responses, () => { prompt(); wait("SUMMARY-1"); shot("narrow", ["▏Done", "▏Open", "▏Next", "while keeping the rem…"], [], note + " Long summary fields are truncated with an ellipsis, not wrapped, by the actual widget."); }, options("narrow", true));
 }
 if (group === "wrapup-audit") {
  const options = (mode = "state", narrow = false, judge = true) => ({ mode, narrow, extensions: [provider], prepare(dir) {
   const fixture = join(dir, "fixture"); mkdirSync(fixture); writeFileSync(join(fixture, "README.md"), "# Offline fixture\n");
   return { fixture, env: { GIT_CEILING_DIRECTORIES: dir }, agentFiles: { "wrapup-audit.json": { ...modelConfig("audit"), rules: auditRules, judgments: auditJudgments, judge } } };
  } });
  const auditResponses = [toolResponse("write", { path: "extensions/demo/index.ts", content: "export default () => {};\n" }), { text: "FIRST-DONE" }, { text: "STEER-HANDLED: documentation remains unverified." }];
  await run(group, "findings", auditResponses, () => {
   prompt("Create the offline demo extension."); wait("STEER-HANDLED"); wait("wrap-up: 2 to check");
   const s = screen(); assert.equal((s.match(/Wrap-up audit \(automatic/g) ?? []).length, 1);
   assert.ok(s.indexOf("FIRST-DONE") < s.indexOf("Wrap-up audit (automatic") && s.indexOf("Wrap-up audit (automatic") < s.indexOf("STEER-HANDLED"));
   assert.ok(readFileSync(current().modelLog, "utf8").includes("Wrap-up audit (automatic"), "Parent received steering");
   shot("steering", ["Wrap-up audit (automatic, once per request)", "readme-extension", "STEER-HANDLED"]);
   shot("findings", ["Wrap-up audit: 2 item(s) to check", "wrap-up: 2 to check"]);
   command("/wrapup-audit", "steered this request: yes"); shot("status", ["Rule findings (Lane A)", "readme-extension", "Judgment (Lane B, report only): ready", "JUDGE-NOTE", "audit-primary (success)"]);
   command("/wrapup-audit off", "Wrap-up audit: off"); shot("off", ["Wrap-up audit: off"], ["wrap-up: 2 to check"]);
  }, options());
  await run(group, "pending", auditResponses, () => { prompt(); wait("wrap-up: checking…"); shot("checking", ["wrap-up: checking…", "STEER-HANDLED"]); release(); wait("wrap-up: 2 to check"); }, options("pending"));
  await run(group, "clean", [toolResponse("write", { path: "notes.txt", content: "Offline fixture\n" }), { text: "CLEAN-DONE" }], () => {
   prompt(); wait("CLEAN-DONE"); command("/wrapup-audit", "audit-primary (success)"); shot("clean", ["Judgment (Lane B, report only): ready", "Rule findings (Lane A):", "(none)"], ["JUDGE-NOTE", "wrap-up: 1 to check"]);
  }, options("clean"));
  await run(group, "rules-only", auditResponses, () => { prompt(); wait("wrap-up: 1 to check"); command("/wrapup-audit", "Judgment (Lane B, report only): off"); shot("rules-only", ["readme-extension", "Judgment (Lane B, report only): off", "Last attempts: none"]); }, options("state", false, false));
  await run(group, "invalid-output", auditResponses, () => { prompt(); wait("wrap-up: audit failed"); command("/wrapup-audit", "Judgment (Lane B, report only): failed"); shot("invalid-output", ["audit-primary (invalid-output)", "wrap-up: audit failed", "readme-extension"]); }, options("invalid-output"));
  await run(group, "narrow", auditResponses, () => {
   prompt(); wait("wrap-up: 2 to check"); command("/wrapup-audit", "audit-primary (success)"); shot("narrow", ["JUDGE-NOTE", "wrap-up: 2 to check"]);
   keys("Ctrl+Home"); stable(); shot("narrow-top", ["Wrap-up audit (automatic", "readme-extension"], [], note + " Supplemental top frame of the same narrow transcript; details exceed one viewport.");
  }, options("state", true));
 }
 if (group === "pi-perf-log") {
  for (const mode of ["normal", "config-error", "write-error"]) await run(group, mode, [{ text: "PERF-DONE: offline turn completed." }], () => {
   if (mode !== "normal") { wait(mode === "config-error" ? "Invalid or unreadable pi-perf-log" : "could not write the performance log"); shot(mode, [mode === "config-error" ? "Invalid or unreadable pi-perf-log" : "could not write the performance log"], [], "Actual production warning; run-local synthetic configuration/filesystem failure. No global permission changes."); }
   prompt(); wait("PERF-DONE");
   if (mode === "normal") {
    const records = readFileSync(join(current().runDir, "perf", readdirSync(join(current().runDir, "perf"))[0]), "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(records.some((r) => r.type === "turn") && records.some((r) => r.type === "run"));
    shot("normal", ["PERF-DONE"], ["pi-perf-log:", "suggesting…", "summarizing…"], "Headless normal operation: no feature widget. Actual session/turn/run JSONL evidence is retained under this run's perf/ directory; timings are not benchmarks.");
   }
  }, { prepare(dir) {
   const output = join(dir, "perf"); if (mode === "write-error") writeFileSync(output, "Not a directory\n");
   return { agentFiles: { "pi-perf-log.json": mode === "config-error" ? { enabled: "invalid" } : { dir: output } } };
  } });
 }
}
