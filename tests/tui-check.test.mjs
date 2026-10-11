import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { countLines, findResumeCommand, listSessionFiles, relaunchCommand, sessionIdFromFile } from "../skills/tui-check/scripts/finish.mjs";
import {
	DEFAULT_EXHAUSTED_TEXT, entryValue, lastUserText, parseScenario, resolveTemplates, shellQuote, summarizeMessage,
} from "../skills/tui-check/scripts/lib.ts";
import {
	buildLaunchScript, buildPiArgs, changedFiles, FAUX_MODEL, fingerprint, footerModelId, parseArgs, userAgentDir,
} from "../skills/tui-check/scripts/start.mjs";

const scratch = mkdtempSync(join(tmpdir(), "tui-check-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe("scenario", () => {
	test("accepts text, thinking, and tool calls", () => {
		const scenario = parseScenario({
			responses: [{ text: "a" }, { thinking: "t", text: "b" }, { toolCalls: [{ name: "write", args: { path: "x" } }, { name: "ls" }] }],
		});
		assert.equal(scenario.whenExhausted, DEFAULT_EXHAUSTED_TEXT);
		assert.deepEqual(scenario.responses[2].toolCalls, [{ name: "write", args: { path: "x" } }, { name: "ls", args: {} }]);
	});

	for (const [label, data, pattern] of [
		["non-object", [], /expected a JSON object/],
		["missing responses", {}, /responses: expected an array/],
		["empty step", { responses: [{}] }, /needs text, thinking, or toolCalls/],
		["unknown key", { responses: [{ txt: "a" }] }, /\.txt: unknown key/],
		["bad tool call", { responses: [{ toolCalls: [{ args: {} }] }] }, /toolCalls\[0\]\.name/],
		["empty tool calls", { responses: [{ toolCalls: [] }] }, /non-empty array/],
		["bad exhausted", { responses: [], whenExhausted: 1 }, /whenExhausted/],
	]) {
		test(`rejects ${label}`, () => assert.throws(() => parseScenario(data), pattern));
	}
});

describe("templates", () => {
	const entries = [
		{ type: "custom", customType: "plan-mode", data: { planFile: "/old.md" } },
		{ type: "message" },
		{ type: "custom", customType: "plan-mode", data: { planFile: "/new.md", nested: { n: 2 } } },
		{ type: "custom", customType: "other", data: { planFile: "/other.md" } },
	];
	const context = { cwd: "/w", env: { NAME: "v" }, entries, lastUser: "hi" };

	test("entryValue reads the latest matching entry", () => {
		assert.equal(entryValue(entries, "plan-mode.planFile"), "/new.md");
		assert.equal(entryValue(entries, "plan-mode.nested.n"), 2);
		assert.equal(entryValue(entries, "missing.x"), undefined);
	});

	test("resolves deep values", () => {
		const resolved = resolveTemplates(
			{ path: "{{cwd}}/a", content: "{{ lastUser }} {{env:NAME}}", list: ["{{entry:plan-mode.planFile}}", 3], n: { m: "{{entry:plan-mode.nested.n}}" } },
			context,
		);
		assert.deepEqual(resolved, { path: "/w/a", content: "hi v", list: ["/new.md", 3], n: { m: "2" } });
	});

	for (const template of ["{{env:MISSING}}", "{{entry:plan-mode.nope}}", "{{bogus}}"]) {
		test(`fails on ${template}`, () => assert.throws(() => resolveTemplates(template, context)));
	}

	test("lastUser fails before any user message", () => {
		assert.throws(() => resolveTemplates("{{lastUser}}", { ...context, lastUser: undefined }), /no user message/);
	});
});

describe("message summaries", () => {
	test("system message joins content and sections", () => {
		assert.deepEqual(summarizeMessage({ role: "system", content: "base", sections: { a: "A", b: null } }), { role: "system", text: "base\n\nA" });
	});

	test("assistant tool calls, tool results, custom messages, images", () => {
		assert.deepEqual(
			summarizeMessage({ role: "assistant", content: [{ type: "text", text: "t" }, { type: "toolCall", name: "write", arguments: { path: "p" } }] }),
			{ role: "assistant", text: "t", toolCalls: [{ name: "write", arguments: { path: "p" } }] },
		);
		assert.deepEqual(summarizeMessage({ role: "toolResult", toolName: "write", isError: true, content: [{ type: "text", text: "no" }] }), {
			role: "toolResult", toolName: "write", isError: true, text: "no",
		});
		assert.deepEqual(summarizeMessage({ role: "custom", customType: "x", content: "c" }), { role: "custom", customType: "x", text: "c" });
		assert.equal(summarizeMessage({ role: "user", content: [{ type: "image" }, { type: "text", text: "q" }] }).images, 1);
	});

	test("lastUserText", () => {
		assert.equal(lastUserText([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: [{ type: "text", text: "c" }] }]), "c");
		assert.equal(lastUserText([]), undefined);
	});

	test("shellQuote", () => {
		assert.equal(shellQuote("/a/b-c.ts"), "/a/b-c.ts");
		assert.equal(shellQuote("it's x"), `'it'\\''s x'`);
	});
});

describe("start options", () => {
	test("parses repeatable and valued options", () => {
		const options = parseArgs(["--scenario", "s.json", "--extension", "a.ts", "--extension=b.ts", "--skill", "sk", "--pi-arg", "--plan", "--context-files", "--agent-file", "plan-mode.json=src.json"]);
		assert.deepEqual(options.extension, ["a.ts", "b.ts"]);
		assert.deepEqual(options["pi-arg"], ["--plan"]);
		assert.equal(options["context-files"], true);
		assert.deepEqual(options["agent-file"], ["plan-mode.json=src.json"]);
	});

	for (const [label, argv, pattern] of [
		["missing mode", [], /--scenario <file> \(faux\) or --real-model/],
		["both modes", ["--scenario", "s", "--real-model", "a/b"], /either --scenario/],
		["model pattern", ["--real-model", "*sonnet*"], /exact <provider>\/<model-id>/],
		["thinking suffix", ["--real-model", "a/b:high"], /exact <provider>\/<model-id>/],
		["agent file in real mode", ["--real-model", "a/b", "--agent-file", "x=y"], /not allowed in real mode/],
		["unknown option", ["--scenario", "s", "--nope", "x"], /Unknown option/],
		["missing value", ["--scenario"], /needs a value/],
		["bad size", ["--scenario", "s", "--cols", "wide"], /positive integer/],
		["escaping agent file", ["--scenario", "s", "--agent-file", "../x=y"], /agent-file/],
		["absolute agent file", ["--scenario", "s", "--agent-file", "/x=y"], /agent-file/],
		["positional", ["s.json"], /Unexpected argument/],
	]) {
		test(`rejects ${label}`, () => assert.throws(() => parseArgs(argv), pattern));
	}

	test("pi args isolate discovery and load the observer last", () => {
		const options = parseArgs(["--scenario", "s", "--extension", "/e.ts", "--theme", "/t.json", "--thinking", "low", "--tools", "read,write", "--pi-arg", "--plan"]);
		const args = buildPiArgs(options, { sessionDir: "/s", fauxModel: "/f.ts", observer: "/o.ts" });
		assert.equal(options.mode, "faux");
		assert.deepEqual(args, [
			"-ne", "-ns", "-np", "--no-themes", "--no-mcp", "--offline", "--session-dir", "/s", "-nc",
			"-e", "/e.ts", "--theme", "/t.json", "-e", "/f.ts", "-e", "/o.ts", "--model", FAUX_MODEL,
			"--thinking", "low", "--tools", "read,write", "--plan",
		]);
		assert.equal(buildPiArgs(parseArgs(["--scenario", "s", "--context-files"]), { sessionDir: "/s", fauxModel: "f", observer: "o" }).includes("-nc"), false);
	});

	test("real mode: no faux model, default thinking low, exact model", () => {
		const options = parseArgs(["--real-model", "anthropic/claude-x", "--extension", "/e.ts"]);
		assert.equal(options.mode, "real");
		assert.equal(options.thinking, "low");
		assert.equal(parseArgs(["--real-model", "a/b", "--thinking", "high"]).thinking, "high");
		const args = buildPiArgs(options, { sessionDir: "/s", fauxModel: "/f.ts", observer: "/o.ts" });
		assert.equal(args.includes("/f.ts"), false);
		assert.deepEqual(args.slice(-6), ["-e", "/o.ts", "--model", "anthropic/claude-x", "--thinking", "low"]);
		assert.ok(args.includes("--no-mcp") && args.includes("-ne") && args.includes("-ns"));
		assert.equal(footerModelId("anthropic/claude-x"), "claude-x");
		assert.equal(footerModelId("openrouter/a/b"), "a/b");
	});

	test("userAgentDir follows pi's rule", () => {
		assert.equal(userAgentDir({}, "/h"), "/h/.pi/agent");
		assert.equal(userAgentDir({ PI_CODING_AGENT_DIR: "~/x" }, "/h"), "/h/x");
		assert.equal(userAgentDir({ PI_CODING_AGENT_DIR: "/abs" }, "/h"), "/abs");
	});

	test("fingerprints detect changed, added, and removed files", () => {
		const dir = join(scratch, "agent-fp");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "settings.json"), "{}");
		writeFileSync(join(dir, "trust.json"), "{}");
		const before = fingerprint(dir);
		assert.equal(before["keybindings.json"], null);
		assert.match(before["settings.json"], /^[0-9a-f]{64}$/);
		writeFileSync(join(dir, "settings.json"), "{\"theme\":\"x\"}");
		writeFileSync(join(dir, "keybindings.json"), "{}");
		rmSync(join(dir, "trust.json"));
		assert.deepEqual(changedFiles(before, fingerprint(dir)), ["keybindings.json", "settings.json", "trust.json"]);
		assert.deepEqual(changedFiles(before, before), []);
	});

	test("launch script exports env, quotes args, and forwards extra args", () => {
		const script = buildLaunchScript({ pi: "/bin/pi", workDir: "/w d", env: { A: "x y" }, args: ["-e", "/p q.ts"] });
		assert.match(script, /^cd '\/w d' \|\| exit 1$/m);
		assert.match(script, /^export A='x y'$/m);
		assert.match(script, /^\/bin\/pi -e '\/p q\.ts' "\$@"$/m);
		assert.match(script, /pi exited with status/);
	});
});

describe("finish helpers", () => {
	test("resume and relaunch commands", () => {
		const screen = "x\nTo resume this session: pi --session-dir /s --session 01abc\nbash$";
		assert.equal(findResumeCommand(screen), "pi --session-dir /s --session 01abc");
		assert.equal(findResumeCommand("nothing"), undefined);
		const file = "/s/2026-10-10T18-47-06-518Z_01a12723-e616-767a-a50d-c650591ba16c.jsonl";
		assert.equal(sessionIdFromFile(file), "01a12723-e616-767a-a50d-c650591ba16c");
		assert.equal(relaunchCommand("/r/launch.sh", [file]), "bash /r/launch.sh --session 01a12723-e616-767a-a50d-c650591ba16c");
		assert.equal(relaunchCommand("/r/launch.sh", []), undefined);
		const newer = "/s/2026-10-10T19-23-32-557Z_01a12745-414d-778d-8ed5-b4f4277bab51.jsonl";
		assert.equal(relaunchCommand("/r/launch.sh", [newer, file]), "bash /r/launch.sh --session 01a12745-414d-778d-8ed5-b4f4277bab51", "latest session wins");
	});

	test("session files and log lines", () => {
		const dir = join(scratch, "sessions");
		mkdirSync(join(dir, "nested"), { recursive: true });
		writeFileSync(join(dir, "b.jsonl"), "");
		writeFileSync(join(dir, "nested", "a.jsonl"), "");
		writeFileSync(join(dir, "skip.txt"), "");
		assert.deepEqual(listSessionFiles(dir), [join(dir, "b.jsonl"), join(dir, "nested", "a.jsonl")]);
		assert.deepEqual(listSessionFiles(join(scratch, "missing")), []);
		const log = join(scratch, "log.jsonl");
		writeFileSync(log, "{}\n\n{}\n");
		assert.equal(countLines(log), 2);
		assert.equal(countLines(join(scratch, "none")), 0);
	});
});
