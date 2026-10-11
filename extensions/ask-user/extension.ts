import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FormController, resultContent, type Details, type StopDetails } from "./controller.ts";
import { normalizeForm, PARAMETERS, safeDisplay } from "./schema.ts";
import { QuestionComponent, type Interaction, type TuiLibrary } from "./ui.ts";

export const GUIDELINES = [
	"Use ask_user only for a material unresolved user choice after inspecting available facts; do not ask for routine implementation details or repeat settled choices.",
	"Prefer one focused question. Batch only 1-4 independent questions; respect the user's requested conversational pacing. Ask dependent questions later.",
	"Provide stable question IDs and option values, concise context and trade-offs. Do not author UI actions like Other, Discussion, or Cancel as options.",
	"Never include answer-dependent sibling tool calls with ask_user. Sequential execution is not an authorization barrier for calls listed before the question.",
	"A needs_discussion result is nonfinal context: explain unresolved choices and never assume missing answers. Submitted preferences are not blanket execution or plan approval.",
	"Do not request secrets. Cancel stops the turn; do not automatically re-ask or choose a recommendation. UI unavailable is not a user decline.",
];
interface Active { stop?: "cancelled" | "aborted"; close?: (kind: "cancelled" | "aborted") => void; component?: QuestionComponent }
export function createAskUserExtension(lib: TuiLibrary) {
	return (pi: ExtensionAPI) => {
		let active: Active | undefined;
		const receipt = (details: Details) => ({ content: [{ type: "text" as const, text: resultContent(details) }], details, ...("responses" in details ? {} : { isError: true }) });
		const failure = (outcome: StopDetails["outcome"], reason: string) => receipt({ outcome, reason });
		pi.on("session_shutdown", () => active?.close?.("aborted"));
		pi.registerTool({
			name: "ask_user", label: "Ask User", exposure: "model-only", executionMode: "sequential",
			annotations: { readOnlyHint: true },
			description: "Ask a material unresolved user decision in the parent Pi TUI. Supports 1-4 independent single/multi/text questions, custom answers and separate comments, review/edit, partial discussion, and cancellation. Not available in RPC/headless modes; does not approve executable plans.",
			promptSnippet: "Ask a focused user decision with structured choices, custom answers and comments in the parent TUI",
			promptGuidelines: GUIDELINES, parameters: PARAMETERS as any,
			async execute(_id, params, signal, _update, ctx) {
				if (active) return failure("busy", "Another ask_user form is active; wait for it to finish.");
				if (signal?.aborted) return failure("aborted", "Caller interrupted before the form opened.");
				if (!ctx.hasUI || ctx.mode !== "tui" || typeof ctx.ui.custom !== "function") return failure("unavailable", "ask_user requires the parent interactive TUI with custom UI. No question was shown; this is not a decline.");
				let controller: FormController;
				try { controller = new FormController(normalizeForm(params)); }
				catch (error) { return failure("invalid", (error as Error).message); }
				const owner: Active = {};
				active = owner;
				let completed = false;
				let complete: ((value: Interaction | { kind: "abort" }) => void) | undefined;
				owner.close = (kind) => {
					if (completed) return;
					owner.stop = kind;
					if (complete) { completed = true; complete({ kind: kind === "cancelled" ? "cancel" : "abort" }); }
				};
				const onAbort = () => owner.close?.("aborted");
				signal?.addEventListener("abort", onAbort, { once: true });
				try {
					const interaction = await ctx.ui.custom<Interaction | { kind: "abort" }>((tui, theme, keys, done) => {
						complete = done;
						const finish = (value: Interaction) => {
							if (completed) return;
							completed = true;
							if (value.kind === "cancel") owner.stop = "cancelled";
							done(value);
						};
						owner.component = new QuestionComponent(controller, tui, theme, keys, finish, lib);
						if (owner.stop || signal?.aborted) {
							completed = true;
							owner.stop = owner.stop ?? "aborted";
							done({ kind: owner.stop === "cancelled" ? "cancel" : "abort" });
						}
						return owner.component;
					});
					if (signal?.aborted && !owner.stop) owner.stop = "aborted";
					if (owner.stop || interaction?.kind === "cancel" || interaction?.kind === "abort") {
						const cancelled = owner.stop === "cancelled" || (!owner.stop && interaction?.kind === "cancel");
						if (cancelled || !signal?.aborted) ctx.abort();
						return failure(cancelled ? "cancelled" : "aborted", cancelled ? "User cancelled the form. The current turn is stopped; unsent drafts were discarded." : "Caller or session interrupted the form; unsent drafts were discarded.");
					}
					if (!interaction) return failure("unavailable", "The client did not provide a custom form UI; no answer was collected.");
					return receipt(controller.finish(interaction.kind === "discussion"));
				} catch (error) {
					if (owner.stop && !signal?.aborted) ctx.abort();
					return failure(owner.stop ?? "error", owner.stop ? "Interaction interrupted; unsent drafts were discarded." : (error as Error).message);
				} finally {
					completed = true;
					signal?.removeEventListener("abort", onAbort);
					owner.component?.dispose();
					if (active === owner) active = undefined;
				}
			},
			renderCall(args, theme) {
				const data = args as { title?: string; questions?: unknown[] };
				return new lib.Text(theme.fg("toolTitle", "ask_user ") + safeDisplay(`${data.title ?? "User decision"} (${data.questions?.length ?? 0} questions)`), 0, 0);
			},
			renderResult(result, options, theme) {
				const details = result.details as Details | undefined;
				const body = details ? options.expanded ? resultContent(details) : "responses" in details
					? `${details.outcome === "submitted" ? "Answers submitted" : "For discussion"}: ${details.responses.filter((r) => r.answered).length}/${details.responses.length} answered${details.unansweredIds.length ? `; unanswered: ${details.unansweredIds.join(", ")}` : ""}`
					: `${details.outcome}: ${details.reason}` : "ask_user result unavailable";
				return new lib.Text(theme.fg(result.isError ? "warning" : "toolTitle", safeDisplay(body)), 0, 0);
			},
		});
	};
}
