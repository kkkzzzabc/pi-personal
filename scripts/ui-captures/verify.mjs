import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { pngDimensions } from "./capture.mjs";
import { validateCaptureScope } from "./scope.mjs";
import { nestedModels } from "./fixtures/nested-data.mjs";
import { fixtureApp } from "./fixtures/data.mjs";

export function verifyEvidence(directory) {
 const out = resolve(directory);
 const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
 validateCaptureScope(manifest);
 const latest = new Map((manifest.invocations ?? []).map((i) => [i.group, i]));
 for (const invocation of latest.values()) assert.equal(invocation.status, "completed", `Latest invocation: ${invocation.group}`);
 const inside = (path) => { assert.equal(typeof path, "string"); const value = resolve(out, path); assert.ok(value.startsWith(out + "/"), "Evidence stays inside output directory"); return value; };
 const dimensions = new Map();
 for (const entry of manifest.captures) {
  assert.equal(entry.status, "captured", `${entry.extension}/${entry.state}`);
  const png = inside(entry.png); const textPath = inside(entry.text);
  const bytes = readFileSync(png); const pixels = pngDimensions(bytes); assert.deepEqual(pixels, entry.pixels);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.screenshot.sha256, "PNG matches renderer metadata");
  const text = readFileSync(textPath, "utf8"); for (const token of entry.expectedTokens) assert.ok(text.includes(token), token);
  for (const token of entry.absentTokens ?? []) assert.ok(!text.includes(token), `Absent: ${token}`);
  assert.ok(entry.actions.length > 0); assert.equal(entry.theme, "dark"); assert.equal(entry.terminalMode, "fullscreen");
  const key = `${entry.cols}x${entry.rows}`;
  if (dimensions.has(key)) assert.deepEqual(pixels, dimensions.get(key)); else dimensions.set(key, pixels);
  const finish = JSON.parse(readFileSync(join(inside(entry.run), "finish.json"), "utf8"));
  assert.ok(finish.piExited && finish.ttySessionDestroyed);
 }
 const html = readFileSync(join(out, "index.html"), "utf8");
 assert.doesNotMatch(html, /<(?:script|iframe)\b|(?:src|href)=["']https?:/i, "Offline gallery has no active or external resources");
 for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (match[1].startsWith("#")) continue;
  assert.ok(existsSync(join(out, match[1])), `Gallery link: ${match[1]}`);
 }
 let runs = 0, providerCalls = 0, helperCalls = 0;
 for (const name of readdirSync(join(out, "runs"))) {
  const dir = join(out, "runs", name); const run = JSON.parse(readFileSync(join(dir, "run.json"), "utf8"));
  const finish = JSON.parse(readFileSync(join(dir, "finish.json"), "utf8"));
  assert.ok(finish.piExited && finish.ttySessionDestroyed, `Cleanup: ${name}`); runs++;
  assert.equal(run.userAgentDir, false); assert.equal(run.mode, "faux");
  const launch = readFileSync(join(dir, "launch.sh"), "utf8");
  assert.match(launch, /export PI_OFFLINE=(?:1|'1')\n/); assert.match(launch, /--offline/); assert.match(launch, /--no-mcp/);
  if (name.includes("plan-mode")) {
   const config = JSON.parse(readFileSync(join(dir, "agent", "plan-mode.json"), "utf8"));
   assert.ok(resolve(config.plansDir).startsWith(dir + "/"));
  }
  const provider = join(dir, "provider-calls.jsonl");
  if (existsSync(provider)) for (const line of readFileSync(provider, "utf8").trim().split("\n")) {
   const call = JSON.parse(line);
   assert.ok(/^ui-fixture\/(primary|backup|failure)$/.test(call.model) || nestedModels.some((id) => call.model === `ui-nested/${id}`), "Offline fixture model allowlist"); providerCalls++;
  }
  if (name.includes("pi-perf-log")) {
   const config = JSON.parse(readFileSync(join(dir, "agent", "pi-perf-log.json"), "utf8"));
   if (typeof config.enabled !== "string") assert.ok(resolve(config.dir).startsWith(dir + "/"), "Run-local perf output");
   if (name.endsWith("-normal")) {
    const logs = readdirSync(join(dir, "perf")); assert.equal(logs.length, 1);
    const records = readFileSync(join(dir, "perf", logs[0]), "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(records.some((r) => r.type === "session") && records.some((r) => r.type === "turn") && records.some((r) => r.type === "run"));
    assert.ok(records.every((r) => `${r.sessionId}.jsonl` === logs[0]), "Log identity");
    const sessions = readdirSync(run.sessionDir).filter((f) => f.endsWith(".jsonl"));
    assert.ok(sessions.some((f) => JSON.parse(readFileSync(join(run.sessionDir, f), "utf8").split("\n")[0]).id === records[0].sessionId), "Actual Pi session identity");
   }
  }
  const helper = join(dir, "helper-calls.jsonl");
  if (existsSync(helper)) for (const line of readFileSync(helper, "utf8").trim().split("\n")) {
   const call = JSON.parse(line); assert.ok(["resolve_app", "get_app_state"].includes(call.method)); assert.equal(call.params.app, fixtureApp.id); helperCalls++;
  }
 }
 return { ok: true, captures: manifest.captures.length, runs, providerCalls, helperCalls, dimensions: Object.fromEntries(dimensions), galleryLinksValid: true, allSessionsDestroyed: true, note: "PNG/text and fixture-boundary checks; visual inspection is recorded separately. No live-provider or real-app behavior was verified." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const out = process.argv[2]; const result = verifyEvidence(out);
 writeFileSync(join(out, "verification.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result, null, 2));
}
