/** Original empty-editor ghost rendering using only public editor/TUI APIs. */
export function createGhostEditor(lib: any, Base: any, hooks: { candidate: () => string | undefined; dismiss: () => void; accepted: () => void; color: (text: string) => string }) {
	return class GhostEditor extends Base {
		private initialized = false;
		private ghostTui: any;
		private ghostKeys: any;
		constructor(...args: any[]) { super(...args); this.ghostTui = args[0]; this.ghostKeys = args[2]; this.initialized = true; }
		refresh(): void { this.invalidate(); this.ghostTui.requestRender(); }
		private candidate(): string | undefined {
			return this.getText() === "" && !this.isShowingAutocomplete() && this.focused ? hooks.candidate() : undefined;
		}
		handleInput(data: string): void {
			const candidate = this.candidate();
			if (candidate && this.ghostKeys.matches(data, "tui.input.tab")) {
				// Preserve CustomEditor's shortcut precedence. The acceptance path never
				// delegates to super, so this callback is dispatched exactly once.
				if (this.onExtensionShortcut?.(data)) { hooks.dismiss(); return; }
				hooks.accepted(); this.insertTextAtCursor(candidate); return;
			}
			hooks.dismiss(); super.handleInput(data);
		}
		setText(value: string): void {
			if (this.initialized) hooks.dismiss();
			super.setText(value);
		}
		insertTextAtCursor(value: string): void {
			if (this.initialized) hooks.dismiss();
			super.insertTextAtCursor(value);
		}
		render(width: number): string[] {
			const lines = super.render(width);
			const candidate = this.candidate();
			if (!candidate || lines.length < 3 || width < 3) return lines;
			// Preserve base borders; replace only the known empty content area, not its ANSI cursor.
			const padding = Math.min(this.getPaddingX(), Math.max(0, Math.floor((width - 1) / 2)));
			const available = Math.max(1, width - padding * 2);
			const wrapped = lib.wrapTextWithAnsi(hooks.color(candidate), available);
			const maxLines = Math.max(1, Math.min(3, Math.floor(this.ghostTui.terminal.rows * 0.15)));
			const shown = wrapped.slice(0, maxLines);
			if (wrapped.length > maxLines) shown[maxLines - 1] = lib.truncateToWidth(shown[maxLines - 1], Math.max(0, available - 1), "") + hooks.color("…");
			const content = shown.map((line: string, i: number) => {
				let display = line;
				if (i === 0) {
					const [first = ""] = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(candidate)].map((s) => s.segment);
					const fits = lib.visibleWidth(first) <= available;
					const rest = fits ? lib.sliceByColumn(line, lib.visibleWidth(first), available) : "";
					display = lib.CURSOR_MARKER + lib.renderFakeCursor(hooks.color(fits ? first : " ")) + rest;
				}
				return " ".repeat(padding) + display + " ".repeat(Math.max(0, available - lib.visibleWidth(display))) + " ".repeat(padding);
			});
			const submitKeys = this.ghostKeys.getKeys("tui.input.submit").join("/") || "unbound";
			const hint = hooks.color(`${this.ghostKeys.getKeys("tui.input.tab").join("/")} accept · edit · ${submitKeys} send`);
			return [lines[0], ...content, lib.truncateToWidth(hint, width, ""), lines[2]];
		}
	};
}
