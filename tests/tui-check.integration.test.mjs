import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

// End-to-end: real pi TUI in agent-tty with the faux model. Skipped when agent-tty or pi is missing.
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const tty = findAgentTty();
const hasPi = spawnSync("pi", ["--version"], { encoding: "utf8" }).status === 0;
const skip = !tty ? "agent-tty not found" : !hasPi ? "pi not found" : false;

const scratch = mkdtempSync(join(tmpdir(), "tui-check-int-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Installed host package (see tests/pi-package.mjs).
const root = findPiPackageRoot();

test("pi loads the tui-check skill without diagnostics", { skip: root ? false : "pi package not found" }, async () => {
	const { loadSkills } = await import(pathToFileURL(join(root, "dist/core/skills.js")).href);
	const skillDir = fileURLToPath(new URL("../skills/tui-check", import.meta.url));
	const result = loadSkills({ cwd: scratch, skillPaths: [skillDir], includeDefaults: false });
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.skills.map((skill) => skill.name), ["tui-check"]);
	assert.ok(result.skills[0].description.length <= 1024);
	for (const ref of ["references/start-options.md", "references/scenario.md", "references/pi-tui-notes.md"]) {
		assert.ok(existsSync(join(skillDir, ref)), ref);
	}
});

test("start → interact → finish against the real pi TUI", { skip, timeout: 120_000 }, () => {
	const extension = join(scratch, "probe.ts");
	writeFileSync(extension, [
		'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
		"export default function (pi: ExtensionAPI) {",
		'\tpi.registerCommand("probe", { description: "probe", handler: async (_a, ctx) => {',
		'\t\tctx.ui.setStatus("probe", "PROBE-STATUS");',
		'\t\tpi.appendEntry("probe", { file: "probe-out.txt" });',
		'\t\tctx.ui.notify("PROBE-NOTICE", "info");',
		"\t} });",
		"}",
		"",
	].join("\n"));
	const fixture = join(scratch, "fixture");
	mkdirSync(fixture);
	writeFileSync(join(fixture, "README.md"), "fixture\n");
	const scenario = join(scratch, "scenario.json");
	writeFileSync(scenario, JSON.stringify({
		responses: [
			{ toolCalls: [{ name: "write", args: { path: "{{cwd}}/{{entry:probe.file}}", content: "said: {{lastUser}}" } }] },
			{ text: "SCENARIO-END" },
		],
	}));
	const out = join(scratch, "run");

	const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario, "--extension", extension, "--fixture", fixture, "--out", out], { encoding: "utf8" });
	const run = JSON.parse(started.stdout);
	try {
		assert.equal(run.ok, true, JSON.stringify(run));
		assert.equal(readFileSync(join(run.workDir, "README.md"), "utf8"), "fixture\n");
		const call = (args) => agentTty(run.agentTty.bin, run.ttyHome, args);

		call(["type", run.sessionId, "/probe"]);
		call(["wait", run.sessionId, "--screen-stable-ms", "500"]);
		call(["send-keys", run.sessionId, "Escape"]);
		call(["send-keys", run.sessionId, "Enter"]);
		assert.equal(call(["wait", run.sessionId, "--text", "PROBE-NOTICE", "--timeout", "10000"]).ok, true);
		const afterCommand = String(call(["snapshot", run.sessionId, "--format", "text"]).result.text);
		assert.match(afterCommand, /PROBE-STATUS/);

		call(["type", run.sessionId, "write it"]);
		call(["send-keys", run.sessionId, "Enter"]);
		assert.equal(call(["wait", run.sessionId, "--text", "SCENARIO-END", "--timeout", "20000"]).ok, true);
		assert.equal(readFileSync(join(run.workDir, "probe-out.txt"), "utf8"), "said: write it");

		const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(log.length, 2);
		assert.equal(log[0].model, "faux/faux-1");
		assert.equal(log[0].messages[0].role, "system");
		assert.ok(log[0].messages[0].text.length > 100);
		assert.equal(log[0].messages.at(-1).text, "write it");
		assert.equal(log[1].messages.at(-1).role, "toolResult");
	} finally {
		if (existsSync(join(out, "run.json"))) {
			const finished = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8" });
			const summary = JSON.parse(finished.stdout);
			assert.equal(summary.ok, true, finished.stdout);
			assert.equal(summary.sessionFiles.length, 1);
			assert.equal(summary.modelLog.calls, 2);
			assert.match(summary.relaunch, /^bash .*launch\.sh --session \S+$/);
		}
	}
});
