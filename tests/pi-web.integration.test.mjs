import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

const skillDir = fileURLToPath(new URL("../skills/pi-web/", import.meta.url));
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const root = findPiPackageRoot();
const tty = findAgentTty();
const hasPi = spawnSync("pi", ["--version"], { encoding: "utf8" }).status === 0;

// This parses the real skill with the installed host, without default discovery.
test("installed pi loads exactly one pi-web skill without diagnostics", { skip: root ? false : "pi package not found" }, async () => {
	const { loadSkills } = await import(pathToFileURL(join(root, "dist/core/skills.js")).href);
	const result = loadSkills({ cwd: tmpdir(), skillPaths: [skillDir], includeDefaults: false });
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.skills.map((skill) => skill.name), ["pi-web"]);
	assert.ok(result.skills[0].description.length <= 1024);
	for (const name of ["references/ego.md", "references/aside.md"]) {
		assert.ok(existsSync(join(skillDir, name)), name);
	}
});

// Scripted responses prove packaging and reference delivery, not autonomous
// routing or vendor functionality. No browser CLI, account, or real model runs.
test("offline pi TUI advertises pi-web and delivers its command and references", {
	skip: !tty ? "agent-tty not found" : !hasPi ? "pi not found" : false,
	timeout: 120_000,
}, (t) => {
	const out = mkdtempSync(join(tmpdir(), "pi-web-tui-"));
	const runFile = join(out, "run.json");
	const references = ["references/ego.md", "references/aside.md"];
	const scenario = join(out, "input-scenario.json");
	writeFileSync(scenario, JSON.stringify({
		responses: [
			{ text: "PI-WEB-ADVERTISED" },
			{ toolCalls: references.map((name) => ({ name: "read", args: { path: join(skillDir, name) } })) },
			{ text: "PI-WEB-REFERENCES-DELIVERED" },
		],
	}));
	t.diagnostic(`Retained offline TUI evidence: ${out}`);
	try {
		const started = spawnSync(process.execPath, [join(scripts, "start.mjs"),
			"--scenario", scenario, "--skill", skillDir, "--tools", "read", "--out", out,
		], { encoding: "utf8", timeout: 90_000 });
		assert.equal(started.status, 0, started.stderr || started.stdout);
		const run = JSON.parse(started.stdout);
		assert.equal(run.ok, true, JSON.stringify(run));
		assert.equal(run.mode, "faux");
		assert.equal(run.model, "faux/faux-1");
		assert.equal(run.userAgentDir, false);
		assert.equal(run.agentTty.supported, true, `Unsupported agent-tty: ${run.agentTty.version}`);
		for (const flag of ["-ne", "-ns", "-np", "--no-themes", "--no-mcp", "--offline", "-nc"]) {
			assert.ok(run.piArgs.includes(flag), flag);
		}
		assert.equal(run.piArgs[run.piArgs.indexOf("--tools") + 1], "read");
		const call = (args) => {
			const result = agentTty(run.agentTty.bin, run.ttyHome, args);
			assert.equal(result.ok, true, JSON.stringify(result));
			return result;
		};

		call(["type", run.sessionId, "Inspect only the advertised skill metadata; do not execute web work."]);
		call(["send-keys", run.sessionId, "Enter"]);
		call(["wait", run.sessionId, "--text", "PI-WEB-ADVERTISED", "--timeout", "15000"]);
		writeFileSync(join(out, "advertisement.txt"), String(call(["snapshot", run.sessionId, "--format", "text"]).result.text));

		const first = JSON.parse(readFileSync(run.modelLog, "utf8").trim().split("\n")[0]);
		assert.equal(first.messages[0].role, "system");
		const system = first.messages[0].text;
		const advertised = [...system.matchAll(/<skill>\s*<name>([^<]+)<\/name>/g)].map((match) => match[1]);
		assert.deepEqual(advertised, ["pi-web"]);
		assert.ok(system.includes(join(skillDir, "SKILL.md")));
		assert.ok(!system.includes("# pi-web"), "the body is not loaded at startup");

		const request = "Read the two project-owned references only; no CLI or account access.";
		call(["type", run.sessionId, `/skill:pi-web ${request}`]);
		call(["wait", run.sessionId, "--screen-stable-ms", "500"]);
		call(["send-keys", run.sessionId, "Escape"]);
		call(["send-keys", run.sessionId, "Enter"]);
		call(["wait", run.sessionId, "--text", "PI-WEB-REFERENCES-DELIVERED", "--timeout", "20000"]);
		writeFileSync(join(out, "references.txt"), String(call(["snapshot", run.sessionId, "--format", "text"]).result.text));

		const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(log.length, 3);
		for (const record of log) {
			assert.equal(record.model, "faux/faux-1");
			assert.deepEqual(record.activeTools, ["read"]);
		}
		const expanded = log[1].messages.at(-1);
		assert.equal(expanded.role, "user");
		assert.ok(expanded.text.includes(`<skill name="pi-web" location="${join(skillDir, "SKILL.md")}">`));
		const body = readFileSync(join(skillDir, "SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
		assert.ok(expanded.text.includes(body), "the expanded command includes the skill body");
		assert.ok(expanded.text.endsWith(request), "the request is appended to the skill");

		const results = log[2].messages.filter((message) => message.role === "toolResult");
		assert.equal(results.length, 2);
		for (const [index, result] of results.entries()) {
			assert.equal(result.toolName, "read");
			assert.notEqual(result.isError, true);
			assert.ok(result.text.includes(readFileSync(join(skillDir, references[index]), "utf8").trim()), references[index]);
		}
		const calls = log[2].messages.flatMap((message) => message.toolCalls ?? []);
		assert.deepEqual(calls.map((call) => call.name), ["read", "read"]);
	} finally {
		if (existsSync(runFile)) {
			const finished = spawnSync(process.execPath, [join(scripts, "finish.mjs"), runFile], { encoding: "utf8", timeout: 30_000 });
			assert.equal(finished.status, 0, finished.stderr || finished.stdout);
			const summary = JSON.parse(finished.stdout);
			assert.equal(summary.ok, true, finished.stdout);
			assert.equal(summary.piExited, true);
			assert.equal(summary.ttySessionDestroyed, true);
		}
		// Preserve logs, sessions, snapshots, and recordings on success or failure.
	}
});
