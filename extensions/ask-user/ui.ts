import { FormController } from "./controller.ts";
import { safeDisplay } from "./schema.ts";

/** Public Pi TUI capabilities are injected; the controller has no host dependency. */
export type TuiLibrary = Record<string, any>;
export type Interaction = { kind: "submit" | "discussion" | "cancel" };
interface Row { label: string; action: () => void }

export class QuestionComponent {
	focused = false;
	private closed = false;
	private editing?: { index: number; field: "text" | "custom" | "comment"; initialValue: string };
	private editor: any;
	private focus = 0;
	private scroll = 0;
	private manualScroll = false;
	private error = "";
	readonly controller: FormController;
	private tui: any;
	private theme: any;
	private keys: any;
	private done: (result: Interaction) => void;
	private lib: TuiLibrary;
	constructor(controller: FormController, tui: any, theme: any, keys: any, done: (result: Interaction) => void, lib: TuiLibrary) {
		this.controller = controller; this.tui = tui; this.theme = theme; this.keys = keys; this.done = done; this.lib = lib;
		const color = (s: string) => theme.fg("accent", s);
		this.editor = new lib.Editor(tui, { borderColor: color, selectList: { selectedPrefix: color, selectedText: color, description: (s: string) => theme.fg("muted", s), scrollInfo: color, noMatch: color } });
		this.editor.onSubmit = (value: string) => { this.saveEditor(value, true); this.refresh(); };
	}
	private refresh(): void { this.tui.requestRender(); }
	invalidate(): void { this.editor.invalidate(); }
	dispose(): void { this.closed = true; this.editor.focused = false; this.editor.onSubmit = undefined; this.editor.onChange = undefined; this.editor.dispose?.(); }
	private finish(kind: Interaction["kind"]): void {
		if (this.closed) return;
		if (kind !== "cancel") {
			try { this.controller.finish(kind === "discussion"); }
			catch (error) { this.error = (error as Error).message; this.refresh(); return; }
		}
		this.closed = true;
		this.done({ kind });
	}
	private saveEditor(value = this.editor.getExpandedText?.() ?? this.editor.getText(), explicitSave = false): void {
		if (!this.editing) return;
		// Viewing an unchanged draft and going Back must not switch the active answer.
		if (explicitSave || value !== this.editing.initialValue) this.controller.set(this.editing.index, this.editing.field, value);
		this.editing = undefined;
		this.editor.focused = false;
	}
	private openEditor(field: "text" | "custom" | "comment"): void {
		const index = this.controller.page;
		const initialValue = this.controller.drafts[index][field];
		this.editing = { index, field, initialValue };
		this.editor.setText(initialValue);
		this.error = "";
	}
	private go(page: number): void {
		this.saveEditor();
		this.controller.go(page);
		this.focus = this.controller.review ? this.controller.form.questions.length : 0;
		this.scroll = 0; this.manualScroll = false; this.error = "";
	}
	private rows(): Row[] {
		const c = this.controller;
		if (c.review) return [
			...c.form.questions.map((q, i) => ({ label: `Edit ${i + 1}: ${q.prompt}`, action: () => this.go(i) })),
			{ label: "Submit answers", action: () => this.finish("submit") },
			{ label: "Send answers for discussion", action: () => this.finish("discussion") },
			{ label: "Cancel and stop", action: () => this.finish("cancel") },
		];
		const q = c.form.questions[c.page]; const draft = c.drafts[c.page];
		return [
			...q.options.map((opt) => ({
				label: `${draft.selected.includes(opt.value) && !(q.type === "single" && draft.customActive) ? "[x]" : "[ ]"} ${opt.label}${q.recommended.includes(opt.value) ? " (recommended)" : ""}${opt.description ? ` — ${opt.description}` : ""}`,
				action: () => c.choose(c.page, opt.value),
			})),
			{ label: q.type === "text" ? "Write answer" : q.type === "single" ? "Write alternative answer" : "Write additional answer", action: () => this.openEditor(q.type === "text" ? "text" : "custom") },
			{ label: "Add or edit comment", action: () => this.openEditor("comment") },
			{ label: c.page === c.form.questions.length - 1 ? "Review answers" : "Next question", action: () => this.go(c.page + 1) },
			{ label: "Send answers for discussion", action: () => this.finish("discussion") },
			{ label: "Cancel and stop", action: () => this.finish("cancel") },
		];
	}
	private answerLabel(type: string): string { return type === "single" ? "Alternative answer" : "Additional answer"; }
	private hint(binding: string): string { return this.keys.getKeys(binding).join("/") || "unbound"; }
	handleInput(data: string): void {
		if (this.closed) return;
		const { matchesKey, Key } = this.lib;
		if (matchesKey(data, Key.ctrl("c"))) { this.finish("cancel"); return; }
		if (this.editing) {
			if (this.keys.matches(data, "tui.select.cancel")) this.saveEditor();
			else this.editor.handleInput(data);
			this.refresh(); return;
		}
		const rows = this.rows();
		if (this.keys.matches(data, "tui.select.cancel")) this.finish("cancel");
		else if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) this.go((this.controller.page + 1) % (this.controller.form.questions.length + 1));
		else if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) this.go((this.controller.page + this.controller.form.questions.length) % (this.controller.form.questions.length + 1));
		else if (this.keys.matches(data, "tui.select.pageUp") || this.keys.matches(data, "tui.select.pageDown")) {
			this.scroll = Math.max(0, this.scroll + (this.keys.matches(data, "tui.select.pageUp") ? -5 : 5)); this.manualScroll = true;
		} else if (this.keys.matches(data, "tui.select.up") || this.keys.matches(data, "tui.select.down")) {
			this.focus = (this.focus + (this.keys.matches(data, "tui.select.up") ? rows.length - 1 : 1)) % rows.length;
			this.manualScroll = false;
		} else if (this.keys.matches(data, "tui.select.confirm") || matchesKey(data, Key.space)) rows[this.focus]?.action();
		this.refresh();
	}
	render(width: number): string[] {
		const w = Math.max(1, width);
		const height = Math.max(4, Math.min(28, (this.tui.terminal.rows ?? 40) - 7));
		const c = this.controller; const q = c.form.questions[Math.min(c.page, c.form.questions.length - 1)];
		const wrap = (s: string) => this.lib.wrapTextWithAnsi(safeDisplay(s), w) as string[];
		const header = this.theme.fg("accent", this.lib.truncateToWidth(`ask_user · ${c.form.title || "User decision"} · ${c.review ? "Review" : `${c.page + 1}/${c.form.questions.length}`}`, w, ""));
		this.editor.focused = this.focused && Boolean(this.editing);
		if (this.editing) {
			const back = this.keys.getKeys("tui.select.cancel").filter((key: string) => key !== "ctrl+c").join("/") || "unbound";
			const field = this.editing.field === "custom" ? this.answerLabel(q.type) : this.editing.field === "text" ? "Answer" : "Comment";
			const title = this.lib.truncateToWidth(`Question ${c.page + 1} · ${field}`, w, "");
			const help = [
				`${back} Back (keep edits)`,
				`${this.hint("tui.input.submit")} Save and return`,
				`${this.hint("tui.input.newLine")} New line`,
				"ctrl+c Cancel and stop",
			].flatMap(wrap);
			// Reserve a cursor-bearing editor line even when help must be clipped.
			const helpCap = Math.max(0, height - 3);
			const guidance = help.length <= helpCap ? help : [...help.slice(0, Math.max(0, helpCap - 1)), ...(helpCap ? [this.lib.truncateToWidth("ctrl+c Cancel and stop", w, "")] : [])];
			const raw = this.editor.getExpandedText?.() ?? this.editor.getText();
			const unsafe = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u.test(raw);
			// Never send raw unsafe draft text through an ANSI-aware component renderer.
			const lines: string[] = unsafe ? wrap(`Remove control characters before submitting: ${raw}`) : this.editor.render(w);
			const cap = Math.max(1, height - 2 - guidance.length);
			const cursor = lines.findIndex((line) => line.includes(this.lib.CURSOR_MARKER));
			const start = Math.max(0, Math.min(Math.max(0, lines.length - cap), cursor - cap + 1));
			return [header, title, ...guidance, ...lines.slice(start, start + cap)].slice(0, height).map((line) => this.lib.truncateToWidth(line, w, ""));
		}
		const lines: string[] = [];
		if (c.form.context) lines.push(...wrap(c.form.context), "");
		if (c.review) {
			try {
				for (const [index, response] of c.responses().entries()) {
					const question = c.form.questions[index];
					const labels = question.options.filter((option) => response.selectedValues.includes(option.value)).map((option) => option.label);
					const answer = response.answered ? [labels.join(", "), response.customText ? `${this.answerLabel(question.type)}: ${response.customText}` : "", response.text].filter(Boolean).join(" + ") : "UNANSWERED";
					lines.push(...wrap(`${index + 1}. ${question.prompt}`), ...wrap(`Answer: ${answer}${response.comment ? `; comment: ${response.comment}` : ""}`));
				}
			} catch (error) { lines.push(...wrap((error as Error).message)); }
			lines.push(...wrap("If any questions are unanswered, your answers will be sent for discussion instead."), ...wrap("Answers sent for discussion are not final decisions."), "");
		} else {
			lines.push(...wrap(q.prompt), "");
			const d = c.drafts[c.page];
			if (d.text) lines.push(...wrap(`Answer draft: ${d.text}`));
			if (d.custom && (q.type === "multi" || d.customActive)) lines.push(...wrap(`${this.answerLabel(q.type)}: ${d.custom}`));
			if (d.comment) lines.push(...wrap(`Comment draft: ${d.comment}`));
		}
		lines.push(...wrap("Cancel and stop: discard these answers and stop the current response."), "");
		const rows = this.rows();
		this.focus = Math.min(this.focus, rows.length - 1);
		let focusRow = lines.length;
		rows.forEach((row, i) => { if (i === this.focus) focusRow = lines.length; lines.push(...wrap(`${i === this.focus ? ">" : " "} ${row.label}`)); });
		if (this.error) lines.push(...wrap(`Error: ${this.error}`));
		const cap = height - 3;
		if (!this.manualScroll) {
			if (focusRow < this.scroll) this.scroll = focusRow;
			if (focusRow >= this.scroll + cap) this.scroll = focusRow - cap + 1;
		}
		this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, lines.length - cap)));
		const hint = `${this.hint("tui.select.up")}/${this.hint("tui.select.down")} move · ${this.hint("tui.select.confirm")} select · ${this.hint("tui.select.cancel")} cancel and stop · tab/shift+tab questions/review · ${this.hint("tui.select.pageUp")}/${this.hint("tui.select.pageDown")} scroll`;
		return [header, ...lines.slice(this.scroll, this.scroll + cap), this.theme.fg("muted", this.lib.truncateToWidth(hint, w, "")), this.lib.truncateToWidth(this.error ? `Error: ${this.error}` : `Rows ${this.scroll + 1}-${Math.min(lines.length, this.scroll + cap)}/${lines.length}`, w, "")];
	}
}
