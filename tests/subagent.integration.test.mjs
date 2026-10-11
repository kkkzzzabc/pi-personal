import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { loadRoles } from "../extensions/subagent/agents.ts";
import { createSubagentExtension, TOOL_NAME } from "../extensions/subagent/extension.ts";
import { createChildRunner } from "../extensions/subagent/runner.ts";
import { findPiPackageRoot } from "./pi-package.mjs";

// Offline host integration against the installed pi package (see tests/pi-package.mjs).
const root = findPiPackageRoot();
assert.ok(root, "Set PI_PACKAGE_DIR to the installed pi package root for integration tests");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const load = (path) => import(pathToFileURL(join(root, path)).href);
const loadAi = (path) => import(pathToFileURL(join(root, "..", "pi-ai", path)).href);
const rolesDir = new URL("../extensions/subagent/agents/", import.meta.url).pathname;

const scratch = mkdtempSync(join(tmpdir(), "subagent-int-"));
const previousOffline = process.env.PI_OFFLINE;
process.env.PI_OFFLINE = "1";
after(() => {
	if (previousOffline === undefined) delete process.env.PI_OFFLINE;
	else process.env.PI_OFFLINE = previousOffline;
	rmSync(scratch, { recursive: true, force: true });
});

const textOf = (content) => typeof content === "string" ? content
	: (content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");

test(`pi ${pkg.version}: the extension loader loads extensions/subagent/index.ts`, async () => {
	const { loadExtensions } = await load("dist/core/extensions/loader.js");
	const entry = new URL("../extensions/subagent/index.ts", import.meta.url).pathname;
	const result = await loadExtensions([entry], scratch);
	assert.deepEqual(result.errors, []);
	const [ext] = result.extensions;
	assert.deepEqual([...ext.tools.keys()], [TOOL_NAME]);
	assert.deepEqual(ext.tools.get(TOOL_NAME).definition.annotations, { readOnlyHint: true });
	assert.deepEqual([...ext.handlers.keys()].sort(), ["before_agent_start", "session_shutdown", "session_start"]);
	assert.equal(typeof ext.tools.get(TOOL_NAME).definition.renderResult, "function");
});

test("the shipped role files parse with pi's frontmatter parser", async () => {
	const agent = await load("dist/index.js");
	const roles = loadRoles(rolesDir, agent.parseFrontmatter);
	assert.deepEqual(Object.keys(roles), ["reviewer", "explorer"]);
	for (const role of Object.values(roles)) {
		assert.ok(role.prompt.includes("not the parent orchestrator"), role.name);
		assert.ok(role.description.length > 10);
	}
});

/**
 * A parent AgentSession on the faux model with the subagent extension. The faux
 * provider is registered by an extension, so children only get it by provider copying.
 * One faux response queue serves parent and children in call order.
 */
async function createParent({ name, responses, files = {}, noContextFiles = false, modelIds = ["faux-1"], settings }) {
	const agent = await load("dist/index.js");
	const { AuthStorage } = await load("dist/core/auth-storage.js");
	const { registerFauxProvider } = await loadAi("dist/compat.js");
	const dir = join(scratch, name);
	const cwd = join(dir, "repo");
	const agentDir = join(dir, "agent");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	// Context files must exist before the parent session loads them.
	for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
	if (settings) writeFileSync(join(agentDir, "settings.json"), JSON.stringify(settings));
	const faux = registerFauxProvider({ models: modelIds.map((id) => ({ id, reasoning: true })) });
	const contexts = [];
	const modelCalls = [];
	const captured = {};
	faux.setResponses(responses.map((make) => (context, options, state, model) => {
		contexts.push(JSON.stringify(context));
		modelCalls.push({ id: model.id, context, options });
		return make(context, options, state, model);
	}));
	const authStorage = AuthStorage.inMemory();
	await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: authStorage, modelsPath: join(dir, "models.json") });
	const options = {
		sdk: agent,
		rolesDir,
		agentDir: () => agentDir,
		createModelRuntime: () => agent.ModelRuntime.create({ credentials: AuthStorage.inMemory(), modelsPath: join(dir, "child-models.json") }),
	};
	const createRuntime = async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({
			cwd: sessionCwd, agentDir, modelRuntime,
			resourceLoaderOptions: {
				extensionFactories: [(pi) => {
					const model = faux.getModel();
					pi.registerProvider(model.provider, {
						baseUrl: model.baseUrl, apiKey: "faux-key", api: faux.api,
						models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning,
							input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
					});
					createSubagentExtension(options)(new Proxy(pi, {
						get: (target, prop) => prop === "registerTool"
							? (tool) => { captured.tool = tool; return target.registerTool(tool); }
							: Reflect.get(target, prop, target),
					}));
					pi.on("session_start", async (_event, ctx) => { captured.ctx = ctx; });
				}],
				noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles,
			},
		});
		return {
			...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel() })),
			services, diagnostics: services.diagnostics,
		};
	};
	const runtime = await agent.createAgentSessionRuntime(createRuntime, {
		cwd, agentDir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")),
	});
	await runtime.session.bindExtensions({ uiContext: { notify: () => {}, setStatus: () => {}, theme: undefined } });
	return {
		agent, faux, runtime, cwd, agentDir, contexts, modelCalls, options, dir, captured,
		async dispose() {
			await runtime.dispose();
			faux.unregister();
		},
	};
}

test("explorer child: read-only tools, no context files, result returned to the parent", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const parent = await createParent({
		name: "explorer",
		files: { "repo/AGENTS.md": "PROJECT-CONTEXT-MARK\n", "agent/AGENTS.md": "GLOBAL-CONTEXT-MARK\n" },
		responses: [
			() => fauxAssistantMessage([fauxToolCall(TOOL_NAME, { agent: "explorer", task: "Where is README.md? Report its first line." })]),
			() => fauxAssistantMessage([
				fauxToolCall("edit", { path: "README.md", edits: [{ oldText: "PROJECT", newText: "HACKED" }] }),
				fauxToolCall("bash", { command: "echo pwned > pwned.txt" }),
				fauxToolCall("read", { path: "README.md" }),
			]),
			() => fauxAssistantMessage("CHILD-EXPLORER-DONE: README.md:1"),
			() => fauxAssistantMessage("PARENT-DONE"),
		],
	});
	try {
		writeFileSync(join(parent.cwd, "README.md"), "PROJECT-README-LINE\n");
		const parentToolsBefore = parent.runtime.session.getActiveToolNames();

		await parent.runtime.session.prompt("Explore");
		await parent.runtime.session.agent.waitForIdle();

		assert.equal(readFileSync(join(parent.cwd, "README.md"), "utf8"), "PROJECT-README-LINE\n");
		assert.equal(existsSync(join(parent.cwd, "pwned.txt")), false);

		// Child model input: role prompt, no context files, child tool results. The parent has both.
		assert.match(parent.contexts[0], /PROJECT-CONTEXT-MARK/);
		const [childFirst, childSecond] = parent.contexts.slice(1, 3);
		assert.match(childFirst, /You are `explorer`/);
		assert.doesNotMatch(childFirst, /PROJECT-CONTEXT-MARK|GLOBAL-CONTEXT-MARK/);
		assert.match(childFirst, /Task: Where is README\.md\?/);
		assert.match(parent.contexts[0], /"text":"Explore"/, "the parent prompt is visible in the parent context");
		assert.doesNotMatch(childFirst, /"text":"Explore"/, "the child does not see the parent conversation");
		assert.match(childSecond, /Tool edit not found/);
		assert.match(childSecond, /Tool bash not found/);
		assert.match(childSecond, /PROJECT-README-LINE/);

		const result = parent.runtime.session.messages.find((m) => m.role === "toolResult" && m.toolName === TOOL_NAME);
		assert.ok(result, "subagent tool result");
		assert.equal(result.isError, false);
		const text = textOf(result.content);
		assert.match(text, /^## explorer · faux\/faux-1 · completed \(.+, 3 tool calls\)/);
		assert.match(text, /CHILD-EXPLORER-DONE: README\.md:1/);
		const [child] = result.details.children;
		assert.equal(child.status, "completed");
		assert.equal(readFileSync(child.outputFile, "utf8"), "CHILD-EXPLORER-DONE: README.md:1");
		const sessionFile = parent.runtime.session.sessionFile;
		assert.ok(child.outputFile.startsWith(join(sessionFile.replace(/\.jsonl$/, ""), "subagents")), child.outputFile);

		// Parent unchanged: same tools, and no child messages in the parent transcript.
		assert.deepEqual(parent.runtime.session.getActiveToolNames(), parentToolsBefore);
		const parentTexts = parent.runtime.session.messages.map((m) => textOf(m.content)).join("\n");
		assert.doesNotMatch(parentTexts, /PROJECT-README-LINE/);
		assert.equal(textOf(parent.runtime.session.messages.at(-1).content), "PARENT-DONE");
	} finally {
		await parent.dispose();
	}
});

test("reviewer child gets review_diff, the parent's project context without the global file", async () => {
	const { execFileSync } = await import("node:child_process");
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const parent = await createParent({
		name: "reviewer",
		files: { "repo/AGENTS.md": "PROJECT-CONTEXT-MARK\n", "agent/AGENTS.md": "GLOBAL-CONTEXT-MARK\n" },
		responses: [
			() => fauxAssistantMessage([fauxToolCall(TOOL_NAME, { agent: "reviewer", task: "Review the uncommitted change." })]),
			() => fauxAssistantMessage([fauxToolCall("review_diff", {})]),
			() => fauxAssistantMessage("No issues found.\nMerge verdict: OK"),
			() => fauxAssistantMessage("PARENT-DONE"),
		],
	});
	try {
		const git = (...args) => execFileSync("git", ["-C", parent.cwd, ...args], { stdio: "ignore" });
		git("init", "-q");
		git("config", "user.email", "t@example.com");
		git("config", "user.name", "t");
		git("config", "commit.gpgsign", "false");
		writeFileSync(join(parent.cwd, "a.txt"), "one\n");
		git("add", ".");
		git("commit", "-q", "-m", "init");
		writeFileSync(join(parent.cwd, "a.txt"), "one\nREVIEW-ME\n");

		await parent.runtime.session.prompt("Review");
		await parent.runtime.session.agent.waitForIdle();

		assert.match(parent.contexts[0], /GLOBAL-CONTEXT-MARK/, "the parent has the global file");
		assert.match(parent.contexts[1], /You are `reviewer`/);
		assert.match(parent.contexts[1], /PROJECT-CONTEXT-MARK/);
		assert.doesNotMatch(parent.contexts[1], /GLOBAL-CONTEXT-MARK/);
		assert.match(parent.contexts[2], /\+REVIEW-ME/);
		const result = parent.runtime.session.messages.find((m) => m.role === "toolResult" && m.toolName === TOOL_NAME);
		assert.match(textOf(result.content), /^## reviewer · faux\/faux-1 · completed \(.+, 1 tool call\)\n\nNo issues found\.\nMerge verdict: OK$/);
	} finally {
		await parent.dispose();
	}
});

test("runner: long output is previewed, abort stops the child, unknown models fail before launch", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const controller = new AbortController();
	const long = `${"evidence line\n".repeat(400)}END`;
	const parent = await createParent({
		name: "runner",
		responses: [
			() => fauxAssistantMessage(long),
			() => {
				controller.abort();
				return fauxAssistantMessage([fauxToolCall("read", { path: "README.md" })]);
			},
			() => fauxAssistantMessage("SHOULD-NOT-RUN"),
		],
	});
	try {
		const runner = createChildRunner(parent.options);
		const roles = loadRoles(rolesDir, parent.agent.parseFrontmatter);
		assert.ok(parent.captured.ctx, "session_start context");
		const ctx = { modelRegistry: parent.captured.ctx.modelRegistry, model: parent.faux.getModel(), thinkingLevel: "off", sessionFile: undefined, contextFiles: undefined };

		const longResult = await runner.run({ role: roles.explorer, task: "long", model: undefined, cwd: parent.cwd, index: 1 }, ctx);
		assert.equal(longResult.status, "completed");
		assert.equal(longResult.output, long);
		assert.match(longResult.preview, /\n…\nFull output: .+ \(5\.5 KB, 401 lines\)\. Read it if needed\.$/);
		assert.ok(longResult.preview.length < 2_200);
		assert.ok(longResult.outputFile.path.includes(`pi-subagent-${process.pid}`));
		rmSync(longResult.outputFile.path);

		const aborted = await runner.run({ role: roles.explorer, task: "abort", model: undefined, cwd: parent.cwd, index: 2 }, ctx, controller.signal);
		assert.equal(aborted.status, "aborted");
		assert.equal(parent.contexts.length, 2, "no model call after abort");

		await assert.rejects(
			runner.run({ role: roles.explorer, task: "x", model: "no-such-provider/no-such-model", cwd: parent.cwd, index: 3 }, ctx),
			/Subagent model "no-such-provider\/no-such-model" cannot be used/,
		);
		assert.equal(parent.contexts.length, 2, "no model call for an unknown model");
	} finally {
		await parent.dispose();
	}
});

test("reviewer follows a parent without context files (--no-context-files)", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const parent = await createParent({
		name: "reviewer-nc",
		noContextFiles: true,
		files: { "repo/AGENTS.md": "PROJECT-CONTEXT-MARK\n" },
		responses: [
			() => fauxAssistantMessage([fauxToolCall(TOOL_NAME, { agent: "reviewer", task: "Review README.md." })]),
			() => fauxAssistantMessage("No issues found.\nMerge verdict: OK"),
			() => fauxAssistantMessage("PARENT-DONE"),
		],
	});
	try {
		await parent.runtime.session.prompt("Review");
		await parent.runtime.session.agent.waitForIdle();
		assert.doesNotMatch(parent.contexts[0], /PROJECT-CONTEXT-MARK/);
		assert.match(parent.contexts[1], /You are `reviewer`/);
		assert.doesNotMatch(parent.contexts[1], /PROJECT-CONTEXT-MARK/);
	} finally {
		await parent.dispose();
	}
});

/** Responses for concurrent children, chosen by the task text in each request (call order is not fixed). */
function byTask(handlers) {
	return (context) => {
		const json = JSON.stringify(context);
		const match = Object.keys(handlers).find((key) => json.includes(`Task: ${key}`));
		return handlers[match ?? "default"](json);
	};
}

test("tasks: parallel children report separately; one failure does not hide the other; progress is emitted", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	let aCalls = 0;
	const handlers = {
		"A-scope": () => (aCalls++ === 0 ? fauxAssistantMessage([fauxToolCall("ls", { path: "." })]) : fauxAssistantMessage("A-DONE")),
		"B-scope": () => fauxAssistantMessage("", { stopReason: "error", errorMessage: "invalid request: CHILD-B-FAILED" }),
		default: () => fauxAssistantMessage("UNEXPECTED"),
	};
	const parent = await createParent({ name: "parallel", responses: Array.from({ length: 6 }, () => byTask(handlers)) });
	try {
		const updates = [];
		const result = await parent.captured.tool.execute(
			"call-1",
			{ tasks: [{ agent: "explorer", task: "A-scope" }, { agent: "explorer", task: "B-scope" }] },
			undefined,
			(update) => updates.push(update),
			parent.captured.ctx,
		);
		assert.equal(result.isError, undefined, "one child succeeded");
		const [a, b] = result.details.children;
		assert.equal(a.status, "completed");
		assert.equal(a.text, "A-DONE");
		assert.equal(a.toolCalls, 1);
		assert.equal(b.status, "failed");
		assert.match(b.error, /CHILD-B-FAILED/);
		const text = result.content[0].text;
		assert.match(text, /## explorer · faux\/faux-1 · completed[\s\S]*A-DONE/);
		assert.match(text, /## explorer · faux\/faux-1 · failed[\s\S]*CHILD-B-FAILED/);
		assert.ok(updates.length >= 3, `progress updates: ${updates.length}`);
		assert.deepEqual(updates[0].details.children.map((row) => row.status), ["starting", "starting"]);
		assert.ok(updates.some((update) => update.details.children[0].currentTool === "ls"));
		assert.deepEqual(updates.at(-1).details.children.map((row) => row.status).sort(), ["completed", "failed"]);
	} finally {
		await parent.dispose();
	}
});

test("tasks: an unknown model rejects the call before any child starts; abort stops every child", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const controller = new AbortController();
	let calls = 0;
	const respond = () => {
		calls++;
		if (calls === 2) controller.abort();
		return fauxAssistantMessage([fauxToolCall("ls", { path: "." })]);
	};
	const parent = await createParent({ name: "parallel-abort", responses: Array.from({ length: 6 }, () => respond) });
	try {
		const ctx = parent.captured.ctx;
		await assert.rejects(
			parent.captured.tool.execute("call-1", { tasks: [{ agent: "explorer", task: "x" }, { agent: "explorer", task: "y", model: "no-such/model" }] }, undefined, undefined, ctx),
			/Subagent model "no-such\/model" cannot be used/,
		);
		assert.equal(calls, 0, "no child started");

		const result = await parent.captured.tool.execute(
			"call-2",
			{ tasks: [{ agent: "explorer", task: "x" }, { agent: "explorer", task: "y" }] },
			controller.signal,
			undefined,
			ctx,
		);
		assert.deepEqual(result.details.children.map((row) => row.status), ["aborted", "aborted"]);
		assert.equal(result.isError, true);
		assert.equal(calls, 2, "no model call after abort");
	} finally {
		await parent.dispose();
	}
});

test("pi loads prompts/review.md as /review and expands its arguments", async () => {
	const { loadPromptTemplates, expandPromptTemplate } = await load("dist/core/prompt-templates.js");
	const promptPath = new URL("../prompts/review.md", import.meta.url).pathname;
	const { templates, diagnostics } = loadPromptTemplates({ cwd: scratch, agentDir: join(scratch, "no-agent"), promptPaths: [promptPath], includeDefaults: false });
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(templates.map((template) => template.name), ["review"]);
	const withFocus = expandPromptTemplate("/review src/api focus on errors", templates);
	assert.match(withFocus, /Target and focus from the user: src\/api focus on errors/);
	assert.match(expandPromptTemplate("/review", templates), /Target and focus from the user: the uncommitted changes in this repository/);
	assert.match(withFocus, /one `subagent` call with `review: \{ task:/);
	assert.match(withFocus, /no review verdict is available/);
	assert.match(withFocus, /Do not edit any files/);
});

test("SDK explorer fallback restarts after a mid-run provider error, not after a strict override", async () => {
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	let primaryCalls = 0;
	const respond = (_context, _options, _state, model) => model.id === "backup"
		? fauxAssistantMessage("BACKUP-DONE")
		: primaryCalls++ === 0 ? fauxAssistantMessage([fauxToolCall("ls", { path: "." })])
			: fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 unauthorized" });
	const parent = await createParent({ name: "fallback-sdk", modelIds: ["primary", "backup"],
		settings: { retry: { enabled: false } }, responses: Array(10).fill(respond) });
	try {
		writeFileSync(join(parent.agentDir, "subagent.json"), JSON.stringify({ agents: { explorer: { model: "faux/primary:high", fallbackModels: ["faux/backup:high"] } } }));
		const updates = [];
		const r = await parent.captured.tool.execute("id", { agent: "explorer", task: "MIDRUN-ORIGINAL" }, undefined, (u) => updates.push(u), parent.captured.ctx);
		const child = r.details.children[0];
		assert.equal(child.status, "completed"); assert.equal(child.model, "faux/backup"); assert.equal(child.text, "BACKUP-DONE");
		assert.equal(child.attempts.length, 2); assert.equal(child.toolCalls, 1);
		const backup = parent.modelCalls.find((c) => c.id === "backup");
		assert.ok(!backup.context.messages.some((m) => m.role === "assistant" || m.role === "toolResult" || m.role === "tool"), "fresh context, no previous assistant/tool history");
		assert.equal(backup.context.messages.filter((m) => m.role === "user").length, 1);
		assert.match(JSON.stringify(backup.context.messages), /MIDRUN-ORIGINAL/);
		assert.ok(updates.some((u) => u.details.children[0].transitions?.[0]?.includes("Trying faux/backup — previous model attempt failed:")));
		const count = parent.modelCalls.length;
		const strict = await parent.captured.tool.execute("strict", { agent: "explorer", task: "STRICT", model: "faux/primary:high" }, undefined, undefined, parent.captured.ctx);
		assert.equal(strict.details.children[0].status, "failed");
		assert.ok(parent.modelCalls.slice(count).every((c) => c.id === "primary"));
	} finally { await parent.dispose(); }
});

test("SDK host retries settle before explorer fallback", async () => {
	const { fauxAssistantMessage } = await loadAi("dist/index.js");
	let primaryCalls = 0;
	const respond = (_c, _o, _s, model) => {
		if (model.id === "primary") { primaryCalls++; return fauxAssistantMessage("", { stopReason: "error", errorMessage: "503 overloaded" }); }
		return fauxAssistantMessage("RECOVERED");
	};
	const parent = await createParent({ name: "retry-sdk", modelIds: ["primary", "backup"],
		settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxAgentDelayMs: 10 } }, responses: Array(8).fill(respond) });
	try {
		writeFileSync(join(parent.agentDir, "subagent.json"), JSON.stringify({ agents: { explorer: { model: "faux/primary", fallbackModels: ["faux/backup"] } } }));
		const r = await parent.captured.tool.execute("id", { agent: "explorer", task: "retry" }, undefined, undefined, parent.captured.ctx);
		assert.equal(r.details.children[0].status, "completed"); assert.equal(primaryCalls, 2);
		assert.deepEqual(parent.modelCalls.map((c) => c.id), ["primary", "primary", "backup"]);
	} finally { await parent.dispose(); }
});

test("SDK review roster isolates preflight and runtime failures with four distinct strict models", async () => {
	const { fauxAssistantMessage } = await loadAi("dist/index.js");
	const respond = (_c, _o, _s, model) => model.id === "r2" ? fauxAssistantMessage("", { stopReason: "error", errorMessage: "401 bad credentials" }) : fauxAssistantMessage(`REVIEW-${model.id}`);
	const parent = await createParent({ name: "roster-sdk", modelIds: ["r1", "r2", "r3", "r4"], settings: { retry: { enabled: false } }, responses: Array(16).fill(respond) });
	try {
		const config = { review: { models: ["faux/r1:high", "faux/r2:high", "faux/r3:high", "faux/r4:high"] } };
		writeFileSync(join(parent.agentDir, "subagent.json"), JSON.stringify(config));
		const r = await parent.captured.tool.execute("id", { review: { task: "WHOLE-REVIEW" } }, undefined, undefined, parent.captured.ctx);
		assert.equal(r.details.review.coverage, "partial"); assert.equal(r.details.review.succeeded, 3); assert.equal(r.isError, undefined);
		assert.deepEqual(parent.modelCalls.map((c) => c.id).sort(), ["r1", "r2", "r3", "r4"]);
		assert.ok(parent.modelCalls.every((c) => JSON.stringify(c.context).includes("WHOLE-REVIEW")));
		assert.ok(r.details.children.every((c) => !c.attempts), "strict slots, no fallback chain");
		config.review.models[1] = "missing/roster-member";
		writeFileSync(join(parent.agentDir, "subagent.json"), JSON.stringify(config));
		const count = parent.modelCalls.length;
		const partial = await parent.captured.tool.execute("id2", { review: { task: "NEXT" } }, undefined, undefined, parent.captured.ctx);
		assert.equal(partial.details.review.succeeded, 3); assert.equal(parent.modelCalls.length - count, 3);
		assert.equal(partial.details.children[1].phase, "resolution"); assert.match(partial.content[0].text, /missing\/roster-member/);
	} finally { await parent.dispose(); }
});

test("SDK reviewer slots preserve the shared HEAD baseline even when HEAD moves during execution", async () => {
	const { execFileSync } = await import("node:child_process");
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	let moved = false;
	const respond = (context) => {
		if (!moved) { moved = true; execFileSync("git", ["-C", parent.cwd, "commit", "--allow-empty", "-qm", "moved"]); }
		if (!context.messages.some((m) => m.role === "toolResult")) return fauxAssistantMessage([fauxToolCall("review_diff", {})]);
		assert.match(JSON.stringify(context.messages), /HEAD changed since this reviewer started/);
		return fauxAssistantMessage("HEAD-MOVED-REPORTED");
	};
	const parent = await createParent({ name: "roster-baseline", modelIds: ["r1", "r2", "r3", "r4"], responses: Array(12).fill(respond) });
	try {
		for (const args of [["init", "-q"], ["config", "user.email", "test@example.org"], ["config", "user.name", "test"], ["config", "commit.gpgsign", "false"], ["commit", "--allow-empty", "-qm", "initial"]]) execFileSync("git", ["-C", parent.cwd, ...args]);
		writeFileSync(join(parent.agentDir, "subagent.json"), JSON.stringify({ review: { models: ["faux/r1", "faux/r2", "faux/r3", "faux/r4"] } }));
		const r = await parent.captured.tool.execute("id", { review: { task: "baseline" } }, undefined, undefined, parent.captured.ctx);
		assert.equal(r.details.review.coverage, "complete"); assert.ok(r.details.children.every((c) => c.text === "HEAD-MOVED-REPORTED"));
	} finally { await parent.dispose(); }
});
