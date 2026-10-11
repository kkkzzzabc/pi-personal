/**
 * Model-facing texts for plan mode.
 *
 * - Enter note: persisted with the next prompt when plan mode starts (rules, workflow, plan structure).
 * - Short reminder: appended to every model request while in plan mode (not persisted),
 *   so it survives compaction and cannot accumulate.
 * - Leave note: persisted with the next prompt when plan mode ends.
 * - Tool texts: descriptions and results of enter_plan_mode / exit_plan_mode.
 */

export const ENTER_NOTE_TYPE = "plan-mode-enter";
export const LEAVE_NOTE_TYPE = "plan-mode-leave";

function reminder(body: string): string {
	return `<system-reminder>\n${body.trim()}\n</system-reminder>`;
}

export function enterNote(planFile: string): string {
	return reminder(`
Plan mode is active. Plan the work; do not do it.

Rules:
- Do not modify the project or the system. The only file you may create or edit is the plan file:
  ${planFile}
- Read-only tools and non-mutating commands are fine, including tests or builds that only write caches or build artifacts.
- Do not run formatters, code generators, migrations, installs, commits, or other commands that change tracked files or system state.
- Do not ask subagents or other tools to make changes on your behalf.
- These rules hold until plan mode ends, even if the user asks you to implement. If asked to implement, explain that plan mode is active and continue planning.

Workflow:
- If the user asks a question (an inquiry), answer it directly without writing a plan.
- If the user asks for a change (a directive):
  1. Explore the relevant code with read-only tools.
  2. Clarify with the user when requirements are ambiguous or a trade-off needs their decision.
  3. Write the plan to the plan file.
  4. Summarize the plan in the chat (goal, main steps, verification), then call exit_plan_mode to ask the user to approve it. The approval prompt does not show the plan, so the summary is what the user reviews. Do not ask for approval in plain text.

Plan structure, scaled to the task:
- Simple: the specific changes and how to verify them.
- Standard: objective, key files and context, implementation steps, verification and testing.
- Complex: background and motivation, scope and impact, proposed solution, alternatives considered, phased implementation, verification, migration and rollback.
`);
}

export function shortReminder(planFile: string): string {
	return reminder(`
Plan mode is still active. Do not modify the project or the system; the only writable file is the plan file ${planFile}. Answer inquiries directly; for directives, explore, clarify, write the plan, then call exit_plan_mode.
`);
}

export function leaveNote(approvedPlanFile?: string): string {
	const approved = approvedPlanFile
		? `\nThe user approved the plan in ${approvedPlanFile}. Implement it; it is the source of truth for this work.`
		: "";
	return reminder(`
Plan mode has ended. The plan-mode restrictions no longer apply; normal tools and permissions are back.${approved}
`);
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const ENTER_TOOL_DESCRIPTION = [
	"Ask the user to switch to plan mode before making changes.",
	"Use it before non-trivial work: new features, changes across several files, architectural decisions,",
	"several valid approaches, or unclear requirements. Do not use it for small, clear fixes or pure questions.",
	"The user must confirm; if they decline, continue in build mode.",
].join(" ");

export const EXIT_TOOL_DESCRIPTION = [
	"Ask the user to approve the plan and leave plan mode.",
	"Call it only after writing the complete plan to the plan file; it reads the plan from that file.",
	"The approval prompt does not display the plan, so summarize the plan in the chat right before calling it.",
	"Do not ask for approval in plain text; this tool asks the user for the decision.",
].join(" ");

export const ENTER_TOOL_GUIDELINES = [
	"Use enter_plan_mode before non-trivial or ambiguous changes so the user can approve a plan first.",
];

export const EXIT_TOOL_GUIDELINES = [
	"In plan mode, finish by writing the plan file, summarizing it in the chat, and calling exit_plan_mode; never ask for plan approval in plain text.",
];

export function enteredResult(planFile: string): string {
	return `The user approved plan mode. ${enterNote(planFile)}`;
}

export const ENTER_DECLINED = "The user declined plan mode. Continue in build mode.";
export const ENTER_NO_UI = "Plan mode needs the user's confirmation, but no interactive UI is available. Continue in build mode, or ask the user to run /plan.";
export const ALREADY_PLANNING = "Plan mode is already active. Write the plan file, then call exit_plan_mode.";
export const NOT_PLANNING = "Plan mode is not active. exit_plan_mode is only available in plan mode.";

export function missingPlanResult(planFile: string): string {
	return `The plan file is missing or empty. Write the complete plan to ${planFile}, then call exit_plan_mode again.`;
}

export function noUiPlanResult(planFile: string, plan: string): string {
	return `No interactive UI is available to approve the plan, so plan mode stays active. The plan in ${planFile} is:\n\n${plan}`;
}

export function approvedHereResult(planFile: string, plan: string): string {
	return `The user approved the plan. Build mode is active; implement the plan now, following it as the source of truth.\nPlan file: ${planFile}\n\n${plan}`;
}

export const APPROVED_FRESH_RESULT = "The user approved the plan. Implementation continues in a fresh session; stop here.";

export function feedbackResult(planFile: string, feedback: string): string {
	return `The user did not approve the plan yet and gave feedback:\n\n${feedback}\n\nRevise ${planFile} accordingly, then call exit_plan_mode again.`;
}

export const DISMISSED_RESULT = "The plan was not approved. Plan mode stays active; wait for the user's next message.";

export function implementFreshPrompt(planFile: string, plan: string): string {
	return [
		"A previous session produced the plan below and the user approved it.",
		"Implement it in this fresh session. Treat the plan as the source of user intent, re-read files as needed,",
		"and carry the work through implementation and verification.",
		`Plan file: ${planFile}`,
		"",
		plan,
	].join("\n");
}
