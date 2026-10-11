import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, modelRef, type SuggestionsConfig } from "./config.ts";
import { SuggestionController } from "./controller.ts";
import { buildConversation, generateSuggestion } from "./suggestion.ts";

interface Dependencies {
	agentDir: () => string;
	editor: (hooks: { candidate: () => string | undefined; dismiss: () => void; accepted: () => void; color: (text: string) => string }) => any;
	lowestThinking: (model: any) => string | undefined;
	load?: typeof loadConfig;
}
export function createSuggestionsExtension(deps: Dependencies) {
	return (pi: ExtensionAPI) => {
		let controller = new SuggestionController(); let config: SuggestionsConfig;
		let ctx: ExtensionContext | undefined; let editor: any; let factory: any;
		let unsubscribe: (() => void) | undefined; let blocked = false; let configError: string | undefined;
		let identity: { session: string; leaf: string | null } | undefined;
		let warned = "";
		const owned = () => { try { return !!ctx && !!factory && ctx.ui.getEditorComponent() === factory; } catch { return false; } };
		const safe = () => {
			try { return !!ctx && ctx.mode === "tui" && config?.enabled && !configError && !blocked && owned() && ctx.isIdle() && !ctx.hasPendingMessages() && ctx.ui.getEditorText() === "" && !editor?.isShowingAutocomplete(); }
			catch { return false; }
		};
		const current = () => {
			try { return safe() && !!identity && identity.session === ctx!.sessionManager.getSessionId() && identity.leaf === ctx!.sessionManager.getLeafId(); }
			catch { return false; }
		};
		const refresh = () => { if (owned()) editor?.refresh(); };
		const invalidate = (state = "idle") => { controller.invalidate(state); identity = undefined; refresh(); };
		const status = () => {
			const c = controller;
			return `Prompt suggestions: ${configError ? "config-error" : !owned() ? "editor-unavailable" : !config?.enabled ? "off" : c.state}\nModels: ${config?.models.join(" → ") ?? "none"}\nLast attempts: ${c.last?.attempts.map((a) => `${a.model} (${a.outcome})`).join(" → ") || "none"}\nElapsed: ${c.last?.elapsedMs ?? 0}ms · requests: ${c.calls} · reported input/output: ${c.input}/${c.output} · reported cost: $${c.cost.toFixed(6)}\nUsage is this extension's in-memory total, not the main agent's native total; unreported usage is unknown.`;
		};
		const changed = () => {
			refresh();
			try {
				if (!ctx || ctx.mode !== "tui") return;
				const editorOwned = owned();
				// This status key belongs to us even when another extension owns the editor.
				ctx.ui.setStatus("prompt-suggestions", editorOwned && config?.enabled ? controller.state === "generating" ? "suggesting…" : controller.state === "failed" ? "suggestions failed" : undefined : undefined);
				if (!editorOwned) return;
				const failure = controller.state === "failed" ? controller.last?.attempts.at(-1)?.outcome ?? "request-failed" : "";
				if (failure) {
					if (failure !== warned) ctx.ui.notify(`Prompt suggestions: ${failure}. Use /prompt-suggestions for details.`, "warning");
					warned = failure;
				} else if (controller.state === "ready" || controller.state === "abstained") warned = "";
			} catch { /* Reload/session replacement invalidates contexts. */ }
		};
		pi.on("session_start", (event, context) => {
			unsubscribe?.(); unsubscribe = undefined; controller.invalidate(); controller = new SuggestionController();
			ctx = context; identity = undefined; blocked = false; warned = "";
			const loaded = (deps.load ?? loadConfig)(deps.agentDir(), ctx.cwd, ctx.isProjectTrusted()); config = loaded.config; configError = loaded.error;
			if (ctx.mode !== "tui") return;
			if (configError) ctx.ui.notify(configError, "error");
			const existing = ctx.ui.getEditorComponent();
			if (existing && existing !== factory) {
				ctx.ui.notify("Prompt suggestions: another custom editor owns the input; suggestions are disabled here.", "warning"); return;
			}
			if (!existing) {
				const Editor = deps.editor({
					candidate: () => current() ? controller.suggestion : undefined,
					dismiss: () => { if (identity || controller.state === "generating" || controller.suggestion) { invalidate(); changed(); } },
					accepted: () => { invalidate("accepted"); changed(); },
					color: (value) => ctx!.ui.theme.fg("muted", value),
				});
				factory = (tui: any, theme: any, keys: any) => { editor = new Editor(tui, theme, keys); return editor; };
				ctx.ui.setEditorComponent(factory);
				// Startup history is populated by the host after session_start. Other starts
				// install this editor after rendering, so seed it through the public API.
				for (const entry of event.reason === "startup" ? [] : ctx.sessionManager.getBranch()) {
					if (entry.type === "message" && entry.message.role === "user") {
						const content = entry.message.content;
						const value = typeof content === "string" ? content : content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
						if (value) editor.addToHistory(value);
					}
				}
			}
			unsubscribe = ctx.ui.onTerminalInput(() => { if (controller.state === "generating") { invalidate(); changed(); } return undefined; });
			changed();
		});
		pi.on("agent_settled", (event, context) => {
			ctx = context;
			if (ctx.mode === "tui" && config?.enabled && factory && !owned()) {
				invalidate("editor-unavailable"); changed();
				if (warned !== "editor-unavailable") ctx.ui.notify("Prompt suggestions: custom editor ownership changed; inference is skipped.", "warning");
				warned = "editor-unavailable"; return;
			}
			if (event.aborted || !safe()) return;
			const conversation = buildConversation(ctx.sessionManager.getBranch(), config);
			if (!conversation.length) return;
			identity = { session: ctx.sessionManager.getSessionId(), leaf: ctx.sessionManager.getLeafId() };
			const registry = ctx.modelRegistry; const snapshot = { ...config, models: [...config.models] };
			void controller.run((signal) => generateSuggestion(registry, conversation, snapshot, signal, deps.lowestThinking), current, changed);
		});
		for (const event of ["input", "agent_start", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact", "model_select"] as const) {
			pi.on(event, (_event: any, context: ExtensionContext) => { ctx = context; invalidate(); changed(); });
		}
		pi.on("ui_prompt_start", (_event, context) => { ctx = context; blocked = true; invalidate(); changed(); });
		pi.on("ui_prompt_end", (_event, context) => { ctx = context; blocked = false; });
		pi.on("session_shutdown", () => {
			controller.invalidate(); unsubscribe?.(); unsubscribe = undefined;
			try { if (owned()) ctx!.ui.setEditorComponent(undefined); ctx?.ui.setStatus("prompt-suggestions", undefined); } catch { /* Idempotent stale-context cleanup. */ }
			ctx = undefined; editor = undefined; factory = undefined; identity = undefined;
		});
		pi.registerCommand("prompt-suggestions", {
			description: "Show suggestion status; on/off or model provider/id changes this session only",
			handler: async (args, context) => {
				ctx = context;
				if (ctx.mode !== "tui") { ctx.ui.notify("Prompt suggestions require TUI mode; no inference runs in this mode.", "warning"); return; }
				const command = args.trim();
				if (command === "on" || command === "off") { config.enabled = command === "on"; warned = ""; invalidate(); changed(); }
				else if (command.startsWith("model ")) {
					const ref = command.slice(6).trim();
					if (!modelRef(ref)) { ctx.ui.notify("Expected an exact provider/model ID.", "error"); return; }
					config.models = [ref]; warned = ""; invalidate(); changed();
				} else if (command && command !== "status") { ctx.ui.notify("Usage: /prompt-suggestions [status|on|off|model provider/id]", "error"); return; }
				ctx.ui.notify(status(), "info");
			},
		});
	};
}
