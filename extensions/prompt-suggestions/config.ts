/** Independent configuration; never reads another extension's settings. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SuggestionsConfig {
	enabled: boolean;
	models: string[];
	timeoutMs: number;
	maxTokens: number;
	maxChars: number;
	maxContextChars: number;
	maxMessages: number;
}
export const DEFAULTS: SuggestionsConfig = {
	enabled: true,
	models: ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5"],
	timeoutMs: 30_000, maxTokens: 1024, maxChars: 240, maxContextChars: 12_000, maxMessages: 6,
};
export function modelRef(value: unknown): value is string {
	return typeof value === "string" && /^[a-zA-Z0-9_.-]+\/[^\s\x00-\x1f\x7f-\x9f]+$/.test(value);
}
export function validateConfig(data: unknown): Partial<SuggestionsConfig> {
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object");
	const value = data as Record<string, unknown>;
	if (Object.keys(value).some((key) => !Object.hasOwn(DEFAULTS, key))) throw new Error("Unknown configuration field");
	if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new Error("enabled must be a boolean");
	if (value.models !== undefined && (!Array.isArray(value.models) || value.models.length < 1 || value.models.length > 2 || !value.models.every(modelRef) || new Set(value.models).size !== value.models.length)) {
		throw new Error("models must contain one or two distinct exact provider/model IDs");
	}
	const bounds: Record<string, [number, number]> = { timeoutMs: [100, 60_000], maxTokens: [128, 4096], maxChars: [20, 500], maxContextChars: [500, 24_000], maxMessages: [2, 12] };
	for (const [key, [min, max]] of Object.entries(bounds)) {
		const v = value[key];
		if (v !== undefined && (!Number.isInteger(v) || (v as number) < min || (v as number) > max)) throw new Error(`${key} must be an integer in ${min}..${max}`);
	}
	return value as Partial<SuggestionsConfig>;
}
export function loadConfig(agentDir: string, cwd: string, trusted: boolean, read = (file: string) => readFileSync(file, "utf8")): { config: SuggestionsConfig; error?: string } {
	const config = { ...DEFAULTS, models: [...DEFAULTS.models] };
	for (const file of [join(agentDir, "prompt-suggestions.json"), ...(trusted ? [join(cwd, ".pi", "prompt-suggestions.json")] : [])]) {
		try { Object.assign(config, validateConfig(JSON.parse(read(file)))); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			// Never include file contents or arbitrary exception/provider text in diagnostics.
			return { config: { ...config, enabled: false }, error: "Invalid or unreadable prompt-suggestions configuration; check documented fields" };
		}
	}
	return { config };
}
