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
after(() => {
	if (process.env.TUI_CHECK_KEEP_TEST_RUNS === "1") console.log(`tui-check evidence: ${scratch}`);
	else rmSync(scratch, { recursive: true, force: true });
});

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

test("faux requests reserve responses synchronously and preserve state", { skip: root ? false : "pi package not found" }, async () => {
	const { loadExtensions } = await import(pathToFileURL(join(root, "dist/core/extensions/loader.js")).href);
	const { getApiProvider } = await import(pathToFileURL(join(root, "..", "pi-ai/dist/compat.js")).href);
	const scenario = join(scratch, "concurrent.json");
	const state = join(scratch, "concurrent-state.json");
	writeFileSync(scenario, JSON.stringify({ responses: [
		{ text: "ONE: {{lastUser}} {{cwd}} {{entry:probe.value}}" },
		{ text: "TWO: {{lastUser}}" }, { text: "THREE: {{lastUser}}" },
		{ toolCalls: [{ name: "read", args: { path: "README.md" } }] },
		{ text: "FOLLOW-UP" }, { text: "{{env:TUI_CHECK_MISSING_TEST_VAR}}" }, { text: "RESTORED" },
	], whenExhausted: "EXHAUSTED" }));
	const names = ["TUI_CHECK_SCENARIO", "TUI_CHECK_FAUX_STATE", "TUI_CHECK_MISSING_TEST_VAR"];
	const previous = names.map((name) => process.env[name]);
	process.env.TUI_CHECK_SCENARIO = scenario;
	process.env.TUI_CHECK_FAUX_STATE = state;
	delete process.env.TUI_CHECK_MISSING_TEST_VAR;
	let loaded;
	const close = async () => {
		if (loaded) for (const handler of loaded.extensions[0].handlers.get("session_shutdown") ?? []) await handler({}, {});
		loaded = undefined;
	};
	const open = async () => {
		loaded = await loadExtensions([join(scripts, "faux-model.ts")], scratch);
		assert.deepEqual(loaded.errors, []);
		const { name, config } = loaded.runtime.pendingProviderRegistrations[0];
		const api = getApiProvider(config.api);
		const model = { ...config.models[0], provider: name, baseUrl: config.baseUrl };
		const stream = config.streamSimple ?? api.streamSimple;
		const request = (text, options, extraMessages = []) => stream(model, { messages: [{ role: "user", content: text, timestamp: 1 }, ...extraMessages] }, options);
		return { request, api: config.api };
	};
	const text = (message) => message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
	try {
		let client = await open();
		for (const handler of loaded.extensions[0].handlers.get("context")) await handler({ messages: [
			{ role: "user", content: "OWNER" },
			{ role: "custom", customType: "note", content: "NOTE" },
		] }, {
			cwd: scratch, sessionManager: {
				getSessionId: () => "owner-session",
				getBranch: () => [{ type: "custom", customType: "probe", data: { value: "ENTRY" } }],
			},
		});
		let release;
		const gate = new Promise((resolve) => { release = resolve; });
		// The host converts the injected custom note to a user-role message.
		const first = client.request("OWNER", { sessionId: "owner-session", onResponse: () => gate }, [{ role: "user", content: "NOTE", timestamp: 2 }]);
		const second = client.request("B", { sessionId: "child-session" });
		const third = client.request("C");
		// Deliberately complete later requests before the first response factory runs.
		const later = await Promise.all([second.result(), third.result()]);
		for (const handler of loaded.extensions[0].handlers.get("context")) await handler({ messages: [] }, {
			cwd: "/changed-after-admission", sessionManager: { getSessionId: () => "owner-session", getBranch: () => [] },
		});
		release();
		const messages = [await first.result(), ...later];
		assert.deepEqual(messages.map((message) => message.stopReason), ["stop", "stop", "stop"]);
		assert.deepEqual(messages.map(text), [`ONE: OWNER ${scratch} ENTRY`, "TWO: B", "THREE: C"]);
		assert.equal(JSON.parse(readFileSync(state, "utf8")).next, 3);
		assert.equal((await client.request("tool").result()).content[0].type, "toolCall");
		assert.equal(text(await client.request("follow-up").result()), "FOLLOW-UP");
		assert.match(text(await client.request("error").result()), /Template error in response 5/);
		const oldApi = client.api;
		await close();
		assert.equal(getApiProvider(oldApi), undefined);
		client = await open();
		assert.equal(text(await client.request("resume").result()), "RESTORED");
		const exhausted = await Promise.all(Array.from({ length: 12 }, () => client.request("done").result()));
		assert.deepEqual(exhausted.map(text), Array(12).fill("EXHAUSTED"));
		assert.equal(JSON.parse(readFileSync(state, "utf8")).next, 19);
		const controller = new AbortController();
		controller.abort();
		assert.equal((await client.request("abort", { signal: controller.signal }).result()).stopReason, "aborted");
		assert.equal(JSON.parse(readFileSync(state, "utf8")).next, 20);
	} finally {
		await close();
		names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
	}
});

test("real pi TUI: two parallel explorer children consume the faux scenario", { skip, timeout: 120_000 }, () => {
	const scenario = join(scratch, "parallel-scenario.json");
	writeFileSync(scenario, JSON.stringify({ responses: [
		{ toolCalls: [{ name: "subagent", args: { tasks: [
			{ agent: "explorer", task: "Inspect scope A and report." },
			{ agent: "explorer", task: "Inspect scope B and report." },
		] } }] },
		{ text: "PARALLEL-CHILD-ONE" }, { text: "PARALLEL-CHILD-TWO" },
		{ text: "PARALLEL-PARENT-DONE" },
	] }));
	const out = join(scratch, "parallel-run");
	const extension = fileURLToPath(new URL("../extensions/subagent/index.ts", import.meta.url));
	const started = spawnSync(process.execPath, [join(scripts, "start.mjs"), "--scenario", scenario, "--extension", extension, "--out", out], { encoding: "utf8" });
	const run = JSON.parse(started.stdout);
	try {
		assert.equal(run.ok, true, JSON.stringify(run));
		const call = (args) => agentTty(run.agentTty.bin, run.ttyHome, args);
		call(["type", run.sessionId, "Run the two independent scopes."]);
		call(["send-keys", run.sessionId, "Enter"]);
		assert.equal(call(["wait", run.sessionId, "--text", "PARALLEL-PARENT-DONE", "--timeout", "30000"]).ok, true);
		const screen = String(call(["snapshot", run.sessionId, "--format", "text"]).result.text);
		writeFileSync(join(out, "parallel-screen.txt"), screen);
		assert.doesNotMatch(screen, /No more faux responses queued/);
		assert.equal(JSON.parse(readFileSync(join(out, "logs/faux-state.json"), "utf8")).next, 4);
	} finally {
		if (existsSync(join(out, "run.json"))) {
			const finished = spawnSync(process.execPath, [join(scripts, "finish.mjs"), join(out, "run.json")], { encoding: "utf8" });
			const summary = JSON.parse(finished.stdout);
			assert.equal(summary.ok, true, finished.stdout);
			assert.equal(summary.ttySessionDestroyed, true);
			assert.equal(summary.modelLog.calls, 2); // Owner calls; children have their own runtimes.
			const entries = summary.sessionFiles.flatMap((file) => readFileSync(file, "utf8").trim().split("\n").map(JSON.parse));
			const result = entries.find((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "subagent");
			assert.ok(result, "parent session records the subagent result");
			assert.deepEqual(result.message.details.children.map((child) => child.status), ["completed", "completed"]);
			assert.deepEqual(result.message.details.children.map((child) => child.text).sort(), ["PARALLEL-CHILD-ONE", "PARALLEL-CHILD-TWO"]);
			assert.doesNotMatch(JSON.stringify(entries), /No more faux responses queued/);
		}
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
