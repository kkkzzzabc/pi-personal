import { checkedText, LIMITS, type Form } from "./schema.ts";

export interface Draft { selected: string[]; custom: string; customActive: boolean; text: string; comment: string }
export interface Response { questionId: string; answered: boolean; selectedValues: string[]; customText?: string; text?: string; comment?: string }
export interface AnswerDetails { outcome: "submitted" | "needs_discussion"; form: Form; responses: Response[]; unansweredIds: string[] }
export interface StopDetails { outcome: "cancelled" | "aborted" | "unavailable" | "invalid" | "busy" | "error"; reason: string }
export type Details = AnswerDetails | StopDetails;

/** Mutable drafts are private to one interaction; every result is a detached snapshot. */
export class FormController {
	readonly form: Form;
	readonly drafts: Draft[];
	page = 0;
	constructor(form: Form) {
		this.form = form;
		this.drafts = form.questions.map(() => ({ selected: [], custom: "", customActive: false, text: "", comment: "" }));
	}
	get review(): boolean { return this.page === this.form.questions.length; }
	go(page: number): void { this.page = Math.max(0, Math.min(this.form.questions.length, page)); }
	choose(index: number, value: string): void {
		const q = this.form.questions[index];
		if (q.type === "text" || !q.options.some((o) => o.value === value)) throw new Error("Unknown choice value.");
		const draft = this.drafts[index];
		if (q.type === "single") { draft.selected = [value]; draft.customActive = false; }
		else draft.selected = draft.selected.includes(value) ? draft.selected.filter((v) => v !== value) : [...draft.selected, value];
	}
	set(index: number, field: "custom" | "text" | "comment", value: string): void {
		this.drafts[index][field] = value;
		if (field === "custom") this.drafts[index].customActive = true;
	}
	responses(): Response[] {
		return this.form.questions.map((q, index) => {
			const draft = this.drafts[index];
			const comment = checkedText(draft.comment, `${q.id} comment`, LIMITS.comment);
			const text = q.type === "text" ? checkedText(draft.text, `${q.id} answer`, LIMITS.answer) : "";
			const custom = q.type !== "text" && (q.type === "multi" || draft.customActive) ? checkedText(draft.custom, `${q.id} custom answer`, LIMITS.answer) : "";
			const selectedValues = q.options.filter((o) => draft.selected.includes(o.value) && !(q.type === "single" && draft.customActive)).map((o) => o.value);
			return { questionId: q.id, answered: Boolean(text || custom || selectedValues.length), selectedValues, ...(text ? { text } : {}), ...(custom ? { customText: custom } : {}), ...(comment ? { comment } : {}) };
		});
	}
	finish(discussion = false): AnswerDetails {
		const responses = this.responses();
		const unansweredIds = responses.filter((r) => !r.answered).map((r) => r.questionId);
		// Detach metadata too, so later navigation or shutdown cannot mutate history.
		return { outcome: discussion || unansweredIds.length ? "needs_discussion" : "submitted", form: structuredClone(this.form), responses, unansweredIds };
	}
}

export function resultContent(details: Details): string {
	if (!("responses" in details)) return `ask_user ${details.outcome}: ${details.reason}`;
	const guidance = details.outcome === "needs_discussion"
		? "Discussion context only, not final decisions or execution approval. Explain unresolved choices; do not assume missing answers."
		: "User submitted these answers. Preserve comments and conditions; this is not blanket execution or plan approval.";
	return `${guidance}\n${JSON.stringify(details, null, 2)}`;
}
