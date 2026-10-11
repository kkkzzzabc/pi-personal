/**
 * plan-mode — OpenCode-style plan ↔ build modes for pi.
 *
 * Plan: docs/plans/2026-10-11-plan-mode-extension.md
 *
 * Phase 1: mode state, toggles (`/plan`, Ctrl+Alt+P, `--plan`), plan-mode tool
 * set, plan-file-only write guard, persistence and restore.
 * Phase 2: enter/leave notes (delivered with the next prompt), a per-request
 * reminder (`context`, not persisted), and the plan-mode thinking level.
 * Phase 3: `enter_plan_mode` (user confirms) and `exit_plan_mode` (approval:
 * implement here, implement in a fresh session, feedback, keep planning).
 * Phase 4: one enter/leave note per prompt (`before_agent_start`) reflecting only the
 * current state; configurable toggle shortcut.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, type PlanModeConfig } from "./config.ts";
import { type Delivered, INITIAL_DELIVERED, latestDelivered, noteFor } from "./delivery.ts";
import { createPlanFilePath, targetsFile } from "./paths.ts";
import {
	ALREADY_PLANNING, APPROVED_FRESH_RESULT, approvedHereResult, DISMISSED_RESULT, ENTER_DECLINED, ENTER_NO_UI,
	ENTER_TOOL_DESCRIPTION, ENTER_TOOL_GUIDELINES, enteredResult, EXIT_TOOL_DESCRIPTION,
	EXIT_TOOL_GUIDELINES, feedbackResult, implementFreshPrompt, missingPlanResult,
	noUiPlanResult, NOT_PLANNING, shortReminder,
} from "./prompts.ts";
import { BUILD_STATE, type PlanState, restoreState, STATE_ENTRY_TYPE } from "./state.ts";
import { computeBuildTools, computePlanTools, GUARDED_WRITE_TOOLS, PLAN_ONLY_TOOLS } from "./tools.ts";

const STATUS_KEY = "plan-mode";
const IMPLEMENT_FRESH = "implement-fresh";
const SUBCOMMANDS = [
	{ value: "on", label: "on", description: "Enter plan mode" },
	{ value: "off", label: "off", description: "Leave plan mode" },
	{ value: "path", label: "path", description: "Show the current or last approved plan file" },
	{ value: IMPLEMENT_FRESH, label: IMPLEMENT_FRESH, description: "Implement the last approved plan in a fresh session" },
];

export const APPROVAL_CHOICES = {
	here: "Approve and implement here",
	fresh: "Approve and implement in a fresh session",
	feedback: "Give feedback",
	keep: "Stay in plan mode and pause",
} as const;

const NO_PARAMETERS = { type: "object", properties: {}, additionalProperties: false };
const ENTER_PARAMETERS = {
	type: "object",
	properties: { reason: { type: "string", description: "Why planning first helps, shown to the user." } },
	additionalProperties: false,
};

export interface PlanModeOptions {
	/** Override config loading (tests). */
	loadConfig?: () => ReturnType<typeof loadConfig>;
	/** Override plan file naming (tests). */
	createPlanFile?: (plansDir: string) => string;
}

export function blockReason(toolName: string, planFile: string | undefined): string {
	return [
		`Plan mode: ${toolName} may only modify the plan file ${planFile ?? "(none)"}.`,
		"Write the plan there and call exit_plan_mode for approval; do not change other files in plan mode.",
	].join(" ");
}

type ThinkingLevel = Parameters<ExtensionAPI["setThinkingLevel"]>[0];

function textResult(text: string, extra: { isError?: boolean; terminate?: boolean; delivered?: Delivered } = {}) {
	const { delivered, ...flags } = extra;
	return { content: [{ type: "text" as const, text }], details: delivered ? { planModeDelivered: delivered } : {}, ...flags };
}

function readPlan(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

export function createPlanMode(options: PlanModeOptions = {}) {
	return function planMode(pi: ExtensionAPI): void {
		let state: PlanState = { ...BUILD_STATE };
		/** Approved plan waiting to be implemented in a fresh session at agent_end. */
		let pendingFresh: string | undefined;
		/** Plan-mode state the model was last told about (notes and tool results). */
		let delivered: Delivered = { ...INITIAL_DELIVERED };
		// Loaded at registration: the shortcut must be registered now. Warnings show at session start.
		const loaded = (options.loadConfig ?? loadConfig)();
		const config: PlanModeConfig = loaded.config;
		let configWarnings = loaded.warnings;

		function getConfig(ctx: ExtensionContext): PlanModeConfig {
			for (const warning of configWarnings) ctx.ui.notify(`plan-mode: ${warning}`, "warning");
			configWarnings = [];
			return config;
		}

		function persist(next: PlanState): void {
			state = next;
			pi.appendEntry(STATE_ENTRY_TYPE, next);
		}

		function updateStatus(ctx: ExtensionContext): void {
			if (state.mode !== "plan") {
				ctx.ui.setStatus(STATUS_KEY, undefined);
				return;
			}
			const label = "⏸ plan";
			ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme ? ctx.ui.theme.fg("warning", label) : label);
		}

		function applyTools(ctx: ExtensionContext): void {
			if (state.mode === "plan") {
				pi.setActiveTools(computePlanTools(state.toolsBefore ?? [], pi.getAllTools(), getConfig(ctx).extraTools));
				return;
			}
			const active = pi.getActiveTools();
			if (active.some((name) => PLAN_ONLY_TOOLS.has(name))) pi.setActiveTools(computeBuildTools(active));
		}

		/** Returns the plan file, or undefined when plan mode could not start. */
		function enterPlan(ctx: ExtensionContext): string | undefined {
			if (state.mode === "plan") {
				ctx.ui.notify(`Already in plan mode. Plan file: ${state.planFile}`, "info");
				return undefined;
			}
			const cfg = getConfig(ctx);
			const planFile = (options.createPlanFile ?? createPlanFilePath)(cfg.plansDir);
			try {
				mkdirSync(dirname(planFile), { recursive: true });
			} catch (error) {
				ctx.ui.notify(`plan-mode: cannot create ${dirname(planFile)}: ${(error as Error).message}`, "error");
				return undefined;
			}
			persist({
				mode: "plan",
				planFile,
				toolsBefore: pi.getActiveTools(),
				thinkingBefore: pi.getThinkingLevel(),
				...(state.approvedPlanFile ? { approvedPlanFile: state.approvedPlanFile } : {}),
			});
			applyTools(ctx);
			pi.setThinkingLevel(cfg.thinkingLevel as ThinkingLevel);
			updateStatus(ctx);
			ctx.ui.notify(`Plan mode on. Plan file: ${planFile}`, "info");
			return planFile;
		}

		function leavePlan(ctx: ExtensionContext, approved = false): void {
			if (state.mode !== "plan") {
				ctx.ui.notify("Already in build mode.", "info");
				return;
			}
			const saved = state.toolsBefore ?? pi.getActiveTools();
			const thinkingBefore = state.thinkingBefore;
			const approvedPlanFile = approved ? state.planFile : state.approvedPlanFile;
			persist({ mode: "build", ...(approvedPlanFile ? { approvedPlanFile } : {}) });
			pi.setActiveTools(computeBuildTools(saved));
			if (thinkingBefore) pi.setThinkingLevel(thinkingBefore as ThinkingLevel);
			updateStatus(ctx);
			ctx.ui.notify(approved ? `Plan approved. Build mode active. Plan: ${approvedPlanFile}` : "Plan mode off. Build mode active.", "info");
		}

		function toggle(ctx: ExtensionContext): void {
			if (state.mode === "plan") leavePlan(ctx);
			else enterPlan(ctx);
		}

		function restore(ctx: ExtensionContext): void {
			const branch = ctx.sessionManager.getBranch();
			state = restoreState(branch);
			delivered = latestDelivered(branch as Parameters<typeof latestDelivered>[0]);
			pendingFresh = undefined;
			applyTools(ctx);
			updateStatus(ctx);
		}

		async function implementFresh(ctx: ExtensionCommandContext): Promise<void> {
			const planFile = state.approvedPlanFile;
			if (state.mode === "plan" || !planFile) {
				ctx.ui.notify("No approved plan to implement. Approve a plan with exit_plan_mode first.", "error");
				return;
			}
			const plan = readPlan(planFile);
			if (plan.trim() === "") {
				ctx.ui.notify(`The approved plan file is missing or empty: ${planFile}`, "error");
				return;
			}
			await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				setup: async (sessionManager) => {
					sessionManager.appendCustomEntry(STATE_ENTRY_TYPE, { mode: "build", approvedPlanFile: planFile });
				},
				withSession: async (replaced) => {
					await replaced.sendUserMessage(implementFreshPrompt(planFile, plan));
				},
			});
		}

		pi.registerFlag("plan", { description: "Start in plan mode", type: "boolean", default: false });

		pi.registerCommand("plan", {
			description: "Plan mode: toggle, or on | off | path | implement-fresh",
			getArgumentCompletions: (prefix) => {
				const items = SUBCOMMANDS.filter((item) => item.value.startsWith(prefix.trim().toLowerCase()));
				return items.length > 0 ? items : null;
			},
			handler: async (args, ctx) => {
				const sub = args.trim().toLowerCase();
				if (sub === "") toggle(ctx);
				else if (sub === "on") enterPlan(ctx);
				else if (sub === "off") leavePlan(ctx);
				else if (sub === IMPLEMENT_FRESH) await implementFresh(ctx);
				else if (sub === "path") {
					const message = state.mode === "plan"
						? `Plan file: ${state.planFile}`
						: state.approvedPlanFile
							? `Last approved plan: ${state.approvedPlanFile}`
							: "No plan file. Enter plan mode with /plan.";
					ctx.ui.notify(message, "info");
				} else ctx.ui.notify(`Unknown /plan argument "${sub}". Use: /plan [on|off|path|${IMPLEMENT_FRESH}]`, "error");
			},
		});

		pi.registerShortcut(config.shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
			description: "Toggle plan mode",
			handler: async (ctx) => toggle(ctx),
		});

		pi.registerTool({
			name: "enter_plan_mode",
			label: "Enter plan mode",
			description: ENTER_TOOL_DESCRIPTION,
			promptSnippet: "Ask the user to switch to plan mode before non-trivial changes",
			promptGuidelines: ENTER_TOOL_GUIDELINES,
			parameters: ENTER_PARAMETERS as never,
			executionMode: "sequential",
			async execute(_id, params: { reason?: string }, _signal, _onUpdate, ctx) {
				if (state.mode === "plan") return textResult(ALREADY_PLANNING);
				if (!ctx.hasUI) return textResult(ENTER_NO_UI);
				const ok = await ctx.ui.confirm(
					"Switch to plan mode?",
					params.reason?.trim() || "The agent wants to plan this work before making changes.",
				);
				if (!ok) return textResult(ENTER_DECLINED);
				const planFile = enterPlan(ctx);
				if (!planFile) return textResult("Plan mode could not start; continue in build mode.", { isError: true });
				delivered = { mode: "plan", planFile };
				return textResult(enteredResult(planFile), { delivered });
			},
		});

		pi.registerTool({
			name: "exit_plan_mode",
			label: "Exit plan mode",
			description: EXIT_TOOL_DESCRIPTION,
			promptSnippet: "Ask the user to approve the written plan and leave plan mode",
			promptGuidelines: EXIT_TOOL_GUIDELINES,
			parameters: NO_PARAMETERS as never,
			executionMode: "sequential",
			defaultActive: false,
			async execute(_id, _params, _signal, _onUpdate, ctx) {
				if (state.mode !== "plan" || !state.planFile) return textResult(NOT_PLANNING, { isError: true });
				const planFile = state.planFile;
				const plan = readPlan(planFile);
				if (plan.trim() === "") return textResult(missingPlanResult(planFile), { isError: true });
				if (!ctx.hasUI) return textResult(noUiPlanResult(planFile, plan));

				const choice = await ctx.ui.select(`Plan ready (${planFile}). How to proceed?`, Object.values(APPROVAL_CHOICES));
				if (choice === APPROVAL_CHOICES.here) {
					leavePlan(ctx, true);
					delivered = { mode: "build" };
					return textResult(approvedHereResult(planFile, plan), { delivered });
				}
				if (choice === APPROVAL_CHOICES.fresh) {
					leavePlan(ctx, true);
					pendingFresh = planFile;
					delivered = { mode: "build" };
					return textResult(APPROVED_FRESH_RESULT, { terminate: true, delivered });
				}
				if (choice === APPROVAL_CHOICES.feedback) {
					const feedback = (await ctx.ui.editor("Feedback on the plan", ""))?.trim();
					if (feedback) return textResult(feedbackResult(planFile, feedback));
				}
				return textResult(DISMISSED_RESULT, { terminate: true });
			},
		});

		pi.on("tool_call", async (event, ctx) => {
			if (pendingFresh) {
				// The plan was approved for a fresh session; stop this turn's remaining calls.
				return { block: true, reason: APPROVED_FRESH_RESULT, terminate: true };
			}
			if (state.mode !== "plan" || !GUARDED_WRITE_TOOLS.has(event.toolName)) return;
			const path = (event.input as { path?: unknown }).path;
			if (typeof path === "string" && state.planFile && targetsFile(path, ctx.cwd, state.planFile)) return;
			return { block: true, reason: blockReason(event.toolName, state.planFile) };
		});

		pi.on("context", async (event) => {
			if (state.mode !== "plan" || !state.planFile) return;
			return {
				messages: [
					...event.messages,
					{ role: "user", content: [{ type: "text", text: shortReminder(state.planFile) }], timestamp: Date.now() },
				],
			};
		});

		pi.on("before_agent_start", async () => {
			const note = noteFor(delivered, state);
			if (!note) return;
			delivered = note.details.planModeDelivered;
			return { message: { customType: note.customType, content: note.content, display: false, details: note.details } };
		});

		pi.on("agent_end", async () => {
			if (!pendingFresh) return;
			pendingFresh = undefined;
			// Session control needs a command context; dispatch our own command.
			pi.sendUserMessage(`/plan ${IMPLEMENT_FRESH}`, { expandPromptTemplates: true });
		});

		pi.on("session_start", async (event, ctx) => {
			restore(ctx);
			if (event.reason === "startup" && pi.getFlag("plan") === true && state.mode !== "plan") enterPlan(ctx);
		});

		pi.on("session_tree", async (_event, ctx) => restore(ctx));
	};
}

export default createPlanMode();
