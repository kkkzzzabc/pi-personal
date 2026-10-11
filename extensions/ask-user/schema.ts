/** Flat model-facing schema plus stricter conditional validation. */
export const LIMITS = { questions: 4, options: 8, id: 64, title: 120, prompt: 4000, context: 4000, label: 160, description: 2000, answer: 12000, comment: 4000 } as const;
export type QuestionType = "single" | "multi" | "text";
export interface Option { value: string; label: string; description?: string }
export interface Question { id: string; prompt: string; type: QuestionType; options: Option[]; recommended: string[] }
export interface Form { title?: string; context?: string; questions: Question[] }

const string = (maxLength: number, description?: string) => ({ type: "string", maxLength, ...(description ? { description } : {}) });
export const PARAMETERS = {
	type: "object", additionalProperties: false,
	properties: {
		title: string(LIMITS.title), context: string(LIMITS.context, "Short inspected context and trade-offs, not a status update."),
		questions: { type: "array", minItems: 1, maxItems: LIMITS.questions, items: {
			type: "object", additionalProperties: false, required: ["id", "prompt", "type"], properties: {
				id: string(LIMITS.id, "Stable unique question ID."), prompt: string(LIMITS.prompt),
				type: { type: "string", enum: ["single", "multi", "text"] },
				options: { type: "array", minItems: 2, maxItems: LIMITS.options, description: "Required for single/multi; omit for text. Do not author UI actions such as Other or Cancel.", items: {
					type: "object", additionalProperties: false, required: ["value", "label"], properties: {
						value: string(LIMITS.id), label: string(LIMITS.label), description: string(LIMITS.description),
					},
				} },
				recommended: { type: "array", maxItems: LIMITS.options, items: string(LIMITS.id), description: "Optional existing option values, visually marked but never preselected; at most one for single. Omit for text." },
			},
		} },
	}, required: ["questions"],
} as const;

const UNSAFE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u;
export function checkedText(value: unknown, name: string, max: number, required = false): string {
	if (typeof value !== "string") throw new Error(`${name} must be a string.`);
	const text = value.replace(/\r\n?/g, "\n").trim();
	if (UNSAFE.test(text)) throw new Error(`${name} contains terminal control characters.`);
	if (value.length > max || text.length > max) throw new Error(`${name} exceeds ${max} characters.`);
	if (required && !text) throw new Error(`${name} must not be blank.`);
	return text;
}
/** Render uncommitted text safely without modifying the underlying draft. */
export function safeDisplay(text: string): string {
	return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/gu, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).replace(/\r\n?/g, "\n");
}
function object(value: unknown, name: string, allowed: string[]): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${name}: unknown field ${key}.`);
	return value as Record<string, unknown>;
}
export function normalizeForm(input: unknown): Form {
	const data = object(input, "ask_user", ["title", "context", "questions"]);
	if (!Array.isArray(data.questions) || !data.questions.length || data.questions.length > LIMITS.questions) throw new Error("Provide 1-4 questions.");
	const ids = new Set<string>();
	const questions = data.questions.map((entry, index): Question => {
		const where = `questions[${index}]`;
		const q = object(entry, where, ["id", "prompt", "type", "options", "recommended"]);
		const id = checkedText(q.id, `${where}.id`, LIMITS.id, true);
		if (ids.has(id)) throw new Error(`Duplicate question ID: ${id}.`);
		ids.add(id);
		if (!["single", "multi", "text"].includes(q.type as string)) throw new Error(`${where}.type must be single, multi, or text.`);
		const type = q.type as QuestionType;
		if (type === "text" && (q.options !== undefined || q.recommended !== undefined)) throw new Error(`${where}: text questions cannot have options or recommended values.`);
		const values = new Set<string>();
		const options: Option[] = [];
		if (type !== "text") {
			if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > LIMITS.options) throw new Error(`${where}: provide 2-8 options.`);
			for (const entry of q.options) {
				const opt = object(entry, `${where}.option`, ["value", "label", "description"]);
				const value = checkedText(opt.value, "option.value", LIMITS.id, true);
				if (values.has(value)) throw new Error(`${where}: duplicate option value ${value}.`);
				values.add(value);
				options.push({ value, label: checkedText(opt.label, "option.label", LIMITS.label, true), ...(opt.description === undefined ? {} : { description: checkedText(opt.description, "option.description", LIMITS.description) }) });
			}
		}
		if (q.recommended !== undefined && !Array.isArray(q.recommended)) throw new Error(`${where}.recommended must be an array.`);
		const recommended = ((q.recommended ?? []) as unknown[]).map((v) => checkedText(v, "recommended value", LIMITS.id, true));
		if (recommended.length > (type === "single" ? 1 : LIMITS.options) || new Set(recommended).size !== recommended.length || recommended.some((v) => !values.has(v))) throw new Error(`${where}: recommended values must be distinct existing options (at most one for single).`);
		return { id, prompt: checkedText(q.prompt, `${where}.prompt`, LIMITS.prompt, true), type, options, recommended };
	});
	return { ...(data.title === undefined ? {} : { title: checkedText(data.title, "title", LIMITS.title) }), ...(data.context === undefined ? {} : { context: checkedText(data.context, "context", LIMITS.context) }), questions };
}
