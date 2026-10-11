/**
 * subagent — delegate bounded read-only work to fresh-context child agents.
 *
 * Plan: docs/plans/2026-10-11-subagent-extension.md
 *
 * Phase 1: one child per call (`agent` + `task`), roles `reviewer` and `explorer`,
 * provider copying, a shared child runtime, output files with previews, abort.
 * Phase 2: `tasks` (1-4 children in parallel), per-child progress, call/result
 * rendering, and per-role context files (reviewer follows the parent; explorer none).
 */
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isRoleName, loadRoles, ROLE_NAMES, type RoleDefinition, type RoleName } from "./agents.ts";
import { loadConfig, MIN_REVIEW_MODELS, MAX_REVIEW_MODELS } from "./config.ts";
import { formatBytes } from "./output.ts";
import { type CallArgs, type ChildRow, callText, formatDuration, resultText, reviewSummary, reviewSummaryText, type ReviewSummary, type ThemeLike } from "./render.ts";
import { type Candidate, type ChildResult, type ContextFile, createChildRunner, diagnostic, failureResult, modelIdentity, addUsage, ZERO_USAGE, type ParentContext, type RunnerOptions } from "./runner.ts";
import { captureBaseline } from "./review-diff.ts";

export const TOOL_NAME = "subagent";
export const MAX_TASKS = 4;

export const TOOL_DESCRIPTION = [
	"Delegate bounded read-only work to child agents that start with fresh context.",
	"Roles: explorer maps the relevant code and reports locations with file:line; reviewer independently reviews a change, files, plan, or document and reports evidence-backed findings with a merge verdict.",
	"Each child sees only its task text (reviewers also get the project's context files), has read-only tools (reviewer also has review_diff for uncommitted changes), cannot delegate, and returns its final answer.",
	`Use agent+task for one child, tasks (up to ${MAX_TASKS}) for manual parallel work, or review: {task} for the configured review roster.`,
	"Explicit model overrides are strict (no fallback). Explorer defaults can have configured error fallback; review roster slots never replace models.",
	"Long answers return a preview plus the path of a file with the full text.",
].join(" ");

export const PROMPT_SNIPPET = "Delegate read-only exploration (explorer) or independent review (reviewer) to fresh-context child agents, one or several in parallel";

export const PROMPT_GUIDELINES = [
	"Use subagent with agent \"explorer\" on your own judgment for broad exploration of unfamiliar code or to keep large searches out of your context; do not use it to look up one or two known files.",
	"Use subagent with agent \"reviewer\" only when the user or applicable instructions ask for a review; the size or risk of a task alone is not a reason.",
	"Write each subagent task to be self-contained: the child does not see this conversation. State the goal, the paths or target, and what to report.",
	"Use subagent tasks to run independent children in parallel, each with a distinct scope or angle; do not split work that depends on another child's result.",
	"Reviewers read uncommitted changes themselves with review_diff; for commits, plans, or documents, name the files or write a diff file and pass its path in the task.",
	"Before editing code or presenting conclusions based on a subagent report, verify the file:line claims you rely on by reading them.",
	"For /review use subagent with review: {task}; the extension assigns the configured distinct models. Do not substitute unspecified-model tasks or guess the roster. Report incomplete coverage and missing models; with no successful reviews give no merge verdict.",
];

const TASK_PROPERTIES = {
	agent: { type: "string", enum: [...ROLE_NAMES], description: "Role: explorer or reviewer." },
	task: { type: "string", description: "Self-contained task for the child: goal, target paths, and what to report." },
	model: { type: "string", description: "Optional strict model override as provider/id, with an optional :thinking suffix; disables fallback." },
} as const;

const PARAMETERS = {
	type: "object",
	properties: {
		...TASK_PROPERTIES,
		review: {
			type: "object", description: "Run one independent strict reviewer per configured roster model (2-4 in parallel).",
			properties: { task: TASK_PROPERTIES.task }, required: ["task"], additionalProperties: false,
		},
		tasks: {
			type: "array",
			minItems: 1,
			maxItems: MAX_TASKS,
			description: `Run 1-${MAX_TASKS} children in parallel instead of agent+task.`,
			items: { type: "object", properties: TASK_PROPERTIES, required: ["agent", "task"], additionalProperties: false },
		},
	},
	additionalProperties: false,
} as const;

export interface TaskRequest {
	agent: RoleName;
	task: string;
	model?: string;
}

/** Validate exclusive manual forms or expand the explicit configured review roster. */
export function parseRequests(params: CallArgs, reviewModels?: readonly string[]): TaskRequest[] {
	const single = params.agent !== undefined || params.task !== undefined || params.model !== undefined;
	if (params.review !== undefined) {
		if (single || params.tasks !== undefined) throw new Error("Use review, agent+task, or tasks, not a mixture.");
		const value = params.review;
		if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).some((key) => key !== "task")) throw new Error("review must contain only a task.");
		const task = (value as { task?: unknown }).task;
		if (typeof task !== "string" || !task.trim()) throw new Error("review.task must be a non-empty string.");
		if (!reviewModels || reviewModels.length < MIN_REVIEW_MODELS || reviewModels.length > MAX_REVIEW_MODELS) throw new Error(`Configure review.models with ${MIN_REVIEW_MODELS}-${MAX_REVIEW_MODELS} distinct models in subagent.json before running /review. Parent-model substitution is not allowed.`);
		return reviewModels.map((model) => ({ agent: "reviewer", task: task.trim(), model }));
	}
	if (params.tasks !== undefined && single) throw new Error("Use either agent+task or tasks, not both.");
	if (params.tasks === undefined && !single) throw new Error("Provide agent and task, or tasks.");
	const items = params.tasks === undefined ? [params] : params.tasks;
	if (!Array.isArray(items) || items.length < 1 || items.length > MAX_TASKS) {
		throw new Error(`tasks must contain 1-${MAX_TASKS} items.`);
	}
	return items.map((item, index) => {
		const where = params.tasks === undefined ? "subagent" : `tasks[${index}]`;
		const { agent, task, model } = (item ?? {}) as CallArgs;
		if (!isRoleName(agent)) throw new Error(`${where}: unknown role "${String(agent)}". Available: ${ROLE_NAMES.join(", ")}.`);
		if (typeof task !== "string" || !task.trim()) throw new Error(`${where}: task must be a non-empty string.`);
		if (model !== undefined && (typeof model !== "string" || !model.trim())) throw new Error(`${where}: model must be a non-empty string.`);
		return { agent, task: task.trim(), ...(typeof model === "string" ? { model: model.trim() } : {}) };
	});
}

export interface SubagentExtensionOptions extends RunnerOptions {
	/** Directory with the role files (default: ./agents next to this module). */
	rolesDir?: string;
	/** TUI text component for call/result rendering; rendering falls back to pi's default without it. */
	tui?: { Text: new (text: string, paddingX: number, paddingY: number) => unknown };
}

const PLAIN_THEME: ThemeLike = { fg: (_color, text) => text, bold: (text) => text };

export function formatResult(result: ChildResult): string {
	const calls = result.toolCalls === 1 ? "1 tool call" : `${result.toolCalls} tool calls`;
	const header = `## ${result.agent} · ${result.model} · ${result.status} (${formatDuration(result.durationMs)}, ${calls})`;
	const warnings = result.warnings.map((warning) => `Warning: ${warning}`);
	return [header, ...warnings, ...attemptTransitions(result), "", result.preview].join("\n");
}

function attemptTransitions(result: ChildResult): string[] {
	return (result.attempts ?? []).slice(1).map((attempt, i) => `Tried ${attempt.model} — previous model attempt failed: ${result.attempts![i]!.error ?? "Model unavailable."}`);
}

export function resultDetails(result: ChildResult, task: string): ChildRow & Record<string, unknown> {
	return {
		agent: result.agent,
		task,
		model: result.model,
		status: result.status,
		durationMs: result.durationMs,
		toolCalls: result.toolCalls,
		usage: result.usage,
		text: result.preview,
		...(result.outputFile ? { outputFile: result.outputFile.path, outputSize: formatBytes(result.outputFile.bytes) } : {}),
		...(result.error ? { error: result.error } : {}),
		...(result.warnings.length ? { warnings: result.warnings } : {}),
		...(result.phase ? { phase: result.phase } : {}),
		...(result.attempts ? { attempts: result.attempts, transitions: attemptTransitions(result) } : {}),
	};
}

function failedResult(request: TaskRequest, error: unknown, durationMs: number): ChildResult {
	return failureResult(request.agent, request.model ?? "(unresolved)", error, "setup", durationMs);
}

export function createSubagentExtension(options: SubagentExtensionOptions) {
	const rolesDir = options.rolesDir ?? fileURLToPath(new URL("./agents/", import.meta.url));
	const agentDir = options.agentDir ?? (() => options.sdk.getAgentDir());

	return function subagentExtension(pi: ExtensionAPI): void {
		const roles: Record<RoleName, RoleDefinition> = loadRoles(rolesDir, options.sdk.parseFrontmatter);
		const runner = createChildRunner({ ...options, agentDir });
		let index = 0;
		// The parent's prompt options of its latest turn; read lazily so later handlers' filters apply (S6).
		let promptOptions: { contextFiles?: readonly ContextFile[] } | undefined;

		pi.on("session_start", async (_event, ctx) => {
			runner.reset();
			promptOptions = undefined;
			const { error } = loadConfig(agentDir(), ROLE_NAMES);
			if (error && ctx.hasUI) ctx.ui.notify(`subagent: ${diagnostic(error)}`, "error");
		});
		pi.on("session_shutdown", async () => runner.reset());
		pi.on("before_agent_start", async (event) => {
			promptOptions = event.systemPromptOptions;
		});

		const Text = options.tui?.Text;
		pi.registerTool({
			name: TOOL_NAME,
			label: "Subagent",
			description: TOOL_DESCRIPTION,
			promptSnippet: PROMPT_SNIPPET,
			promptGuidelines: PROMPT_GUIDELINES,
			parameters: PARAMETERS,
			// Both roles are read-only, so plan mode keeps this tool (plan S17).
			annotations: { readOnlyHint: true },
			async execute(_toolCallId, params, signal, onUpdate, ctx) {
				const startedCall = Date.now();
				const config = loadConfig(agentDir(), ROLE_NAMES);
				if (config.error) throw new Error(`subagent configuration error: ${diagnostic(config.error)}`);
				const isReview = (params as CallArgs).review !== undefined;
				const requests = parseRequests(params as CallArgs, config.config.review?.models);
				const withModels = requests.map((request) => {
					const roleConfig = config.config.agents[request.agent];
					return { ...request, model: request.model ?? roleConfig?.model,
						fallbacks: request.agent === "explorer" && request.model === undefined ? roleConfig?.fallbackModels ?? [] : [] };
				});
				const baseline = isReview ? { value: captureBaseline(ctx.cwd) } : undefined;
				const parent: ParentContext = {
					modelRegistry: ctx.modelRegistry,
					model: ctx.model,
					thinkingLevel: pi.getThinkingLevel(),
					sessionFile: ctx.sessionManager.getSessionFile(),
					contextFiles: promptOptions?.contextFiles,
				};
				// Validate/preflight the whole request before launch; roster errors are slot-local.
				const prepared = await Promise.all(withModels.map(async (request): Promise<Candidate[]> => {
					if (signal?.aborted) return [{ spec: request.model }];
					try {
						return isReview || request.fallbacks.length ? await runner.prepareChain([request.model, ...request.fallbacks], parent)
							: [{ spec: request.model, prepared: await runner.prepare(request, parent) }];
					} catch (error) {
						if (signal?.aborted) return [{ spec: request.model }];
						throw new Error(diagnostic(error));
					}
				}));
				if (isReview && !signal?.aborted) {
					const identities = prepared.flatMap((list) => list[0]?.prepared ? [modelIdentity(list[0].prepared)] : []);
					if (new Set(identities).size !== identities.length) throw new Error("review.models resolves to duplicate model identities; each model must participate only once.");
				}
				const rows: ChildRow[] = withModels.map((request) => ({ agent: request.agent, task: request.task, status: "starting", toolCalls: 0,
					...(isReview ? { requestedModel: request.model } : {}) }));
				const emit = () => {
					const review = isReview ? reviewSummary(rows) : undefined;
					onUpdate?.({ content: [{ type: "text", text: resultText(rows, { expanded: false }, PLAIN_THEME, review) }],
						details: { children: rows.map((row) => ({ ...row })), ...(review ? { review } : {}) } });
				};
				emit();
				const results = await Promise.all(withModels.map(async (request, i) => {
					const started = Date.now();
					const row = rows[i]!;
					try {
						const child = { role: roles[request.agent], task: request.task, model: request.model, cwd: ctx.cwd, index: ++index, baseline };
						const eventHandler = (event: import("./runner.ts").ChildEvent) => {
							if (event.type === "start") Object.assign(row, { status: "running", model: event.model, currentTool: undefined });
							else if (event.type === "fallback") Object.assign(row, { status: "starting", model: event.model, currentTool: undefined,
								transitions: [...(row.transitions ?? []), `Trying ${event.model} — previous model attempt failed: ${event.reason}`] });
							else if (event.type === "tool_start") Object.assign(row, { toolCalls: row.toolCalls + 1, currentTool: event.name });
							else row.currentTool = undefined;
							emit();
						};
						const candidate = prepared[i]![0]!;
						const result = request.fallbacks.length ? await runner.runChain(child, parent, prepared[i]!, signal, eventHandler)
							: signal?.aborted ? failureResult(request.agent, request.model ?? "(unresolved)", "Aborted.", "cancelled")
							: candidate.prepared ? await runner.run(child, parent, signal, eventHandler, candidate.prepared)
							: failureResult(request.agent, `${request.model} (unresolved)`, candidate.error, "resolution");
						Object.assign(row, resultDetails(result, request.task), { currentTool: undefined });
						emit();
						return result;
					} catch (error) {
						const result = signal?.aborted ? failureResult(request.agent, request.model ?? "(unresolved)", "Aborted.", "cancelled", Date.now() - started)
							: failedResult(request, error, Date.now() - started);
						Object.assign(row, resultDetails(result, request.task), { currentTool: undefined });
						emit();
						return result;
					}
				}));
				const review = isReview ? reviewSummary(rows) : undefined;
				const usage = { ...ZERO_USAGE };
				for (const result of results) addUsage(usage, result.usage);
				return {
					content: [{ type: "text" as const, text: [ ...(review ? [reviewSummaryText(review)] : []), ...results.map(formatResult) ].join("\n\n") }],
					details: { children: results.map((result, i) => ({ ...resultDetails(result, requests[i]!.task),
						...(isReview ? { requestedModel: requests[i]!.model } : {}) })),
						...(review ? { review, usage, toolCalls: results.reduce((n, r) => n + r.toolCalls, 0), durationMs: Date.now() - startedCall } : {}) },
					...(results.some((result) => result.status === "completed") ? {} : { isError: true }),
				};
			},
			...(Text
				? {
					renderCall: (args: CallArgs, theme: ThemeLike) => new Text(callText(args, theme), 0, 0),
					renderResult: (result: { content: Array<{ type: string; text?: string }>; details?: { children?: ChildRow[]; review?: ReviewSummary } }, { expanded }: { expanded: boolean }, theme: ThemeLike) => {
						const rows = result.details?.children;
						const text = Array.isArray(rows)
							? resultText(rows, { expanded }, theme, result.details?.review)
							: result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
						return new Text(text, 0, 0);
					},
				}
				: {}),
		} as Parameters<ExtensionAPI["registerTool"]>[0]);
	};
}
