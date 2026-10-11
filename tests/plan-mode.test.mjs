import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { agentDir, defaultConfig, loadConfig } from "../extensions/plan-mode/config.ts";
import { createPlanMode } from "../extensions/plan-mode/index.ts";
import { canonicalPath, createPlanFilePath, resolveToolPath, targetsFile } from "../extensions/plan-mode/paths.ts";
import { ENTER_TOOL_DESCRIPTION, ENTER_TOOL_GUIDELINES, enterNote } from "../extensions/plan-mode/prompts.ts";
import { parseState, restoreState, STATE_ENTRY_TYPE } from "../extensions/plan-mode/state.ts";
import { computeBuildTools, computePlanTools } from "../extensions/plan-mode/tools.ts";

const scratch = mkdtempSync(join(tmpdir(), "plan-mode-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe("paths", () => {
	const home = "/home/u";
	const cwd = "/work/repo";

	for (const [input, expected] of [
		["src/a.ts", "/work/repo/src/a.ts"],
		["./src/../b.ts", "/work/repo/b.ts"],
		["@src/c.ts", "/work/repo/src/c.ts"],
		["~", "/home/u"],
		["~/plans/p.md", "/home/u/plans/p.md"],
		["~user/x", "/work/repo/~user/x"],
		["/etc/hosts", "/etc/hosts"],
		["/a/b/../c", "/a/c"],
		["a\u00A0b.md", "/work/repo/a b.md"],
		["file:///tmp/x.md", "/tmp/x.md"],
	]) {
		test(`resolveToolPath(${JSON.stringify(input)})`, () => {
			assert.equal(resolveToolPath(input, cwd, home), expected);
		});
	}

	test("cwd with ~ is expanded like the host", () => {
		assert.equal(resolveToolPath("a.md", "~/repo", home), "/home/u/repo/a.md");
	});

	test("canonicalPath resolves symlinks in the nearest existing ancestor", () => {
		const real = join(scratch, "real");
		const plans = join(scratch, "plans");
		mkdirSync(real, { recursive: true });
		mkdirSync(plans, { recursive: true });
		symlinkSync(real, join(plans, "escape"));
		assert.equal(canonicalPath(join(plans, "escape", "missing", "x.md")), join(canonicalPath(real), "missing", "x.md"));
	});

	test("targetsFile matches only the plan file", () => {
		const plans = join(scratch, "plans2");
		mkdirSync(plans, { recursive: true });
		const planFile = join(plans, "p.md");
		assert.equal(targetsFile(planFile, "/work", planFile), true);
		assert.equal(targetsFile("p.md", plans, planFile), true);
		assert.equal(targetsFile(`@${planFile}`, "/work", planFile), true);
		assert.equal(targetsFile(join(plans, "other.md"), "/work", planFile), false);
		assert.equal(targetsFile(join(plans, "..", "p.md"), "/work", planFile), false);
	});

	test("targetsFile rejects a symlink that points the plan path elsewhere", () => {
		const plans = join(scratch, "plans3");
		const outside = join(scratch, "outside3");
		mkdirSync(plans, { recursive: true });
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(plans, "link"));
		assert.equal(targetsFile(join(plans, "link", "p.md"), "/", join(plans, "p.md")), false);
	});

	test("createPlanFilePath uses local timestamp and two words", () => {
		const path = createPlanFilePath("/plans", new Date(2026, 9, 11, 9, 5, 7), () => 0);
		assert.equal(path, "/plans/20261011-090507-amber-badger.md");
		assert.match(createPlanFilePath("/plans"), /^\/plans\/\d{8}-\d{6}-[a-z]+-[a-z]+\.md$/);
	});
});

describe("config", () => {
	const home = "/home/u";
	const files = (content) => (path) => {
		if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
		assert.equal(path, "/home/u/.pi/agent/plan-mode.json");
		return content;
	};

	test("agentDir honors PI_CODING_AGENT_DIR", () => {
		assert.equal(agentDir({}, home), "/home/u/.pi/agent");
		assert.equal(agentDir({ PI_CODING_AGENT_DIR: "~/alt" }, home), "/home/u/alt");
	});

	test("missing file yields defaults without warnings", () => {
		const result = loadConfig({ env: {}, home, readFile: files(undefined) });
		assert.deepEqual(result.config, defaultConfig(home));
		assert.deepEqual(result.warnings, []);
	});

	test("valid overrides are applied", () => {
		const result = loadConfig({
			env: {}, home,
			readFile: files(JSON.stringify({ plansDir: "~/p", thinkingLevel: "medium", extraTools: ["a", "a", "b"] })),
		});
		assert.deepEqual(result.config, { plansDir: "/home/u/p", thinkingLevel: "medium", extraTools: ["a", "b"], shortcut: "ctrl+alt+p" });
	});

	test("invalid values fall back with warnings", () => {
		const bad = loadConfig({ env: {}, home, readFile: files(JSON.stringify({ plansDir: "", thinkingLevel: "huge", extraTools: [1] })) });
		assert.deepEqual(bad.config, defaultConfig(home));
		assert.equal(bad.warnings.length, 3);
		const broken = loadConfig({ env: {}, home, readFile: files("{") });
		assert.deepEqual(broken.config, defaultConfig(home));
		assert.match(broken.warnings[0], /Invalid JSON/);
	});
});

describe("tools", () => {
	const all = [
		{ name: "read" }, { name: "bash" }, { name: "edit" }, { name: "write" }, { name: "grep" },
		{ name: "mcp_docs_search", annotations: { readOnlyHint: true } },
		{ name: "mcp_db_write", annotations: { readOnlyHint: false } },
		{ name: "custom" }, { name: "exit_plan_mode" }, { name: "enter_plan_mode" },
	];

	test("plan tools keep base, read-only, and extra tools that were active", () => {
		const before = ["read", "bash", "edit", "write", "mcp_docs_search", "mcp_db_write", "custom", "enter_plan_mode"];
		assert.deepEqual(computePlanTools(before, all), ["read", "bash", "edit", "write", "mcp_docs_search", "exit_plan_mode"]);
		assert.deepEqual(computePlanTools(before, all, ["custom"]), ["read", "bash", "edit", "write", "mcp_docs_search", "custom", "exit_plan_mode"]);
	});

	test("inactive tools are not added; unregistered plan tools are skipped", () => {
		assert.deepEqual(computePlanTools(["read"], [{ name: "read" }, { name: "grep" }]), ["read"]);
	});

	test("build tools restore the saved set without plan-only tools", () => {
		assert.deepEqual(computeBuildTools(["read", "exit_plan_mode", "enter_plan_mode"]), ["read", "enter_plan_mode"]);
		assert.deepEqual(computeBuildTools(["read"]), ["read"], "build-only tools return only if they were active");
	});
});

describe("state", () => {
	test("parseState validates entries", () => {
		assert.deepEqual(parseState({ mode: "build" }), { mode: "build" });
		assert.equal(parseState({ mode: "plan" }), undefined);
		assert.equal(parseState({ mode: "other" }), undefined);
		assert.deepEqual(parseState({ mode: "plan", planFile: "/p.md", toolsBefore: ["read"], extra: 1 }), {
			mode: "plan", planFile: "/p.md", toolsBefore: ["read"],
		});
	});

	test("restoreState picks the latest valid plan-mode entry", () => {
		const entry = (data, customType = STATE_ENTRY_TYPE) => ({ type: "custom", customType, data });
		assert.deepEqual(restoreState([]), { mode: "build" });
		assert.deepEqual(
			restoreState([
				entry({ mode: "plan", planFile: "/a.md", toolsBefore: ["read"] }),
				entry({ mode: "plan" }),
				entry({ mode: "build" }, "other"),
				{ type: "message" },
			]),
			{ mode: "plan", planFile: "/a.md", toolsBefore: ["read"] },
		);
	});
});

function harness({ entries = [], flag = false, active = ["read", "bash", "edit", "write", "grep", "custom"], hasUI = true, answers = {}, shortcut = "ctrl+alt+p", warnings = [] } = {}) {
	const reg = { commands: {}, shortcuts: {}, flags: {}, handlers: {}, tools: {} };
	const userMessages = [];
	const newSessions = [];
	const dialogs = [];
	const appended = [];
	const notices = [];
	const status = {};
	let activeTools = [...active];
	let thinking = "medium";
	const sent = [];
	const allTools = [...new Set([...active, "read", "bash", "edit", "write", "grep", "custom"])].map((name) => ({ name }));
	const plansDir = mkdtempSync(join(scratch, "plans-"));
	const pi = {
		registerTool: (tool) => { reg.tools[tool.name] = tool; },
		sendUserMessage: (text, options) => { userMessages.push({ text, options }); },
		registerFlag: (name, options) => { reg.flags[name] = options; },
		registerCommand: (name, options) => { reg.commands[name] = options; },
		registerShortcut: (key, options) => { reg.shortcuts[key] = options; },
		on: (name, handler) => { reg.handlers[name] = handler; },
		appendEntry: (customType, data) => { appended.push({ type: "custom", customType, data: structuredClone(data) }); },
		getActiveTools: () => [...activeTools],
		setActiveTools: (names) => { activeTools = [...names]; },
		getAllTools: () => allTools,
		getFlag: (name) => (name === "plan" ? flag : undefined),
		getThinkingLevel: () => thinking,
		setThinkingLevel: (level) => { thinking = level; },
		sendMessage: (message, options) => { sent.push({ message, options }); },
	};
	const ctx = {
		cwd: join(scratch, "repo"),
		hasUI,
		ui: {
			notify: (message, type) => notices.push({ message, type }),
			setStatus: (key, text) => { status[key] = text; },
			confirm: async (title, message) => { dialogs.push({ kind: "confirm", title, message }); return answers.confirm ?? true; },
			select: async (title, options) => { dialogs.push({ kind: "select", title, options }); return answers.select; },
			editor: async (title) => { dialogs.push({ kind: "editor", title }); return answers.editor; },
		},
		sessionManager: { getBranch: () => [...entries, ...appended], getSessionFile: () => "/sessions/current.jsonl" },
		newSession: async (options) => { newSessions.push(options); return { cancelled: false }; },
	};
	createPlanMode({
		loadConfig: () => ({ config: { plansDir, thinkingLevel: "high", extraTools: [], shortcut }, path: "", warnings }),
		createPlanFile: (dir) => join(dir, "plan.md"),
	})(pi);
	return {
		beforeAgentStart: () => reg.handlers.before_agent_start({ type: "before_agent_start", prompt: "p" }, ctx),
		reg, ctx, appended, notices, status, sent, userMessages, newSessions, dialogs, planFile: join(plansDir, "plan.md"),
		tool: (name, params = {}) => reg.tools[name].execute("call-1", params, undefined, undefined, ctx),
		agentEnd: () => reg.handlers.agent_end({ type: "agent_end", messages: [] }, ctx),
		get active() { return activeTools; },
		get thinking() { return thinking; },
		context: (messages) => reg.handlers.context({ type: "context", messages }, ctx),
		start: (reason = "startup") => reg.handlers.session_start({ type: "session_start", reason }, ctx),
		command: (args = "") => reg.commands.plan.handler(args, ctx),
		toolCall: (toolName, input) => reg.handlers.tool_call({ type: "tool_call", toolCallId: "1", toolName, input }, ctx),
	};
}

const text = (result) => result.content.map((part) => part.text).join("");

describe("phase 3: enter_plan_mode", () => {
	test("asks the user and enters plan mode on confirm", async () => {
		const h = harness();
		await h.start();
		const result = await h.tool("enter_plan_mode", { reason: "Several files change" });
		assert.deepEqual(h.dialogs[0], { kind: "confirm", title: "Switch to plan mode?", message: "Several files change" });
		assert.equal(h.appended.at(-1).data.mode, "plan");
		assert.match(text(result), /approved plan mode/);
		assert.ok(text(result).includes(h.planFile));
	});

	test("declined, no UI, and already planning stay in their mode", async () => {
		const declined = harness({ answers: { confirm: false } });
		await declined.start();
		assert.match(text(await declined.tool("enter_plan_mode")), /declined/);
		assert.equal(declined.appended.length, 0);

		const headless = harness({ hasUI: false });
		await headless.start();
		assert.match(text(await headless.tool("enter_plan_mode")), /no interactive UI/);
		assert.equal(headless.dialogs.length, 0);

		const planning = harness();
		await planning.start();
		await planning.command("on");
		assert.match(text(await planning.tool("enter_plan_mode")), /already active/);
	});
});

describe("phase 3: exit_plan_mode", () => {
	async function planning(options) {
		const h = harness(options);
		await h.start();
		await h.command("on");
		return h;
	}

	test("outside plan mode or with an empty plan file it reports an error", async () => {
		const h = harness();
		await h.start();
		assert.equal((await h.tool("exit_plan_mode")).isError, true);
		const p = await planning();
		const result = await p.tool("exit_plan_mode");
		assert.equal(result.isError, true);
		assert.match(text(result), /missing or empty/);
		assert.equal(p.dialogs.length, 0);
	});

	test("without UI it returns the plan and stays in plan mode", async () => {
		const p = await planning({ hasUI: false });
		writeFileSync(p.planFile, "# Plan\n1. A");
		const result = await p.tool("exit_plan_mode");
		assert.match(text(result), /plan mode stays active[\s\S]*# Plan/);
		assert.equal(p.appended.at(-1).data.mode, "plan");
	});

	test("approve here leaves plan mode with the plan as the result", async () => {
		const p = await planning({ answers: { select: "Approve and implement here" } });
		writeFileSync(p.planFile, "# Plan\n1. A");
		const result = await p.tool("exit_plan_mode");
		assert.equal(p.dialogs[0].kind, "select");
		assert.deepEqual(p.dialogs[0].options, ["Approve and implement here", "Approve and implement in a fresh session", "Give feedback", "Stay in plan mode and pause"]);
		assert.equal(result.terminate, undefined);
		assert.match(text(result), /approved the plan\. Build mode is active[\s\S]*# Plan/);
		assert.deepEqual(p.appended.at(-1).data, { mode: "build", approvedPlanFile: p.planFile });
		assert.equal(p.thinking, "medium");
		assert.deepEqual(result.details, { planModeDelivered: { mode: "build" } });
		assert.equal(await p.beforeAgentStart(), undefined, "the tool result already told the model");
	});

	test("approve fresh terminates, blocks later calls, and dispatches implement-fresh at agent_end", async () => {
		const p = await planning({ answers: { select: "Approve and implement in a fresh session" } });
		writeFileSync(p.planFile, "# Plan\n1. A");
		const result = await p.tool("exit_plan_mode");
		assert.equal(result.terminate, true);
		const blocked = await p.toolCall("read", { path: "x" });
		assert.deepEqual([blocked.block, blocked.terminate], [true, true]);
		await p.agentEnd();
		assert.deepEqual(p.userMessages, [{ text: "/plan implement-fresh", options: { expandPromptTemplates: true } }]);
		await p.agentEnd();
		assert.equal(p.userMessages.length, 1, "dispatched once");
		assert.equal(await p.toolCall("read", { path: "x" }), undefined, "block lifted after dispatch");

		await p.command("implement-fresh");
		const [session] = p.newSessions;
		assert.equal(session.parentSession, "/sessions/current.jsonl");
		const seeded = [];
		await session.setup({ appendCustomEntry: (type, data) => seeded.push({ type, data }) });
		assert.deepEqual(seeded, [{ type: "plan-mode", data: { mode: "build", approvedPlanFile: p.planFile } }]);
		const prompts = [];
		await session.withSession({ sendUserMessage: async (message) => prompts.push(message) });
		assert.match(prompts[0], /approved it[\s\S]*Plan file: [\s\S]*# Plan\n1\. A/);
	});

	test("feedback keeps plan mode; empty feedback, pause, and dismissal terminate without approval", async () => {
		const withFeedback = await planning({ answers: { select: "Give feedback", editor: " Add tests " } });
		writeFileSync(withFeedback.planFile, "# Plan");
		const result = await withFeedback.tool("exit_plan_mode");
		assert.match(text(result), /feedback:\n\nAdd tests\n/);
		assert.equal(result.terminate, undefined);
		assert.equal(withFeedback.appended.at(-1).data.mode, "plan");

		for (const answers of [{ select: "Give feedback", editor: "  " }, { select: "Stay in plan mode and pause" }, { select: undefined }]) {
			const p = await planning({ answers });
			writeFileSync(p.planFile, "# Plan");
			const dismissed = await p.tool("exit_plan_mode");
			assert.equal(dismissed.terminate, true);
			assert.match(dismissed.content[0].text, /The plan was not approved\. Plan mode stays active; wait for the user's next message\./);
			assert.doesNotMatch(dismissed.content[0].text, /dismissed/);
			assert.match(text(dismissed), /not approved/);
			assert.equal(p.appended.at(-1).data.mode, "plan");
		}
	});

	test("implement-fresh without an approved plan reports an error", async () => {
		const h = harness();
		await h.start();
		await h.command("implement-fresh");
		assert.equal(h.newSessions.length, 0);
		assert.equal(h.notices.at(-1).type, "error");
	});

	test("session start hides exit_plan_mode in build mode", async () => {
		const h = harness({ active: ["read", "exit_plan_mode", "enter_plan_mode"] });
		await h.start();
		assert.deepEqual(h.active, ["read", "enter_plan_mode"]);
		await h.command("on");
		assert.deepEqual(h.active, ["read", "exit_plan_mode"]);
		await h.command("off");
		assert.deepEqual(h.active, ["read", "enter_plan_mode"]);
	});
});

describe("phase 2: notes, reminder, thinking", () => {
	test("entering sets thinking; the next prompt carries one hidden enter note", async () => {
		const h = harness();
		await h.start();
		await h.command("on");
		assert.equal(h.thinking, "high");
		assert.equal(h.sent.length, 0, "no message is appended at toggle time");
		const { message } = await h.beforeAgentStart();
		assert.equal(message.customType, "plan-mode-enter");
		assert.equal(message.display, false);
		assert.deepEqual(message.details, { planModeDelivered: { mode: "plan", planFile: h.planFile } });
		assert.ok(message.content.includes(h.planFile));
		assert.match(message.content, /^<system-reminder>/);
		assert.match(message.content, /inquiry/);
		assert.match(message.content, /Summarize the plan in the chat/);
		assert.match(message.content, /Complex: /);
		assert.equal(await h.beforeAgentStart(), undefined, "sent once");
	});

	test("leaving restores thinking; the next prompt carries a leave note only if plan mode was announced", async () => {
		const h = harness();
		await h.start();
		await h.command("on");
		await h.beforeAgentStart();
		await h.command("off");
		assert.equal(h.thinking, "medium");
		const { message } = await h.beforeAgentStart();
		assert.equal(message.customType, "plan-mode-leave");
		assert.match(message.content, /Plan mode has ended/);
		assert.equal(await h.beforeAgentStart(), undefined);
	});

	test("toggling several times before a prompt yields at most one note for the final state", async () => {
		const h = harness();
		await h.start();
		await h.command("on");
		await h.command("off");
		assert.equal(await h.beforeAgentStart(), undefined, "on → off before a prompt: nothing to say");
		await h.command("on");
		await h.command("off");
		await h.command("on");
		const { message } = await h.beforeAgentStart();
		assert.equal(message.customType, "plan-mode-enter");
		assert.equal(await h.beforeAgentStart(), undefined);
	});

	test("context appends a short reminder only in plan mode", async () => {
		const h = harness();
		await h.start();
		const base = [{ role: "user", content: "hi", timestamp: 1 }];
		assert.equal(await h.context(base), undefined);
		await h.command("on");
		const result = await h.context(base);
		assert.equal(result.messages.length, 2);
		assert.equal(result.messages[0], base[0]);
		const text = result.messages[1].content[0].text;
		assert.match(text, /Plan mode is still active/);
		assert.ok(text.includes(h.planFile));
		assert.equal(base.length, 1, "input array is not mutated");
		await h.command("off");
		assert.equal(await h.context(base), undefined);
	});

	test("restore reads what was delivered: no repeat after a delivered note, enter note when missing", async () => {
		const planFile = join(scratch, "restored3.md");
		const stateEntry = { type: "custom", customType: STATE_ENTRY_TYPE, data: { mode: "plan", planFile, toolsBefore: ["read"] } };
		const deliveredNote = { type: "custom_message", customType: "plan-mode-enter", details: { planModeDelivered: { mode: "plan", planFile } } };
		const announced = harness({ entries: [stateEntry, deliveredNote] });
		await announced.start("resume");
		assert.equal(await announced.beforeAgentStart(), undefined);
		const silent = harness({ entries: [stateEntry] });
		await silent.start("resume");
		assert.equal((await silent.beforeAgentStart()).message.customType, "plan-mode-enter");
	});

	test("restored plan mode keeps the reminder", async () => {
		const planFile = join(scratch, "restored2.md");
		const h = harness({
			entries: [{ type: "custom", customType: STATE_ENTRY_TYPE, data: { mode: "plan", planFile, toolsBefore: ["read"], thinkingBefore: "low" } }],
		});
		await h.start("resume");
		assert.ok((await h.context([])).messages[0].content[0].text.includes(planFile));
		await h.command("off");
		assert.equal(h.thinking, "low");
	});
});

describe("prompt contract", () => {
	test("entry guidance excludes no-change discussions and redundant re-entry", () => {
		const guidance = ENTER_TOOL_GUIDELINES.join("\n");
		for (const text of [ENTER_TOOL_DESCRIPTION, guidance]) {
			assert.match(text, /proposals, discussions, (or|and) research scoping that change no files/);
			assert.match(text, /plan the user approved with exit_plan_mode that already covers the current work/);
			assert.match(text, /material change in scope or approach/);
		}
	});

	test("the enter note scopes the plan to the requested outcome", () => {
		const note = enterNote("/plans/p.md");
		assert.match(note, /^<system-reminder>\nPlan mode is active\. Plan the work; do not do it\./);
		assert.match(note, /requested outcome end to end, including the changes and verification/);
		assert.match(note, /unless the user asked only for that, and do not expand it beyond the request/);
	});
});

describe("extension wiring", () => {
	test("registers command, shortcut, flag, and hooks", () => {
		const h = harness();
		assert.ok(h.reg.commands.plan);
		assert.ok(h.reg.shortcuts["ctrl+alt+p"]);
		assert.equal(h.reg.flags.plan.type, "boolean");
		for (const name of ["tool_call", "context", "before_agent_start", "agent_end", "session_start", "session_tree"]) assert.ok(h.reg.handlers[name], name);
		assert.deepEqual(Object.keys(h.reg.tools), ["enter_plan_mode", "exit_plan_mode"]);
		assert.equal(h.reg.tools.exit_plan_mode.defaultActive, false);
		assert.equal(h.reg.tools.enter_plan_mode.defaultActive, undefined);
		assert.deepEqual(h.reg.commands.plan.getArgumentCompletions("o").map((i) => i.value), ["on", "off"]);
		assert.equal(h.reg.commands.plan.getArgumentCompletions("x"), null);
	});

	test("/plan toggles tools, status, and persisted state", async () => {
		const h = harness();
		await h.start();
		await h.command();
		assert.deepEqual(h.active, ["read", "bash", "edit", "write", "grep"]);
		assert.equal(h.status["plan-mode"], "⏸ plan");
		assert.deepEqual(h.appended.at(-1).data, {
			mode: "plan", planFile: h.planFile, toolsBefore: ["read", "bash", "edit", "write", "grep", "custom"], thinkingBefore: "medium",
		});
		await h.command("off");
		assert.deepEqual(h.active, ["read", "bash", "edit", "write", "grep", "custom"]);
		assert.equal(h.status["plan-mode"], undefined);
		assert.deepEqual(h.appended.at(-1).data, { mode: "build" });
	});

	test("write guard allows only the plan file in plan mode", async () => {
		const h = harness();
		await h.start();
		assert.equal(await h.toolCall("write", { path: "src/a.ts", content: "" }), undefined);
		await h.command("on");
		assert.equal(await h.toolCall("write", { path: h.planFile, content: "" }), undefined);
		assert.equal(await h.toolCall("edit", { path: h.planFile, edits: [] }), undefined);
		const blocked = await h.toolCall("edit", { path: "src/a.ts", edits: [] });
		assert.equal(blocked.block, true);
		assert.match(blocked.reason, /may only modify the plan file/);
		assert.equal((await h.toolCall("write", { content: "" })).block, true);
		assert.equal(await h.toolCall("bash", { command: "rm -rf x" }), undefined);
	});

	test("/plan path reports the plan file; unknown args report usage", async () => {
		const h = harness();
		await h.start();
		await h.command("path");
		assert.match(h.notices.at(-1).message, /No plan file/);
		await h.command("on");
		await h.command("path");
		assert.equal(h.notices.at(-1).message, `Plan file: ${h.planFile}`);
		await h.command("bogus");
		assert.equal(h.notices.at(-1).type, "error");
	});

	test("repeated on/off are reported without new entries", async () => {
		const h = harness();
		await h.start();
		await h.command("off");
		assert.equal(h.appended.length, 0);
		await h.command("on");
		await h.command("on");
		assert.equal(h.appended.length, 1);
		assert.match(h.notices.at(-1).message, /Already in plan mode/);
	});

	test("--plan enters plan mode on startup only", async () => {
		const startup = harness({ flag: true });
		await startup.start("startup");
		assert.equal(startup.appended.at(-1).data.mode, "plan");
		const resumed = harness({ flag: true });
		await resumed.start("resume");
		assert.equal(resumed.appended.length, 0);
	});

	test("session start restores plan mode from the branch", async () => {
		const planFile = join(scratch, "restored.md");
		const h = harness({
			entries: [{ type: "custom", customType: STATE_ENTRY_TYPE, data: { mode: "plan", planFile, toolsBefore: ["read", "edit", "custom"] } }],
		});
		await h.start("resume");
		assert.deepEqual(h.active, ["read", "edit"]);
		assert.equal(h.status["plan-mode"], "⏸ plan");
		assert.equal((await h.toolCall("edit", { path: "x.ts", edits: [] })).block, true);
		assert.equal(await h.toolCall("edit", { path: planFile, edits: [] }), undefined);
	});
});

describe("phase 4: delivery and shortcut", () => {
	test("latestDelivered reads notes, tool results, and legacy notes", async () => {
		const { latestDelivered } = await import("../extensions/plan-mode/delivery.ts");
		assert.deepEqual(latestDelivered([]), { mode: "build" });
		assert.deepEqual(latestDelivered([{ type: "custom_message", customType: "plan-mode-enter" }]), { mode: "plan" });
		assert.deepEqual(latestDelivered([
			{ type: "custom_message", customType: "plan-mode-enter", details: { planModeDelivered: { mode: "plan", planFile: "/p.md" } } },
			{ type: "message", message: { role: "toolResult", details: { planModeDelivered: { mode: "build" } } } },
			{ type: "message", message: { role: "assistant" } },
			{ type: "custom_message", customType: "other" },
		]), { mode: "build" });
		assert.deepEqual(latestDelivered([
			{ type: "message", message: { role: "toolResult", details: { planModeDelivered: { mode: "plan", planFile: "/q.md" } } } },
		]), { mode: "plan", planFile: "/q.md" });
	});

	test("enter_plan_mode marks plan mode as delivered by its result", async () => {
		const h = harness();
		await h.start();
		const result = await h.tool("enter_plan_mode");
		assert.deepEqual(result.details, { planModeDelivered: { mode: "plan", planFile: h.planFile } });
		assert.equal(await h.beforeAgentStart(), undefined);
	});

	test("shortcut comes from config; config warnings show once at session start", async () => {
		const h = harness({ shortcut: "shift+tab", warnings: ["bad value"] });
		assert.deepEqual(Object.keys(h.reg.shortcuts), ["shift+tab"]);
		await h.start();
		await h.command("on");
		assert.equal(h.notices.filter((n) => n.message === "plan-mode: bad value").length, 1);
	});

	test("config accepts a shortcut and rejects invalid ones", () => {
		const read = (data) => () => JSON.stringify(data);
		assert.equal(loadConfig({ env: {}, home: "/h", readFile: read({ shortcut: "Shift+Tab" }) }).config.shortcut, "shift+tab");
		const bad = loadConfig({ env: {}, home: "/h", readFile: read({ shortcut: "shift tab!" }) });
		assert.equal(bad.config.shortcut, "ctrl+alt+p");
		assert.match(bad.warnings[0], /shortcut/);
	});
});
