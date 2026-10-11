import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import { matrix, pngDimensions, buildIndex } from "../scripts/ui-captures/capture.mjs";
import { fixturePng, helperReply, fixtureApp, form, scenario, settings, subagentConfig } from "../scripts/ui-captures/fixtures/data.mjs";
import { normalizeForm } from "../extensions/ask-user/schema.ts";
import { parseScenario } from "../skills/tui-check/scripts/lib.ts";
import { HelperClient } from "../extensions/computer-use/helper-client.ts";

test("capture matrix includes all four extensions, baseline, narrow states, and expanded supplementary frame", () => {
 assert.deepEqual(Object.keys(matrix), ["baseline", "ask-user", "plan-mode", "subagent", "computer-use"]);
 assert.equal(Object.values(matrix).flat().length, 35);
 for (const [extension, states] of Object.entries(matrix)) { assert.equal(states.length, new Set(states).size); if (extension !== "baseline") assert.ok(states.includes("narrow")); }
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
