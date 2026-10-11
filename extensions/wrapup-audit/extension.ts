import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type AuditConfig } from "./config.ts";
import { judge, buildContext, type JudgeFinding, type Judgement } from "./judge.ts";
import { ChangeTracker, projectRoot } from "./paths.ts";
import { checkRules, steeringMessage, STEER_TYPE, type Finding } from "./rules.ts";

const KEY = "wrapup-audit";
const MAX_READ = 2 * 1024 * 1024;
interface Dependencies {
	agentDir: () => string;
	lowestThinking: (model: any) => string | undefined;
	load?: typeof loadConfig;
	root?: (cwd: string) => string;
	today?: () => string;
}
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function createWrapupAuditExtension(deps: Dependencies) {
	return (pi: ExtensionAPI) => {
		let ctx: ExtensionContext | undefined; let config: AuditConfig | undefined; let configError: string | undefined;
		let root = ""; let tracker = new ChangeTracker("");
		// Per user request, in memory only.
		// startAfter: last message entry before the request; undefined until an idle prompt starts one.
		let steered = false; let rules: Finding[] = []; let startAfter: string | null | undefined;
		let judgeState = "idle"; let findings: JudgeFinding[] = []; let last: Judgement | undefined;
		let revision = 0; let pending: AbortController | undefined; let identity: { session: string; leaf: string | null } | undefined;
		let warned = ""; let steers = 0; let calls = 0; let input = 0; let output = 0; let cost = 0;

		const tui = () => !!ctx && ctx.mode === "tui";
		const active = () => tui() && !!config?.enabled && !configError;
		const messageLeaf = () => { const b = ctx!.sessionManager.getBranch(); for (let i = b.length - 1; i >= 0; i--) if (b[i].type === "message") return b[i].id; return null; };
		const current = () => {
			try { return active() && !!identity && identity.session === ctx!.sessionManager.getSessionId() && identity.leaf === messageLeaf(); }
			catch { return false; }
		};
		const read = (path: string) => {
			try { const file = join(root, path); if (statSync(file).size > MAX_READ) return undefined; return readFileSync(file, "utf8"); }
			catch { return undefined; }
		};
		const cancel = () => { revision++; pending?.abort(); pending = undefined; };
		const render = (notify = false) => {
			try {
				if (!tui()) return;
				const n = rules.length + findings.length;
				const status = !active() ? undefined : judgeState === "checking" ? "wrap-up: checking…" : judgeState === "failed" ? `wrap-up: audit failed${n ? ` · ${n} to check` : ""}` : n ? `wrap-up: ${n} to check` : undefined;
				ctx!.ui.setStatus(KEY, status);
				if (!notify) return;
				const key = judgeState === "failed" ? `failed:${last?.attempts.at(-1)?.outcome}` : JSON.stringify([rules, findings]);
				if (judgeState === "failed" || n) {
					if (key !== warned) ctx!.ui.notify(judgeState === "failed" ? `Wrap-up audit: judgment ${last?.attempts.at(-1)?.outcome ?? "request-failed"}${n ? `; ${n} rule item(s) to check` : ""}. Use /wrapup-audit for details.` : `Wrap-up audit: ${n} item(s) to check. Use /wrapup-audit for details.`, "warning");
					warned = key;
				} else warned = "";
			} catch { /* Reload/session replacement invalidates contexts. */ }
		};
		const clearResults = () => { cancel(); rules = []; findings = []; judgeState = "idle"; identity = undefined; render(); };
		const newRequest = (start?: string | null) => { tracker.reset(); steered = false; startAfter = start; clearResults(); };
		const status = () => {
			const ruleLines = rules.length ? rules.map((f) => `  - ${f.path} [${f.rule}]: ${f.message}`).join("\n") : "  (none)";
			const judgeLines = findings.length ? findings.map((f) => `  - [${f.id}] ${f.note}`).join("\n") : "  (none)";
			return `Wrap-up audit: ${configError ? "config-error" : !config?.enabled ? "off" : "on"} · rules ${config?.rules.length ?? 0} · judgments ${config?.judgments.length ?? 0}
Changed files this request: ${tracker.list().length} · steered this request: ${steered ? "yes" : "no"} · steering total: ${steers}
Rule findings (Lane A):
${ruleLines}
Judgment (Lane B, report only): ${!config?.judge ? "off" : judgeState}
${judgeLines}
Models: ${config?.models.join(" → ") ?? "none"}
Last attempts: ${last?.attempts.map((a) => `${a.model} (${a.outcome})`).join(" → ") || "none"}
Requests: ${calls} · reported input/output: ${input}/${output} · reported cost: $${cost.toFixed(6)}
Judgments are advice and can be wrong; usage is this extension's in-memory total.`;
		};

		pi.on("session_start", (_event, context) => {
			cancel(); ctx = context; identity = undefined; warned = ""; steered = false; startAfter = undefined; rules = []; findings = []; judgeState = "idle"; last = undefined;
			const loaded = (deps.load ?? loadConfig)(deps.agentDir(), ctx.cwd, ctx.isProjectTrusted()); config = loaded.config; configError = loaded.error;
			root = (deps.root ?? projectRoot)(ctx.cwd); tracker = new ChangeTracker(root);
			if (!tui()) return;
			if (configError) ctx.ui.notify(configError, "error");
			render();
		});
		// Steering typed during a run belongs to the same request; only an idle prompt starts a new one.
		pi.on("input", (event, context) => {
			ctx = context;
			if (event.streamingBehavior !== undefined) return;
			let start: string | null | undefined;
			try { start = messageLeaf(); } catch { start = undefined; }
			newRequest(start);
		});
		pi.on("tool_call", (event, context) => { ctx = context; if (active()) tracker.call(event.toolCallId, event.toolName, event.input, context.cwd); });
		pi.on("tool_result", (event) => { tracker.result(event.toolCallId, event.isError); });

		pi.on("agent_before_settle", (event, context) => {
			ctx = context;
			if (!active() || event.outcome !== "completed") return;
			const changed = tracker.list();
			if (!changed.length || !config!.rules.length) return;
			rules = checkRules(changed, config!.rules, read, ctx.sessionManager.getSessionId(), (deps.today ?? localDate)());
			render();
			if (!rules.length || steered || !config!.steer) return;
			steered = true; steers++;
			return {
				entries: [...event.entries, { type: "custom_message", customType: STEER_TYPE, content: steeringMessage(rules), display: true, details: { findings: rules } }],
				continue: true,
			};
		});

		pi.on("agent_settled", (event, context) => {
			ctx = context;
			if (event.aborted || !active()) return;
			try { if (!ctx.isIdle() || ctx.hasPendingMessages()) return; } catch { return; }
			const changed = tracker.list().map((c) => c.path);
			const ctx_ = changed.length && config!.judge && config!.judgments.length && startAfter !== undefined ? buildContext(ctx.sessionManager.getBranch(), startAfter, changed, config!) : undefined;
			if (!ctx_) { render(true); return; }
			cancel(); const mine = revision; const request = new AbortController(); pending = request;
			identity = { session: ctx.sessionManager.getSessionId(), leaf: messageLeaf() };
			judgeState = "checking"; findings = []; render();
			const registry = ctx.modelRegistry; const snapshot = { ...config!, models: [...config!.models] };
			void judge(registry, ctx_, snapshot, request.signal, deps.lowestThinking).then((result) => {
				// Aggregate usage is kept even when the visible result became stale.
				calls += result.attempts.filter((a) => a.outcome !== "unavailable").length;
				for (const a of result.attempts) { input += a.input ?? 0; output += a.output ?? 0; cost += a.cost ?? 0; }
				if (mine !== revision || request.signal.aborted) return;
				pending = undefined;
				if (!current()) { judgeState = "discarded"; render(); return; }
				last = result; judgeState = result.outcome === "ready" ? "ready" : "failed"; findings = result.findings; render(true);
			}, () => { if (mine === revision && current()) { judgeState = "failed"; render(true); } });
		});

		for (const name of ["session_before_switch", "session_before_fork", "session_before_tree", "session_tree"] as const) {
			pi.on(name, (_event: any, context: ExtensionContext) => { ctx = context; newRequest(); });
		}
		pi.on("session_shutdown", () => {
			cancel();
			try { ctx?.ui.setStatus(KEY, undefined); } catch { /* Idempotent stale-context cleanup. */ }
			ctx = undefined; identity = undefined;
		});
		pi.registerCommand("wrapup-audit", {
			description: "Show wrap-up audit findings and status; on/off changes this session only",
			handler: async (args, context) => {
				ctx = context;
				if (ctx.mode !== "tui") { ctx.ui.notify("Wrap-up audit runs only in TUI mode.", "warning"); return; }
				const command = args.trim();
				// Toggling clears shown results and pending work but keeps the request's tracking and steering guard.
				if ((command === "on" || command === "off") && config) { config.enabled = command === "on"; warned = ""; clearResults(); }
				else if (command && command !== "status") { ctx.ui.notify("Usage: /wrapup-audit [status|on|off]", "error"); return; }
				ctx.ui.notify(status(), "info");
			},
		});
	};
}
