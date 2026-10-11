import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LIMITS, normalizeForm, PARAMETERS, safeDisplay } from "../extensions/ask-user/schema.ts";
import { FormController, resultContent } from "../extensions/ask-user/controller.ts";
import { createAskUserExtension, GUIDELINES } from "../extensions/ask-user/extension.ts";
import { QuestionComponent } from "../extensions/ask-user/ui.ts";

const choice = (type = "single", id = "mode") => ({ id, prompt: "Which mode?", type, options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }] });
const input = (...questions) => ({ questions: questions.length ? questions : [choice()] });
const form = (...questions) => normalizeForm(input(...questions));
const text = { id: "note", prompt: "Describe it", type: "text" };
const keyMap = { "tui.select.up": "up", "tui.select.down": "down", "tui.select.confirm": "enter", "tui.select.cancel": "escape", "tui.select.pageUp": "pageUp", "tui.select.pageDown": "pageDown", "tui.input.submit": "enter", "tui.input.newLine": "shift+enter" };
const keys = { matches: (data, name) => data === keyMap[name], getKeys: (name) => [keyMap[name]] };
const theme = { fg: (_color, str) => str };
class Editor {
	text = ""; focused = false;
	setText(text) { this.text = text; }
	getText() { return this.text; }
	getExpandedText() { return this.text; }
	invalidate() {}
	render() { return [this.text + "<cursor>"]; }
	handleInput(data) { if (data === "enter") this.onSubmit?.(this.text); else this.text += data === "shift+enter" ? "\n" : data; }
}
const lib = {
	Editor, Text: class { constructor(text) { this.text = text; } },
	matchesKey: (data, key) => data === key,
	Key: { tab: "tab", right: "right", left: "left", space: "space", ctrl: (key) => `ctrl+${key}`, shift: (key) => `shift+${key}` },
	CURSOR_MARKER: "<cursor>",
	wrapTextWithAnsi: (text, width) => text.split("\n").flatMap((line) => { const chars = Array.from(line); const out = []; do { out.push(chars.splice(0, width).join("")); } while (chars.length); return out; }),
	truncateToWidth: (text, width) => Array.from(text).slice(0, width).join(""),
};
function harness(custom) {
	let tool; const handlers = new Map(); let component; let deliver; let aborted = 0; let opens = 0;
	createAskUserExtension(lib)({ registerTool: (t) => { tool = t; }, on: (name, handler) => handlers.set(name, handler) });
	const ctx = { hasUI: true, mode: "tui", abort: () => { aborted++; }, ui: { custom: custom ?? ((factory) => new Promise((resolve) => {
		opens++; deliver = resolve; component = factory({ terminal: { rows: 40 }, requestRender() {} }, theme, keys, resolve); component.focused = true;
	})) } };
	return { tool, ctx, handlers, get component() { return component; }, get aborted() { return aborted; }, get opens() { return opens; }, deliver: (value) => deliver(value), run: (args = input(), signal) => tool.execute("call", args, signal, undefined, ctx) };
}

describe("schema", () => {
	test("flat public schema and normalized recommendations", () => {
		assert.equal(PARAMETERS.properties.questions.maxItems, 4);
		const q = { ...choice(), recommended: ["a"] };
		assert.deepEqual(form(q).questions[0].recommended, ["a"]);
		assert.deepEqual(form(text).questions[0].options, []);
	});
	for (const [name, args, pattern] of [
		["empty", { questions: [] }, /1-4/],
		["no questions", {}, /1-4/],
		["too many", input(...Array.from({ length: 5 }, (_, i) => choice("single", `q${i}`))), /1-4/],
		["duplicate IDs", input(choice(), choice()), /Duplicate/],
		["blank ID", input({ ...choice(), id: "  " }), /blank/],
		["blank prompt", input({ ...choice(), prompt: "  " }), /blank/],
		["unsafe prompt", input({ ...choice(), prompt: "\x1b[2J" }), /control/],
		["prompt bound", input({ ...choice(), prompt: "x".repeat(LIMITS.prompt + 1) }), /exceeds/],
		["unknown type", input({ ...choice(), type: "wat" }), /type/],
		["unknown field", input({ ...choice(), required: true }), /unknown/],
		["one option", input({ ...choice(), options: [choice().options[0]] }), /2-8/],
		["too many options", input({ ...choice(), options: Array.from({ length: 9 }, (_, i) => ({ value: `${i}`, label: `${i}` })) }), /2-8/],
		["duplicate values", input({ ...choice(), options: [choice().options[0], choice().options[0]] }), /duplicate/],
		["text options", input({ ...text, options: [] }), /cannot/],
		["text recommendation", input({ ...text, recommended: [] }), /cannot/],
		["unknown recommendation", input({ ...choice(), recommended: ["z"] }), /recommended/],
		["repeated recommendation", input({ ...choice("multi"), recommended: ["a", "a"] }), /recommended/],
		["single multiple recommendations", input({ ...choice(), recommended: ["a", "b"] }), /recommended/],
	]) test(name, () => assert.throws(() => normalizeForm(args), pattern));
	test("boundary sizes, trimming, and display escaping", () => {
		assert.equal(form({ ...choice(), prompt: "x".repeat(LIMITS.prompt) }).questions[0].prompt.length, LIMITS.prompt);
		assert.equal(normalizeForm({ ...input(), context: " line\r\nnext " }).context, "line\nnext");
		assert.equal(safeDisplay("a\x1b[2J"), "a\\u001b[2J");
	});
});

describe("controller", () => {
	test("no recommendation or focus is implicitly selected", () => {
		const c = new FormController(form({ ...choice(), recommended: ["a"] }));
		assert.equal(c.finish().outcome, "needs_discussion");
		assert.deepEqual(c.finish().unansweredIds, ["mode"]);
	});
	test("single alternatives are exclusive but drafts survive switching", () => {
		const c = new FormController(form()); c.choose(0, "a"); c.set(0, "custom", "C"); c.set(0, "comment", "No dependency");
		assert.deepEqual(c.responses()[0], { questionId: "mode", answered: true, selectedValues: [], customText: "C", comment: "No dependency" });
		c.choose(0, "b"); assert.deepEqual(c.responses()[0].selectedValues, ["b"]); assert.equal(c.drafts[0].custom, "C");
		assert.equal(c.responses()[0].customText, undefined);
	});
	test("multi selected values and custom/comment remain distinct", () => {
		const c = new FormController(form(choice("multi"))); c.choose(0, "b"); c.choose(0, "a"); c.set(0, "custom", "Search"); c.set(0, "comment", "No personal data");
		assert.deepEqual(c.responses()[0].selectedValues, ["a", "b"]);
		c.choose(0, "a"); c.choose(0, "b"); assert.equal(c.responses()[0].answered, true);
		assert.equal(c.responses()[0].customText, "Search");
	});
	test("comment-only and blank text stay unanswered, partial is discussion", () => {
		const c = new FormController(form(choice(), text)); c.choose(0, "a"); c.set(1, "text", " \n "); c.set(1, "comment", "Explain first");
		const result = c.finish(); assert.equal(result.outcome, "needs_discussion"); assert.deepEqual(result.unansweredIds, ["note"]);
		assert.equal(result.responses[1].comment, "Explain first"); assert.match(resultContent(result), /not final decisions/);
	});
	test("explicit discussion with complete answers remains nonfinal", () => {
		const c = new FormController(form(text)); c.set(0, "text", "answer");
		assert.equal(c.finish().outcome, "submitted"); assert.equal(c.finish(true).outcome, "needs_discussion");
	});
	test("review edits and snapshots are detached", () => {
		const c = new FormController(form()); c.choose(0, "a"); c.go(1); const snapshot = c.finish(); c.go(0); c.choose(0, "b"); c.form.questions[0].prompt = "changed";
		assert.deepEqual(snapshot.responses[0].selectedValues, ["a"]); assert.equal(snapshot.form.questions[0].prompt, "Which mode?");
	});
	for (const field of ["text", "custom", "comment"]) test(`${field} limits retain drafts`, () => {
		const c = new FormController(form(field === "custom" ? choice() : text)); const value = "x".repeat(LIMITS[field === "comment" ? "comment" : "answer"] + 1); c.set(0, field, value);
		assert.throws(() => c.finish(), /exceeds/); assert.equal(c.drafts[0][field], value);
	});
	test("unknown choices fail", () => assert.throws(() => new FormController(form()).choose(0, "z"), /Unknown/));
});

describe("registration and lifecycle", () => {
	test("independent model-only sequential read-only registration", () => {
		const h = harness(); assert.equal(h.tool.exposure, "model-only"); assert.equal(h.tool.executionMode, "sequential"); assert.equal(h.tool.annotations.readOnlyHint, true);
		assert.deepEqual([...h.handlers.keys()], ["session_shutdown"]); assert.ok(GUIDELINES.some((s) => s.includes("routine implementation")));
	});
	for (const mode of ["rpc", "print", "json"]) test(`${mode} fails without opening`, async () => {
		const h = harness(); h.ctx.mode = mode; const result = await h.run(); assert.equal(result.details.outcome, "unavailable"); assert.equal(result.isError, true); assert.equal(h.opens, 0);
	});
	test("no UI and malformed input fail before opening", async () => {
		const h = harness(); h.ctx.hasUI = false; assert.equal((await h.run()).details.outcome, "unavailable"); h.ctx.hasUI = true;
		assert.equal((await h.run({ questions: [] })).details.outcome, "invalid"); assert.equal(h.opens, 0);
	});
	test("pre-abort does not open or register lingering listener", async () => {
		const h = harness(); const signal = AbortSignal.abort(); assert.equal((await h.run(input(), signal)).details.outcome, "aborted"); assert.equal(h.opens, 0);
	});
	test("submit and discussion expose faithful content", async () => {
		const h = harness(); const pending = h.run(); h.component.controller.choose(0, "a"); h.deliver({ kind: "submit" });
		const result = await pending; assert.equal(result.details.outcome, "submitted"); assert.match(result.content[0].text, /"a"/); assert.equal(h.aborted, 0);
		const next = h.run(); h.deliver({ kind: "discussion" }); assert.equal((await next).details.outcome, "needs_discussion");
	});
	test("whole Cancel aborts turn without leaking drafts", async () => {
		const h = harness(); const pending = h.run(); h.component.controller.set(0, "custom", "PRIVATE UNSENT"); h.component.handleInput("escape");
		const result = await pending; assert.equal(result.details.outcome, "cancelled"); assert.equal(h.aborted, 1); assert.equal(result.isError, true); assert.doesNotMatch(JSON.stringify(result), /PRIVATE UNSENT|responses/);
	});
	for (const stage of ["question", "editor", "review"]) test(`abort at ${stage} closes once and releases ownership`, async () => {
		const h = harness(); const ac = new AbortController(); let add = 0; let remove = 0;
		const originalAdd = ac.signal.addEventListener.bind(ac.signal), originalRemove = ac.signal.removeEventListener.bind(ac.signal);
		ac.signal.addEventListener = (...args) => { add++; return originalAdd(...args); }; ac.signal.removeEventListener = (...args) => { remove++; return originalRemove(...args); };
		const pending = h.run(input(text), ac.signal); const comp = h.component;
		if (stage === "editor") comp.handleInput("enter"); if (stage === "review") comp.handleInput("tab");
		ac.abort(); comp.handleInput("enter"); const result = await pending; assert.equal(result.details.outcome, "aborted"); assert.equal(add, remove);
		const next = h.run(); h.deliver({ kind: "discussion" }); assert.equal((await next).details.outcome, "needs_discussion");
	});
	test("overlap fails rather than queuing", async () => {
		const h = harness(); const first = h.run(); assert.equal((await h.run()).details.outcome, "busy"); assert.equal(h.opens, 1); h.deliver({ kind: "discussion" }); await first;
	});
	test("shutdown closes interaction, is idempotent and discards drafts", async () => {
		const h = harness(); const first = h.run(); h.component.controller.set(0, "comment", "UNSENT"); h.handlers.get("session_shutdown")(); h.handlers.get("session_shutdown")();
		const result = await first; assert.equal(result.details.outcome, "aborted"); assert.equal(h.aborted, 1); assert.doesNotMatch(JSON.stringify(result), /UNSENT/);
	});
	test("custom exception/undefined release ownership", async () => {
		const h = harness(async () => { throw new Error("UI failed"); }); assert.equal((await h.run()).details.outcome, "error"); assert.equal((await h.run()).details.outcome, "error");
		const unavailable = harness(async () => undefined); assert.equal((await unavailable.run()).details.outcome, "unavailable");
	});
	test("late result after abort cannot become submission", async () => {
		const h = harness(); const ac = new AbortController(); const first = h.run(input(), ac.signal); ac.abort(); h.deliver({ kind: "submit" }); assert.equal((await first).details.outcome, "aborted");
	});
	test("collapsed results use friendly labels without changing model-facing outcomes", () => {
		const h = harness(); const c = new FormController(form(choice(), text));
		c.choose(0, "a"); c.set(1, "text", "complete");
		for (const [discussion, label] of [[false, "Answers submitted"], [true, "For discussion"]]) {
			const details = c.finish(discussion);
			assert.equal(h.tool.renderResult({ details }, { expanded: false }, theme).text, `${label}: 2/2 answered`);
			assert.match(h.tool.renderResult({ details }, { expanded: true }, theme).text, new RegExp(details.outcome));
			assert.match(resultContent(details), new RegExp(details.outcome));
		}
		c.set(1, "text", "");
		assert.equal(h.tool.renderResult({ details: c.finish() }, { expanded: false }, theme).text, "For discussion: 1/2 answered; unanswered: note");
	});
	test("renderers handle partial/missing/error results safely", () => {
		const h = harness(); assert.doesNotThrow(() => h.tool.renderResult({ details: undefined }, { expanded: false }, theme));
		assert.doesNotMatch(h.tool.renderCall({ title: "\x1b[2J" }, theme).text, /\x1b/);
	});
});

describe("UI state", () => {
	function component(questions = [text]) { const c = new FormController(form(...questions)); const results = []; const ui = new QuestionComponent(c, { terminal: { rows: 20 }, requestRender() {} }, theme, keys, (value) => results.push(value), lib); ui.focused = true; return { c, ui, results }; }
	test("editor headings identify answer kinds and show actual remapped keys", () => {
		for (const [question, field, label] of [[text, "text", "Answer"], [choice(), "custom", "Alternative answer"], [choice("multi"), "custom", "Additional answer"], [text, "comment", "Comment"]]) {
			const c = new FormController(form(question));
			const remapped = { ...keys, getKeys: (name) => ({ "tui.select.cancel": ["alt+b", "ctrl+c"], "tui.input.submit": ["alt+s"], "tui.input.newLine": ["alt+n"] })[name] ?? keys.getKeys(name) };
			const ui = new QuestionComponent(c, { terminal: { rows: 24 }, requestRender() {} }, theme, remapped, () => {}, lib);
			ui.focused = true; ui.openEditor(field);
			const rendered = ui.render(80).join("\n");
			assert.match(rendered, new RegExp(`Question 1 · ${label}`));
			assert.match(rendered, /alt\+b Back \(keep edits\)/); assert.match(rendered, /alt\+s Save and return/);
			assert.match(rendered, /alt\+n New line/); assert.match(rendered, /ctrl\+c Cancel and stop/);
			assert.doesNotMatch(rendered, / · custom| · text| · comment/); ui.dispose();
		}
	});
	test("short editor reserves room for guidance and a cursor through resize", () => {
		const c = new FormController(form(text)); const terminal = { rows: 14 };
		const ui = new QuestionComponent(c, { terminal, requestRender() {} }, theme, keys, () => {}, lib);
		ui.focused = true; ui.openEditor("text");
		for (const width of [80, 32, 12]) {
			const lines = ui.render(width); assert.ok(lines.length <= 7); assert.ok(lines.every((line) => Array.from(line).length <= width));
			assert.ok(lines.some((line) => line.includes(lib.CURSOR_MARKER)));
			if (width >= 32) for (const label of ["Back (keep edits)", "Save and return", "New line", "Cancel and stop"]) assert.ok(lines.join("\n").includes(label));
		}
		ui.dispose();
	});
	test("discussion, submission, cancellation and answer labels explain their scope", () => {
		const { c, ui } = component([choice(), choice("multi", "extras")]);
		c.set(0, "custom", "Alternative"); c.set(1, "custom", "Extra");
		assert.match(ui.render(120).join("\n"), /Alternative answer: Alternative/);
		assert.match(ui.render(120).join("\n"), /discard these answers and stop the current response/);
		assert.ok(ui.rows().some((r) => r.label === "Send answers for discussion"));
		assert.match(ui.render(240).join("\n"), /move.*select.*cancel and stop.*questions\/review/);
		ui.handleInput("tab"); assert.match(ui.render(120).join("\n"), /Additional answer: Extra/);
		ui.handleInput("tab"); ui.scroll = 0; ui.manualScroll = true;
		const review = ui.render(240).join("\n");
		assert.match(review, /Alternative answer: Alternative/); assert.match(review, /Additional answer: Extra/);
		assert.match(review, /If any questions are unanswered/); assert.match(review, /not final decisions/);
		assert.ok(ui.rows().some((r) => r.label === "Submit answers")); assert.doesNotMatch(review, /Custom:|Custom draft:/);
	});
	test("editor Back preserves multiline draft and is not Cancel", () => {
		const { c, ui, results } = component(); ui.handleInput("enter"); ui.handleInput("line1"); ui.handleInput("shift+enter"); ui.handleInput("line2"); ui.handleInput("escape");
		assert.equal(c.drafts[0].text, "line1\nline2"); assert.deepEqual(results, []); ui.handleInput("escape"); assert.deepEqual(results, [{ kind: "cancel" }]);
	});
	test("unchanged Back from an empty alternative editor preserves the selected option", () => {
		const { c, ui } = component([choice()]); ui.handleInput("enter");
		ui.handleInput("down"); ui.handleInput("down"); ui.handleInput("enter"); ui.handleInput("escape");
		assert.deepEqual(c.responses()[0].selectedValues, ["a"]);
		assert.equal(c.responses()[0].answered, true); assert.equal(c.drafts[0].customActive, false);
	});
	test("unchanged Back does not reactivate a historical alternative draft", () => {
		const { c, ui } = component([choice()]); c.set(0, "custom", "C"); c.choose(0, "b");
		ui.handleInput("down"); ui.handleInput("down"); ui.handleInput("enter"); ui.handleInput("escape");
		assert.deepEqual(c.responses()[0].selectedValues, ["b"]);
		assert.equal(c.responses()[0].customText, undefined); assert.equal(c.drafts[0].custom, "C");
	});
	test("explicit Save can reactivate an unchanged historical alternative", () => {
		const { c, ui } = component([choice()]); c.set(0, "custom", "C"); c.choose(0, "b");
		ui.handleInput("down"); ui.handleInput("down"); ui.handleInput("enter"); ui.handleInput("enter");
		assert.deepEqual(c.responses()[0].selectedValues, []); assert.equal(c.responses()[0].customText, "C");
	});
	test("edited alternative Back still preserves and activates the new draft", () => {
		const { c, ui } = component([choice()]); c.choose(0, "a");
		ui.handleInput("down"); ui.handleInput("down"); ui.handleInput("enter"); ui.handleInput("C"); ui.handleInput("escape");
		assert.equal(c.drafts[0].custom, "C"); assert.deepEqual(c.responses()[0].selectedValues, []);
		assert.equal(c.responses()[0].customText, "C");
	});
	test("ctrl+c from the editor cancels rather than returning Back", () => {
		const { ui, results } = component(); ui.handleInput("enter"); ui.handleInput("ctrl+c");
		assert.deepEqual(results, [{ kind: "cancel" }]);
	});
	test("review supports explicit partial submission and double completion protection", () => {
		const { ui, results } = component(); ui.handleInput("tab"); ui.handleInput("enter"); ui.handleInput("enter"); assert.deepEqual(results, [{ kind: "submit" }]);
	});
	test("review uses displayed prompts and labels, not machine values", () => {
		const { c, ui } = component([choice()]); c.choose(0, "a"); ui.handleInput("tab");
		assert.match(ui.render(80).join("\n"), /Which mode\?[\s\S]*Answer: Alpha/);
	});
	test("editing review returns to question and drafts survive navigation", () => {
		const { c, ui } = component([text, choice()]); ui.handleInput("enter"); ui.handleInput("draft"); ui.handleInput("enter"); ui.handleInput("tab"); ui.handleInput("tab");
		assert.equal(c.review, true); ui.handleInput("up"); ui.handleInput("enter"); assert.equal(c.page, 1); assert.equal(c.drafts[0].text, "draft");
	});
	test("invalid submission leaves form and raw draft intact", () => {
		const { c, ui, results } = component(); c.set(0, "text", "x".repeat(LIMITS.answer + 1)); ui.handleInput("tab"); ui.handleInput("enter"); assert.deepEqual(results, []); assert.equal(c.drafts[0].text.length, LIMITS.answer + 1);
		assert.match(ui.render(80).at(-1), /Error:.*exceeds/);
	});
	test("bounded rendering, safe draft display, scrolling and focus propagation", () => {
		const { c, ui } = component(); c.set(0, "comment", "\x1b[2J"); const lines = ui.render(20); assert.ok(lines.length <= 13); assert.ok(lines.every((s) => Array.from(s).length <= 20)); assert.doesNotMatch(lines.join(""), /\x1b/);
		ui.handleInput("enter"); ui.render(20); assert.equal(ui.focused, true); ui.handleInput("escape"); ui.handleInput("pageDown"); assert.doesNotThrow(() => ui.render(10));
	});
});
