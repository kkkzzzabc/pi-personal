import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { findPiPackageRoot } from "./pi-package.mjs";
import { createTurnSummaryExtension } from "../extensions/turn-summary/extension.ts";
import { createWidget } from "../extensions/turn-summary/widget.ts";
import { DEFAULTS } from "../extensions/turn-summary/config.ts";

const root = findPiPackageRoot(); assert.ok(root);
const load = (p) => import(pathToFileURL(join(root, p)).href);
const agent = await load("dist/index.js");
const tui = await load("../pi-tui/dist/index.js");
const ai = await load("../pi-ai/dist/index.js");
const compat = await load("../pi-ai/dist/compat.js");
const { AuthStorage } = await load("dist/core/auth-storage.js");
const { theme, initTheme, setTheme } = await load("dist/modes/interactive/theme/theme.js");
initTheme("dark", false);
const scratch = mkdtempSync(join(tmpdir(), "turn-summary-int-"));
const oldOffline = process.env.PI_OFFLINE; process.env.PI_OFFLINE = "1";
after(() => { if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline; rmSync(scratch, { recursive: true, force: true }); });
const drain = () => new Promise((r) => setTimeout(r, 25));
const SUMMARY = { summary: { done: "검증 단계를 설명했습니다", open: "실제 실행은 하지 않았습니다", next: "테스트를 실행할지 정하세요" } };
let seq = 0;

async function parent({ mode = "tui", delay = false, fallback = false, continuation = false, summary = SUMMARY } = {}) {
	const dir = join(scratch, String(++seq)); const cwd = join(dir, "work"); const agentDir = join(dir, "agent"); mkdirSync(cwd, { recursive: true }); mkdirSync(agentDir);
	const faux = compat.registerFauxProvider({ provider: `summary-test-${seq}`, models: [{ id: "parent", reasoning: true }, { id: "luna", reasoning: true }, { id: "haiku", reasoning: true }] });
	const calls = []; let release;
	const nested = async () => { if (delay) await new Promise((r) => { release = r; }); return fallback ? ai.fauxAssistantMessage("", { stopReason: "error", errorMessage: "synthetic failure" }) : ai.fauxAssistantMessage(JSON.stringify(summary)); };
	faux.setResponses([() => ai.fauxAssistantMessage("PARENT-DONE; verification not run."), ...(continuation ? [() => ai.fauxAssistantMessage("CONTINUED-DONE")] : []), nested, () => ai.fauxAssistantMessage(JSON.stringify(SUMMARY)), () => ai.fauxAssistantMessage("NEXT-PARENT")]);
	const auth = AuthStorage.inMemory(); await auth.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "offline-test" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: auth, modelsPath: join(dir, "models.json") });
	const widgets = new Map(); const notices = [];
	const build = async ({ cwd: work, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({ cwd: work, agentDir, modelRuntime, resourceLoaderOptions: {
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			extensionFactories: [(pi) => {
				if (continuation) { let done = false; pi.on("agent_before_settle", () => { if (!done) { done = true; return { entries: [{ type: "custom_message", customType: "synthetic-continue", content: "Continue the fixture.", display: false }], continue: true }; } }); }
				const delegate = compat.getApiProvider(faux.api).streamSimple; const m = faux.getModel();
				pi.registerProvider(m.provider, { baseUrl: m.baseUrl, apiKey: "offline-test", api: faux.api,
					models: faux.models.map((x) => ({ id: x.id, name: x.name, api: x.api, reasoning: x.reasoning, input: x.input, cost: x.cost, contextWindow: x.contextWindow, maxTokens: x.maxTokens })),
					streamSimple(model, context, options) { calls.push({ model: model.id, context }); return delegate(model, context, options); } });
				createTurnSummaryExtension({ agentDir: () => agentDir, lowestThinking: () => undefined,
					load: () => ({ config: { ...DEFAULTS, models: [m.provider + "/luna", m.provider + "/haiku"] } }),
					widget: (get) => createWidget(tui, get) })(pi);
			}],
		} });
		return { ...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel("parent") })), services, diagnostics: services.diagnostics };
	};
	const runtime = await agent.createAgentSessionRuntime(build, { cwd, agentDir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")) });
	await runtime.session.bindExtensions({ mode, uiContext: { theme, notify: (m) => notices.push(m), setStatus() {},
		setWidget(k, f, o) { if (f) widgets.set(k, { component: f({}, theme), placement: o?.placement }); else widgets.delete(k); } } });
	return { runtime, calls, widgets, notices, get release() { return release; },
		async prompt(text = "Explain the remaining verification step; do not run it.") { await runtime.session.prompt(text); await runtime.session.agent.waitForIdle(); await drain(); },
		async status() { await runtime.session.prompt("/turn-summary status"); return notices.at(-1); },
		async dispose() { release?.(); await runtime.dispose(); faux.unregister(); } };
}
const lines = (p, w = 100) => p.widgets.get("turn-summary")?.component.render(w).map((l) => tui.stripTerminalSequences(l)) ?? [];

test("real loader registers one command, no tools", async () => {
	const { loadExtensions } = await load("dist/core/extensions/loader.js"); const r = await loadExtensions([new URL("../extensions/turn-summary/index.ts", import.meta.url).pathname], scratch);
	assert.deepEqual(r.errors, []); assert.deepEqual([...r.extensions[0].commands.keys()], ["turn-summary"]); assert.equal(r.extensions[0].tools.size, 0);
});
test("settlement: one nested call, widget above editor, no parent messages or turns", async () => {
	const p = await parent(); try {
		await p.prompt(); assert.deepEqual(p.calls.map((c) => c.model), ["parent", "luna"]);
		assert.equal(p.widgets.get("turn-summary").placement, "aboveEditor");
		assert.deepEqual(lines(p).map((l) => l.slice(1, 5)), ["Done", "Open", "Next"]);
		assert.doesNotMatch(JSON.stringify(p.runtime.session.messages), /검증 단계를 설명/);
		const payload = JSON.stringify(p.calls[1].context.messages); assert.match(payload, /currentTurn/); assert.doesNotMatch(payload, /thinking/);
	} finally { await p.dispose(); }
});
test("next submitted prompt clears the widget and summarizes again", async () => {
	const p = await parent(); try {
		await p.prompt(); assert.ok(p.widgets.has("turn-summary"));
		await p.runtime.session.prompt("Next request"); await p.runtime.session.agent.waitForIdle(); await drain();
		assert.equal(p.calls.filter((c) => c.model === "luna").length, 2);
		assert.match(JSON.stringify(p.calls.at(-1).context.messages), /previousSummary/);
	} finally { await p.dispose(); }
});
test("fallback uses exact second model", async () => {
	const p = await parent({ fallback: true }); try { await p.prompt(); assert.deepEqual(p.calls.map((c) => c.model), ["parent", "luna", "haiku"]); assert.match(await p.status(), /provider-error.*haiku \(success\)/); } finally { await p.dispose(); }
});
for (const mode of ["rpc", "json", "print"]) test(`real ${mode}: no nested call or widget`, async () => {
	const p = await parent({ mode }); try { await p.prompt(); assert.deepEqual(p.calls.map((c) => c.model), ["parent"]); assert.equal(p.widgets.size, 0); } finally { await p.dispose(); }
});
test("continuation settles first, then exactly one summary", async () => {
	const p = await parent({ continuation: true }); try { await p.prompt(); assert.deepEqual(p.calls.map((c) => c.model), ["parent", "parent", "luna"]); } finally { await p.dispose(); }
});
test("session replacement discards late result", async () => {
	const p = await parent({ delay: true }); try {
		await p.prompt(); const release = p.release; const r = await p.runtime.newSession(); assert.equal(r.cancelled, false);
		release(); await drain(); assert.equal(p.widgets.has("turn-summary"), false);
	} finally { await p.dispose(); }
});
test("off cancels pending work; shutdown removes widget", async () => {
	const p = await parent({ delay: true }); try {
		await p.prompt(); const release = p.release; await p.runtime.session.prompt("/turn-summary off"); release(); await drain();
		assert.equal(p.widgets.has("turn-summary"), false); assert.match(await p.status(), /: off/);
	} finally { await p.dispose(); }
	const q = await parent(); await q.prompt(); assert.ok(q.widgets.has("turn-summary")); await q.dispose(); assert.equal(q.widgets.has("turn-summary"), false);
});
test("Unicode widths, narrow terminals, and theme changes", async () => {
	const long = { summary: { done: "한글 👨‍👩‍👧‍👦 é 긴 요약 ".repeat(6).trim().slice(0, 110), open: null, next: "다음 단계" } };
	const p = await parent({ summary: long }); try {
		await p.prompt(); const w = p.widgets.get("turn-summary").component;
		for (const width of [4, 12, 40, 100]) { const out = w.render(width); assert.ok(out.length <= 3); assert.ok(out.every((l) => tui.visibleWidth(l) <= width), `width ${width}`); }
		assert.equal(w.render(100).length, 2);
		const dark = w.render(80).join(""); setTheme("light", false); assert.notEqual(w.render(80).join(""), dark);
	} finally { setTheme("dark", false); await p.dispose(); }
});
