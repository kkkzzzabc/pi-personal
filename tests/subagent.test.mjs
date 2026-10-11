import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { parseRole, ROLE_NAMES, ROLE_SPECS, ROLE_TOOLS } from "../extensions/subagent/agents.ts";
import { loadConfig } from "../extensions/subagent/config.ts";
import { formatResult, MAX_TASKS, parseRequests, PROMPT_GUIDELINES, resultDetails } from "../extensions/subagent/extension.ts";
import { callText, oneLine, resultText, reviewSummary, reviewSummaryText } from "../extensions/subagent/render.ts";
import { countLines, outputDir, outputFileName, previewOutput, PREVIEW_CHARS, saveOutput } from "../extensions/subagent/output.ts";
import {
	boundDiffText, captureBaseline, createReviewDiffTool, HEAD_MOVED_TEXT, MAX_UNTRACKED_FILES, NO_BASELINE_TEXT,
	REVIEW_DIFF_MAX_CHARS, reviewDiffText, validateDiffPath,
} from "../extensions/subagent/review-diff.ts";
import { finalText, sumUsage } from "../extensions/subagent/runner.ts";

const scratch = mkdtempSync(join(tmpdir(), "subagent-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function makeRepo(name) {
	const dir = join(scratch, name);
	mkdirSync(dir, { recursive: true });
	git(dir, "init", "-q");
	git(dir, "config", "user.email", "t@example.com");
	git(dir, "config", "user.name", "t");
	git(dir, "config", "commit.gpgsign", "false");
	writeFileSync(join(dir, "a.txt"), "one\n");
	writeFileSync(join(dir, "b.txt"), "bee\n");
	git(dir, "add", ".");
	git(dir, "commit", "-q", "-m", "init");
	return dir;
}

describe("config", () => {
	const read = (text) => () => text;
	const enoent = () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };

	test("missing file means defaults without error", () => {
		const result = loadConfig("/agent", ROLE_NAMES, enoent);
		assert.deepEqual(result.config, { agents: {} });
		assert.equal(result.error, undefined);
		assert.equal(result.path, "/agent/subagent.json");
	});

	test("valid role models are read and trimmed", () => {
		const result = loadConfig("/agent", ROLE_NAMES, read('{"agents":{"reviewer":{"model":" p/m:high "},"explorer":{}}}'));
		assert.equal(result.error, undefined);
		assert.deepEqual(result.config.agents, { reviewer: { model: "p/m:high" }, explorer: {} });
	});

	test("explorer fallback and independent review roster are trimmed", () => {
		const result = loadConfig("/agent", ROLE_NAMES, read(JSON.stringify({ agents: { explorer: { model: " p/m ", fallbackModels: [" q/b:high "] } }, review: { models: [" a/1 ", "a/2", "a/3", "a/4"] } })));
		assert.equal(result.error, undefined);
		assert.deepEqual(result.config.agents.explorer, { model: "p/m", fallbackModels: ["q/b:high"] });
		assert.deepEqual(result.config.review.models, ["a/1", "a/2", "a/3", "a/4"]);
	});

	test("review rosters accept two through four explicit models and the recommended example", () => {
		for (const count of [2, 3, 4]) {
			const models = Array.from({ length: count }, (_, i) => ` p/m${i}:high `);
			const result = loadConfig("/agent", ROLE_NAMES, read(JSON.stringify({ review: { models } })));
			assert.equal(result.error, undefined);
			assert.deepEqual(result.config.review.models, models.map((m) => m.trim()));
		}
		const example = readFileSync(new URL("../extensions/subagent/subagent.example.json", import.meta.url), "utf8");
		const result = loadConfig("/agent", ROLE_NAMES, read(example));
		assert.equal(result.error, undefined);
		assert.deepEqual(result.config.review.models, ["anthropic/claude-opus-5-5:high", "openai/gpt-6.1-sol:high"]);
	});

	for (const [text, pattern] of [
		["{", /invalid JSON/],
		["[]", /JSON object/],
		['{"agent":{}}', /unknown key/],
		['{"agents":[]}', /must be an object/],
		['{"agents":{"worker":{}}}', /unknown agent "worker"/],
		['{"agents":{"reviewer":{"model":""}}}', /non-empty string/],
		['{"agents":{"reviewer":{"model":"x","tools":[]}}}', /unknown key/],
		['{"agents":{"reviewer":{"fallbackModels":["p/m"]}}}', /unknown key/],
		['{"agents":{"explorer":{"fallbackModels":"p/m"}}}', /array/],
		['{"agents":{"explorer":{"fallbackModels":[""]}}}', /non-empty strings/],
		[JSON.stringify({ agents: { explorer: { fallbackModels: Array(9).fill("p/m") } } }), /at most 8/],
		['{"review":{"models":[]}}', /2-4/],
		['{"review":{"models":["a/1"]}}', /2-4/],
		['{"review":{"models":["a/1","a/2","a/3","a/4","a/5"]}}', /2-4/],
		['{"review":{"models":["a/1",null]}}', /non-empty/],
		['{"review":{"models":["a/1"," "]}}', /non-empty/],
		['{"review":{"models":["a/1"," a/1 "]}}', /distinct/],
		['{"review":{"models":["a/1","a/2","a/3",""]}}', /non-empty/],
		['{"review":{"models":["a/1","a/1","a/3","a/4"]}}', /distinct/],
		['{"review":{"models":["a/1","a/2","a/3","a/4"],"unknown":true}}', /only "models"/],
	]) {
		test(`invalid config is an error, not a fallback: ${text}`, () => {
			const result = loadConfig("/agent", ROLE_NAMES, read(text));
			assert.match(result.error ?? "", pattern);
			assert.deepEqual(result.config, { agents: {} });
		});
	}
});

describe("roles", () => {
	const parse = (content) => {
		const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
		const frontmatter = Object.fromEntries((match?.[1] ?? "").split("\n").map((line) => line.split(/:\s*/, 2)));
		return { frontmatter, body: match?.[2] ?? content };
	};

	test("tools are fixed per role: read-only, no delegation", () => {
		assert.deepEqual([...ROLE_TOOLS.explorer], ["read", "grep", "find", "ls"]);
		assert.deepEqual([...ROLE_TOOLS.reviewer], ["read", "grep", "find", "ls", "review_diff"]);
		for (const tools of Object.values(ROLE_TOOLS)) {
			for (const forbidden of ["bash", "edit", "write", "subagent"]) assert.equal(tools.includes(forbidden), false);
		}
	});

	test("context-file policy: reviewer follows the parent, explorer gets none", () => {
		assert.equal(ROLE_SPECS.reviewer.contextFiles, "parent");
		assert.equal(ROLE_SPECS.explorer.contextFiles, "none");
		assert.equal(parseRole("explorer", "---\nname: explorer\ndescription: d\n---\nP", parse).contextFiles, "none");
	});

	test("parseRole reads frontmatter and body", () => {
		const role = parseRole("reviewer", "---\nname: reviewer\ndescription: Review things\n---\nPrompt body\n", parse);
		assert.equal(role.description, "Review things");
		assert.equal(role.prompt, "Prompt body");
		assert.equal(role.reviewDiff, true);
		assert.equal(parseRole("explorer", "---\nname: explorer\ndescription: d\n---\nP", parse).reviewDiff, false);
	});

	test("parseRole rejects a wrong name, missing description, or empty body", () => {
		assert.throws(() => parseRole("reviewer", "---\nname: explorer\ndescription: d\n---\nP", parse), /name must be "reviewer"/);
		assert.throws(() => parseRole("reviewer", "---\nname: reviewer\n---\nP", parse), /description is required/);
		assert.throws(() => parseRole("reviewer", "---\nname: reviewer\ndescription: d\n---\n  ", parse), /body is empty/);
	});
});

describe("output", () => {
	test("output files go next to the parent session, else to a per-process temp directory", () => {
		assert.equal(outputDir("/s/2026_abc.jsonl"), "/s/2026_abc/subagents");
		assert.equal(outputDir(undefined, "/tmp", 42), "/tmp/pi-subagent-42");
		assert.equal(outputFileName("reviewer", 3, new Date(2026, 9, 11, 9, 5, 7, 8)), "20261011-090507-008-reviewer-3.md");
	});

	test("short output stays whole", () => {
		assert.equal(previewOutput("short", { path: "/x", bytes: 5, lines: 1 }), "short");
	});

	test("long output becomes a preview plus the file reference, cut at a line end", () => {
		const text = `${"line\n".repeat(500)}tail`;
		const saved = saveOutput(join(scratch, "out", "r.md"), text);
		assert.equal(readFileSync(saved.path, "utf8"), text);
		assert.equal(saved.lines, 501);
		const preview = previewOutput(text, saved);
		const [head] = preview.split("\n…\n");
		assert.ok(head.length <= PREVIEW_CHARS);
		assert.ok(head.endsWith("line"));
		assert.match(preview, new RegExp(`Full output: ${saved.path} \\(2\\.4 KB, 501 lines\\)\\. Read it if needed\\.$`));
	});

	test("without a saved file, long output stays whole", () => {
		const text = "x".repeat(PREVIEW_CHARS + 10);
		assert.equal(previewOutput(text, undefined), text);
	});

	test("the cut does not split a surrogate pair", () => {
		const text = `${"a".repeat(PREVIEW_CHARS - 1)}😀${"b".repeat(10)}`;
		const head = previewOutput(text, { path: "/x", bytes: 1, lines: 1 }).split("\n…\n")[0];
		assert.equal(head, "a".repeat(PREVIEW_CHARS - 1));
	});

	test("countLines", () => {
		assert.equal(countLines(""), 0);
		assert.equal(countLines("a"), 1);
		assert.equal(countLines("a\n"), 1);
		assert.equal(countLines("a\nb"), 2);
	});
});

describe("result extraction", () => {
	const assistant = (text, extra = {}) => ({ role: "assistant", content: [{ type: "text", text }], ...extra });

	test("finalText takes the last non-error assistant text", () => {
		assert.equal(finalText([assistant("first"), { role: "toolResult" }, assistant("final")]), "final");
		assert.equal(finalText([assistant("good"), assistant("bad", { stopReason: "error", errorMessage: "x" })]), "good");
		assert.equal(finalText([{ role: "assistant", content: [{ type: "toolCall" }] }]), "");
	});

	test("sumUsage adds assistant usage", () => {
		const usage = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.5 } };
		assert.deepEqual(sumUsage([assistant("a", { usage }), assistant("b", { usage }), { role: "user" }]), {
			input: 2, output: 4, cacheRead: 6, cacheWrite: 8, cost: 1,
		});
	});

	test("formatResult and resultDetails", () => {
		const result = {
			agent: "explorer", model: "p/m", status: "completed", durationMs: 1500, toolCalls: 1,
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 }, output: "out", preview: "out",
			outputFile: { path: "/o.md", bytes: 3, lines: 1 }, warnings: ["w"],
		};
		assert.equal(formatResult(result), "## explorer · p/m · completed (1.5s, 1 tool call)\nWarning: w\n\nout");
		assert.deepEqual(resultDetails(result, "the task"), {
			agent: "explorer", task: "the task", model: "p/m", status: "completed", durationMs: 1500, toolCalls: 1, usage: result.usage,
			text: "out", outputFile: "/o.md", outputSize: "3 B", warnings: ["w"],
		});
	});

	test("guidelines state the invocation rules per role", () => {
		assert.ok(PROMPT_GUIDELINES.some((line) => line.includes("\"explorer\" on your own judgment")));
		assert.ok(PROMPT_GUIDELINES.some((line) => line.includes("\"reviewer\" only when the user or applicable instructions ask")));
	});
});

describe("review_diff", () => {
	test("path validation", () => {
		assert.equal(validateDiffPath(undefined), undefined);
		assert.equal(validateDiffPath("  "), undefined);
		assert.equal(validateDiffPath("src/a.ts"), "src/a.ts");
		for (const bad of ["-p", "--output=x", "/etc", "../x", "a/../../b", ":(top)x"]) {
			assert.throws(() => validateDiffPath(bad), /review_diff path/, bad);
		}
	});

	test("boundDiffText caps output with a hint", () => {
		const text = "x".repeat(REVIEW_DIFF_MAX_CHARS + 100);
		const bounded = boundDiffText(text);
		assert.equal(bounded.length, REVIEW_DIFF_MAX_CHARS);
		assert.match(bounded, /narrower path/);
	});

	test("outside a repository there is no baseline", async () => {
		const dir = join(scratch, "plain");
		mkdirSync(dir, { recursive: true });
		assert.equal(captureBaseline(dir), undefined);
		assert.equal(await reviewDiffText(undefined, {}), NO_BASELINE_TEXT);
		const tool = createReviewDiffTool(undefined);
		assert.deepEqual((await tool.execute("id", {})).content, [{ type: "text", text: NO_BASELINE_TEXT }]);
		assert.deepEqual(tool.annotations, { readOnlyHint: true });
	});

	test("shows staged, unstaged, and untracked changes; path and stat narrow it", async () => {
		const repo = makeRepo("repo1");
		const baseline = captureBaseline(repo);
		assert.ok(baseline);
		assert.match(await reviewDiffText(baseline, {}), /No working-tree changes/);
		writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
		writeFileSync(join(repo, "b.txt"), "bee\nstaged\n");
		git(repo, "add", "b.txt");
		writeFileSync(join(repo, "new.txt"), "new\n");
		const full = await reviewDiffText(baseline, {});
		assert.match(full, /\+two/);
		assert.match(full, /\+staged/);
		assert.match(full, /Untracked files \(inspect with read\):\n {2}new\.txt/);
		const onlyA = await reviewDiffText(baseline, { path: "a.txt" });
		assert.match(onlyA, /\+two/);
		assert.doesNotMatch(onlyA, /staged|new\.txt/);
		const stat = await reviewDiffText(baseline, { stat: true });
		assert.match(stat, /a\.txt \| 1 \+/);
		assert.doesNotMatch(stat, /\+two/);
		await assert.rejects(reviewDiffText(baseline, { path: "../x" }), /must not contain/);
	});

	test("untracked files are listed up to the limit", async () => {
		const repo = makeRepo("repo2");
		const baseline = captureBaseline(repo);
		for (let i = 0; i < MAX_UNTRACKED_FILES + 3; i++) writeFileSync(join(repo, `u${String(i).padStart(3, "0")}.txt`), "u");
		const text = await reviewDiffText(baseline, {});
		assert.match(text, /\.\.\. 3 more untracked files/);
	});

	test("a moved HEAD is reported instead of a diff", async () => {
		const repo = makeRepo("repo3");
		const baseline = captureBaseline(repo);
		writeFileSync(join(repo, "a.txt"), "changed\n");
		git(repo, "commit", "-q", "-am", "second");
		assert.equal(await reviewDiffText(baseline, {}), HEAD_MOVED_TEXT);
	});
});

describe("requests", () => {
	test("review form expands the explicit roster and rejects mixtures", () => {
		const models = ["p/a", "p/b", "p/c", "p/d"];
		for (const count of [2, 3, 4]) {
			const roster = models.slice(0, count);
			assert.deepEqual(parseRequests({ review: { task: " shared " } }, roster), roster.map((model) => ({ agent: "reviewer", task: "shared", model })));
		}
		for (const count of [0, 1, 5]) assert.throws(() => parseRequests({ review: { task: "r" } }, Array(count).fill("p/a")), /2-4 distinct/);
		for (const params of [{ review: { task: "r" }, agent: "reviewer", task: "x" }, { review: { task: "r" }, tasks: [] }]) assert.throws(() => parseRequests(params, models), /mixture/);
		for (const review of [null, [], {}, { task: "" }, { task: "r", model: "p/a" }]) assert.throws(() => parseRequests({ review }, models), /review/);
		assert.throws(() => parseRequests({ review: { task: "r" } }), /Configure review.models/);
	});
	test("single form", () => {
		assert.deepEqual(parseRequests({ agent: "explorer", task: " find x ", model: " p/m " }), [{ agent: "explorer", task: "find x", model: "p/m" }]);
		assert.deepEqual(parseRequests({ agent: "reviewer", task: "t" }), [{ agent: "reviewer", task: "t" }]);
	});

	test("parallel form", () => {
		const tasks = [{ agent: "explorer", task: "a" }, { agent: "reviewer", task: "b", model: "p/m" }];
		assert.deepEqual(parseRequests({ tasks }), [{ agent: "explorer", task: "a" }, { agent: "reviewer", task: "b", model: "p/m" }]);
	});

	for (const [params, pattern] of [
		[{}, /Provide agent and task, or tasks/],
		[{ agent: "explorer", task: "a", tasks: [{ agent: "explorer", task: "b" }] }, /either agent\+task or tasks/],
		[{ tasks: [] }, new RegExp(`1-${MAX_TASKS} items`)],
		[{ tasks: Array.from({ length: MAX_TASKS + 1 }, () => ({ agent: "explorer", task: "x" })) }, /1-4 items/],
		[{ agent: "worker", task: "a" }, /unknown role "worker"/],
		[{ tasks: [{ agent: "explorer", task: "ok" }, { agent: "explorer", task: " " }] }, /tasks\[1\]: task must be a non-empty string/],
		[{ agent: "explorer", task: "a", model: "" }, /model must be a non-empty string/],
	]) {
		test(`rejects ${JSON.stringify(params).slice(0, 60)}`, () => assert.throws(() => parseRequests(params), pattern));
	}
});

describe("render", () => {
	const theme = { fg: (color, text) => `<${color}>${text}</${color}>`, bold: (text) => `*${text}*` };
	const plain = { fg: (_c, text) => text, bold: (text) => text };

	test("review summaries describe coverage, not agreement", () => {
		const row = (status) => ({ status });
		const partial = reviewSummaryText(reviewSummary([row("completed"), row("failed"), row("aborted"), row("failed")]));
		assert.match(partial, /partial \(1\/4 succeeded, 2 failed, 1 aborted, 0 pending\)/);
		assert.match(partial, /not all configured models returned a review/);
		assert.match(partial, /Do not claim agreement across all configured models/);
		assert.doesNotMatch(partial, /full-model agreement/);
		const pending = reviewSummaryText(reviewSummary([row("completed"), row("running")]));
		assert.match(pending, /1 pending.*Review in progress/); assert.doesNotMatch(pending, /returned a review/);
		const none = reviewSummaryText(reviewSummary([row("failed"), row("aborted")]));
		assert.match(none, /none.*No review verdict is available/);
		const complete = reviewSummaryText(reviewSummary([row("completed"), row("completed")]));
		assert.match(complete, /complete \(2\/2 succeeded/); assert.doesNotMatch(complete, /agreement|incomplete|No review verdict/);
	});
	test("oneLine flattens and shortens", () => {
		assert.equal(oneLine("a\n  b"), "a b");
		assert.equal(oneLine("x".repeat(100), 10), `${"x".repeat(9)}…`);
	});

	test("call text for single and parallel calls", () => {
		assert.equal(callText({ review: { task: "Review this" } }, plain), "subagent configured review Review this");
		assert.equal(callText({ agent: "explorer", task: "Find\nit" }, plain), "subagent explorer Find it");
		assert.equal(callText({ agent: "reviewer", task: "t", model: "p/m" }, plain), "subagent reviewer [p/m] t");
		assert.equal(callText({ tasks: [{ agent: "reviewer", task: "a" }, { agent: "explorer", task: "b" }] }, plain),
			"subagent 2 in parallel\n  reviewer a\n  explorer b");
		assert.match(callText({ agent: "explorer", task: "t" }, theme), /^<toolTitle>\*subagent\*<\/toolTitle> <accent>explorer<\/accent>/);
	});

	test("progress rows show the running tool", () => {
		const rows = [
			{ agent: "explorer", task: "a", status: "running", model: "p/m", toolCalls: 2, currentTool: "grep" },
			{ agent: "reviewer", task: "b", status: "starting", toolCalls: 0 },
		];
		assert.equal(resultText(rows, { expanded: false }, plain), "… explorer p/m 2 tool calls · running grep\n… reviewer 0 tool calls");
	});

	test("finished rows collapse to three lines and expand fully", () => {
		const rows = [
			{ agent: "explorer", task: "a", status: "completed", model: "p/m", toolCalls: 1, durationMs: 1200, text: "1\n2\n3\n4\n5" },
			{ agent: "reviewer", task: "b", status: "failed", model: "p/m", toolCalls: 0, durationMs: 5, text: "boom" },
		];
		assert.equal(resultText(rows, { expanded: false }, plain),
			"✓ explorer p/m completed (1.2s, 1 tool call)\n  1\n  2\n  3\n  … 2 more lines\n✗ reviewer p/m failed (5ms, 0 tool calls)\n  boom");
		assert.match(resultText(rows, { expanded: true }, plain), /\n {2}5\n/);
		assert.match(resultText(rows, { expanded: false }, theme), /<error>boom<\/error>/);
	});
});
