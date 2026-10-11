import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DEFAULTS, loadConfig, validateConfig } from "../extensions/wrapup-audit/config.ts";
import { ChangeTracker, canonicalPath, relativeTo, resolveToolPath } from "../extensions/wrapup-audit/paths.ts";
import { checkRules, frontmatter, steeringMessage } from "../extensions/wrapup-audit/rules.ts";
import { buildContext, judge, parseFindings } from "../extensions/wrapup-audit/judge.ts";
import { createWrapupAuditExtension } from "../extensions/wrapup-audit/extension.ts";

const repoConfig = JSON.parse(readFileSync(new URL("../.pi/wrapup-audit.json", import.meta.url), "utf8"));
const SESSION = "s-current";
const TODAY = "2026-10-12";
const conf = (v = {}) => ({ ...DEFAULTS, models: ["test/luna", "test/haiku"], rules: repoConfig.rules, judgments: repoConfig.judgments, ...v });
const scratch = mkdtempSync(join(tmpdir(), "wrapup-audit-unit-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// ── Config ──────────────────────────────────────────────────────────────
const rule = (v) => ({ rules: [{ id: "r", type: "frontmatter", match: "x", keys: ["a"], message: "m", ...v }] });
for (const data of [null, [], { x: 1 }, { steer: 1 }, { models: [] }, { models: ["a/b", "a/b"] }, { timeoutMs: 0 }, { maxContextChars: 999 },
	{ rules: {} }, rule({ type: "nope" }), rule({ id: "Bad Id" }), rule({ match: "(" }), rule({ extra: 1 }), rule({ keys: [] }),
	{ rules: [rule().rules[0], rule().rules[0]] }, rule({ type: "mention" }), rule({ type: "field-line", keys: undefined }),
	{ judgments: [{ id: "a" }] }, { judgments: [{ id: "a", text: "t", x: 1 }] }, { judgments: Array.from({ length: 9 }, (_, i) => ({ id: `j${i}`, text: "t" })) },
	{ judgments: [{ id: "a", text: "t" }, { id: "a", text: "u" }] }, { judgments: [{ foo: "x", text: "t" }] }, { judgments: [{ id: 1, text: "t" }] },
	{ rules: [{ type: "amendment", match: "x", message: "m" }] }, rule({ id: null })])
	test(`invalid config ${JSON.stringify(data)}`, () => assert.throws(() => validateConfig(data)));
test("config: no built-in rules, repository config valid, trusted project replaces, fail-closed without echo", () => {
	assert.deepEqual([DEFAULTS.rules, DEFAULTS.judgments], [[], []]);
	assert.doesNotThrow(() => validateConfig(repoConfig));
	const read = (f) => f.includes("/.pi/") ? JSON.stringify({ judge: false }) : JSON.stringify({ steer: false });
	const trusted = loadConfig("/a", "/r", true, read).config; assert.deepEqual([trusted.steer, trusted.judge], [false, false]);
	assert.equal(loadConfig("/a", "/r", false, read).config.judge, true);
	const bad = loadConfig("/a", "/r", false, () => "PRIVATE"); assert.equal(bad.config.enabled, false); assert.doesNotMatch(bad.error, /PRIVATE/);
	const missing = loadConfig("/a", "/r", true, () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); }); assert.equal(missing.error, undefined);
});

// ── Lane A rules ────────────────────────────────────────────────────────
const record = (session, body = "") => `---\ntitle: T\ndate: 2026-10-11\nsession: ${session}\nbased_on: []\n---\n\n# T\n${body}`;
const check = (changed, files) => checkRules(changed, conf().rules, (p) => files[p], SESSION, TODAY);
test("mention: only created files; $1 capture; README hit passes", () => {
	const files = { "README.md": "| `known/` | Extension |\n| `known-skill` | Skill |" };
	assert.deepEqual(check([{ path: "extensions/new/index.ts", created: true }], files).map((f) => f.rule), ["readme-extension"]);
	assert.deepEqual(check([{ path: "extensions/known/index.ts", created: true }], files), []);
	assert.deepEqual(check([{ path: "extensions/new/index.ts", created: false }], files), []);
	assert.deepEqual(check([{ path: "extensions/new/helper.ts", created: true }], files), []);
	assert.deepEqual(check([{ path: "skills/new-skill/SKILL.md", created: true }, { path: "skills/known-skill/SKILL.md", created: true }], files).map((f) => f.path), ["skills/new-skill/SKILL.md"]);
	assert.deepEqual(check([{ path: "extensions/one.ts", created: true }], {}).map((f) => f.rule), ["readme-extension-file"]);
	assert.deepEqual(check([{ path: "prompts/p.md", created: true }], { "README.md": "`p`" }), []);
});
test("frontmatter: created records need all keys; other folders and modified files ignored", () => {
	const p = "docs/plans/2026-10-12-x.md";
	assert.deepEqual(check([{ path: p, created: true }], { [p]: record(SESSION) }), []);
	assert.deepEqual(check([{ path: p, created: true }], { [p]: "---\ntitle: T\ndate: d\n---\n" }).map((f) => f.rule), ["record-frontmatter"]);
	assert.deepEqual(check([{ path: p, created: true }], { [p]: "# no frontmatter" }).map((f) => f.rule), ["record-frontmatter"]);
	assert.deepEqual(check([{ path: "docs/other/x.md", created: true }], { "docs/other/x.md": "# x" }), []);
});
test("amendment: other-session record needs today's entry; own session, older date, other section", () => {
	const p = "docs/research/2026-10-11-x.md";
	const run = (content, created = false) => check([{ path: p, created }], { [p]: content }).map((f) => f.rule);
	assert.deepEqual(run(record("s-other")), ["record-amendment"]);
	assert.deepEqual(run(record(SESSION)), []);
	assert.deepEqual(run(record("s-other", `\n## Amendments\n\n### ${TODAY} — Link\n- Change: x\n`)), []);
	assert.deepEqual(run(record("s-other", "\n## Amendments\n\n### 2026-10-11 — Older\n")), ["record-amendment"]);
	assert.deepEqual(run(record("s-other", `\n## Notes\n### ${TODAY}\n## Amendments\n`)), ["record-amendment"]);
	assert.deepEqual(run(record("s-other", `\n## Amendments\n### 2026-10-01 — a\n## Later\n### ${TODAY}\n`)), ["record-amendment"]);
	assert.deepEqual(run("# no frontmatter"), []);
	assert.match(steeringMessage(check([{ path: p, created: false }], { [p]: record("s-other") })), /typos, formatting, and link repairs need none/);
});
test("field-line: done/dropped items need a Closure line", () => {
	const p = "docs/backlog/BL-x.md"; const item = (status, extra = "") => `---\nid: BL-x\nstatus: ${status}\n---\n\n- Outcome: x\n${extra}`;
	const run = (c) => check([{ path: p, created: false }], { [p]: c }).map((f) => f.rule);
	assert.deepEqual(run(item("done")), ["backlog-closure"]);
	assert.deepEqual(run(item("dropped")), ["backlog-closure"]);
	assert.deepEqual(run(item("done", "- Closure: Done — link\n")), []);
	assert.deepEqual(run(item("active")), []);
});
test("deleted or unreadable changed file is skipped; frontmatter parser strips quotes and comments", () => {
	assert.deepEqual(check([{ path: "docs/backlog/x.md", created: false }], {}), []);
	const fm = frontmatter("---\ntitle: \"Q\"\nbased_on: []   # note\n---\nbody");
	assert.deepEqual([fm.get("title"), fm.get("based_on")], ["Q", "[]"]);
});
test("steering message lists items and permits declining", () => {
	const m = steeringMessage([{ rule: "r", path: "a.md", message: "Do x." }]);
	assert.match(m, /- a\.md \[r\]: Do x\./); assert.match(m, /only if it is within the current request's scope/); assert.match(m, /report each item you did not fix/);
});

// ── Paths ───────────────────────────────────────────────────────────────
test("paths: @ prefix, ~, relative, outside root, created vs modified, failed calls ignored", () => {
	const root = canonicalPath(mkdtempSync(join(scratch, "root-"))); mkdirSync(join(root, "docs")); writeFileSync(join(root, "docs/old.md"), "x");
	assert.equal(resolveToolPath("@docs/a.md", root), join(root, "docs/a.md"));
	assert.equal(resolveToolPath("~/x", "/", "/home/u"), "/home/u/x");
	assert.equal(resolveToolPath("file:///tmp/outside.md", root), "/tmp/outside.md");
	assert.equal(resolveToolPath(`file://${root}/docs/a.md`, "/elsewhere"), join(root, "docs/a.md"));
	assert.equal(relativeTo(root, join(root, "..", "elsewhere.md")), undefined);
	const t = new ChangeTracker(root);
	t.call("1", "write", { path: "docs/new.md" }, root); t.result("1", false);
	t.call("2", "edit", { path: join(root, "docs/old.md") }, root); t.result("2", false);
	t.call("3", "write", { path: "/tmp/outside.md" }, root); t.result("3", false);
	t.call("3b", "write", { path: "file:///tmp/outside.md" }, root); t.result("3b", false);
	t.call("4", "edit", { path: "docs/failed.md" }, root); t.result("4", true);
	t.call("5", "read", { path: "docs/old.md" }, root); t.result("5", false);
	t.call("6", "write", { path: "docs/new.md" }, root); t.result("6", false); // Second write keeps "created".
	assert.deepEqual(t.list(), [{ path: "docs/new.md", created: true }, { path: "docs/old.md", created: false }]);
	t.reset(); assert.deepEqual(t.list(), []);
});

// ── Lane B parser, context, chain ───────────────────────────────────────
const ids = new Set(["backlog-followups", "adr-for-rules"]);
test("parser: empty list, valid findings, and rejected shapes", () => {
	assert.deepEqual(parseFindings('{"findings":[]}', ids), []);
	assert.deepEqual(parseFindings('{"findings":[{"id":"adr-for-rules","note":" ADR 필요 "}]}', ids), [{ id: "adr-for-rules", note: "ADR 필요" }]);
	for (const bad of ["x", "[]", '{"findings":null}', '{"findings":[],"x":1}', '{"findings":[{"id":"unknown","note":"n"}]}',
		'{"findings":[{"id":"adr-for-rules","note":"n"},{"id":"adr-for-rules","note":"m"}]}', '{"findings":[{"id":"adr-for-rules"}]}',
		'{"findings":[{"id":"adr-for-rules","note":"n","x":1}]}', `{"findings":[{"id":"adr-for-rules","note":"${"x".repeat(161)}"}]}`,
		'{"findings":[{"id":"adr-for-rules","note":"a\\u001b[31m"}]}', '{"findings":[{"id":"adr-for-rules","note":"/run this"}]}',
		JSON.stringify({ findings: Array.from({ length: 4 }, (_, i) => ({ id: `x${i}`, note: "n" })) })])
		assert.throws(() => parseFindings(bad, ids), /invalid-output/, bad);
});
let n = 0;
const entry = (message) => ({ type: "message", id: `e${++n}`, message });
const user = (t) => entry({ role: "user", content: t });
const reply = (t, stopReason = "stop") => entry({ role: "assistant", stopReason, content: [{ type: "thinking", thinking: "THINK_SECRET" }, { type: "text", text: t }] });
const call = (id, name, args) => entry({ role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", id, name, arguments: args }] });
const result = (id, ok) => entry({ role: "toolResult", toolCallId: id, toolName: "x", isError: !ok, content: [{ type: "text", text: "RESULT_SECRET" }] });
test("context: only the request after its start entry; trace without secrets; none for non-stop endings", () => {
	const old = [user("old"), call("o1", "write", { path: "OLD_PATH" }), result("o1", true)];
	const b = [...old, user("문서 고쳐줘"), call("c1", "write", { path: "docs/a.md", content: "ARG_SECRET" }), result("c1", true), call("c2", "bash", { command: "SECRET_CMD" }), result("c2", false), reply("고쳤습니다")];
	// The previous run ended right after a tool result (for example terminate: true); it must not leak in.
	const c = buildContext(b, old.at(-1).id, ["docs/a.md"], conf());
	assert.equal(c.request, "문서 고쳐줘"); assert.equal(c.response, "고쳤습니다");
	assert.deepEqual(c.tools, [{ tool: "write", ok: true, path: "docs/a.md" }, { tool: "bash", ok: false }]);
	assert.deepEqual(c.changedFiles, ["docs/a.md"]); assert.equal(c.obligations.length, repoConfig.judgments.length);
	assert.doesNotMatch(JSON.stringify(c), /SECRET|OLD_PATH|"old"/);
	assert.equal(buildContext(b, "not-on-branch", ["docs/a.md"], conf()), undefined);
	assert.equal(buildContext(b, null, ["docs/a.md"], conf()).request, "old\n---\n문서 고쳐줘");
	for (const reason of ["error", "length", "aborted"]) assert.equal(buildContext([user("u"), reply("a", reason)], null, [], conf()), undefined);
});
test("context: steering after a completed answer keeps the original request and its writes", () => {
	const b = [user("원래 요청"), call("c1", "write", { path: "docs/a.md" }), result("c1", true), reply("완료"), user("README도 봐줘"), reply("확인했습니다")];
	const c = buildContext(b, null, ["docs/a.md"], conf());
	assert.equal(c.request, "원래 요청\n---\nREADME도 봐줘"); assert.deepEqual(c.tools, [{ tool: "write", ok: true, path: "docs/a.md" }]);
});
test("context: total size capped at maxContextChars, including changed paths and obligations", () => {
	const calls = Array.from({ length: 40 }, (_, i) => [call(`k${i}`, "edit", { path: "p".repeat(150) + i }), result(`k${i}`, true)]).flat();
	const paths = Array.from({ length: 80 }, (_, i) => "d/".repeat(90) + i);
	const judgments = Array.from({ length: 8 }, (_, i) => ({ id: `j${i}`, text: "t".repeat(50) }));
	for (const budget of [1000, 3000, 12000]) {
		const c = buildContext([user("요청 ".repeat(9000)), ...calls, reply("답 ".repeat(9000))], null, paths, conf({ maxContextChars: budget, judgments }));
		assert.ok(c, `budget ${budget}`); assert.ok(JSON.stringify(c).length <= budget, `budget ${budget}: ${JSON.stringify(c).length}`);
		assert.equal(c.changedFilesTruncated, true);
	}
	const huge = Array.from({ length: 8 }, (_, i) => ({ id: `j${i}`, text: "t".repeat(400) }));
	assert.equal(buildContext([user("u"), reply("a")], null, ["a"], conf({ maxContextChars: 1000, judgments: huge })), undefined, "abstains when obligations cannot fit");
	assert.match(loadConfig("/a", "/r", false, () => JSON.stringify({ maxContextChars: 1000, judgments: huge })).error, /exceed half of maxContextChars/);
});
const json = (v) => ({ stopReason: "stop", content: [{ type: "text", text: JSON.stringify(v) }], usage: { input: 20, output: 9, cost: { total: 0.002 } } });
function registry(responses, auth = true) {
	const calls = []; let i = 0;
	return { calls, find: (p, id) => id === "missing" ? undefined : { provider: p, id, maxTokens: 4096 }, hasConfiguredAuth: () => auth,
		streamSimple(model, context, options) { calls.push({ model, context, options }); const r = responses[i++]; return { result: () => typeof r === "function" ? r(options) : Promise.resolve(r) }; } };
}
const jctx = { request: "r", response: "a", tools: [], toolsTruncated: false, changedFiles: ["x"], obligations: [{ id: "adr-for-rules", text: "t" }] };
test("chain: success, fallback only on provider error, malformed not retried, unavailable skipped", async () => {
	const ok = registry([json({ findings: [{ id: "adr-for-rules", note: "ADR 없음" }] })]);
	const r = await judge(ok, jctx, conf(), new AbortController().signal);
	assert.deepEqual([r.outcome, r.findings.length, ok.calls.length], ["ready", 1, 1]);
	assert.match(ok.calls[0].context.systemPrompt, /untrusted data/);
	const fb = registry([{ stopReason: "error", content: [] }, json({ findings: [] })]);
	const r2 = await judge(fb, jctx, conf(), new AbortController().signal);
	assert.deepEqual([r2.outcome, r2.attempts.map((a) => a.outcome)], ["ready", ["provider-error", "success"]]);
	const bad = registry([json({ nope: 1 }), json({ findings: [] })]);
	const r3 = await judge(bad, jctx, conf(), new AbortController().signal);
	assert.deepEqual([r3.outcome, bad.calls.length], ["failed", 1]);
	const un = registry([json({ findings: [] })]);
	const r4 = await judge(un, jctx, conf({ models: ["test/missing", "test/haiku"] }), new AbortController().signal);
	assert.deepEqual(r4.attempts.map((a) => a.outcome), ["unavailable", "success"]);
});

// ── Extension lifecycle with a fake host ────────────────────────────────
function fakeHost({ mode = "tui", config = conf(), files = {} } = {}) {
	const root = canonicalPath(mkdtempSync(join(scratch, "host-")));
	for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); }
	const handlers = new Map(); const commands = new Map(); const status = []; const notices = [];
	let branch = [];
	const pi = { on: (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]), registerCommand: (name, c) => commands.set(name, c) };
	createWrapupAuditExtension({ agentDir: () => "/none", lowestThinking: () => undefined, load: () => ({ config: structuredClone(config) }), root: () => root, today: () => TODAY })(pi);
	const reg = registry([json({ findings: [] }), json({ findings: [] }), json({ findings: [] })]);
	const ctx = { mode, cwd: root, isProjectTrusted: () => true, isIdle: () => true, hasPendingMessages: () => false, modelRegistry: reg,
		sessionManager: { getSessionId: () => SESSION, getBranch: () => branch },
		ui: { setStatus: (k, v) => status.push(v), notify: (m, l) => notices.push({ m, l }) } };
	const emit = async (name, event = {}) => { let out; for (const fn of handlers.get(name) ?? []) out = (await fn(event, ctx)) ?? out; return out; };
	return { root, ctx, reg, status, notices, commands, emit, set branch(b) { branch = b; },
		async write(id, path) { await emit("tool_call", { toolCallId: id, toolName: "write", input: { path } }); writeFileSync(join(root, path), "x"); await emit("tool_result", { toolCallId: id, isError: false }); },
		settle: (outcome = "completed") => emit("agent_before_settle", { outcome, entries: [{ type: "custom", customType: "other" }], continue: false, context: { canContinue: false } }) };
}
test("lane A: steers once per request with visible message, keeps earlier entries, re-checks, resets on idle input", async () => {
	const h = fakeHost({ files: { "README.md": "" } }); await h.emit("session_start");
	await h.emit("input", { text: "go" });
	mkdirSync(join(h.root, "extensions/new"), { recursive: true });
	await h.emit("tool_call", { toolCallId: "1", toolName: "write", input: { path: "extensions/new/index.ts" } }); writeFileSync(join(h.root, "extensions/new/index.ts"), "x"); await h.emit("tool_result", { toolCallId: "1", isError: false });
	const first = await h.settle();
	assert.equal(first.continue, true); assert.equal(first.entries.length, 2); assert.equal(first.entries[0].customType, "other");
	assert.deepEqual([first.entries[1].type, first.entries[1].customType, first.entries[1].display], ["custom_message", "wrapup-audit", true]);
	assert.match(first.entries[1].content, /extensions\/new\/index\.ts \[readme-extension\]/);
	assert.equal(await h.settle(), undefined, "never steers twice in one request");
	assert.equal(h.status.at(-1), "wrap-up: 1 to check");
	for (const cmd of ["off", "on"]) await h.commands.get("wrapup-audit").handler(cmd, h.ctx);
	mkdirSync(join(h.root, "extensions/other"), { recursive: true }); await h.write("t2", "extensions/other/index.ts");
	assert.equal(await h.settle(), undefined, "toggling does not reset the request's steering guard");
	assert.equal(h.status.at(-1), "wrap-up: 2 to check", "tracking survives the toggle");
	await h.emit("input", { text: "steer", streamingBehavior: "steer" }); assert.equal(await h.settle(), undefined, "mid-run steering keeps the request");
	await h.emit("input", { text: "next" }); assert.equal(await h.settle(), undefined, "new request has no changes yet");
	await h.emit("tool_call", { toolCallId: "2", toolName: "edit", input: { path: "extensions/new/index.ts" } }); await h.emit("tool_result", { toolCallId: "2", isError: false });
	assert.equal(await h.settle(), undefined, "modified file does not trigger a creation rule");
});
test("lane A: skips abort/error outcomes, non-TUI, steer:false, and fixed files", async () => {
	for (const outcome of ["aborted", "error"]) {
		const h = fakeHost(); await h.emit("session_start"); await h.emit("input", {}); mkdirSync(join(h.root, "extensions/a"), { recursive: true });
		await h.write("1", "extensions/a/index.ts"); assert.equal(await h.settle(outcome), undefined);
	}
	const rpc = fakeHost({ mode: "rpc" }); await rpc.emit("session_start"); mkdirSync(join(rpc.root, "extensions/a"), { recursive: true });
	await rpc.write("1", "extensions/a/index.ts"); assert.equal(await rpc.settle(), undefined); assert.deepEqual(rpc.status, []);
	const off = fakeHost({ config: conf({ steer: false }) }); await off.emit("session_start"); mkdirSync(join(off.root, "extensions/a"), { recursive: true });
	await off.write("1", "extensions/a/index.ts"); assert.equal(await off.settle(), undefined); assert.equal(off.status.at(-1), "wrap-up: 1 to check");
	const fixed = fakeHost({ files: { "README.md": "`a/`" } }); await fixed.emit("session_start"); mkdirSync(join(fixed.root, "extensions/a"), { recursive: true });
	await fixed.write("1", "extensions/a/index.ts"); assert.equal(await fixed.settle(), undefined);
});
test("lane B: runs only after changes, reports without continuing, notifies once; off clears", async () => {
	const h = fakeHost(); await h.emit("session_start"); await h.emit("input", {});
	h.branch = [user("go"), reply("done")];
	await h.emit("agent_settled", { aborted: false }); assert.equal(h.reg.calls.length, 0, "no changed files, no model call");
	await h.write("1", "notes.md");
	h.reg.calls.length = 0;
	const reg = registry([json({ findings: [{ id: "glossary", note: "용어 추가 필요" }] })]); h.ctx.modelRegistry = reg;
	await h.emit("agent_settled", { aborted: false }); await new Promise((r) => setTimeout(r, 10));
	assert.equal(reg.calls.length, 1); assert.equal(h.status.at(-1), "wrap-up: 1 to check");
	assert.equal(h.notices.filter((x) => /1 item/.test(x.m)).length, 1);
	await h.commands.get("wrapup-audit").handler("", h.ctx); assert.match(h.notices.at(-1).m, /\[glossary\] 용어 추가 필요/);
	await h.emit("agent_settled", { aborted: true }); assert.equal(reg.calls.length, 1);
	await h.commands.get("wrapup-audit").handler("off", h.ctx); assert.match(h.notices.at(-1).m, /: off/); assert.equal(h.status.at(-1), undefined);
});
test("lane B: stale result after a new request is discarded", async () => {
	const h = fakeHost(); await h.emit("session_start"); await h.emit("input", {});
	h.branch = [user("go"), reply("done")]; await h.write("1", "notes.md");
	let release; const reg = registry([() => new Promise((r) => { release = () => r(json({ findings: [{ id: "glossary", note: "late" }] })); })]); h.ctx.modelRegistry = reg;
	await h.emit("agent_settled", { aborted: false }); assert.equal(h.status.at(-1), "wrap-up: checking…");
	await h.emit("input", { text: "next" }); release(); await new Promise((r) => setTimeout(r, 10));
	assert.equal(h.status.at(-1), undefined); assert.equal(h.notices.length, 0);
});
test("invalid config disables with one error and no steering", async () => {
	const h = fakeHost(); const handlers = new Map(); const pi = { on: (n, f) => handlers.set(n, f), registerCommand() {} };
	createWrapupAuditExtension({ agentDir: () => "/none", lowestThinking: () => undefined, load: () => ({ config: { ...conf(), enabled: false }, error: "Invalid" }), root: () => h.root })(pi);
	await handlers.get("session_start")({}, h.ctx); assert.equal(h.notices[0].l, "error");
	await handlers.get("tool_call")({ toolCallId: "1", toolName: "write", input: { path: "extensions/x/index.ts" } }, h.ctx);
	assert.equal(await handlers.get("agent_before_settle")({ outcome: "completed", entries: [] }, h.ctx), undefined);
});
