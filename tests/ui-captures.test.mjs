import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { matrix, pngDimensions, buildIndex, buildLanding } from "../scripts/ui-captures/capture.mjs";
import { fixturePng, helperReply, fixtureApp, form, scenario, settings, subagentConfig } from "../scripts/ui-captures/fixtures/data.mjs";
import { normalizeForm } from "../extensions/ask-user/schema.ts";
import { parseScenario } from "../skills/tui-check/scripts/lib.ts";
import { HelperClient } from "../extensions/computer-use/helper-client.ts";

import { legacyMatrix, supplementalMatrix, scopeKeys, validateCaptureScope, assertAction } from "../scripts/ui-captures/scope.mjs";
import { nestedModels, nestedResponse, waitForRelease } from "../scripts/ui-captures/fixtures/nested-data.mjs";
import { verifyEvidence } from "../scripts/ui-captures/verify.mjs";

test("capture matrices preserve 35 legacy states and add four supplemental groups", () => {
 assert.deepEqual(Object.keys(legacyMatrix), ["baseline", "ask-user", "plan-mode", "subagent", "computer-use"]);
 assert.equal(Object.values(legacyMatrix).flat().length, 35);
 assert.deepEqual(Object.keys(supplementalMatrix), ["prompt-suggestions", "turn-summary", "wrapup-audit", "pi-perf-log"]);
 for (const [extension, states] of Object.entries(matrix)) { assert.equal(states.length, new Set(states).size); if (!["baseline", "pi-perf-log"].includes(extension)) assert.ok(states.includes("narrow")); }
});
test("scopes enforce complete known unique states and preserve legacy manifests", () => {
 const captures = (groups, source = matrix) => scopeKeys(groups, source).map((key) => { const [extension, state] = key.split("/"); return { extension, state }; });
 assert.deepEqual(validateCaptureScope({ captures: captures(Object.keys(legacyMatrix), legacyMatrix) }), Object.keys(legacyMatrix));
 const manifest = { schemaVersion: 2, scope: ["turn-summary"], captures: captures(["turn-summary"]) };
 assert.deepEqual(validateCaptureScope(manifest), ["turn-summary"]);
 for (const value of [{ ...manifest, schemaVersion: 3 }, { ...manifest, scope: [] }, { ...manifest, scope: ["bogus"] }, { ...manifest, scope: ["turn-summary", "turn-summary"] }, { ...manifest, captures: manifest.captures.slice(1) }, { ...manifest, captures: [...manifest.captures, manifest.captures[0]] }, { ...manifest, captures: [...manifest.captures, { extension: "turn-summary", state: "bogus" }] }]) assert.throws(() => validateCaptureScope(value));
});
test("timed-out waits fail even when agent-tty reports ok", () => {
 assert.throws(() => assertAction({ ok: true, result: { timedOut: true } }, ["wait", "fixture"]), /Wait timed out/);
 assert.deepEqual(assertAction({ ok: true, result: { timedOut: false } }, ["wait"]), { timedOut: false });
 assert.throws(() => assertAction({ ok: false }, ["snapshot"]));
});
test("nested response fixtures route contracts, malformed output, and fallback deterministically", () => {
 assert.equal(nestedModels.length, 6);
 assert.equal(JSON.parse(nestedResponse("suggestion-primary", "state", 1).text).suggestion, "검증 결과를 요약해주세요.");
 assert.equal(JSON.parse(nestedResponse("summary-primary", "partial", 2).text).summary.open, null);
 assert.match(nestedResponse("summary-primary", "state", 2).text, /SUMMARY-2/);
 assert.deepEqual(JSON.parse(nestedResponse("audit-primary", "clean", 1).text), { findings: [] });
 assert.equal(nestedResponse("summary-primary", "invalid-output", 1).text, "not-json");
 assert.equal(nestedResponse("summary-primary", "fallback", 1).stopReason, "error");
 assert.ok(JSON.parse(nestedResponse("summary-backup", "fallback", 1).text).summary);
 assert.throws(() => nestedResponse("live/model", "state", 1));
});
test("nested gate handles release, cancellation, and bounded failure without leaking watchers", async () => {
 const dir = mkdtempSync(join(tmpdir(), "ui-capture-gate-")); const gate = join(dir, "release");
 try {
  const abort = new AbortController(); const pending = waitForRelease(gate, abort.signal); abort.abort(); await pending;
  const released = waitForRelease(gate); writeFileSync(gate, "release"); await released; await waitForRelease(gate);
  await assert.rejects(waitForRelease(join(dir, "missing"), undefined, 5), /timed out/);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("evidence verifier rejects escaping paths, missing cleanup, nonlocal providers and perf output", () => {
 const dir = mkdtempSync(join(tmpdir(), "ui-capture-verifier-")); const run = join(dir, "runs", "01-fixture"); mkdirSync(run, { recursive: true });
 const json = (p, v) => writeFileSync(p, JSON.stringify(v));
 const png = fixturePng(); writeFileSync(join(dir, "idle.png"), png); writeFileSync(join(dir, "idle.txt"), "IDLE");
 const entry = { extension: "baseline", state: "idle", status: "captured", png: "idle.png", text: "idle.txt", pixels: pngDimensions(png), screenshot: { sha256: createHash("sha256").update(png).digest("hex") }, expectedTokens: ["IDLE"], absentTokens: ["LIVE"], actions: [["snapshot"]], theme: "dark", terminalMode: "fullscreen", cols: 120, rows: 40, run: "runs/01-fixture" };
 const manifest = { schemaVersion: 2, scope: ["baseline"], captures: [entry] };
 const save = () => json(join(dir, "manifest.json"), manifest);
 save(); writeFileSync(join(dir, "index.html"), '<a href="idle.png">PNG</a>');
 json(join(run, "run.json"), { userAgentDir: false, mode: "faux" }); json(join(run, "finish.json"), { piExited: true, ttySessionDestroyed: true });
 writeFileSync(join(run, "launch.sh"), "export PI_OFFLINE=1\npi --offline --no-mcp\n");
 try {
  assert.equal(verifyEvidence(dir).captures, 1);
  manifest.invocations = [{ group: "baseline", status: "failed" }]; save(); assert.throws(() => verifyEvidence(dir), /Latest invocation/); manifest.invocations[0].status = "completed"; save();
  entry.png = "../escape.png"; save(); assert.throws(() => verifyEvidence(dir), /inside/); entry.png = "idle.png";
  entry.run = "../escape"; save(); assert.throws(() => verifyEvidence(dir), /inside/); entry.run = "runs/01-fixture"; save();
  json(join(run, "finish.json"), { piExited: true, ttySessionDestroyed: false }); assert.throws(() => verifyEvidence(dir)); json(join(run, "finish.json"), { piExited: true, ttySessionDestroyed: true });
  writeFileSync(join(run, "provider-calls.jsonl"), JSON.stringify({ model: "openai/live" }) + "\n"); assert.throws(() => verifyEvidence(dir), /allowlist/); writeFileSync(join(run, "provider-calls.jsonl"), JSON.stringify({ model: "ui-nested/summary-primary" }) + "\n");
  const renamed = join(dir, "runs", "02-pi-perf-log-write-error"); renameSync(run, renamed); entry.run = "runs/02-pi-perf-log-write-error"; save(); mkdirSync(join(renamed, "agent")); json(join(renamed, "agent", "pi-perf-log.json"), { dir: "/outside" }); assert.throws(() => verifyEvidence(dir), /Run-local perf/);
 } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("scoped gallery and landing index remain offline and label separate histories", () => {
 const index = buildIndex({ schemaVersion: 2, scope: ["pi-perf-log"], environment: { createdAt: "fixture" }, captures: [] });
 assert.match(index.html, /id="pi-perf-log"/); assert.doesNotMatch(index.html, /id="ask-user"/);
 const landing = buildLanding(["historical", "supplemental"]); assert.match(landing, /historical\/index.html/); assert.match(landing, /supplemental\/index.html/); assert.doesNotMatch(landing, /<script|https?:/);
});
test("fixture scenarios and forms match existing public validation", () => {
 assert.equal(normalizeForm(form).questions.length, 3);
 assert.equal(parseScenario(scenario([{ text: "FIXTURE" }])).responses.length, 1);
 assert.deepEqual(settings, { theme: "dark", tuiMode: "fullscreen", quietStartup: true });
 for (const model of [...subagentConfig.review.models, subagentConfig.agents.explorer.model, ...subagentConfig.agents.explorer.fallbackModels]) assert.match(model, /^ui-fixture\//);
});
test("generated PNG has complete decodable RGB data and correct dimensions", () => {
 const png = fixturePng(); assert.deepEqual(pngDimensions(png), { width: 240, height: 120 });
 let offset = 8; const imageData = [];
 while (offset < png.length) { const size = png.readUInt32BE(offset); const type = png.subarray(offset + 4, offset + 8).toString(); if (type === "IDAT") imageData.push(png.subarray(offset + 8, offset + 8 + size)); offset += 12 + size; }
 assert.equal(inflateSync(Buffer.concat(imageData)).length, 120 * (1 + 240 * 3));
 assert.throws(() => pngDimensions(Buffer.alloc(24)), /PNG signature/);
});
test("fake helper refuses arbitrary apps and all app-changing methods", () => {
 assert.throws(() => helperReply("resolve_app", { app: "com.apple.calculator" }), /Unexpected fixture app/);
 for (const method of ["click", "type_text", "press_key", "launch_app", "set_value", "scroll"]) assert.equal(helperReply(method, { app: fixtureApp.id }).error.code, "fixture_method_denied");
 assert.equal(helperReply("get_app_state", { app: fixtureApp.id }, "permissions").error.code, "permissions_missing");
 const state = helperReply("get_app_state", { app: fixtureApp.id }).result;
 assert.match(state.text, /No private app contents/); assert.equal(state.screenshot.mimeType, "image/png");
});
test("actual HelperClient round-trips the executable fixture and logs only controlled requests", async () => {
 const scratch = mkdtempSync(join(tmpdir(), "ui-capture-helper-test-")); const log = join(scratch, "helper.jsonl");
 const helper = new URL("../scripts/ui-captures/fixtures/computer-helper.mjs", import.meta.url).pathname;
 const previous = { PI_OFFLINE: process.env.PI_OFFLINE, UI_CAPTURE_HELPER_LOG: process.env.UI_CAPTURE_HELPER_LOG };
 process.env.PI_OFFLINE = "1"; process.env.UI_CAPTURE_HELPER_LOG = log; chmodSync(helper, 0o755);
 const client = new HelperClient(helper);
 try {
  assert.equal((await client.request("resolve_app", { app: fixtureApp.id })).id, fixtureApp.id);
  assert.equal((await client.request("get_app_state", { app: fixtureApp.id })).nodeCount, 8);
  await assert.rejects(client.request("click", { app: fixtureApp.id }), /Real app operations are disabled/);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 3);
 } finally {
  client.close(); for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } rmSync(scratch, { recursive: true, force: true });
 }
});
test("fixture helper cannot start outside the offline capture boundary", () => {
 const result = spawnSync(process.execPath, [new URL("../scripts/ui-captures/fixtures/computer-helper.mjs", import.meta.url).pathname], { env: { ...process.env, PI_OFFLINE: "0" }, encoding: "utf8" });
 assert.notEqual(result.status, 0); assert.match(result.stderr, /requires an isolated offline/);
});
test("gallery is offline, escapes fixture strings, and links relative artifacts", () => {
 const index = buildIndex({ environment: { createdAt: "fixture-date" }, captures: [{ extension: "ask-user", state: "single-choice", cols: 120, rows: 40, status: "captured", png: "ask-user/single.png", text: "ask-user/single.txt", note: '<script>not executable</script> & "quoted"' }] });
 assert.doesNotMatch(index.html, /<script>|(?:src|href)="https?:/);
 assert.match(index.html, /&lt;script&gt;/); assert.match(index.html, /src="ask-user\/single.png"/); assert.match(index.markdown, /single.png/);
});
