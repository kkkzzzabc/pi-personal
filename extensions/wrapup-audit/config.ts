/** Independent configuration; never reads another extension's settings. No rules are built in. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface RuleBase { id: string; match: string; message: string }
export type Rule =
	| (RuleBase & { type: "mention"; file: string; mustContain: string })
	| (RuleBase & { type: "frontmatter"; keys: string[] })
	| (RuleBase & { type: "amendment" })
	| (RuleBase & { type: "field-line"; field: string; values: string[]; linePrefix: string });
export interface Judgment { id: string; text: string }
export interface AuditConfig {
	enabled: boolean;
	steer: boolean;
	judge: boolean;
	models: string[];
	timeoutMs: number;
	maxTokens: number;
	maxContextChars: number;
	rules: Rule[];
	judgments: Judgment[];
}
export const DEFAULTS: AuditConfig = {
	enabled: true, steer: true, judge: true,
	// Haiku first: it matched all synthetic judgment cases; Luna missed three and had one false positive.
	models: ["anthropic/claude-haiku-5-5", "openai/gpt-6-luna"],
	timeoutMs: 30_000, maxTokens: 1024, maxContextChars: 12_000,
	rules: [], judgments: [],
};
export function modelRef(value: unknown): value is string {
	return typeof value === "string" && /^[a-zA-Z0-9_.-]+\/[^\s\x00-\x1f\x7f-\x9f]+$/.test(value);
}
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const id = (v: unknown) => typeof v === "string" && ID.test(v);
const str = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(v);
const strings = (v: unknown, max: number) => Array.isArray(v) && v.length > 0 && v.length <= max && v.every((s) => str(s, 80));
const FIELDS: Record<Rule["type"], string[]> = {
	mention: ["file", "mustContain"],
	frontmatter: ["keys"],
	amendment: [],
	"field-line": ["field", "values", "linePrefix"],
};

function validateRule(rule: unknown): Rule {
	if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error("rule must be an object");
	const r = rule as Record<string, any>;
	const extra = FIELDS[r.type as Rule["type"]];
	if (!extra) throw new Error("unknown rule type");
	if (Object.keys(r).some((k) => !["id", "type", "match", "message", ...extra].includes(k))) throw new Error("unknown rule field");
	if (!id(r.id)) throw new Error("rule id must be lowercase kebab-case");
	if (!str(r.match, 300) || !str(r.message, 300)) throw new Error("rule match and message are required");
	try { new RegExp(r.match, "u"); } catch { throw new Error("rule match is not a valid regular expression"); }
	if (r.type === "mention" && (!str(r.file, 300) || !str(r.mustContain, 200))) throw new Error("mention needs file and mustContain");
	if (r.type === "frontmatter" && !strings(r.keys, 20)) throw new Error("frontmatter needs keys");
	if (r.type === "field-line" && (!str(r.field, 80) || !strings(r.values, 20) || !str(r.linePrefix, 200))) throw new Error("field-line needs field, values, and linePrefix");
	return r as Rule;
}

export function validateConfig(data: unknown): Partial<AuditConfig> {
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object");
	const value = data as Record<string, unknown>;
	if (Object.keys(value).some((key) => !Object.hasOwn(DEFAULTS, key))) throw new Error("Unknown configuration field");
	for (const key of ["enabled", "steer", "judge"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error(`${key} must be a boolean`);
	if (value.models !== undefined && (!Array.isArray(value.models) || value.models.length < 1 || value.models.length > 2 || !value.models.every(modelRef) || new Set(value.models).size !== value.models.length)) {
		throw new Error("models must contain one or two distinct exact provider/model IDs");
	}
	const bounds: Record<string, [number, number]> = { timeoutMs: [100, 60_000], maxTokens: [128, 4096], maxContextChars: [1000, 24_000] };
	for (const [key, [min, max]] of Object.entries(bounds)) {
		const v = value[key];
		if (v !== undefined && (!Number.isInteger(v) || (v as number) < min || (v as number) > max)) throw new Error(`${key} must be an integer in ${min}..${max}`);
	}
	if (value.rules !== undefined) {
		if (!Array.isArray(value.rules) || value.rules.length > 20) throw new Error("rules must be an array of at most 20");
		value.rules.forEach(validateRule);
		if (new Set(value.rules.map((r: any) => r.id)).size !== value.rules.length) throw new Error("rule ids must be unique");
	}
	if (value.judgments !== undefined) {
		const j = value.judgments;
		if (!Array.isArray(j) || j.length > 8 || !j.every((x) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === 2 && id(x.id) && str(x.text, 400))) {
			throw new Error("judgments must be at most 8 {id, text} objects");
		}
		if (new Set(j.map((x: any) => x.id)).size !== j.length) throw new Error("judgment ids must be unique");
	}
	return value as Partial<AuditConfig>;
}

export function loadConfig(agentDir: string, cwd: string, trusted: boolean, read = (file: string) => readFileSync(file, "utf8")): { config: AuditConfig; error?: string } {
	const config: AuditConfig = { ...DEFAULTS, models: [...DEFAULTS.models], rules: [], judgments: [] };
	for (const file of [join(agentDir, "wrapup-audit.json"), ...(trusted ? [join(cwd, ".pi", "wrapup-audit.json")] : [])]) {
		try { Object.assign(config, validateConfig(JSON.parse(read(file)))); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			// Never include file contents or arbitrary exception text in diagnostics.
			return { config: { ...config, enabled: false }, error: "Invalid or unreadable wrapup-audit configuration; check documented fields" };
		}
	}
	// The judgment request must leave room for the request data within the total cap.
	if (JSON.stringify(config.judgments).length > config.maxContextChars / 2) {
		return { config: { ...config, enabled: false }, error: "wrapup-audit judgments exceed half of maxContextChars; shorten them or raise the limit" };
	}
	return { config };
}
