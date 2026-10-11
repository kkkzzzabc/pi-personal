import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";

// Offline, isolated real TUI; a test-only provider supplies two distinct identities.
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "subagent-tui-"));
after(() => {
	if (process.env.TUI_CHECK_KEEP_TEST_RUNS === "1") console.log(`subagent TUI evidence: ${scratch}`);
	else rmSync(scratch, { recursive: true, force: true });
});
const skip = !findAgentTty() ? "agent-tty not found" : spawnSync("pi", ["--version"]).status !== 0 ? "pi not found" : false;

for (const mode of ["complete", "partial", "cancel"]) {
	test(`real pi TUI: two-model /review ${mode}`, { skip, timeout: 120_000 }, () => {
		const dir = join(scratch, mode); mkdirSync(dir);
		const scenario = join(dir, "scenario.json");
		writeFileSync(scenario, JSON.stringify({ responses: [
			{ toolCalls: [{ name: "subagent", args: { review: { task: "Inspect README.md; report only evidence-backed findings. Zero findings is valid." } } }] },
			{ text: `REVIEW-${mode.toUpperCase()}-PARENT-DONE` },
		] }));
		const config = join(dir, "subagent.json");
		writeFileSync(config, JSON.stringify({ review: { models: ["review-test/a:high", "review-test/b:high"] } }));
		const fixture = join(dir, "fixture"); mkdirSync(fixture);
		writeFileSync(join(fixture, "README.md"), "Review fixture.\n");
		const provider = join(dir, "provider.ts");
		writeFileSync(provider, `
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { registerFauxProvider, getApiProvider } from "@earendil-works/pi-ai/compat";
export default function (pi) {
 const faux = registerFauxProvider({ provider: "review-test", models: [{ id: "a", reasoning: true }, { id: "b", reasoning: true }] });
 const delegate = getApiProvider(faux.api).streamSimple;
 pi.on("session_shutdown", async () => faux.unregister());
 pi.registerProvider("review-test", {
  baseUrl: faux.getModel().baseUrl, apiKey: "offline-test", api: faux.api,
  models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
  streamSimple(model, context, options) {
   appendFileSync(join(process.cwd(), "review-calls.jsonl"), JSON.stringify({ model: model.id, messages: context.messages }) + "\\n");
   faux.appendResponses([async () => {
    if (${JSON.stringify(mode)} === "cancel") await new Promise((resolve) => {
     if (options?.signal?.aborted) resolve();
     else options?.signal?.addEventListener("abort", resolve, { once: true });
    });
    return ${JSON.stringify(mode)} === "partial" && model.id === "b"
     ? fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 unauthorized test fixture" })
     : fauxAssistantMessage("REVIEW-CHILD-" + model.id);
   }]);
   return delegate(model, context, options);
  }
 });
}
`);
		const out = join(dir, "run");
		const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario,
			"--extension", fileURLToPath(new URL("../extensions/subagent/index.ts", import.meta.url)),
			"--extension", provider, "--prompt-template", fileURLToPath(new URL("../prompts/review.md", import.meta.url)),
			"--agent-file", `subagent.json=${config}`, "--fixture", fixture, "--out", out], { encoding: "utf8" });
		const run = JSON.parse(started.stdout);
		try {
			assert.equal(run.ok, true, JSON.stringify(run));
			const call = (args) => agentTty(run.agentTty.bin, run.ttyHome, args);
			call(["type", run.sessionId, "/review README.md"]);
			call(["wait", run.sessionId, "--screen-stable-ms", "500"]);
			call(["send-keys", run.sessionId, "Escape", "Enter"]);
			if (mode === "cancel") {
				assert.equal(call(["wait", run.sessionId, "--text", "2 pending", "--timeout", "30000"]).ok, true);
				// Only cancel after both provider requests have entered their abort-aware gate.
				const callsFile = join(run.workDir, "review-calls.jsonl");
				const deadline = Date.now() + 15_000;
				while (!existsSync(callsFile) || readFileSync(callsFile, "utf8").trim().split("\n").length < 2) {
					assert.ok(Date.now() < deadline, "both cancellation requests admitted");
					call(["wait", run.sessionId, "--screen-stable-ms", "100"]);
				}
				call(["send-keys", run.sessionId, "Escape"]);
				assert.equal(call(["wait", run.sessionId, "--text", "2 aborted", "--timeout", "30000"]).ok, true);
			} else {
				assert.equal(call(["wait", run.sessionId, "--text", `REVIEW-${mode.toUpperCase()}-PARENT-DONE`, "--timeout", "30000"]).ok, true);
			}
			const screen = String(call(["snapshot", run.sessionId, "--format", "text"]).result.text);
			writeFileSync(join(out, "review-screen.txt"), screen);
			assert.match(screen, /configured review/);
			assert.match(screen, mode === "complete" ? /complete \(2\/2 succeeded/ : mode === "partial" ? /partial \(1\/2 succeeded/ : /2 aborted/);
			assert.doesNotMatch(screen, /4-model review|No more faux responses queued/);
			const calls = readFileSync(join(run.workDir, "review-calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
			assert.deepEqual(calls.map((c) => c.model).sort(), ["a", "b"]);
			assert.ok(calls.every((c) => c.messages.filter((m) => m.role === "user").length === 1));
		} finally {
			if (existsSync(join(out, "run.json"))) {
				const finished = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8" });
				const summary = JSON.parse(finished.stdout);
				assert.equal(summary.ok, true, finished.stdout);
				assert.equal(summary.piExited, true); assert.equal(summary.ttySessionDestroyed, true);
				const entries = summary.sessionFiles.flatMap((file) => readFileSync(file, "utf8").trim().split("\n").map(JSON.parse));
				const result = entries.find((e) => e.message?.role === "toolResult" && e.message.toolName === "subagent");
				assert.ok(result, "two-model result recorded in real parent session");
				assert.equal(result.message.details.review.total, 2);
				assert.equal(result.message.details.review.succeeded, mode === "complete" ? 2 : mode === "partial" ? 1 : 0);
				if (mode === "cancel") assert.equal(result.message.details.review.aborted, 2);
				const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map(JSON.parse);
				assert.match(JSON.stringify(log[0]), /Target and focus from the user: README.md/);
				assert.doesNotMatch(JSON.stringify(log[0]), /configured four distinct|four-model roster/);
			}
		}
	});
}
