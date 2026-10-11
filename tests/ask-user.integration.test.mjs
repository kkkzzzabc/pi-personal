import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { createAskUserExtension } from "../extensions/ask-user/extension.ts";
import { FormController } from "../extensions/ask-user/controller.ts";
import { normalizeForm } from "../extensions/ask-user/schema.ts";
import { QuestionComponent } from "../extensions/ask-user/ui.ts";
import { createPlanMode } from "../extensions/plan-mode/index.ts";
import { findPiPackageRoot } from "./pi-package.mjs";

const root = findPiPackageRoot();
assert.ok(root, "Set PI_PACKAGE_DIR to the installed Pi package root");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(pkg.name, "@earendil-works/pi-coding-agent");
const load = (path) => import(pathToFileURL(join(root, path)).href);
const loadAi = (path) => import(pathToFileURL(join(root, "..", "pi-ai", path)).href);
const tui = await import(pathToFileURL(join(root, "..", "pi-tui/dist/index.js")).href);
const theme = { fg: (_color, value) => value };
const scratch = mkdtempSync(join(tmpdir(), "ask-user-int-"));
const oldOffline = process.env.PI_OFFLINE;
process.env.PI_OFFLINE = "1";
after(() => { if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline; rmSync(scratch, { recursive: true, force: true }); });
const params = { questions: [{ id: "mode", prompt: "Which mode?", type: "single", options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] }] };
const keys = new tui.KeybindingsManager(tui.TUI_KEYBINDINGS);

async function parent(name, { action, mode = "tui", plan = false, args = params, siblings = false } = {}) {
	const agent = await load("dist/index.js");
	const { AuthStorage } = await load("dist/core/auth-storage.js");
	const { registerFauxProvider } = await loadAi("dist/compat.js");
	const { fauxAssistantMessage, fauxToolCall } = await loadAi("dist/index.js");
	const dir = join(scratch, name); const cwd = join(dir, "repo"); const agentDir = join(dir, "agent"); mkdirSync(cwd, { recursive: true }); mkdirSync(agentDir, { recursive: true });
	const faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: true }] }); const contexts = []; let api; let marker = 0;
	faux.setResponses([
		(context) => { contexts.push(context); return fauxAssistantMessage([fauxToolCall("ask_user", args), ...(siblings ? [fauxToolCall("benign_marker", {})] : [])]); },
		(context) => { contexts.push(context); return fauxAssistantMessage("FOLLOWUP"); },
	]);
	const authStorage = AuthStorage.inMemory(); await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: authStorage, modelsPath: join(dir, "models.json") });
	const createRuntime = async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({ cwd: sessionCwd, agentDir, modelRuntime, resourceLoaderOptions: {
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			extensionFactories: [(pi) => {
				api = pi; const model = faux.getModel(); pi.registerProvider(model.provider, { baseUrl: model.baseUrl, apiKey: "faux-key", api: faux.api, models: faux.models.map((m) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })) });
				createAskUserExtension(tui)(pi);
				pi.registerTool({ name: "benign_marker", description: "Synthetic no-side-effect test marker", parameters: { type: "object", properties: {} }, async execute() { marker++; return { content: [{ type: "text", text: "marker" }], details: undefined }; } });
				if (plan) createPlanMode({ loadConfig: () => ({ config: { plansDir: join(dir, "plans"), thinkingLevel: "high", extraTools: [] }, path: "", warnings: [] }) })(pi);
			}],
		} });
		return { ...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel() })), services, diagnostics: services.diagnostics };
	};
	const runtime = await agent.createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")) });
	await runtime.session.bindExtensions({ mode, uiContext: { theme, notify() {}, setStatus() {}, custom: (factory) => new Promise((resolve) => {
		const component = factory({ terminal: { rows: 40, columns: 100 }, requestRender() {} }, theme, keys, resolve); component.focused = true; action?.(component);
	}) } });
	return { runtime, api, contexts, get marker() { return marker; }, async dispose() { await runtime.dispose(); faux.unregister(); } };
}

test(`Pi ${pkg.version}: real extension loader and public schema metadata`, async () => {
	const { loadExtensions } = await load("dist/core/extensions/loader.js"); const result = await loadExtensions([new URL("../extensions/ask-user/index.ts", import.meta.url).pathname], scratch);
	assert.deepEqual(result.errors, []); const ext = result.extensions[0]; assert.deepEqual([...ext.tools.keys()], ["ask_user"]);
	const tool = ext.tools.get("ask_user").definition; assert.equal(tool.exposure, "model-only"); assert.equal(tool.executionMode, "sequential"); assert.equal(tool.annotations.readOnlyHint, true);
	assert.deepEqual([...ext.handlers.keys()], ["session_shutdown"]); assert.equal(tool.parameters.properties.questions.maxItems, 4);
	const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	assert.equal(manifest.peerDependencies["@earendil-works/pi-tui"], "*");
});

test("actual host submission reaches subsequent model input", async () => {
	const p = await parent("submit", { action(c) { c.controller.choose(0, "a"); c.controller.set(0, "comment", "No dependencies"); c.handleInput("\t"); c.handleInput("\r"); } });
	try {
		await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); assert.equal(p.contexts.length, 2);
		const result = p.runtime.session.messages.find((m) => m.role === "toolResult" && m.toolName === "ask_user"); assert.equal(result.isError, false); assert.equal(result.details.outcome, "submitted");
		assert.deepEqual(result.details.responses[0].selectedValues, ["a"]); assert.match(JSON.stringify(p.contexts[1]), /No dependencies/);
	} finally { await p.dispose(); }
});

test("incomplete intentional submission becomes discussion with missing IDs", async () => {
	const p = await parent("partial", { action(c) { c.handleInput("\t"); c.handleInput("\r"); } });
	try {
		await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); assert.equal(p.contexts.length, 2);
		const result = p.runtime.session.messages.find((m) => m.role === "toolResult"); assert.equal(result.details.outcome, "needs_discussion"); assert.deepEqual(result.details.unansweredIds, ["mode"]);
		assert.match(JSON.stringify(p.contexts[1]), /Discussion context only/);
	} finally { await p.dispose(); }
});

test("explicit Discussion with complete answers is still nonfinal", async () => {
	const p = await parent("discussion", { action(c) { c.controller.choose(0, "b"); c.handleInput("\t"); c.handleInput("\x1b[B"); c.handleInput("\r"); } });
	try {
		await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); const result = p.runtime.session.messages.find((m) => m.role === "toolResult");
		assert.equal(result.details.outcome, "needs_discussion"); assert.deepEqual(result.details.unansweredIds, []); assert.equal(p.contexts.length, 2);
	} finally { await p.dispose(); }
});

test("actual Cancel stops later benign calls and automatic follow-up, retaining no drafts", async () => {
	const p = await parent("cancel", { siblings: true, action(c) { c.controller.set(0, "custom", "UNSENT-CANCEL-DRAFT"); c.handleInput("\x1b"); } });
	try {
		await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); assert.equal(p.contexts.length, 1); assert.equal(p.marker, 0);
		const results = p.runtime.session.messages.filter((m) => m.role === "toolResult"); assert.ok(results.length >= 1);
		assert.doesNotMatch(JSON.stringify(results), /UNSENT-CANCEL-DRAFT/); assert.ok(results[0].isError); assert.equal(results[0].details?.outcome, "cancelled");
	} finally { await p.dispose(); }
});

test("actual abort closes an open form without follow-up", async () => {
	const p = await parent("abort", { action(c) { c.controller.set(0, "comment", "UNSENT-ABORT-DRAFT"); queueMicrotask(() => { void p.runtime.session.abort(); }); } });
	try {
		await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); assert.equal(p.contexts.length, 1);
		const results = p.runtime.session.messages.filter((m) => m.role === "toolResult"); assert.doesNotMatch(JSON.stringify(results), /UNSENT-ABORT-DRAFT/); assert.equal(results[0].details?.outcome, "aborted");
	} finally { await p.dispose(); }
});

for (const mode of ["rpc", "print", "json"]) test(`host ${mode} cannot collect an answer`, async () => {
	const p = await parent(`mode-${mode}`, { mode, action() { assert.fail("Must not open UI"); } });
	try { await p.runtime.session.prompt("Choose"); await p.runtime.session.agent.waitForIdle(); const result = p.runtime.session.messages.find((m) => m.role === "toolResult"); assert.equal(result.isError, true); assert.equal(result.details.outcome, "unavailable"); }
	finally { await p.dispose(); }
});

test("plan coexistence is generic and intentional disabling is preserved", async () => {
	const p = await parent("plan", { plan: true });
	try {
		const session = p.runtime.session; assert.ok(session.getActiveToolNames().includes("ask_user"));
		await session.prompt("/plan on"); assert.ok(session.getActiveToolNames().includes("ask_user")); await session.prompt("/plan off"); assert.ok(session.getActiveToolNames().includes("ask_user"));
		p.api.setActiveTools(p.api.getActiveTools().filter((name) => name !== "ask_user")); await session.prompt("/plan on"); assert.ok(!session.getActiveToolNames().includes("ask_user")); await session.prompt("/plan off"); assert.ok(!session.getActiveToolNames().includes("ask_user"));
		const declared = p.api.getAllTools().find((t) => t.name === "ask_user"); assert.equal(declared.exposure, "model-only");
	} finally { await p.dispose(); }
});

for (const scenario of ["empty-back", "historical-back", "historical-save"]) test(`native alternative editor preserves explicit intent: ${scenario}`, async () => {
	const historical = scenario !== "empty-back";
	const p = await parent(scenario, { action(c) {
		if (historical) c.controller.set(0, "custom", "C");
		c.controller.choose(0, historical ? "b" : "a");
		c.handleInput("\x1b[B"); c.handleInput("\x1b[B"); c.handleInput("\r");
		c.handleInput(scenario === "historical-save" ? "\r" : "\x1b");
		c.handleInput("\t"); c.handleInput("\r");
	} });
	try {
		await p.runtime.session.prompt("Inspect the alternative without changing intent"); await p.runtime.session.agent.waitForIdle();
		const result = p.runtime.session.messages.find((m) => m.role === "toolResult");
		assert.equal(result.details.outcome, "submitted"); assert.equal(p.contexts.length, 2);
		const response = result.details.responses[0];
		if (scenario === "historical-save") { assert.deepEqual(response.selectedValues, []); assert.equal(response.customText, "C"); }
		else { assert.deepEqual(response.selectedValues, [historical ? "b" : "a"]); assert.equal(response.customText, undefined); }
	} finally { await p.dispose(); }
});

test("native editor keeps short-screen guidance and cursor within bounds", () => {
	const terminal = { rows: 14, columns: 32 };
	const controller = new FormController(normalizeForm({ questions: [{ id: "internal-id", type: "text", prompt: "Answer" }] }));
	const component = new QuestionComponent(controller, { terminal, requestRender() {} }, theme, keys, () => {}, tui);
	component.focused = true;
	try {
		component.handleInput("\r");
		for (const width of [80, 32, 12]) {
			const lines = component.render(width); assert.ok(lines.length <= 7);
			assert.ok(lines.every((line) => tui.visibleWidth(line) <= width));
			assert.ok(lines.some((line) => line.includes(tui.CURSOR_MARKER)));
			if (width >= 32) for (const label of ["Back (keep edits)", "Save and return", "New line", "Cancel and stop"]) assert.ok(lines.join("\n").includes(label), label);
			assert.doesNotMatch(lines.join("\n"), /internal-id/);
		}
	} finally { component.dispose(); }
});

test("public TUI editor, Unicode width, bounds, resizing, focus and multiline Back", () => {
	const terminal = { rows: 16, columns: 30 }; const controller = new FormController(normalizeForm({ title: "한글 decision", questions: [{ id: "text", type: "text", prompt: "설명해주세요 🙂" }] }));
	const results = []; const component = new QuestionComponent(controller, { terminal, requestRender() {} }, theme, keys, (v) => results.push(v), tui); component.focused = true;
	try {
		for (const width of [100, 30, 12]) { const lines = component.render(width); assert.ok(lines.every((line) => tui.visibleWidth(line) <= width)); assert.ok(lines.length <= 9); }
		component.handleInput("\r"); component.handleInput("한국어"); component.handleInput("\x1b[200~\nsecond line\x1b[201~");
		const edited = component.render(30); assert.ok(edited.some((line) => line.includes(tui.CURSOR_MARKER))); assert.equal(component.editor.focused, true);
		component.handleInput("\x1b"); assert.match(controller.drafts[0].text, /한국어\nsecond line/); assert.equal(results.length, 0);
		terminal.rows = 12; assert.ok(component.render(12).every((line) => tui.visibleWidth(line) <= 12));
	} finally { component.dispose(); }
});
