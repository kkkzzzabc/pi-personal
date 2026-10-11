import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, modelRef, type SummaryConfig } from "./config.ts";
import { SummaryController } from "./controller.ts";
import { buildContext, generateSummary, type Summary } from "./summary.ts";
import { summaryLines } from "./widget.ts";

const KEY = "turn-summary";
interface Dependencies {
	agentDir: () => string;
	widget: (getSummary: () => Summary | undefined) => any;
	lowestThinking: (model: any) => string | undefined;
	load?: typeof loadConfig;
}
export function createTurnSummaryExtension(deps: Dependencies) {
	return (pi: ExtensionAPI) => {
		let controller = new SummaryController(); let config: SummaryConfig; let configError: string | undefined;
		let ctx: ExtensionContext | undefined; let identity: { session: string; leaf: string | null } | undefined;
		// In memory only: the last displayed summary and where it was produced.
		let previous: { session: string; leaf: string | null; summary: Summary } | undefined;
		let warned = ""; let shown = false;
		const tui = () => !!ctx && ctx.mode === "tui";
		// Model, thinking-level, label, and name entries move the raw leaf; only conversation messages define the turn.
		const messageLeaf = () => { const b = ctx!.sessionManager.getBranch(); for (let i = b.length - 1; i >= 0; i--) if (b[i].type === "message") return b[i].id; return null; };
		const current = () => {
			try { return tui() && config?.enabled && !configError && !!identity && identity.session === ctx!.sessionManager.getSessionId() && identity.leaf === messageLeaf(); }
			catch { return false; }
		};
		const render = () => {
			try {
				if (!tui()) return;
				const visible = !!controller.summary && current();
				if (visible && !shown) { ctx!.ui.setWidget(KEY, deps.widget(() => current() ? controller.summary : undefined), { placement: "aboveEditor" }); shown = true; }
				else if (!visible && shown) { ctx!.ui.setWidget(KEY, undefined); shown = false; }
				ctx!.ui.setStatus(KEY, config?.enabled ? controller.state === "summarizing" ? "summarizing…" : controller.state === "failed" ? "summary failed" : undefined : undefined);
				const failure = controller.state === "failed" ? controller.last?.attempts.at(-1)?.outcome ?? "request-failed" : "";
				if (failure) {
					if (failure !== warned) ctx!.ui.notify(`Turn summary: ${failure}. Use /turn-summary for details.`, "warning");
					warned = failure;
				} else if (controller.state === "ready" || controller.state === "abstained") warned = "";
			} catch { /* Reload/session replacement invalidates contexts. */ }
		};
		const clear = (state = "idle") => { controller.invalidate(state); identity = undefined; render(); };
		const changed = () => {
			if (controller.state === "ready" && controller.summary && identity) previous = { ...identity, summary: controller.summary };
			render();
		};
		const status = () => {
			const c = controller; const lines = c.summary ? summaryLines(c.summary).map(([k, v]) => `  ${k}: ${v}`).join("\n") : "  (none)";
			return `Turn summary: ${configError ? "config-error" : !config?.enabled ? "off" : c.state}\nCurrent summary:\n${lines}\nModels: ${config?.models.join(" → ") ?? "none"}\nLast attempts: ${c.last?.attempts.map((a) => `${a.model} (${a.outcome})`).join(" → ") || "none"}\nElapsed: ${c.last?.elapsedMs ?? 0}ms · requests: ${c.calls} · reported input/output: ${c.input}/${c.output} · reported cost: $${c.cost.toFixed(6)}\nUsage is this extension's in-memory total, not the main agent's native total; unreported usage is unknown.`;
		};
		pi.on("session_start", (_event, context) => {
			controller.invalidate(); controller = new SummaryController();
			ctx = context; identity = undefined; previous = undefined; warned = ""; shown = false;
			const loaded = (deps.load ?? loadConfig)(deps.agentDir(), ctx.cwd, ctx.isProjectTrusted()); config = loaded.config; configError = loaded.error;
			if (!tui()) return;
			try { ctx.ui.setWidget(KEY, undefined); } catch { /* Fresh UI. */ }
			if (configError) ctx.ui.notify(configError, "error");
			render();
		});
		pi.on("agent_settled", (event, context) => {
			ctx = context;
			if (event.aborted || !tui() || !config?.enabled || configError) return;
			try { if (!ctx.isIdle() || ctx.hasPendingMessages()) return; } catch { return; }
			const branch = ctx.sessionManager.getBranch(); const session = ctx.sessionManager.getSessionId();
			// The earlier summary is used only when produced on an ancestor of this leaf.
			const ancestor = previous && previous.session === session && branch.some((e: any) => e.id === previous!.leaf) ? previous.summary : undefined;
			const context_ = buildContext(branch, config, ancestor);
			if (!context_) { clear(); return; }
			identity = { session, leaf: messageLeaf() };
			const registry = ctx.modelRegistry; const snapshot = { ...config, models: [...config.models] };
			void controller.run((signal) => generateSummary(registry, context_, snapshot, signal, deps.lowestThinking), current, changed);
		});
		// A new turn or a different branch makes the displayed summary stale. Typing does not.
		for (const event of ["input", "agent_start", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact"] as const) {
			pi.on(event, (_event: any, context: ExtensionContext) => { ctx = context; clear(); });
		}
		pi.on("session_shutdown", () => {
			controller.invalidate();
			try { if (shown) ctx?.ui.setWidget(KEY, undefined); ctx?.ui.setStatus(KEY, undefined); } catch { /* Idempotent stale-context cleanup. */ }
			ctx = undefined; identity = undefined; previous = undefined; shown = false;
		});
		pi.registerCommand("turn-summary", {
			description: "Show the last turn summary and status; on/off or model provider/id changes this session only",
			handler: async (args, context) => {
				ctx = context;
				if (ctx.mode !== "tui") { ctx.ui.notify("Turn summaries require TUI mode; no inference runs in this mode.", "warning"); return; }
				const command = args.trim();
				if (command === "on" || command === "off") { config.enabled = command === "on"; warned = ""; clear(); }
				else if (command.startsWith("model ")) {
					const ref = command.slice(6).trim();
					if (!modelRef(ref)) { ctx.ui.notify("Expected an exact provider/model ID.", "error"); return; }
					config.models = [ref]; warned = "";
				} else if (command && command !== "status") { ctx.ui.notify("Usage: /turn-summary [status|on|off|model provider/id]", "error"); return; }
				ctx.ui.notify(status(), "info");
			},
		});
	};
}
