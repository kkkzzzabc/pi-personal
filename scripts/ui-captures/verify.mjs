import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { matrix, pngDimensions } from "./capture.mjs";
import { fixtureApp } from "./fixtures/data.mjs";

export function verifyEvidence(directory) {
 const out = resolve(directory);
 const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
 const expected = Object.entries(matrix).flatMap(([extension, states]) => states.map((state) => `${extension}/${state}`));
 assert.deepEqual(manifest.captures.map((entry) => `${entry.extension}/${entry.state}`).sort(), expected.sort());
 const dimensions = new Map();
 for (const entry of manifest.captures) {
  assert.equal(entry.status, "captured", `${entry.extension}/${entry.state}`);
  const png = resolve(out, entry.png); const textPath = resolve(out, entry.text);
  assert.ok(png.startsWith(out + "/") && textPath.startsWith(out + "/"), "Evidence stays inside output directory");
  const bytes = readFileSync(png); const pixels = pngDimensions(bytes); assert.deepEqual(pixels, entry.pixels);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.screenshot.sha256, "PNG matches renderer metadata");
  const text = readFileSync(textPath, "utf8"); for (const token of entry.expectedTokens) assert.ok(text.includes(token), token);
  assert.ok(entry.actions.length > 0); assert.equal(entry.theme, "dark"); assert.equal(entry.terminalMode, "fullscreen");
  const key = `${entry.cols}x${entry.rows}`;
  if (dimensions.has(key)) assert.deepEqual(pixels, dimensions.get(key)); else dimensions.set(key, pixels);
  const finish = JSON.parse(readFileSync(join(out, entry.run, "finish.json"), "utf8"));
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
   const call = JSON.parse(line); assert.match(call.model, /^ui-fixture\/(primary|backup|failure)$/); providerCalls++;
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
