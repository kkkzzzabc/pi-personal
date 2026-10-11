import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { AppApprovals } from "../extensions/computer-use/approval.ts";
import { HelperClient, HelperError } from "../extensions/computer-use/helper-client.ts";
import { createComputerTools, explainError, formatState } from "../extensions/computer-use/tools.ts";

const scratch = mkdtempSync(join(tmpdir(), "computer-use-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const ui = (answers = []) => {
	const asked = [];
	return {
		asked,
		hasUI: true,
		confirm: async (title, message) => {
			asked.push(message);
			return answers.length ? answers.shift() : true;
		},
	};
};

describe("AppApprovals", () => {
	test("asks once per app and remembers approval", async () => {
		const approvals = new AppApprovals([], undefined);
		const u = ui([true]);
		await approvals.ensure({ id: "com.apple.calculator", name: "Calculator" }, u);
		await approvals.ensure({ id: "COM.APPLE.CALCULATOR" }, u);
		assert.equal(u.asked.length, 1);
		assert.match(u.asked[0], /Calculator \(com\.apple\.calculator\)/);
	});

	test("declined approval throws and is not remembered", async () => {
		const approvals = new AppApprovals([], undefined);
		await assert.rejects(approvals.ensure({ id: "a.b" }, ui([false])), /did not allow/);
		assert.equal(approvals.isApproved({ id: "a.b" }), false);
	});

	test("denied apps and the host terminal are refused without asking", async () => {
		const approvals = new AppApprovals(undefined, "com.example.HostTerm");
		const u = ui();
		await assert.rejects(approvals.ensure({ id: "com.apple.Terminal" }, u), /not allowed/);
		await assert.rejects(approvals.ensure({ id: "com.example.hostterm" }, u), /not allowed/);
		await assert.rejects(approvals.ensure({ id: "com.apple.keychainaccess" }, u), /not allowed/);
		assert.equal(u.asked.length, 0);
	});

	test("no UI refuses unapproved apps", async () => {
		const approvals = new AppApprovals([], undefined);
		await assert.rejects(approvals.ensure({ id: "a.b" }, { hasUI: false, confirm: async () => true }), /interactive UI/);
	});
});

/** Fake helper: echoes method/params, errors on method "fail", exits on "die", stalls on "hang". */
function fakeHelper() {
	const path = join(scratch, "fake-helper.mjs");
	writeFileSync(
		path,
		`#!/usr/bin/env node
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (method === "die") process.exit(7);
  if (method === "hang") return;
  if (method === "fail") return console.log(JSON.stringify({ id, error: { code: "stale_element", message: "gone" } }));
  // Respond in two chunks to exercise buffering.
  const out = JSON.stringify({ id, result: { method, params } });
  process.stdout.write(out.slice(0, 5));
  setTimeout(() => process.stdout.write(out.slice(5) + "\\n"), 5);
});
`,
	);
	chmodSync(path, 0o755);
	return path;
}

describe("HelperClient with a fake helper", () => {
	test("round-trips requests in order across chunked output", async () => {
		const client = new HelperClient(fakeHelper());
		try {
			const [a, b] = await Promise.all([client.request("one", { x: 1 }), client.request("two")]);
			assert.deepEqual(a, { method: "one", params: { x: 1 } });
			assert.deepEqual(b, { method: "two", params: {} });
		} finally {
			client.close();
		}
	});

	test("maps helper errors to HelperError", async () => {
		const client = new HelperClient(fakeHelper());
		try {
			await assert.rejects(client.request("fail"), (e) => e instanceof HelperError && e.code === "stale_element");
			assert.deepEqual(await client.request("after"), { method: "after", params: {} });
		} finally {
			client.close();
		}
	});

	test("restarts after the helper exits", async () => {
		const client = new HelperClient(fakeHelper());
		try {
			await assert.rejects(client.request("die"), (e) => e.code === "helper_exited");
			assert.deepEqual(await client.request("again"), { method: "again", params: {} });
		} finally {
			client.close();
		}
	});

	test("abort and timeout reject and do not block later requests", async () => {
		const client = new HelperClient(fakeHelper());
		try {
			const controller = new AbortController();
			const hung = client.request("hang", {}, { signal: controller.signal });
			setTimeout(() => controller.abort(), 50);
			await assert.rejects(hung, (e) => e.code === "aborted");
			await assert.rejects(client.request("hang", {}, { timeoutMs: 100 }), (e) => e.code === "timeout");
			assert.deepEqual(await client.request("ok"), { method: "ok", params: {} });
		} finally {
			client.close();
		}
	});

	test("missing binary names the build command", async () => {
		const client = new HelperClient(join(scratch, "no-helper"));
		await assert.rejects(client.request("x"), (e) => e.code === "helper_missing" && /build:cua-helper/.test(e.message));
	});
});

describe("computer tools with a mocked helper", () => {
	const make = (responses = {}) => {
		const calls = [];
		const helper = {
			async request(method, params) {
				calls.push({ method, params });
				const r = responses[method];
				if (r instanceof Error) throw r;
				return typeof r === "function" ? r(params) : r ?? { ok: true };
			},
		};
		const approvals = new AppApprovals(undefined, undefined);
		const tools = Object.fromEntries(createComputerTools(() => helper, () => approvals).map((t) => [t.name, t]));
		return { calls, tools, approvals };
	};
	const calc = { id: "com.apple.calculator", name: "Calculator", running: true };

	test("registers the expected tools with read-only flags", () => {
		const { tools } = make();
		assert.deepEqual(Object.keys(tools).sort(), [
			"computer_click",
			"computer_get_app_state",
			"computer_launch_app",
			"computer_list_apps",
			"computer_press_key",
			"computer_scroll",
			"computer_set_value",
			"computer_type_text",
		]);
		assert.equal(tools.computer_get_app_state.readOnly, true);
		assert.equal(tools.computer_click.readOnly, false);
	});

	test("click resolves, approves, and maps snake_case params to the helper", async () => {
		const { calls, tools } = make({ resolve_app: calc, click: { performed: "AXPress" } });
		const u = ui([true]);
		const result = await tools.computer_click.run({ app: "Calculator", element_index: 14 }, u);
		assert.deepEqual(calls.map((c) => c.method), ["resolve_app", "click"]);
		assert.deepEqual(JSON.parse(JSON.stringify(calls[1].params)), { app: "com.apple.calculator", elementIndex: 14 });
		assert.match(result.content[0].text, /AXPress/);
		assert.equal(u.asked.length, 1);
	});

	test("action acknowledgments identify the action and retain helper data without claiming app success", async () => {
		const helperResult = { performed: "synthetic-action", elementIndex: 14 };
		const cases = [
			["computer_click", { element_index: 14 }, "Click action completed."],
			["computer_type_text", { text: "PRIVATE INPUT" }, "Text input action completed."],
			["computer_press_key", { key: "return" }, "Key press action completed."],
			["computer_scroll", { direction: "down" }, "Scroll action completed."],
			["computer_set_value", { element_index: 14, value: "PRIVATE INPUT" }, "Set value action completed."],
		];
		for (const [name, params, acknowledgment] of cases) {
			const { tools } = make({ resolve_app: calc, [name.replace(/^computer_/, "")]: helperResult });
			const result = await tools[name].run({ app: "Calculator", ...params }, ui([true]));
			assert.ok(result.content[0].text.startsWith(acknowledgment));
			assert.match(result.content[0].text, /Call computer_get_app_state to see the result/);
			assert.ok(result.content[0].text.endsWith(`Helper result: ${JSON.stringify(helperResult)}`));
			assert.deepEqual(result.details, { app: calc, result: helperResult });
			assert.doesNotMatch(result.content[0].text, /PRIVATE INPUT|Done:|task succeeded/);
		}
	});
	test("denied app never reaches the action", async () => {
		const { calls, tools } = make({ resolve_app: { id: "com.apple.Terminal", name: "Terminal" } });
		await assert.rejects(tools.computer_type_text.run({ app: "Terminal", text: "rm -rf" }, ui()), /not allowed/);
		assert.deepEqual(calls.map((c) => c.method), ["resolve_app"]);
	});

	test("declined approval never reaches the action", async () => {
		const { calls, tools } = make({ resolve_app: calc });
		await assert.rejects(tools.computer_press_key.run({ app: "Calculator", key: "5" }, ui([false])), /did not allow/);
		assert.deepEqual(calls.map((c) => c.method), ["resolve_app"]);
	});

	test("get_app_state returns text and image content", async () => {
		const state = {
			app: calc,
			window: { title: "Calculator", x: 0, y: 0, width: 230, height: 408 },
			text: "[0] Window",
			nodeCount: 1,
			truncated: false,
			screenshot: { mimeType: "image/jpeg", data: "AAAA", width: 460, height: 816 },
		};
		const { tools } = make({ resolve_app: calc, get_app_state: state });
		const result = await tools.computer_get_app_state.run({ app: "Calculator" }, ui());
		assert.equal(result.content[1].type, "image");
		assert.match(result.content[0].text, /screenshot 460x816 px/);
		assert.match(result.content[0].text, /\[0\] Window/);
	});

	test("list_apps marks denied apps without approval", async () => {
		const { tools } = make({ list_apps: [calc, { id: "com.apple.Terminal", name: "Terminal" }] });
		const u = ui();
		const result = await tools.computer_list_apps.run({}, u);
		assert.match(result.content[0].text, /Terminal \(com\.apple\.Terminal\) \[not allowed\]/);
		assert.equal(u.asked.length, 0);
	});

	test("formatState and explainError", () => {
		const r = formatState({ app: calc, text: "(no window)", nodeCount: 0, truncated: false });
		assert.equal(r.content.length, 1);
		assert.match(r.content[0].text, /Window: none/);
		assert.match(explainError(new HelperError("permissions_missing", "No AX.")).message, /terminal/);
	});
});
