/**
 * Native computer-use tools (option B) backed by pi-cua-helper.
 * Tool shapes follow the mac window API recorded in
 * docs/research/2026-10-11-codex-sky-computer-use.md; no OpenAI code is used.
 */
import { type AppApprovals, type AppIdentity, type ApprovalUI } from "./approval.ts";
import { HelperError, type RequestOptions } from "./helper-client.ts";

export interface HelperLike {
	request<T = unknown>(method: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<T>;
}

export interface ToolContext extends ApprovalUI {
	signal?: AbortSignal;
}

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
	content: Content[];
	details: Record<string, unknown>;
}

export interface ComputerTool {
	name: string;
	label: string;
	description: string;
	parameters: Record<string, unknown>;
	readOnly: boolean;
	run(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

interface AppInfo extends AppIdentity {
	bundleName?: string;
	pid?: number;
	active?: boolean;
	running?: boolean;
}

interface AppState {
	app: AppInfo;
	window?: { title: string; x: number; y: number; width: number; height: number };
	text: string;
	nodeCount: number;
	truncated: boolean;
	screenshot?: { mimeType: string; data: string; width: number; height: number };
	screenshotError?: string;
}

const APP_PARAM = {
	type: "string",
	description: "App bundle id (preferred, e.g. com.apple.calculator), app name, or bundle file name.",
};
const INDEX_PARAM = { type: "integer", minimum: 0, description: "Element index from the latest computer_get_app_state." };
const COORD_NOTE = "Coordinates are pixels in the latest screenshot (window points when there was no screenshot).";
const AFTER_ACTION = "Call computer_get_app_state to see the result; element indexes may have changed.";

function object(properties: Record<string, unknown>, required: string[]) {
	return { type: "object", properties, required, additionalProperties: false };
}

function text(value: string, details: Record<string, unknown> = {}): ToolResult {
	return { content: [{ type: "text", text: value }], details };
}

/** Translate helper errors into model-facing guidance. */
export function explainError(error: unknown): Error {
	if (!(error instanceof HelperError)) return error instanceof Error ? error : new Error(String(error));
	switch (error.code) {
		case "permissions_missing":
			return new Error(
				`${error.message} macOS attributes this permission to the app hosting pi (the terminal). ` +
					"Ask the user to grant it in System Settings › Privacy & Security, then retry.",
			);
		case "stale_element":
		case "no_state":
			return new Error(`${error.message}`);
		default:
			return new Error(`${error.message} (${error.code})`);
	}
}

export function formatState(state: AppState): ToolResult {
	const header = [
		`App: ${state.app.name ?? ""} (${state.app.id})`,
		state.window
			? `Window: "${state.window.title}" ${state.window.width}x${state.window.height} pt` +
				(state.screenshot ? `, screenshot ${state.screenshot.width}x${state.screenshot.height} px` : "")
			: "Window: none",
		state.screenshotError ? `Screenshot unavailable: ${state.screenshotError}` : undefined,
		state.truncated ? `Tree truncated at ${state.nodeCount} nodes.` : undefined,
	].filter(Boolean);
	const content: Content[] = [{ type: "text", text: `${header.join("\n")}\n\n${state.text}` }];
	if (state.screenshot) content.push({ type: "image", data: state.screenshot.data, mimeType: state.screenshot.mimeType });
	return {
		content,
		details: { app: state.app, window: state.window, nodeCount: state.nodeCount, truncated: state.truncated },
	};
}

function requireString(params: Record<string, unknown>, key: string): string {
	const value = params[key];
	if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
	return value;
}

export function createComputerTools(getHelper: () => HelperLike, getApprovals: () => AppApprovals): ComputerTool[] {
	const call = async <T>(method: string, params: Record<string, unknown>, ctx: ToolContext): Promise<T> => {
		try {
			return await getHelper().request<T>(method, params, { signal: ctx.signal });
		} catch (error) {
			throw explainError(error);
		}
	};

	/** Resolve the app, enforce approval, and return its canonical id for the helper call. */
	const approve = async (params: Record<string, unknown>, ctx: ToolContext): Promise<AppInfo> => {
		const app = await call<AppInfo>("resolve_app", { app: requireString(params, "app") }, ctx);
		await getApprovals().ensure(app, ctx);
		return app;
	};

	const action = (
		name: string,
		label: string,
		description: string,
		properties: Record<string, unknown>,
		required: string[],
		toHelper: (params: Record<string, unknown>) => Record<string, unknown>,
	): ComputerTool => ({
		name,
		label,
		description: `${description} ${AFTER_ACTION}`,
		parameters: object({ app: APP_PARAM, ...properties }, ["app", ...required]),
		readOnly: false,
		async run(params, ctx) {
			const app = await approve(params, ctx);
			const result = await call<Record<string, unknown>>(name.replace(/^computer_/, ""), { app: app.id, ...toHelper(params) }, ctx);
			const acknowledgment: Record<string, string> = {
				computer_click: "Click action completed.",
				computer_type_text: "Text input action completed.",
				computer_press_key: "Key press action completed.",
				computer_scroll: "Scroll action completed.",
				computer_set_value: "Set value action completed.",
			};
			return text(`${acknowledgment[name]} ${AFTER_ACTION}\nHelper result: ${JSON.stringify(result)}`, { app, result });
		},
	});

	return [
		{
			name: "computer_list_apps",
			label: "List apps",
			description: "List running macOS apps (regular apps with a Dock presence) with their bundle ids.",
			parameters: object({}, []),
			readOnly: true,
			async run(_params, ctx) {
				const apps = await call<AppInfo[]>("list_apps", {}, ctx);
				const lines = apps.map((a) => {
					const flags = [a.active ? "active" : "", getApprovals().isDenied(a) ? "not allowed" : ""].filter(Boolean);
					return `- ${a.name} (${a.id})${flags.length ? ` [${flags.join(", ")}]` : ""}`;
				});
				return text(lines.join("\n") || "No running apps.", { apps });
			},
		},
		{
			name: "computer_get_app_state",
			label: "Get app state",
			description:
				"Read an app's front window: an indexed accessibility tree and, when permitted, a screenshot. " +
				"Call it before acting and again after every action; indexes are valid only until the next call.",
			parameters: object(
				{ app: APP_PARAM, screenshot: { type: "boolean", description: "Include a window screenshot (default true)." } },
				["app"],
			),
			readOnly: true,
			async run(params, ctx) {
				const app = await approve(params, ctx);
				const state = await call<AppState>("get_app_state", { app: app.id, screenshot: params.screenshot !== false }, ctx);
				return formatState(state);
			},
		},
		{
			name: "computer_launch_app",
			label: "Launch app",
			description: "Launch an installed app, or bring it to the front if it is running.",
			parameters: object({ app: APP_PARAM }, ["app"]),
			readOnly: false,
			async run(params, ctx) {
				const app = await approve(params, ctx);
				const launched = await call<AppInfo>("launch_app", { app: app.id }, ctx);
				return text(`Launched ${launched.name} (${launched.id}). ${AFTER_ACTION}`, { app: launched });
			},
		},
		action(
			"computer_click",
			"Click",
			`Click an element by index (uses its press action when possible) or at x/y. ${COORD_NOTE}`,
			{
				element_index: INDEX_PARAM,
				x: { type: "number" },
				y: { type: "number" },
				button: { type: "string", enum: ["left", "right"] },
				click_count: { type: "integer", minimum: 1, maximum: 3 },
			},
			[],
			(p) => ({ elementIndex: p.element_index, x: p.x, y: p.y, button: p.button, clickCount: p.click_count }),
		),
		action(
			"computer_type_text",
			"Type text",
			"Type text into the app's focused element. Focus a field first (click it) if needed.",
			{ text: { type: "string" } },
			["text"],
			(p) => ({ text: p.text }),
		),
		action(
			"computer_press_key",
			"Press key",
			"Press a key or chord such as `return`, `escape`, `tab`, `down`, `cmd+n`, or `cmd+shift+z` (US key positions).",
			{ key: { type: "string" } },
			["key"],
			(p) => ({ key: p.key }),
		),
		action(
			"computer_scroll",
			"Scroll",
			`Scroll over an element, at x/y, or over the window center. ${COORD_NOTE}`,
			{
				direction: { type: "string", enum: ["up", "down", "left", "right"] },
				element_index: INDEX_PARAM,
				x: { type: "number" },
				y: { type: "number" },
				amount: { type: "integer", minimum: 1, maximum: 50, description: "Lines to scroll (default 5)." },
			},
			["direction"],
			(p) => ({ direction: p.direction, elementIndex: p.element_index, x: p.x, y: p.y, amount: p.amount }),
		),
		action(
			"computer_set_value",
			"Set value",
			"Replace the value of an editable element (text field, text area) directly.",
			{ element_index: INDEX_PARAM, value: { type: "string" } },
			["element_index", "value"],
			(p) => ({ elementIndex: p.element_index, value: p.value }),
		),
	];
}
