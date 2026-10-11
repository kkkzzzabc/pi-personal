import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { findPiPackageRoot } from "./pi-package.mjs";
import { createWrapupAuditExtension } from "../extensions/wrapup-audit/extension.ts";
import { DEFAULTS } from "../extensions/wrapup-audit/config.ts";
import { createTurnSummaryExtension } from "../extensions/turn-summary/extension.ts";
import { createWidget } from "../extensions/turn-summary/widget.ts";
import { DEFAULTS as SUMMARY_DEFAULTS } from "../extensions/turn-summary/config.ts";

const root = findPiPackageRoot(); assert.ok(root);
const load = (p) => import(pathToFileURL(join(root, p)).href);
const agent = await load("dist/index.js");
const tui = await load("../pi-tui/dist/index.js");
const ai = await load("../pi-ai/dist/index.js");
const compat = await load("../pi-ai/dist/compat.js");
const { AuthStorage } = await load("dist/core/auth-storage.js");
const { theme, initTheme } = await load("dist/modes/interactive/theme/theme.js");
initTheme("dark", false);
const repoConfig = JSON.parse(readFileSync(new URL("../.pi/wrapup-audit.json", import.meta.url), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "wrapup-audit-int-"));
const oldOffline = process.env.PI_OFFLINE; process.env.PI_OFFLINE = "1";
after(() => { if (oldOffline === undefined) delete process.env.PI_OFFLINE; else process.env.PI_OFFLINE = oldOffline; rmSync(scratch, { recursive: true, force: true }); });
const drain = () => new Promise((r) => setTimeout(r, 25));
const JUDGED = { findings: [{ id: "glossary", note: "새 용어를 glossary에 추가하세요" }] };
let seq = 0;

/** Parent responses are functions so each sees the context; nested audit/summary calls are answered separately. */
async function parent({ mode = "tui", parentSteps, judged = JUDGED, judgeFail = false, withSummary = false, config = {} } = {}) {
	const dir = join(scratch, String(++seq)); const cwd = join(dir, "work"); const agentDir = join(dir, "agent");
	mkdirSync(cwd, { recursive: true }); mkdirSync(agentDir); writeFileSync(join(cwd, "README.md"), "# Work\n");
	const faux = compat.registerFauxProvider({ provider: `audit-test-${seq}`, models: [{ id: "parent", reasoning: true }, { id: "luna", reasoning: true }, { id: "haiku", reasoning: true }] });
	const calls = []; const steps = parentSteps(cwd); let p = 0;
	const respond = (model, context) => {
		const sys = JSON.stringify(context);
		if (sys.includes("wrap-up obligations")) return judgeFail && model === "luna" ? ai.fauxAssistantMessage("", { stopReason: "error", errorMessage: "synthetic" }) : ai.fauxAssistantMessage(JSON.stringify(judged));
		if (sys.includes("Summarize the agent")) return ai.fauxAssistantMessage(JSON.stringify({ summary: { done: "d", open: null, next: null } }));
		const step = steps[Math.min(p++, steps.length - 1)]; return typeof step === "function" ? step(context) : step;
	};
	const auth = AuthStorage.inMemory(); await auth.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "offline-test" }));
	const modelRuntime = await agent.ModelRuntime.create({ credentials: auth, modelsPath: join(dir, "models.json") });
	const notices = []; const status = new Map(); const widgets = new Map();
	const build = async ({ cwd: work, sessionManager, sessionStartEvent }) => {
		const services = await agent.createAgentSessionServices({ cwd: work, agentDir, modelRuntime, resourceLoaderOptions: {
			noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
			extensionFactories: [(pi) => {
				const delegate = compat.getApiProvider(faux.api).streamSimple; const m = faux.getModel();
				pi.registerProvider(m.provider, { baseUrl: m.baseUrl, apiKey: "offline-test", api: faux.api,
					models: faux.models.map((x) => ({ id: x.id, name: x.name, api: x.api, reasoning: x.reasoning, input: x.input, cost: x.cost, contextWindow: x.contextWindow, maxTokens: x.maxTokens })),
					streamSimple(model, context, options) {
						calls.push({ model: model.id, context });
						faux.setResponses([respond(model.id, context)]);
						return delegate(model, context, options);
					} });
				createWrapupAuditExtension({ agentDir: () => agentDir, lowestThinking: () => undefined,
					load: () => ({ config: { ...DEFAULTS, models: [m.provider + "/luna", m.provider + "/haiku"], rules: repoConfig.rules, judgments: repoConfig.judgments, ...config } }) })(pi);
				if (withSummary) createTurnSummaryExtension({ agentDir: () => agentDir, lowestThinking: () => undefined,
					load: () => ({ config: { ...SUMMARY_DEFAULTS, models: [m.provider + "/luna"] } }), widget: (get) => createWidget(tui, get) })(pi);
			}],
		} });
		return { ...(await agent.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel("parent") })), services, diagnostics: services.diagnostics };
	};
	const runtime = await agent.createAgentSessionRuntime(build, { cwd, agentDir, sessionManager: agent.SessionManager.create(cwd, join(dir, "sessions")) });
	await runtime.session.bindExtensions({ mode, uiContext: { theme, notify: (m, l) => notices.push({ m, l }), setStatus: (k, v) => status.set(k, v),
		setWidget(k, f) { if (f) widgets.set(k, f); else widgets.delete(k); } } });
	return { runtime, cwd, calls, notices, status, widgets,
		parents: () => calls.filter((c) => c.model === "parent"),
		nested: (kind) => calls.filter((c) => JSON.stringify(c.context).includes(kind === "audit" ? "wrap-up obligations" : "Summarize the agent")),
		steering: () => runtime.session.messages.filter((m) => m.customType === "wrapup-audit"),
		async prompt(text = "Add the new extension.") { await runtime.session.prompt(text); await runtime.session.agent.waitForIdle(); await drain(); },
		async command(text) { await runtime.session.prompt(text); return notices.at(-1).m; },
		async dispose() { await runtime.dispose(); faux.unregister(); } };
}
const write = (path, content = "x") => ai.fauxAssistantMessage([ai.fauxToolCall("write", { path, content })]);
const say = (text) => ai.fauxAssistantMessage(text);
const textOf = (m) => typeof m.content === "string" ? m.content : (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");

test("real loader registers one command, no tools", async () => {
	const { loadExtensions } = await load("dist/core/extensions/loader.js");
	const r = await loadExtensions([new URL("../extensions/wrapup-audit/index.ts", import.meta.url).pathname], scratch);
	assert.deepEqual(r.errors, []); assert.deepEqual([...r.extensions[0].commands.keys()], ["wrapup-audit"]); assert.equal(r.extensions[0].tools.size, 0);
});
test("rule miss: exactly one visible continuation the model receives; remaining miss reported, not steered again", async () => {
	let seen;
	const p = await parent({ parentSteps: () => [write("extensions/new/index.ts"), say("Done."), (ctx) => { seen = ctx.messages.map(textOf).join("\n"); return say("README not updated: out of scope."); }] });
	try {
		await p.prompt();
		assert.equal(p.parents().length, 3); assert.equal(p.steering().length, 1);
		assert.equal(p.steering()[0].display, true);
		assert.match(seen, /Wrap-up audit \(automatic, once per request\)[\s\S]*extensions\/new\/index\.ts \[readme-extension\]/);
		assert.equal(p.nested("audit").length, 1, "judgment runs once after settlement");
		assert.equal(p.status.get("wrapup-audit"), "wrap-up: 2 to check");
		const status = await p.command("/wrapup-audit");
		assert.match(status, /steered this request: yes · steering total: 1/); assert.match(status, /\[readme-extension\]/); assert.match(status, /\[glossary\] 새 용어/);
	} finally { await p.dispose(); }
});
test("fixed during the continuation: re-check is clean", async () => {
	const p = await parent({ judged: { findings: [] }, parentSteps: (cwd) => [write("extensions/new/index.ts"), say("Done."),
		ai.fauxAssistantMessage([ai.fauxToolCall("write", { path: join(cwd, "README.md"), content: "| `new/` | Extension |\n" })]), say("Added the README row.")] });
	try {
		await p.prompt(); assert.equal(p.parents().length, 4); assert.equal(p.steering().length, 1);
		assert.equal(p.status.get("wrapup-audit"), undefined);
		assert.match(await p.command("/wrapup-audit"), /Rule findings \(Lane A\):\n {2}\(none\)/);
	} finally { await p.dispose(); }
});
test("next request starts fresh; each request steers at most once", async () => {
	const p = await parent({ judged: { findings: [] }, parentSteps: () => [write("extensions/a/index.ts"), say("A."), say("Left."), write("extensions/b/index.ts"), say("B."), say("Left too.")] });
	try {
		await p.prompt(); await p.prompt("Add b.");
		assert.equal(p.steering().length, 2); assert.equal(p.parents().length, 6);
		const second = JSON.stringify(p.nested("audit").at(-1).context.messages);
		assert.match(second, /Add b\./); assert.doesNotMatch(second, /Add the new extension|extensions\/a\//, "judgment context is limited to the current request");
	} finally { await p.dispose(); }
});
test("no changes, out-of-root file, or failed write: no continuation and no judgment call", async () => {
	const outside = join(scratch, `outside-${seq}.md`);
	for (const steps of [() => [say("Explained.")], () => [write(outside), say("Wrote outside.")],
		() => [ai.fauxAssistantMessage([ai.fauxToolCall("edit", { path: "missing.md", edits: [{ oldText: "a", newText: "b" }] })]), say("Edit failed.")]]) {
		const p = await parent({ parentSteps: steps });
		try { await p.prompt(); assert.equal(p.steering().length, 0); assert.equal(p.nested("audit").length, 0); assert.equal(p.status.get("wrapup-audit"), undefined); }
		finally { await p.dispose(); }
	}
	assert.ok(existsSync(outside)); rmSync(outside);
});
test("judgment fallback uses the exact second model; report only, no extra parent turn", async () => {
	const p = await parent({ judgeFail: true, parentSteps: () => [write("notes.md"), say("Wrote notes.")] });
	try {
		await p.prompt(); assert.equal(p.parents().length, 2); assert.deepEqual(p.nested("audit").map((c) => c.model), ["luna", "haiku"]);
		assert.match(await p.command("/wrapup-audit"), /luna \(provider-error\) → .*haiku \(success\)/);
		assert.equal(p.notices.filter((n) => /Wrap-up audit: 1 item/.test(n.m)).length, 1);
	} finally { await p.dispose(); }
});
for (const mode of ["rpc", "print"]) test(`real ${mode}: no continuation or judgment`, async () => {
	const p = await parent({ mode, parentSteps: () => [write("extensions/new/index.ts"), say("Done.")] });
	try { await p.prompt(); assert.equal(p.parents().length, 2); assert.equal(p.steering().length, 0); assert.equal(p.nested("audit").length, 0); } finally { await p.dispose(); }
});
test("coexists with turn-summary: one continuation, then one judgment and one summary", async () => {
	const p = await parent({ withSummary: true, parentSteps: () => [write("extensions/new/index.ts"), say("Done."), say("Not fixed.")] });
	try {
		await p.prompt(); assert.equal(p.parents().length, 3); assert.equal(p.steering().length, 1);
		assert.equal(p.nested("audit").length, 1); assert.equal(p.nested("summary").length, 1); assert.ok(p.widgets.has("turn-summary"));
	} finally { await p.dispose(); }
});
