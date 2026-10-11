import { deflateSync } from "node:zlib";

export const settings = { theme: "dark", tuiMode: "fullscreen", quietStartup: true };
export const form = {
 title: "Choose the UI baseline", context: "Decide how to capture extension screens. These answers are fixture data, not implementation approval.",
 questions: [
  { id: "layout", prompt: "Which layout should be the baseline?", type: "single", options: [
   { value: "standard", label: "Standard terminal", description: "120 columns by 40 rows; enough room for context and keyboard hints." },
   { value: "compact", label: "Compact terminal", description: "80 columns by 30 rows; useful for checking wrapping and scrolling." }], recommended: ["standard"] },
  { id: "states", prompt: "Which states should the reference set include?", type: "multi", options: [
   { value: "ready", label: "Ready and completed", description: "Inspect hierarchy, result density, and action labels." },
   { value: "busy", label: "Running, failed, and cancelled", description: "Inspect progress feedback and recovery guidance." },
   { value: "narrow", label: "Narrow screens · 좁은 화면", description: "Check long labels, wide characters, and keyboard guidance at small widths." }] },
  { id: "notes", prompt: "What should a designer know about these captures?", type: "text" },
 ],
};
export const childAnswer = ["## UI baseline findings", "The extension uses the host theme for semantic colors.", "Running rows show the current tool and completed rows show duration.", "Long result text is truncated in the collapsed view.", "Expanded results preserve the remaining details.", "Cancellation is distinct from a failed provider request.", "All observations here are offline fixture data.", "No real repository review or model inference occurred."].join("\n");
export const childTask = "Inspect the fixture README for UI/UX reference: report hierarchy, progress feedback, long output wrapping, and keyboard guidance.";
export const toolResponse = (name, args) => ({ toolCalls: [{ name, args }] });
export const scenario = (responses) => ({ responses, whenExhausted: "CAPTURE-SCENARIO-EXHAUSTED" });
export const subagentConfig = {
 agents: { explorer: { model: "ui-fixture/primary", fallbackModels: ["ui-fixture/backup"] }, reviewer: { model: "ui-fixture/backup" } },
 review: { models: ["ui-fixture/primary", "ui-fixture/failure"] },
};

// Generate a deliberately synthetic non-private PNG without image-library dependencies.
function crc32(bytes) {
 let crc = 0xffffffff;
 for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
 return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, payload) {
 const data = Buffer.concat([Buffer.from(type), payload]);
 const size = Buffer.alloc(4); size.writeUInt32BE(payload.length);
 const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(data));
 return Buffer.concat([size, data, crc]);
}
export function fixturePng(width = 240, height = 120) {
 const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
 const raw = Buffer.alloc(height * (1 + width * 3));
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const offset = y * (1 + width * 3) + 1 + x * 3;
  const bright = y < 20 || (x > 20 && x < width - 20 && y > 40 && y < 80);
  raw.set(bright ? [70, 160, 190] : [24, 32, 45], offset);
 }
 return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
export const fixtureApp = { id: "com.example.ui-capture", name: "UI Capture Fixture", running: true, active: true };
export function helperReply(method, params, mode = "state") {
 if (method === "resolve_app") {
  if (params.app !== fixtureApp.id) throw new Error("Unexpected fixture app; real apps are not supported.");
  return { result: fixtureApp };
 }
 if (method !== "get_app_state") return { error: { code: "fixture_method_denied", message: `Unexpected helper method: ${method}. Real app operations are disabled.` } };
 if (params.app !== fixtureApp.id) throw new Error("Unexpected fixture app identity.");
 if (mode === "permissions") return { error: { code: "permissions_missing", message: "Accessibility permission is missing (synthetic fixture)." } };
 return { result: {
  app: fixtureApp, window: { title: "Synthetic reference window — not a real app", x: 0, y: 0, width: 480, height: 240 },
  nodeCount: 8, truncated: false,
  text: ['[0] window "Synthetic reference window"', '[1] heading "Offline UI fixture · 오프라인 화면"', '[2] text "No private app contents were read."', '[3] button "Capture the completed state with detailed accessibility labels"', '[4] checkbox "Include running, failed, and cancelled states"', '[5] text "Long output should wrap without hiding the action or keyboard instructions."', '[6] button "Review answers"', '[7] button "Cancel and stop"'].join("\n"),
  screenshot: { mimeType: "image/png", data: fixturePng().toString("base64"), width: 240, height: 120 },
 } };
}
