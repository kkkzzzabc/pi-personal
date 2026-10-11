/** Optional <agentDir>/subagent.json. Invalid configuration never falls back silently. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE_NAME = "subagent.json";
export const MIN_REVIEW_MODELS = 2;
export const MAX_REVIEW_MODELS = 4;
export const MAX_FALLBACK_MODELS = 8;

export interface RoleConfig {
	model?: string;
	/** Explorer only; ordered error recovery, not quality escalation. */
	fallbackModels?: string[];
}

export interface SubagentConfig {
	agents: Record<string, RoleConfig>;
	review?: { models: string[] };
}

export interface LoadConfigResult {
	config: SubagentConfig;
	path: string;
	error?: string;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadConfig(
	agentDir: string,
	roleNames: readonly string[],
	readFile: (path: string) => string = (file) => readFileSync(file, "utf8"),
): LoadConfigResult {
	const path = join(agentDir, CONFIG_FILE_NAME);
	const config: SubagentConfig = { agents: {} };
	const fail = (reason: string): LoadConfigResult => ({ config: { agents: {} }, path, error: `${path}: ${reason}` });
	let data: unknown;
	try {
		data = JSON.parse(readFile(path));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config, path };
		return fail(`${error instanceof SyntaxError ? "invalid JSON" : "cannot read"}: ${(error as Error).message}`);
	}
	if (!object(data)) return fail("must contain a JSON object.");
	const unknownKeys = Object.keys(data).filter((key) => key !== "agents" && key !== "review");
	if (unknownKeys.length) return fail(`unknown key(s): ${unknownKeys.join(", ")}.`);
	if (data.agents !== undefined && !object(data.agents)) return fail('"agents" must be an object.');
	for (const [role, value] of Object.entries(data.agents ?? {})) {
		if (!roleNames.includes(role)) return fail(`unknown agent "${role}"; expected one of ${roleNames.join(", ")}.`);
		if (!object(value)) return fail(`"agents.${role}" must be an object.`);
		const extra = Object.keys(value).filter((key) => key !== "model" && !(role === "explorer" && key === "fallbackModels"));
		if (extra.length) return fail(`"agents.${role}" has unknown key(s): ${extra.join(", ")}.`);
		const { model, fallbackModels } = value;
		if (model !== undefined && (typeof model !== "string" || !model.trim())) return fail(`"agents.${role}.model" must be a non-empty string.`);
		if (fallbackModels !== undefined && (!Array.isArray(fallbackModels) || fallbackModels.length > MAX_FALLBACK_MODELS || fallbackModels.some((m) => typeof m !== "string" || !m.trim()))) {
			return fail(`"agents.${role}.fallbackModels" must be an array of at most ${MAX_FALLBACK_MODELS} non-empty strings.`);
		}
		config.agents[role] = {
			...(typeof model === "string" ? { model: model.trim() } : {}),
			...(Array.isArray(fallbackModels) ? { fallbackModels: fallbackModels.map((m: string) => m.trim()) } : {}),
		};
	}
	if (data.review !== undefined) {
		if (!object(data.review) || Object.keys(data.review).some((key) => key !== "models")) return fail('"review" must be an object containing only "models".');
		const models = data.review.models;
		if (!Array.isArray(models) || models.length < MIN_REVIEW_MODELS || models.length > MAX_REVIEW_MODELS || models.some((m) => typeof m !== "string" || !m.trim())) {
			return fail(`"review.models" must contain ${MIN_REVIEW_MODELS}-${MAX_REVIEW_MODELS} non-empty model strings.`);
		}
		const trimmed = models.map((m: string) => m.trim());
		if (new Set(trimmed).size !== trimmed.length) return fail('"review.models" must contain distinct models.');
		config.review = { models: trimmed };
	}
	return { config, path };
}
