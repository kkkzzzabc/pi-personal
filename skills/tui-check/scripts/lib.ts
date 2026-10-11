/**
 * Pure helpers shared by tui-check scripts and extensions (no pi imports).
 *
 * - Scenario parsing and validation for the faux model.
 * - Template resolution: {{cwd}}, {{env:NAME}}, {{entry:<customType>.<dot.path>}}, {{lastUser}}.
 * - Message summaries for the model-input log.
 */

export interface ScenarioToolCall {
	name: string;
	args: Record<string, unknown>;
}

export interface ScenarioStep {
	text?: string;
	thinking?: string;
	toolCalls?: ScenarioToolCall[];
}

export interface Scenario {
	responses: ScenarioStep[];
	whenExhausted: string;
}

export const DEFAULT_EXHAUSTED_TEXT = "[tui-check] Scenario exhausted.";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a parsed scenario object. Throws with a path-qualified message. */
export function parseScenario(data: unknown): Scenario {
	if (!isRecord(data)) throw new Error("scenario: expected a JSON object");
	if (!Array.isArray(data.responses)) throw new Error("scenario.responses: expected an array");
	const responses = data.responses.map((step, index): ScenarioStep => {
		const at = `scenario.responses[${index}]`;
		if (!isRecord(step)) throw new Error(`${at}: expected an object`);
		const result: ScenarioStep = {};
		for (const key of Object.keys(step)) {
			if (!["text", "thinking", "toolCalls"].includes(key)) throw new Error(`${at}.${key}: unknown key`);
		}
		if (step.text !== undefined) {
			if (typeof step.text !== "string") throw new Error(`${at}.text: expected a string`);
			result.text = step.text;
		}
		if (step.thinking !== undefined) {
			if (typeof step.thinking !== "string") throw new Error(`${at}.thinking: expected a string`);
			result.thinking = step.thinking;
		}
		if (step.toolCalls !== undefined) {
			if (!Array.isArray(step.toolCalls) || step.toolCalls.length === 0) {
				throw new Error(`${at}.toolCalls: expected a non-empty array`);
			}
			result.toolCalls = step.toolCalls.map((call, callIndex) => {
				const callAt = `${at}.toolCalls[${callIndex}]`;
				if (!isRecord(call) || typeof call.name !== "string" || call.name === "") {
					throw new Error(`${callAt}.name: expected a non-empty string`);
				}
				if (call.args !== undefined && !isRecord(call.args)) throw new Error(`${callAt}.args: expected an object`);
				return { name: call.name, args: (call.args as Record<string, unknown> | undefined) ?? {} };
			});
		}
		if (result.text === undefined && result.thinking === undefined && result.toolCalls === undefined) {
			throw new Error(`${at}: needs text, thinking, or toolCalls`);
		}
		return result;
	});
	if (data.whenExhausted !== undefined && typeof data.whenExhausted !== "string") {
		throw new Error("scenario.whenExhausted: expected a string");
	}
	return { responses, whenExhausted: (data.whenExhausted as string | undefined) ?? DEFAULT_EXHAUSTED_TEXT };
}

export interface EntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface TemplateContext {
	cwd: string;
	env: Record<string, string | undefined>;
	entries: readonly EntryLike[];
	lastUser?: string;
}

/** Value at `<customType>.<dot.path>` in the latest matching custom entry (oldest-first list). */
export function entryValue(entries: readonly EntryLike[], ref: string): unknown {
	const [customType, ...path] = ref.split(".");
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== customType) continue;
		let value: unknown = entry.data;
		for (const key of path) {
			if (!isRecord(value)) return undefined;
			value = value[key];
		}
		return value;
	}
	return undefined;
}

const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

function resolveOne(expression: string, context: TemplateContext): string {
	if (expression === "cwd") return context.cwd;
	if (expression === "lastUser") {
		if (context.lastUser === undefined) throw new Error("{{lastUser}}: no user message yet");
		return context.lastUser;
	}
	if (expression.startsWith("env:")) {
		const value = context.env[expression.slice(4)];
		if (value === undefined) throw new Error(`{{${expression}}}: environment variable not set`);
		return value;
	}
	if (expression.startsWith("entry:")) {
		const value = entryValue(context.entries, expression.slice(6));
		if (value === undefined || value === null) throw new Error(`{{${expression}}}: no matching custom entry value`);
		return typeof value === "string" ? value : JSON.stringify(value);
	}
	throw new Error(`{{${expression}}}: unknown template`);
}

/** Resolve templates in every string inside `value` (deep). Throws on unresolved templates. */
export function resolveTemplates<T>(value: T, context: TemplateContext): T {
	if (typeof value === "string") {
		return value.replace(TEMPLATE, (_match, expression: string) => resolveOne(expression.trim(), context)) as T;
	}
	if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, context)) as T;
	if (isRecord(value)) {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, context)])) as T;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Model-input log
// ---------------------------------------------------------------------------

interface Block {
	type: string;
	text?: string;
	thinking?: string;
	name?: string;
	arguments?: unknown;
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as Block[])
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

export interface LoggedMessage {
	role: string;
	customType?: string;
	toolName?: string;
	isError?: boolean;
	text: string;
	toolCalls?: { name: string; arguments: unknown }[];
	images?: number;
}

/** Compact, JSON-safe view of an agent message for the model-input log. */
export function summarizeMessage(message: Record<string, unknown>): LoggedMessage {
	const role = typeof message.role === "string" ? message.role : "unknown";
	const summary: LoggedMessage = { role, text: "" };
	if (typeof message.customType === "string") summary.customType = message.customType;
	if (typeof message.toolName === "string") summary.toolName = message.toolName;
	if (typeof message.isError === "boolean") summary.isError = message.isError;
	if (role === "system") {
		const parts = [contentText(message.content)];
		if (isRecord(message.sections)) {
			for (const text of Object.values(message.sections)) if (typeof text === "string") parts.push(text);
		}
		summary.text = parts.filter((part) => part.length > 0).join("\n\n");
		return summary;
	}
	summary.text = contentText(message.content);
	if (Array.isArray(message.content)) {
		const blocks = message.content as Block[];
		const calls = blocks.filter((block) => block?.type === "toolCall");
		if (calls.length > 0) summary.toolCalls = calls.map((call) => ({ name: String(call.name), arguments: call.arguments }));
		const images = blocks.filter((block) => block?.type === "image").length;
		if (images > 0) summary.images = images;
	}
	return summary;
}

/** Text of the latest user message, if any. */
export function lastUserText(messages: readonly Record<string, unknown>[]): string | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		if (messages[index].role === "user") return contentText(messages[index].content);
	}
	return undefined;
}

/** Quote a string for POSIX sh. */
export function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'\\''`)}'`;
}
