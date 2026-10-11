import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

// Isolated faux TUI: the scripted model creates an extension without a README row; the audit steers once.
const root = findPiPackageRoot(); assert.ok(root);
const scratch = mkdtempSync(join(tmpdir(), "wrapup-audit-tui-"));
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const binDir = join(scratch, "bin"); mkdirSync(binDir); symlinkSync(join(root, "dist/bundle/cli.js"), join(binDir, "pi"));
const env = { ...process.env, PATH: binDir + ":" + process.env.PATH, PI_PACKAGE_DIR: root };
after(() => { if (process.env.TUI_CHECK_KEEP_TEST_RUNS === "1") console.log(`Wrap-up audit TUI evidence: ${scratch}`); else rmSync(scratch, { recursive: true, force: true }); });
const skip = !findAgentTty() ? "agent-tty not found" : false;
const repoConfig = JSON.parse(readFileSync(new URL("../.pi/wrapup-audit.json", import.meta.url), "utf8"));

test("isolated TUI: visible one-time steering, footer status, and /wrapup-audit details", { skip, timeout: 120000 }, () => {
	const dir = join(scratch, "run-1"); mkdirSync(dir);
	const fixture = join(dir, "fixture"); mkdirSync(fixture); writeFileSync(join(fixture, "README.md"), "# Fixture\n");
	const scenario = join(dir, "scenario.json"); writeFileSync(scenario, JSON.stringify({ responses: [
		{ toolCalls: [{ name: "write", args: { path: "extensions/demo/index.ts", content: "export default () => {};\n" } }] },
		{ text: "FIRST-DONE" },
		{ text: "STEER-HANDLED: README row left for the user." },
		{ text: JSON.stringify({ findings: [{ id: "glossary", note: "JUDGE-NOTE glossary entry may be missing" }] }) },
	], whenExhausted: "END-DONE" }));
	const config = join(dir, "wrapup-audit.json"); writeFileSync(config, JSON.stringify({ models: ["faux/faux-1"], timeoutMs: 20000, rules: repoConfig.rules, judgments: repoConfig.judgments }));
	const out = join(dir, "run");
	const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario,
		"--extension", fileURLToPath(new URL("../extensions/wrapup-audit/index.ts", import.meta.url)),
		"--agent-file", `wrapup-audit.json=${config}`, "--fixture", fixture, "--cols", "110", "--out", out], { encoding: "utf8", env });
	const run = JSON.parse(started.stdout); assert.equal(run.ok, true, JSON.stringify(run));
	// agent-tty wait reports a timeout as ok: true with timedOut: true; treat it as failure.
	const call = (args) => { const v = agentTty(run.agentTty.bin, run.ttyHome, args); assert.equal(v.ok, true, JSON.stringify(v)); if (args[0] === "wait") assert.notEqual(v.result?.timedOut, true, `wait timed out: ${args.join(" ")}`); return v; };
	const snapshot = () => String(call(["snapshot", sid, "--format", "text"]).result.text);
	const sid = run.sessionId;
	try {
		call(["type", sid, "Create the demo extension."]); call(["send-keys", sid, "Enter"]);
		call(["wait", sid, "--text", "STEER-HANDLED", "--timeout", "30000"]);
		call(["wait", sid, "--text", "wrap-up: 2 to check", "--timeout", "30000"]);
		const screen = snapshot(); writeFileSync(join(out, "steer-screen.txt"), screen);
		assert.match(screen, /Wrap-up audit \(automatic, once per request\)/);
		assert.match(screen, /extensions\/demo\/index\.ts \[readme-extension\]/);
		assert.ok(screen.indexOf("FIRST-DONE") < screen.indexOf("Wrap-up audit (automatic") && screen.indexOf("Wrap-up audit (automatic") < screen.indexOf("STEER-HANDLED"), "steering appears between the answer and the continuation");
		assert.equal((screen.match(/Wrap-up audit \(automatic/g) ?? []).length, 1);
		const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map((l) => JSON.parse(l));
		assert.ok(log.some((r) => JSON.stringify(r.messages).includes("Wrap-up audit (automatic")), "model received the steering message");
		// Wait for the completion list instead of a fixed stable window before closing it.
		call(["type", sid, "/wrapup-audit"]); call(["wait", sid, "--text", "Show wrap-up audit findings", "--timeout", "15000"]); call(["send-keys", sid, "Escape", "Enter"]);
		call(["wait", sid, "--text", "steered this request: yes", "--timeout", "15000"]);
		const status = snapshot(); writeFileSync(join(out, "status-screen.txt"), status);
		assert.match(status, /JUDGE-NOTE/); assert.match(status, /faux\/faux-1 \(success\)/);
		assert.ok(existsSync(join(run.workDir, "extensions/demo/index.ts")));
	} catch (error) {
		// An unreproduced intermittent failure (BL-u5hs) left no evidence; attach the last screen.
		try { console.error(`[wrapup-audit TUI] last screen:\n${snapshot().slice(-4000)}`); } catch { /* Session already gone. */ }
		throw error;
	} finally {
		const r = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8", env });
		const v = JSON.parse(r.stdout); assert.equal(v.piExited, true, JSON.stringify(v)); assert.equal(v.ttySessionDestroyed, true, JSON.stringify(v));
	}
});
