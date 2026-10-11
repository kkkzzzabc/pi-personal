import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

// Isolated faux TUI; the summary and prompt-suggestion extensions are loaded together to check coexistence.
const root = findPiPackageRoot(); assert.ok(root);
const scratch = mkdtempSync(join(tmpdir(), "turn-summary-tui-"));
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const binDir = join(scratch, "bin"); mkdirSync(binDir); symlinkSync(join(root, "dist/bundle/cli.js"), join(binDir, "pi"));
const env = { ...process.env, PATH: binDir + ":" + process.env.PATH, PI_PACKAGE_DIR: root };
after(() => { if (process.env.TUI_CHECK_KEEP_TEST_RUNS === "1") console.log(`Turn summary TUI evidence: ${scratch}`); else rmSync(scratch, { recursive: true, force: true }); });
const skip = !findAgentTty() ? "agent-tty not found" : false;

function setup(name, mode, delayed = false) {
	const dir = join(scratch, name); mkdirSync(dir);
	const scenario = join(dir, "scenario.json"); writeFileSync(scenario, JSON.stringify({ responses: [{ text: "FIRST-DONE; tests not run." }, { text: "SECOND-DONE" }, { text: "THIRD-DONE" }], whenExhausted: "END-DONE" }));
	const summaryConfig = join(dir, "turn-summary.json"); writeFileSync(summaryConfig, JSON.stringify({ models: ["fixture/luna"], timeoutMs: 20000 }));
	const suggestConfig = join(dir, "prompt-suggestions.json"); writeFileSync(suggestConfig, JSON.stringify({ models: ["fixture/luna"], timeoutMs: 20000 }));
	const provider = join(dir, "provider.ts"); writeFileSync(provider, `
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { registerFauxProvider, getApiProvider } from "@earendil-works/pi-ai/compat";
let summaries = 0;
export default function(pi) {
 const faux = registerFauxProvider({ provider: "fixture", models: [{ id: "luna" }] });
 const delegate = getApiProvider(faux.api).streamSimple; const model = faux.getModel();
 pi.registerProvider(model.provider, { baseUrl: model.baseUrl, apiKey: "offline-test", api: faux.api,
  models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
  streamSimple(m, context, options) {
   const isSummary = JSON.stringify(context).includes("Summarize the agent");
   const n = isSummary ? ++summaries : 0;
   appendFileSync(join(process.cwd(), "nested-calls.jsonl"), JSON.stringify({ kind: isSummary ? "summary" : "suggestion", n }) + "\\n");
   faux.appendResponses([async () => {
    ${delayed ? 'if (isSummary && n === 1) while (!options.signal?.aborted && !existsSync(join(process.cwd(), "release"))) await new Promise((r) => setTimeout(r, 20));' : ""}
    if (options.signal?.aborted) return fauxAssistantMessage("", { stopReason: "aborted" });
    return fauxAssistantMessage(isSummary
     ? JSON.stringify({ summary: { done: "SUMMARY-" + n + " explained", open: "tests not run", next: "decide whether to run tests" } })
     : JSON.stringify({ suggestion: "테스트를 실행해주세요." }));
   }]);
   return delegate(m, context, options);
  } });
 pi.on("session_shutdown", () => faux.unregister());
}
`);
	const out = join(dir, "run");
	const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario,
		"--extension", fileURLToPath(new URL("../extensions/turn-summary/index.ts", import.meta.url)),
		"--extension", fileURLToPath(new URL("../extensions/prompt-suggestions/index.ts", import.meta.url)), "--extension", provider,
		"--agent-file", `turn-summary.json=${summaryConfig}`, "--agent-file", `prompt-suggestions.json=${suggestConfig}`,
		"--pi-arg", "--tui-mode", "--pi-arg", mode, "--cols", mode === "regular" ? "40" : "100", "--out", out], { encoding: "utf8", env });
	const run = JSON.parse(started.stdout); assert.equal(run.ok, true, JSON.stringify(run));
	// agent-tty wait reports a timeout as ok: true with timedOut: true; treat it as failure.
	const call = (args) => { const v = agentTty(run.agentTty.bin, run.ttyHome, args); assert.equal(v.ok, true, JSON.stringify(v)); if (args[0] === "wait") assert.notEqual(v.result?.timedOut, true, `wait timed out: ${args.join(" ")}`); return v; };
	const snapshot = () => String(call(["snapshot", run.sessionId, "--format", "text"]).result.text);
	const parents = () => existsSync(run.modelLog) ? readFileSync(run.modelLog, "utf8").trim().split("\n").filter(Boolean).length : 0;
	return { run, out, call, snapshot, parents, finish() {
		const r = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8", env });
		const v = JSON.parse(r.stdout); assert.equal(v.piExited, true, JSON.stringify(v)); assert.equal(v.ttySessionDestroyed, true, JSON.stringify(v));
	} };
}
const index = (screen, re) => screen.split("\n").findIndex((l) => re.test(l));

for (const mode of ["fullscreen", "regular"]) test(`isolated ${mode}: summary above editor, coexists with ghost, cleared by next prompt`, { skip, timeout: 120000 }, () => {
	const p = setup(mode, mode); const sid = p.run.sessionId;
	try {
		p.call(["type", sid, "Explain the next verification step."]); p.call(["send-keys", sid, "Enter"]);
		p.call(["wait", sid, "--text", "SUMMARY-1", "--timeout", "30000"]); p.call(["wait", sid, "--text", "tab accept", "--timeout", "30000"]);
		const screen = p.snapshot(); writeFileSync(join(p.out, "summary-screen.txt"), screen);
		const done = index(screen, /▏Done/), next = index(screen, /▏Next/), ghost = index(screen, /테스트를 실행해주세요/);
		assert.ok(done >= 0 && next > done, "Done/Next lines present"); assert.ok(ghost > next, "summary renders above the editor ghost");
		if (mode === "fullscreen") assert.match(screen, /▏Open\s+tests not run/);
		const before = p.parents();
		p.call(["send-keys", sid, "Tab"]); p.call(["wait", sid, "--screen-stable-ms", "300"]);
		assert.equal(p.parents(), before, "Tab never submits"); assert.match(p.snapshot(), /SUMMARY-1/, "summary stays while composing");
		p.call(["type", sid, " 지금"]); p.call(["wait", sid, "--screen-stable-ms", "300"]); assert.match(p.snapshot(), /SUMMARY-1/);
		p.call(["send-keys", sid, "Enter"]); p.call(["wait", sid, "--text", "SECOND-DONE", "--timeout", "30000"]);
		p.call(["wait", sid, "--text", "SUMMARY-2", "--timeout", "30000"]);
		const later = p.snapshot(); assert.doesNotMatch(later, /SUMMARY-1/); writeFileSync(join(p.out, "second-screen.txt"), later);
		p.call(["send-keys", sid, "Ctrl+C"]);
		for (const cmd of ["/turn-summary off", "/turn-summary on"]) { p.call(["send-keys", sid, "Ctrl+U"]); p.call(["type", sid, cmd]); p.call(["wait", sid, "--screen-stable-ms", "300"]); p.call(["send-keys", sid, "Escape", "Enter"]); p.call(["wait", sid, "--screen-stable-ms", "300"]); }
		assert.match(p.snapshot(), /Turn summary: idle/);
	} finally { p.finish(); }
});
test("isolated pending summary is discarded when the next prompt is submitted", { skip, timeout: 120000 }, () => {
	const p = setup("pending", "fullscreen", true); const sid = p.run.sessionId;
	try {
		p.call(["type", sid, "Explain the next verification step."]); p.call(["send-keys", sid, "Enter"]);
		p.call(["wait", sid, "--text", "summarizing…", "--timeout", "30000"]);
		p.call(["send-keys", sid, "Ctrl+U"]); p.call(["type", sid, "Another request"]); p.call(["send-keys", sid, "Enter"]);
		p.call(["wait", sid, "--text", "SECOND-DONE", "--timeout", "30000"]); writeFileSync(join(p.run.workDir, "release"), "release");
		p.call(["wait", sid, "--text", "SUMMARY-2", "--timeout", "30000"]); p.call(["wait", sid, "--screen-stable-ms", "500"]);
		assert.doesNotMatch(p.snapshot(), /SUMMARY-1/);
	} finally { p.finish(); }
});
