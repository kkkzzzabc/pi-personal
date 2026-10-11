import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "../../tests/pi-package.mjs";
import { childTask, fixtureApp, fixturePng, form, scenario, settings, subagentConfig, toolResponse } from "./fixtures/data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const harness = join(root, "skills/tui-check/scripts");
const fixtures = join(root, "scripts/ui-captures/fixtures");
import { matrix, legacyMatrix, supplementalMatrix, manifestGroups, assertAction } from "./scope.mjs";
import { captureSupplemental } from "./supplemental.mjs";
export { matrix } from "./scope.mjs";
export function pngDimensions(buffer) {
 assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG signature");
 return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
function command(file, args, env = process.env) {
 const result = spawnSync(file, args, { cwd: root, env, encoding: "utf8", timeout: 120_000 });
 if (result.error) throw result.error;
 if (result.status !== 0) throw new Error(`${file} ${args.join(" ")}: ${result.stderr || result.stdout}`);
 return result.stdout;
}
function provenance(bin) {
 const packageRoot = findPiPackageRoot();
 const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
 return {
  createdAt: new Date().toISOString(), session: process.env.PI_SESSION_ID ?? null,
  gitRevision: command("git", ["rev-parse", "HEAD"]).trim(), gitStatus: command("git", ["status", "--short"]),
  node: process.version, piExecutable: command("which", ["pi"]).trim(), packageRoot: realpathSync(packageRoot), piVersion: pkg.version,
  agentTty: agentTty(bin, "/tmp", ["version"]).result,
  theme: settings.theme, terminalMode: settings.tuiMode, screenshotRenderer: "ghostty-web", renderProfile: "reference-dark", cursor: "hardware cursor hidden; TUI fake editor cursor preserved",
  productionSources: Object.keys(matrix).filter((group) => group !== "baseline").map((group) => {
   const file = `extensions/${group}/index.ts`;
   return { path: file, sha256: createHash("sha256").update(readFileSync(join(root, file))).digest("hex") };
  }),
 };
}
export function buildIndex(manifest) {
 const disclaimer = "Actual Pi TUI; offline fixture data. No live models or real macOS app contents. Dark theme, fullscreen mode; 120×40 baseline and 80×30 narrow. Screenshots are renderer-backed, not photographs of the user's terminal.";
 const groups = manifestGroups(manifest);
 const sections = groups.map((group) => {
  const entries = manifest.captures.filter((entry) => entry.extension === group);
  const cards = entries.map((entry) => `<article id="${escapeHtml(`${group}-${entry.state}`)}"><h3>${escapeHtml(entry.state)} <small>${entry.cols}×${entry.rows} · ${escapeHtml(entry.status)}</small></h3>${entry.png ? `<a href="${escapeHtml(entry.png)}"><img loading="lazy" src="${escapeHtml(entry.png)}" alt="${escapeHtml(`${group}: ${entry.state}`)}"></a>` : ""}<p>${escapeHtml(entry.note ?? entry.error ?? "Pending capture")}</p>${entry.text ? `<a href="${escapeHtml(entry.text)}">Text evidence</a>` : ""}<details><summary>Reproduction and evidence</summary><pre>${escapeHtml(JSON.stringify(entry, null, 2))}</pre></details></article>`).join("\n");
  return `<section id="${group}"><h2>${group}</h2>${cards}</section>`;
 }).join("\n");
 const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pi extension UI captures</title><style>body{margin:0;background:#10151d;color:#e7edf6;font:16px system-ui}header,main{max-width:1260px;margin:auto;padding:24px}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#85c8ff}h2{margin-top:48px}article{background:#1b2330;padding:20px;margin:20px 0;border-radius:12px}img{width:100%;height:auto;display:block;margin:16px 0}small{font-weight:400;color:#aebbd0}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{line-height:1.6}</style><header><h1>Pi extension UI captures</h1><p>${disclaimer}</p><nav>${groups.map((group) => `<a href="#${group}">${group}</a>`).join("")}</nav><p><a href="manifest.json">Manifest</a> · <a href="index.md">Markdown index</a></p></header><main>${sections}</main></html>`;
 const markdown = ["# Pi extension UI captures", "", disclaimer, "", `Created: ${manifest.environment.createdAt}`, "", ...groups.flatMap((group) => [
  `## ${group}`, "", ...manifest.captures.filter((entry) => entry.extension === group).flatMap((entry) => [
   `### ${entry.state} — ${entry.status} (${entry.cols}×${entry.rows})`, "", entry.png ? `![${entry.state}](${entry.png})` : "No image captured.", "", entry.note ?? entry.error ?? "Pending capture.", "", entry.text ? `[Text snapshot](${entry.text})` : "", "",
  ]),
 ])].join("\n");
 return { html, markdown };
}

export function buildLanding(galleries) {
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pi UI capture sets</title><body><h1>Pi UI capture sets</h1><p>Separate historical capture sets; actual Pi TUI with offline synthetic data. No live-provider behavior is implied.</p><ul>${galleries.map((name) => `<li><a href="${escapeHtml(name)}/index.html">${escapeHtml(name)}</a></li>`).join("")}</ul></body></html>`;
}
export async function main(args) {
 if (args.includes("--help")) { console.log("Usage: node scripts/ui-captures/capture.mjs [--group baseline|ask-user|plan-mode|subagent|computer-use|prompt-suggestions|turn-summary|wrapup-audit|pi-perf-log|supplemental|all] [--case <run-label>] [--out artifacts/ui-captures/<id>]\nUse one group per invocation for bounded runs. All execution is offline. No installs or global settings changes.\nVerify: node scripts/ui-captures/verify.mjs <output-directory>"); return; }
 const get = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
 const out = resolve(get("--out", join(root, "artifacts/ui-captures/2026-10-11-baseline")));
 assert.ok(out.startsWith(join(root, "artifacts/ui-captures") + "/"), "Output must stay in the workspace capture directory");
 const selected = get("--group", "all");
 assert.ok(selected === "all" || selected === "supplemental" || Object.hasOwn(matrix, selected), `Unknown group: ${selected}`);
 const groups = selected === "all" ? Object.keys(matrix) : selected === "supplemental" ? Object.keys(supplementalMatrix) : [selected];
 mkdirSync(out, { recursive: true });
 const bin = findAgentTty(); assert.ok(bin, "Existing agent-tty required; do not install automatically");
 const manifestPath = join(out, "manifest.json");
 const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {
  schemaVersion: 2, scope: groups, environment: provenance(bin), runs: [], captures: [],
 };
 const declared = manifestGroups(manifest);
 if (manifest.schemaVersion !== 2) assert.ok(groups.every((g) => Object.hasOwn(legacyMatrix, g)), "Use a new output directory for supplemental captures");
 else manifest.scope = [...new Set([...declared, ...groups])];
 for (const extension of manifestGroups(manifest)) for (const state of matrix[extension]) if (!manifest.captures.some((entry) => entry.extension === extension && entry.state === state)) manifest.captures.push({ extension, state, cols: state.startsWith("narrow") ? 80 : 120, rows: state.startsWith("narrow") ? 30 : 40, status: "pending" });
 function persist() {
  json(manifestPath, manifest);
  const index = buildIndex(manifest); writeFileSync(join(out, "index.html"), index.html); writeFileSync(join(out, "index.md"), index.markdown);
  const parent = dirname(out);
  const galleries = readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(parent, d.name, "manifest.json")) && existsSync(join(parent, d.name, "index.html"))).map((d) => d.name).sort();
  writeFileSync(join(parent, "index.html"), buildLanding(galleries));
 }
 const doctor = agentTty(bin, join(out, "doctor-home"), ["doctor"]); json(join(out, "doctor.json"), doctor);
 assert.ok(doctor.ok && doctor.result.ok, "Screenshot prerequisites failed; do not install automatically");
 chmodSync(join(fixtures, "computer-helper.mjs"), 0o755);
 writeFileSync(join(out, "fixture-image.png"), fixturePng());
 let current; let actions = []; let runSerial = existsSync(join(out, "runs")) ? Math.max(0, ...readdirSync(join(out, "runs")).map((name) => Number.parseInt(name, 10) || 0)) : 0;
 const act = (args) => {
  actions.push(args); const result = agentTty(bin, current.ttyHome, args);
  return assertAction(result, args);
 };
 const keys = (...names) => act(["send-keys", current.sessionId, ...names]);
 const type = (text) => act(["type", current.sessionId, text]);
 const wait = (text) => act(["wait", current.sessionId, "--text", text, "--timeout", "30000"]);
 const stable = () => act(["wait", current.sessionId, "--screen-stable-ms", "350", "--timeout", "10000"]);
 const prompt = (text = "Show the next offline UI fixture.") => { type(text); keys("Enter"); };
 function capture(group, state, expected, note = "Actual production extension with offline fixture data.", absent = []) {
  const entry = manifest.captures.find((item) => item.extension === group && item.state === state);
  assert.ok(entry, `${group}/${state} exists in matrix`);
  entry.status = "pending"; delete entry.error;
  stable();
  const text = String(act(["snapshot", current.sessionId, "--format", "text"]).text);
  for (const token of expected) assert.ok(text.includes(token), `Missing ${JSON.stringify(token)} in ${group}/${state}:\n${text}`);
  for (const token of absent) assert.ok(!text.includes(token), `Unexpected ${JSON.stringify(token)} in ${group}/${state}`);
  actions.push(["screenshot-rpc", current.sessionId, "reference-dark", "60s timeout", "hidden cursor"]);
  const shot = JSON.parse(command(process.execPath, [join(root, "scripts/ui-captures/screenshot.mjs"), bin, current.ttyHome, current.sessionId]));
  json(join(current.runDir, `screenshot-${state}.json`), shot);
  const path = shot.path ?? shot.outputPath ?? shot.artifact?.path ?? shot.artifactPath;
  assert.ok(path, `Screenshot path missing: ${JSON.stringify(shot)}`);
  const targetDir = join(out, group); mkdirSync(targetDir, { recursive: true });
  const stem = `${state}-${current.cols}x${current.rows}`;
  const png = join(targetDir, `${stem}.png`); copyFileSync(path, png);
  const textPath = join(targetDir, `${stem}.txt`); writeFileSync(textPath, text);
  Object.assign(entry, { status: "captured", png: relative(out, png), text: relative(out, textPath), pixels: pngDimensions(readFileSync(png)), cols: current.cols, rows: current.rows, run: relative(out, current.runDir), theme: settings.theme, terminalMode: settings.tuiMode, note, expectedTokens: expected, absentTokens: absent, fixtureMode: current.captureFixture.mode, screenshot: { capturedAtSeq: shot.capturedAtSeq, profile: shot.profileName, renderer: shot.rendererBackend, sha256: shot.sha256, profileHash: shot.renderProfileHash }, fixtureBoundary: group === "subagent" ? "Local ui-fixture provider; real extension runner" : group === "computer-use" ? "Fake JSON-lines helper; real approval, formatting, and host renderer" : "Scripted parent provider; real extension UI", actions: [...actions], source: group === "baseline" ? null : `extensions/${group}/index.ts` });
  persist(); console.log(`Captured ${group}/${state}`);
 }
 async function run(group, label, responses, callback, { mode = "state", config, narrow = false, extensions = [], agentFiles = {}, prepare } = {}) {
  if (get("--case", null) && label !== get("--case", null)) return;
  const runDir = join(out, "runs", `${String(++runSerial).padStart(2, "0")}-${group}-${label}`);
  mkdirSync(runDir, { recursive: true });
  json(join(runDir, "input.json"), scenario(responses)); json(join(runDir, "settings.json"), settings);
  const argv = [join(harness, "start.mjs"), "--scenario", join(runDir, "input.json"), "--agent-file", `settings.json=${join(runDir, "settings.json")}`, "--out", runDir, "--cols", narrow ? "80" : "120", "--rows", narrow ? "30" : "40"];
  if (group !== "baseline") argv.push("--extension", join(root, `extensions/${group}/index.ts`));
  if (group === "plan-mode") {
   const planConfig = { plansDir: join(runDir, "plans", "reference-layout-and-keyboard-guidance"), thinkingLevel: "high" };
   json(join(runDir, "plan-mode.json"), planConfig); argv.push("--agent-file", `plan-mode.json=${join(runDir, "plan-mode.json")}`);
  }
  if (group === "subagent") {
   json(join(runDir, "subagent.json"), config ?? subagentConfig); argv.push("--agent-file", `subagent.json=${join(runDir, "subagent.json")}`, "--extension", join(fixtures, "subagent-provider.ts"));
   const fixtureDir = join(runDir, "fixture"); mkdirSync(fixtureDir); writeFileSync(join(fixtureDir, "README.md"), "Offline UI reference fixture. No actual repository review.\n"); argv.push("--fixture", fixtureDir);
  }
  for (const extension of extensions) argv.push("--extension", join(root, extension));
  const prepared = prepare?.(runDir) ?? {};
  for (const [name, value] of Object.entries({ ...agentFiles, ...prepared.agentFiles })) { json(join(runDir, name), value); argv.push("--agent-file", `${name}=${join(runDir, name)}`); }
  if (prepared.fixture) argv.push("--fixture", prepared.fixture);
  const env = { ...process.env, ...prepared.env, UI_CAPTURE_MODE: mode, UI_CAPTURE_PROVIDER_LOG: join(runDir, "provider-calls.jsonl"), UI_CAPTURE_HELPER_LOG: join(runDir, "helper-calls.jsonl"), PI_CUA_HELPER: join(fixtures, "computer-helper.mjs") };
  actions = []; current = undefined;
  try {
   const started = spawnSync(process.execPath, argv, { cwd: root, env, encoding: "utf8", timeout: 100_000 });
   if (existsSync(join(runDir, "run.json"))) current = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
   else {
    // Startup can time out after creating a PTY but before writing run.json.
    // Recover only sessions in this newly created, isolated home for cleanup.
    const listed = agentTty(bin, join(runDir, "tty"), ["list"]);
    const session = listed.result?.sessions?.find((item) => item.status === "running");
    if (session) {
     current = { ok: false, recoveredAfterStartupFailure: true, mode: "faux", model: "faux/faux-1", userAgentDir: false, runDir, ttyHome: join(runDir, "tty"), sessionId: session.sessionId, agentTty: { bin }, sessionDir: join(runDir, "sessions"), workDir: join(runDir, "work"), modelLog: join(runDir, "logs/model-input.jsonl"), launch: join(runDir, "launch.sh") };
     json(join(runDir, "run.json"), current);
    }
   }
   manifest.runs.push({ group, label, path: relative(out, runDir), status: current ? "running" : "startup-failed" }); persist();
   assert.ok(current?.ok, started.stdout + started.stderr);
   current.captureFixture = { mode, gitCeiling: prepared.env?.GIT_CEILING_DIRECTORIES ?? null, providerLog: env.UI_CAPTURE_PROVIDER_LOG };
   json(join(runDir, "run.json"), current);
   await callback();
  } catch (error) {
   if (current?.ok) { try { writeFileSync(join(runDir, "failure-screen.txt"), String(agentTty(bin, current.ttyHome, ["snapshot", current.sessionId, "--format", "text"]).result?.text)); } catch { /* Preserve the original failure. */ } }
   throw error;
  } finally {
   if (current) {
    writeFileSync(join(current.workDir, "release-children"), "release\n");
    // Close dialogs or cancel any active operation before the ordinary finish sequence.
    agentTty(bin, current.ttyHome, ["send-keys", current.sessionId, "Escape"]);
    const finished = JSON.parse(command(process.execPath, [join(harness, "finish.mjs"), join(runDir, "run.json")]));
    assert.ok(finished.piExited && finished.ttySessionDestroyed, `Cleanup failed: ${JSON.stringify(finished)}`);
    const row = manifest.runs.find((item) => item.path === relative(out, runDir)); if (row) row.status = "destroyed";
    persist();
   }
  }
 }

 const api = { run, capture, prompt, keys, type, wait, stable, act, current: () => current, root };
 for (const entry of manifest.captures.filter((entry) => groups.includes(entry.extension) && entry.status === "failed")) { entry.status = "pending"; delete entry.error; }
 let failedInvocations = 0;
 manifest.invocations ??= [];
 for (const group of groups) {
  const invocation = { group, case: get("--case", null), startedAt: new Date().toISOString(), status: "running" };
  manifest.invocations.push(invocation);
  try {
   if (Object.hasOwn(supplementalMatrix, group)) await captureSupplemental(group, api);
   if (group === "baseline") await run(group, "idle", [{ text: "OFFLINE-IDLE" }], () => capture(group, "idle", ["faux-1"], "Shared idle screen; built-in dark theme and fullscreen mode."));
   if (group === "ask-user") {
    await run(group, "form", [toolResponse("ask_user", form), { text: "ASK-SUBMITTED-DONE" }], () => {
     prompt(); wait("Choose the UI baseline");
     keys("Enter"); capture(group, "single-choice", ["1/3", "[x] Standard", "recommended"]);
     keys("Down", "Down", "Enter"); type("Keep the existing host controls and compare both widths."); stable(); capture(group, "alternative-editor", ["Alternative answer", "Keep the existing"]); keys("Escape");
     keys("Down", "Enter"); type("Offline fixtures only; do not infer real model behavior."); stable(); capture(group, "comment-editor", ["Comment", "Offline fixtures only"]); keys("Escape");
     keys("Tab", "Enter", "Down", "Enter"); capture(group, "multi-choice", ["2/3", "[x] Ready", "[x] Running"]);
     keys("Tab", "Enter"); type("These are controlled visual references, not live model evaluations."); stable(); capture(group, "text-editor", ["Question 3", "controlled visual references"]); keys("Escape"); stable(); keys("Tab");
     capture(group, "review", ["Review", "Submit answers", "Answer:"]);
     keys("Enter"); wait("ASK-SUBMITTED-DONE"); capture(group, "submitted-collapsed", ["Answers submitted", "3/3 answered"]);
     keys("Ctrl+O"); stable(); capture(group, "submitted-expanded", ["unansweredIds", "controlled visual references"], "Expanded result exceeds one viewport; this frame shows the answer details at the bottom."); keys("Ctrl+Home"); stable(); capture(group, "submitted-expanded-top", ["submitted", "Choose the UI baseline"], "Supplemental top frame of the same expanded result; default fullscreen transcript scrolling.");
    });
    await run(group, "narrow", [toolResponse("ask_user", form)], () => { prompt(); wait("Choose the UI baseline"); keys("Tab", "Enter", "Down", "Enter"); capture(group, "narrow", ["2/3", "좁은 화면"], "Started at 80×30; long labels and Korean fixture text. This is a narrow layout baseline, not a dynamic-resize test."); }, { narrow: true });
    await run(group, "partial", [toolResponse("ask_user", form), { text: "ASK-DISCUSSION-DONE" }], () => {
     prompt(); wait("Choose the UI baseline"); keys("Enter", "Tab", "Tab", "Tab"); capture(group, "partial-review", ["UNANSWERED", "Review", "Answer: Standard terminal"]);
     keys("Enter"); wait("ASK-DISCUSSION-DONE"); capture(group, "discussion", ["For discussion", "unanswered"]);
    });
    await run(group, "cancel", [toolResponse("ask_user", form)], () => {
     prompt(); wait("Choose the UI baseline"); keys("Escape"); wait("cancelled"); capture(group, "cancelled", ["cancelled"]);
    });
   }
   if (group === "plan-mode") {
    const plan = "# UI capture plan\n\nCapture actual extension screens using local fixtures.\nVerify state labels, wrapping, and cleanup.\n";
    const responses = [toolResponse("enter_plan_mode", { reason: "Plan the UI capture states before creating screenshots; no production UI changes are needed." }), toolResponse("write", { path: "{{entry:plan-mode.planFile}}", content: plan }), toolResponse("exit_plan_mode", {}), { text: "PLAN-FEEDBACK-RECORDED" }, toolResponse("exit_plan_mode", {}), { text: "PLAN-APPROVED-DONE" }];
    await run(group, "dialogs", responses, () => {
     prompt(); wait("Switch to plan mode?"); capture(group, "enter-confirmation", ["Switch to plan mode?", "UI capture states"]);
     keys("Enter"); wait("Plan ready ("); capture(group, "approval", ["Approve and implement here", "Give feedback", "plan"]);
     keys("Down", "Down", "Enter"); wait("Feedback on the plan"); type("Add one narrow-screen reference per extension and preserve keyboard hints."); stable(); capture(group, "feedback-editor", ["Feedback on the plan", "narrow-screen"]);
     keys("Enter"); wait("PLAN-FEEDBACK-RECORDED"); prompt("Show the approval dialog again."); wait("Plan ready ("); keys("Enter"); wait("PLAN-APPROVED-DONE"); keys("Ctrl+O"); stable(); capture(group, "approved", ["Build mode is active", "PLAN-APPROVED-DONE"]);
    });
    await run(group, "narrow", responses, () => { prompt(); wait("Switch to plan mode?"); keys("Enter"); wait("Plan ready ("); capture(group, "narrow", ["Approve and implement", "Give feedback"], "Started at 80×30; long fixture plan path. This is not a dynamic-resize test."); }, { narrow: true });
    await run(group, "status", [{ text: "STATUS-FIXTURE" }], () => {
     type("/plan on"); stable(); keys("Escape"); stable(); keys("Enter"); wait("Plan mode on"); capture(group, "active-status", ["Plan mode on", "⏸ plan"], "Real entry notification and persistent plan status; plan directory is isolated.");
    });
   }
   if (group === "subagent") {
    const one = { agent: "explorer", task: childTask };
    const parallel = { tasks: [{ ...one, model: "ui-fixture/primary" }, { ...one, model: "ui-fixture/backup" }] };
    for (const [label, args] of [["single", one], ["parallel", parallel]]) await run(group, label, [toolResponse("subagent", args), { text: "SUBAGENT-COMPLETED-DONE" }], () => {
     prompt(); wait("running"); capture(group, `${label}-running`, ["subagent", "ui-fixture/primary"]);
     writeFileSync(join(current.workDir, "release-children"), "release\n"); wait("SUBAGENT-COMPLETED-DONE");
     if (label === "single") { capture(group, "completed-collapsed", ["completed", "more lines"]); keys("Ctrl+O"); stable(); capture(group, "completed-expanded", ["Expanded results preserve", "No real repository review"]); }
    }, { mode: "running" });
    await run(group, "narrow", [toolResponse("subagent", parallel)], () => { prompt(); wait("running"); capture(group, "narrow", ["ui-fixture/primary", "ui-fixture/backup"], "Started at 80×30; real parallel progress held at offline fixture gates."); }, { mode: "running", narrow: true });
    await run(group, "mixed", [toolResponse("subagent", { tasks: [{ ...one, model: "ui-fixture/primary" }, { agent: "reviewer", task: childTask, model: "ui-fixture/failure" }] }), { text: "SUBAGENT-MIXED-DONE" }], () => { prompt(); wait("SUBAGENT-MIXED-DONE"); capture(group, "mixed-results", ["completed", "failed", "503"]); });
    await run(group, "fallback", [toolResponse("subagent", one), { text: "SUBAGENT-FALLBACK-DONE" }], () => { prompt(); wait("SUBAGENT-FALLBACK-DONE"); capture(group, "fallback", ["ui-fixture/backup", "previous model attempt failed"]); }, { mode: "fallback" });
    await run(group, "cancel", [toolResponse("subagent", parallel)], () => { prompt(); wait("running"); keys("Escape"); wait("aborted"); capture(group, "aborted", ["aborted"]); }, { mode: "cancel" });
    await run(group, "review", [toolResponse("subagent", { review: { task: childTask } }), { text: "SUBAGENT-REVIEW-DONE" }], () => { prompt(); wait("SUBAGENT-REVIEW-DONE"); capture(group, "review-partial", ["Review coverage: partial", "1/2 succeeded", "ui-fixture/failure"], "Synthetic review coverage from two local fixture models; not an actual code review."); });
   }
   if (group === "computer-use") {
    const args = { app: fixtureApp.id, screenshot: true };
    await run(group, "state", [toolResponse("computer_get_app_state", args), { text: "COMPUTER-STATE-DONE" }], () => {
     prompt(); wait("Allow computer use?"); capture(group, "approval", ["Allow computer use?", fixtureApp.name]); keys("Enter"); wait("COMPUTER-STATE-DONE");
     capture(group, "state-collapsed", ["computer_get_app_state", "App:"]);
     keys("Ctrl+O"); stable(); capture(group, "state-expanded", ["No private app contents", "Review answers"], "Real default Pi rendering; app tree and attached PNG are synthetic. This backend displayed an image text placeholder, not inline pixels.");
    });
    await run(group, "narrow", [toolResponse("computer_get_app_state", args), { text: "COMPUTER-NARROW-DONE" }], () => { prompt(); wait("Allow computer use?"); keys("Enter"); wait("COMPUTER-NARROW-DONE"); keys("Ctrl+O"); stable(); capture(group, "narrow", ["Offline UI fixture", "Review answers"], "Started at 80×30; synthetic accessibility-tree data, not a real app screenshot."); }, { narrow: true });
    await run(group, "rejected", [toolResponse("computer_get_app_state", args), { text: "COMPUTER-REJECTED-DONE" }], () => { prompt(); wait("Allow computer use?"); keys("Escape"); wait("COMPUTER-REJECTED-DONE"); capture(group, "rejected", ["did not allow", fixtureApp.name]); });
    await run(group, "permissions", [toolResponse("computer_get_app_state", args), { text: "COMPUTER-PERMISSIONS-DONE" }], () => { prompt(); wait("Allow computer use?"); keys("Enter"); wait("COMPUTER-PERMISSIONS-DONE"); capture(group, "permissions-error", ["Accessibility permission", "Privacy & Security"], "Synthetic helper permissions error; no actual permission request or settings change."); }, { mode: "permissions" });
   }
   invocation.status = "completed";
  } catch (error) {
   failedInvocations++; invocation.status = "failed";
   console.error(`${group}: ${error.stack}`);
   for (const entry of manifest.captures.filter((entry) => entry.extension === group && entry.status === "pending")) Object.assign(entry, { status: "failed", error: error.message });
   persist();
  }
 }
 persist(); console.log(JSON.stringify({ out, captured: manifest.captures.filter((entry) => entry.status === "captured").length, failed: manifest.captures.filter((entry) => entry.status === "failed").length, pending: manifest.captures.filter((entry) => entry.status === "pending").length }));
 if (failedInvocations || manifest.captures.some((entry) => groups.includes(entry.extension) && entry.status === "failed")) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
