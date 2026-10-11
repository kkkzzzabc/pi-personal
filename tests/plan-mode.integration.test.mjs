import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createPlanMode } from "../extensions/plan-mode/index.ts";
import { resolveToolPath } from "../extensions/plan-mode/paths.ts";
import { STATE_ENTRY_TYPE } from "../extensions/plan-mode/state.ts";
import { findPiPackageRoot } from "./pi-package.mjs";

// Offline host integration against the installed pi package (see tests/pi-package.mjs).
const root = findPiPackageRoot();
assert.ok(root, "Set PI_PACKAGE_DIR to the installed pi package root for integration tests");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(pkg.name, "@earendil-works/pi-coding-agent");
const load = (path) => import(pathToFileURL(join(root, path)).href);
const loadAi = (path) => import(pathToFileURL(join(root, "..", "pi-ai", path)).href);

const scratch = mkdtempSync(join(tmpdir(), "plan-mode-int-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

test(`pi ${pkg.version}: resolveToolPath matches host resolveToCwd`, async () => {
	const { resolveToCwd } = await load("dist/core/tools/path-utils.js");
	const cwd = join(scratch, "repo");
	const inputs = [
		"src/a.ts", "./src/../b.ts", "@src/c.ts", "~", "~/plans/p.md", "~user/x", "/etc/hosts", "/a/b/../c",
		"a\u00A0b.md", "a\u202Fb.md", "file:///tmp/x.md", "@~/x.md", "", ".", "..", "dir/", "@@x",
	];
	for (const input of inputs) {
		assert.equal(resolveToolPath(input, cwd), resolveToCwd(input, cwd), JSON.stringify(input));
	}
	assert.equal(resolveToolPath("a.md", "~/repo"), resolveToCwd("a.md", "~/repo"));
});

test("pi's extension loader loads extensions/plan-mode/index.ts", async () => {
	const { loadExtensions } = await load("dist/core/extensions/loader.js");
	const entry = new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname;
	// Isolate from the user's ~/.pi/agent/plan-mode.json (the shortcut is read at load time).
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(scratch, "empty-agent-dir");
	let result;
	try {
		result = await loadExtensions([entry], scratch);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	}
	assert.deepEqual(result.errors, []);
	const [ext] = result.extensions;
	assert.deepEqual([...ext.commands.keys()], ["plan"]);
	assert.deepEqual([...ext.shortcuts.keys()], ["ctrl+alt+p"]);
	assert.deepEqual([...ext.flags.keys()], ["plan"]);
	assert.deepEqual([...ext.handlers.keys()].sort(), ["agent_end", "before_agent_start", "context", "session_start", "session_tree", "tool_call"]);
	assert.deepEqual([...ext.tools.keys()], ["enter_plan_mode", "exit_plan_mode"]);
});

test("Shift+Tab opt-in: reserved by default, available after moving app.thinking.cycle", async () => {
	const { ExtensionRunner } = await load("dist/index.js");
	const { KeybindingsManager } = await load("dist/core/keybindings.js");
	const register = (userBindings) => {
		const ext = { path: "plan-mode", shortcuts: new Map([["shift+tab", { extensionPath: "plan-mode", handler() {} }]]) };
		const fake = { extensions: [ext], shortcutDiagnostics: [], hasUI: () => true };
		return ExtensionRunner.prototype.getShortcuts.call(fake, new KeybindingsManager(userBindings).getEffectiveConfig()).has("shift+tab");
	};
	assert.equal(register({}), false);
	assert.equal(register({ "app.thinking.cycle": "ctrl+alt+t" }), true);
});

test("Ctrl+Alt+P is not a reserved built-in shortcut", async () => {
	const { ExtensionRunner } = await load("dist/index.js");
	const { KeybindingsManager } = await load("dist/core/keybindings.js");
	const ext = { path: "plan-mode", shortcuts: new Map([["ctrl+alt+p", { extensionPath: "plan-mode", handler() {} }]]) };
	const fake = { extensions: [ext], shortcutDiagnostics: [], hasUI: () => true };
	const shortcuts = ExtensionRunner.prototype.getShortcuts.call(fake, new KeybindingsManager({}).getEffectiveConfig());
	assert.equal(shortcuts.has("ctrl+alt+p"), true);
	assert.deepEqual(fake.shortcutDiagnostics, []);
});

test("in a real session, plan mode limits writes to the plan file and restores tools", async () => {
	const agent = await load("dist/index.js");
	const { AuthStorage } = await load("dist/core/auth-storage.js");
	const { registerFauxProvider } = await loadAi("dist/compat.js");
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");

	const dir = join(scratch, "session");
	const cwd = join(dir, "repo");
	const plansDir = join(dir, "plans");
	mkdirSync(cwd, { recursive: true });
	const planFile = join(plansDir, "plan.md");
	const outside = join(cwd, "src.ts");

	const faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: true }] });
	const seenTools = [];
	const seenTexts = [];
	const firstRoles = [];
	const textOf = (m) => typeof m.content === "string" ? m.content
		: Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text).join("") : "";
	let extensionPi;
	const step = (message) => (context) => {
		seenTools.push(extensionPi.getActiveTools());
		seenTexts.push(context.messages.filter((m) => m.role !== "system").map(textOf));
		firstRoles.push(context.messages[0]?.role);
		return message;
	};
	faux.setResponses([
		step(fauxAssistantMessage([
			fauxToolCall("write", { path: outside, content: "nope" }),
			fauxToolCall("write", { path: planFile, content: "# Plan" }),
		])),
		step(fauxAssistantMessage("done")),
		step(fauxAssistantMessage("after plan")),
	]);
	const authStorage = AuthStorage.inMemory();
	await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: authStorage, modelsPath: join(dir, "models.json") });
	const notices = [];

	const createRuntime = async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({
			cwd: sessionCwd, agentDir: dir, modelRuntime,
			resourceLoaderOptions: {
				extensionFactories: [(pi) => {
					extensionPi = pi;
					const model = faux.getModel();
					pi.registerProvider(model.provider, {
						baseUrl: model.baseUrl, apiKey: "faux-key", api: faux.api,
						models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning,
							input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
					});
					createPlanMode({
						loadConfig: () => ({ config: { plansDir, thinkingLevel: "high", extraTools: [] }, path: "", warnings: [] }),
						createPlanFile: (d) => join(d, "plan.md"),
					})(pi);
				}],
				noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			},
		});
		return {
			...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel() })),
			services, diagnostics: services.diagnostics,
		};
	};
	const runtime = await agent.createAgentSessionRuntime(createRuntime, {
		cwd, agentDir: dir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")),
	});
	try {
		await runtime.session.bindExtensions({
			uiContext: { notify: (message) => notices.push(message), setStatus: () => {}, theme: undefined },
		});
		const before = runtime.session.getActiveToolNames();
		extensionPi.setThinkingLevel("low");

		await runtime.session.prompt("/plan on");
		assert.equal(extensionPi.getThinkingLevel(), "high");
		await runtime.session.prompt("Write the plan");
		await runtime.session.agent.waitForIdle();

		assert.equal(existsSync(outside), false, "write outside the plan file must be blocked");
		assert.equal(readFileSync(planFile, "utf8"), "# Plan");
		assert.deepEqual(seenTools[0], [
			...before.filter((name) => ["read", "grep", "find", "ls", "bash", "edit", "write"].includes(name)),
			"exit_plan_mode",
		]);
		assert.equal(seenTools[0].includes("enter_plan_mode"), false);
		assert.ok(before.includes("enter_plan_mode") && !before.includes("exit_plan_mode"), before.join(","));
		assert.ok(seenTools[0].includes("write"));
		const results = runtime.session.messages.filter((m) => m.role === "toolResult");
		assert.equal(results.length, 2);
		assert.match(JSON.stringify(results[0].content), /may only modify the plan file/);

		// Model input in plan mode: the enter note once (persisted), the short reminder last (per request).
		for (const texts of seenTexts.slice(0, 2)) {
			assert.equal(texts.filter((t) => t.includes("Plan mode is active. Plan the work")).length, 1);
			assert.match(texts.at(-1), /Plan mode is still active/);
			assert.equal(texts.filter((t) => t.includes("Plan mode is still active")).length, 1, "reminder does not accumulate");
		}

		await runtime.session.prompt("/plan off");
		assert.equal(extensionPi.getThinkingLevel(), "low");
		await runtime.session.prompt("Continue");
		await runtime.session.agent.waitForIdle();
		const lastCall = seenTexts.at(-1);
		assert.equal(lastCall.some((t) => t.includes("Plan mode is still active")), false, "no reminder after leaving");
		assert.equal(lastCall.filter((t) => t.includes("Plan mode has ended")).length, 1);
		// nextTurn notes follow the user message they were delivered with.
		assert.equal(lastCall.at(-2), "Continue");
		assert.match(lastCall.at(-1), /Plan mode has ended/);
		const notes = runtime.session.sessionManager.getEntries().filter((e) => e.type === "custom_message").map((e) => e.customType);
		assert.deepEqual(notes, ["plan-mode-enter", "plan-mode-leave"]);
		// Entering before the first prompt must not push the system prompt off the front.
		assert.deepEqual(firstRoles, ["system", "system", "system"]);
		const order = runtime.session.sessionManager.getEntries().map((e) => e.type === "message" ? e.message.role : e.customType ?? e.type);
		assert.ok(order.indexOf("system") < order.indexOf("plan-mode-enter"), order.join(","));

		const entries = runtime.session.sessionManager.getEntries().filter((e) => e.type === "custom" && e.customType === STATE_ENTRY_TYPE);
		assert.deepEqual(entries.map((e) => e.data.mode), ["plan", "build"]);
		assert.deepEqual(runtime.session.getActiveToolNames(), before);
		assert.ok(notices.some((n) => n.startsWith("Plan mode on.")));
	} finally {
		await runtime.dispose();
		faux.unregister();
	}
});

/** Real AgentSession runtime with the faux model, plan-mode, a scripted UI, and newSession support. */
async function createRuntime({ name, responses, select }) {
	const agent = await load("dist/index.js");
	const { AuthStorage } = await load("dist/core/auth-storage.js");
	const { registerFauxProvider } = await loadAi("dist/compat.js");
	const dir = join(scratch, name);
	const cwd = join(dir, "repo");
	const plansDir = join(dir, "plans");
	mkdirSync(cwd, { recursive: true });
	const faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: true }] });
	const calls = [];
	faux.setResponses(responses.map((make) => (context) => {
		calls.push(context.messages.map((m) => ({ role: m.role, text: typeof m.content === "string" ? m.content : (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("") })));
		return make();
	}));
	const authStorage = AuthStorage.inMemory();
	await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: authStorage, modelsPath: join(dir, "models.json") });
	const createRuntimeFactory = async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({
			cwd: sessionCwd, agentDir: dir, modelRuntime,
			resourceLoaderOptions: {
				extensionFactories: [(pi) => {
					const model = faux.getModel();
					pi.registerProvider(model.provider, {
						baseUrl: model.baseUrl, apiKey: "faux-key", api: faux.api,
						models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning,
							input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
					});
					createPlanMode({
						loadConfig: () => ({ config: { plansDir, thinkingLevel: "high", extraTools: [] }, path: "", warnings: [] }),
						createPlanFile: (d) => join(d, "plan.md"),
					})(pi);
				}],
				noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			},
		});
		return {
			...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel() })),
			services, diagnostics: services.diagnostics,
		};
	};
	const runtime = await agent.createAgentSessionRuntime(createRuntimeFactory, {
		cwd, agentDir: dir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")),
	});
	const rebind = async () => {
		const session = runtime.session;
		await session.bindExtensions({
			uiContext: { notify: () => {}, setStatus: () => {}, theme: undefined, select: async () => select, confirm: async () => true, editor: async () => undefined },
			commandContextActions: {
				waitForIdle: () => session.agent.waitForIdle(),
				newSession: async (options) => runtime.newSession(options),
				fork: async () => ({ cancelled: true }),
				navigateTree: async () => ({ cancelled: true }),
				switchSession: async () => ({ cancelled: true }),
				reload: async () => {},
			},
		});
	};
	runtime.setRebindSession(rebind);
	await rebind();
	return { runtime, faux, calls, planFile: join(plansDir, "plan.md"), cwd };
}

async function settle(runtime) {
	for (let i = 0; i < 40; i++) {
		await runtime.session.agent.waitForIdle();
		await new Promise((resolve) => setTimeout(resolve, 25));
		if (runtime.session.isIdle !== false && !runtime.session.isStreaming) return;
	}
}

test("approval in a real session: implement here continues the same turn in build mode", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	let planFile;
	const { runtime, faux, calls, ...env } = await createRuntime({
		name: "approve-here",
		select: "Approve and implement here",
		responses: [
			() => fauxAssistantMessage([fauxToolCall("write", { path: planFile, content: "# Plan\n1. Create done.txt" })]),
			() => fauxAssistantMessage([fauxToolCall("exit_plan_mode", {})]),
			() => fauxAssistantMessage([fauxToolCall("write", { path: "done.txt", content: "built" })]),
			() => fauxAssistantMessage("IMPLEMENTED"),
		],
	});
	planFile = env.planFile;
	try {
		await runtime.session.prompt("/plan on");
		await runtime.session.prompt("Build it");
		await settle(runtime);
		assert.equal(readFileSync(join(env.cwd, "done.txt"), "utf8"), "built", "write allowed after approval in the same turn");
		const toolResult = runtime.session.messages.find((m) => m.role === "toolResult" && m.toolName === "exit_plan_mode");
		assert.match(JSON.stringify(toolResult.content), /approved the plan\. Build mode is active/);
		const states = runtime.session.sessionManager.getEntries().filter((e) => e.type === "custom" && e.customType === STATE_ENTRY_TYPE);
		assert.deepEqual(states.at(-1).data, { mode: "build", approvedPlanFile: planFile });
		assert.equal(calls.at(-1).some((m) => m.text.includes("Plan mode is still active")), false, "no reminder after approval");
	} finally {
		await runtime.dispose();
		faux.unregister();
	}
});

test("approval in a real session: fresh session starts with the approved plan", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	let planFile;
	const { runtime, faux, calls, ...env } = await createRuntime({
		name: "approve-fresh",
		select: "Approve and implement in a fresh session",
		responses: [
			() => fauxAssistantMessage([fauxToolCall("write", { path: planFile, content: "# Plan\n1. Fresh step" })]),
			() => fauxAssistantMessage([fauxToolCall("exit_plan_mode", {})]),
			() => fauxAssistantMessage("FRESH-IMPLEMENTING"),
		],
	});
	planFile = env.planFile;
	try {
		const firstFile = runtime.session.sessionManager.getSessionFile();
		await runtime.session.prompt("/plan on");
		await runtime.session.prompt("Build it");
		for (let i = 0; i < 80 && runtime.session.sessionManager.getSessionFile() === firstFile; i++) {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		await settle(runtime);
		assert.notEqual(runtime.session.sessionManager.getSessionFile(), firstFile, "a new session was created");
		assert.equal(calls.length, 3, "no extra model call in the old session after approval");
		const first = calls[2].filter((m) => m.role === "user").map((m) => m.text);
		assert.match(first[0], /approved it[\s\S]*Fresh step/);
		assert.equal(calls[2].some((m) => m.text.includes("Plan the work")), false, "fresh session has no plan-mode notes");
		const states = runtime.session.sessionManager.getEntries().filter((e) => e.type === "custom" && e.customType === STATE_ENTRY_TYPE);
		assert.deepEqual(states[0].data, { mode: "build", approvedPlanFile: planFile });
		const messages = runtime.session.messages.filter((m) => m.role !== "system").map((m) => m.role);
		assert.deepEqual(messages, ["user", "assistant"]);
	} finally {
		await runtime.dispose();
		faux.unregister();
	}
});
