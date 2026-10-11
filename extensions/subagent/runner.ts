/** In-process read-only child sessions, strict attempts and fresh-context explorer fallback. */
import { dirname, join, resolve } from "node:path";
import type * as Pi from "@earendil-works/pi-coding-agent";
import type { RoleDefinition } from "./agents.ts";
import { outputDir, outputFileName, previewOutput, type SavedOutput, saveOutput } from "./output.ts";
import { captureBaseline, createReviewDiffTool, type DiffBaseline } from "./review-diff.ts";

export type Sdk = Pick<typeof Pi,
	"createAgentSession" | "DefaultResourceLoader" | "ModelRuntime" | "SessionManager" | "SettingsManager" | "resolveCliModel" | "getAgentDir" | "parseFrontmatter">;
type ModelRuntime = Awaited<ReturnType<Sdk["ModelRuntime"]["create"]>>;
type ProviderRegistry = Pick<Pi.ExtensionContext["modelRegistry"], "getRegisteredProviderIds" | "getRegisteredNativeProvider" | "getRegisteredProviderConfig">;
type Model = NonNullable<Pi.ExtensionContext["model"]>;

export interface ContextFile { path: string; content: string }
export interface ParentContext {
	modelRegistry: ProviderRegistry;
	model: Pick<Model, "provider" | "id"> | undefined;
	thinkingLevel: string | undefined;
	sessionFile: string | undefined;
	contextFiles: readonly ContextFile[] | undefined;
}
export interface ChildRequest {
	role: RoleDefinition;
	task: string;
	model: string | undefined;
	cwd: string;
	index: number;
	/** Wrapper distinguishes an absent shared baseline from a non-repository baseline. */
	baseline?: { value: DiffBaseline | undefined };
}
export type ChildStatus = "completed" | "failed" | "aborted";
export type FailurePhase = "resolution" | "model" | "input" | "setup" | "task" | "cancelled";
export interface ChildUsage { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
export interface ChildAttempt {
	requestedModel: string;
	model: string;
	thinkingLevel?: string;
	status: ChildStatus;
	phase?: FailurePhase;
	error?: string;
	durationMs: number;
	toolCalls: number;
	usage: ChildUsage;
}
export interface ChildResult {
	agent: string;
	model: string;
	status: ChildStatus;
	durationMs: number;
	toolCalls: number;
	usage: ChildUsage;
	output: string;
	preview: string;
	outputFile?: SavedOutput;
	error?: string;
	phase?: FailurePhase;
	warnings: string[];
	attempts?: ChildAttempt[];
}
export type ChildEvent =
	| { type: "start"; model: string }
	| { type: "tool_start"; name: string }
	| { type: "tool_end"; name: string }
	| { type: "fallback"; model: string; reason: string };
export interface PreparedChild {
	runtime: ModelRuntime;
	model: Model;
	thinkingLevel: Pi.CreateAgentSessionOptions["thinkingLevel"];
	warning: string | undefined;
}
export interface Candidate { spec: string | undefined; prepared?: PreparedChild; error?: string }
export interface RunnerOptions {
	sdk: Sdk;
	agentDir?: () => string;
	createModelRuntime?: () => Promise<ModelRuntime>;
	now?: () => Date;
	/** Test seam; production uses the existing final-output writer. */
	saveOutput?: typeof saveOutput;
}
export const ZERO_USAGE: ChildUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** Bounded diagnostics, never raw request dumps or authentication material. */
export function diagnostic(error: unknown): string {
	const text = error instanceof Error ? error.message : String(error);
	return text
		.replace(/\b(?:sk|sk-ant|sess)-[A-Za-z0-9_-]+/g, "[redacted]")
		.replace(/\b(Bearer|Basic)\s+[^\s,;"']+/gi, "$1 [redacted]")
		.replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, "$1[redacted]")
		.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
		.slice(0, 1000);
}
export class ModelResolutionError extends Error {}
export function modelIdentity(prepared: PreparedChild): string { return `${prepared.model.provider}/${prepared.model.id}`; }
export function addUsage(total: ChildUsage, usage: ChildUsage): void {
	for (const key of Object.keys(ZERO_USAGE) as Array<keyof ChildUsage>) total[key] += usage[key];
}
export function failureResult(agent: string, model: string, error: unknown, phase: FailurePhase = "setup", durationMs = 0): ChildResult {
	const message = diagnostic(error);
	return { agent, model, status: phase === "cancelled" ? "aborted" : "failed", durationMs, toolCalls: 0,
		usage: { ...ZERO_USAGE }, output: "", preview: message, error: message, phase, warnings: [] };
}

interface AssistantLike {
	role: "assistant";
	content: Array<{ type: string; text?: string }>;
	stopReason?: string;
	errorMessage?: string;
	usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } };
}
function isAssistant(message: unknown): message is AssistantLike {
	return typeof message === "object" && message !== null && (message as { role?: unknown }).role === "assistant";
}
export function finalText(messages: readonly unknown[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!isAssistant(m) || m.stopReason === "error" || m.errorMessage) continue;
		const text = m.content.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n").trim();
		if (text) return text;
	}
	return "";
}
export function sumUsage(messages: readonly unknown[]): ChildUsage {
	const total = { ...ZERO_USAGE };
	for (const m of messages) {
		if (!isAssistant(m) || !m.usage) continue;
		addUsage(total, { input: m.usage.input ?? 0, output: m.usage.output ?? 0, cacheRead: m.usage.cacheRead ?? 0,
			cacheWrite: m.usage.cacheWrite ?? 0, cost: m.usage.cost?.total ?? 0 });
	}
	return total;
}
/** Input errors take precedence even when the provider reports an assistant error. */
export function requestFailurePhase(error: string, assistantError: boolean): FailurePhase {
	if (/context.{0,30}(?:length|limit|window|exceed|overflow)|(?:input|prompt).{0,30}(?:too long|too large|exceed)|maximum.{0,20}tokens|too many tokens/i.test(error)) return "input";
	// A host credential lookup can throw before an assistant message is created.
	if (assistantError || /^(?:No API key (?:found )?for |Authentication failed for ["']|No credentials (?:found|available) for provider)/i.test(error)) return "model";
	return "setup";
}

export function createChildRunner(options: RunnerOptions) {
	const { sdk } = options;
	const agentDir = options.agentDir ?? (() => sdk.getAgentDir());
	const now = options.now ?? (() => new Date());
	const writeOutput = options.saveOutput ?? saveOutput;
	const createRuntime = options.createModelRuntime ?? (() => sdk.ModelRuntime.create());
	let shared: { runtime: Promise<ModelRuntime>; copied: Set<string>; sync: Promise<void> } | undefined;

	async function runtimeFor(registry: ProviderRegistry): Promise<ModelRuntime> {
		if (!shared) {
			const entry = { runtime: createRuntime(), copied: new Set<string>(), sync: Promise.resolve() };
			shared = entry;
			entry.runtime.catch(() => { if (shared === entry) shared = undefined; });
		}
		const entry = shared;
		const runtime = await entry.runtime;
		// Serialize provider copying/refresh: no sibling sees a partially refreshed runtime.
		const sync = entry.sync.then(async () => {
			const added: string[] = [];
			for (const id of registry.getRegisteredProviderIds()) {
				if (entry.copied.has(id)) continue;
				const native = registry.getRegisteredNativeProvider(id);
				const config = native ? undefined : registry.getRegisteredProviderConfig(id);
				if (native) runtime.registerNativeProvider(native);
				else if (config) runtime.registerProvider(id, config);
				else continue;
				added.push(id);
			}
			if (added.length) await runtime.refresh({ allowNetwork: false });
			for (const id of added) entry.copied.add(id);
		});
		entry.sync = sync.catch(() => {});
		await sync;
		return runtime;
	}
	function resolveModel(runtime: ModelRuntime, spec: string | undefined, parent: ParentContext): PreparedChild {
		if (spec) {
			const resolved = sdk.resolveCliModel({ cliModel: spec, modelRuntime: runtime });
			if (resolved.error || !resolved.model) throw new ModelResolutionError(diagnostic(`Subagent model "${spec}" cannot be used: ${resolved.error ?? "not found"}`));
			return { runtime, model: resolved.model, thinkingLevel: resolved.thinkingLevel, warning: resolved.warning };
		}
		if (!parent.model) throw new ModelResolutionError("No parent model to inherit. Pass model or set agents.<role>.model in subagent.json.");
		const model = runtime.getModel(parent.model.provider, parent.model.id);
		if (!model) throw new ModelResolutionError(`The parent model ${parent.model.provider}/${parent.model.id} is not available to subagents.`);
		return { runtime, model, thinkingLevel: parent.thinkingLevel as PreparedChild["thinkingLevel"], warning: undefined };
	}
	async function prepare(request: Pick<ChildRequest, "model">, parent: ParentContext): Promise<PreparedChild> {
		return resolveModel(await runtimeFor(parent.modelRegistry), request.model, parent);
	}
	async function prepareChain(specs: Array<string | undefined>, parent: ParentContext): Promise<Candidate[]> {
		const runtime = await runtimeFor(parent.modelRegistry);
		const seen = new Set<string>();
		const candidates: Candidate[] = [];
		for (const spec of specs) {
			try {
				const prepared = resolveModel(runtime, spec, parent);
				const identity = `${modelIdentity(prepared)}:${prepared.thinkingLevel ?? "default"}`;
				if (seen.has(identity)) continue;
				seen.add(identity);
				candidates.push({ spec, prepared });
			} catch (error) {
				if (!(error instanceof ModelResolutionError)) throw error;
				candidates.push({ spec, error: diagnostic(error) });
			}
		}
		return candidates;
	}

	async function run(request: ChildRequest, parent: ParentContext, signal?: AbortSignal,
		onEvent?: (event: ChildEvent) => void, prepared?: PreparedChild): Promise<ChildResult> {
		const started = Date.now();
		if (signal?.aborted) return failureResult(request.role.name, request.model ?? "(unresolved)", "Aborted.", "cancelled");
		const resolved = prepared ?? await prepare(request, parent);
		const { runtime, model, thinkingLevel, warning } = resolved;
		const { role, cwd } = request;
		const modelLabel = modelIdentity(resolved);
		const warnings = warning ? [diagnostic(warning)] : [];
		let session: Pi.AgentSession | undefined;
		let unsubscribe: (() => void) | undefined;
		let toolCalls = 0;
		let messages: readonly unknown[] = [];
		const eventUsage = { ...ZERO_USAGE };
		let assistantEvents = 0;
		let failure: string | undefined;
		let phase: FailurePhase | undefined;
		let aborted = signal?.aborted === true;
		const onAbort = () => { aborted = true; void session?.abort().catch(() => {}); };
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			const dir = agentDir();
			const settingsManager = sdk.SettingsManager.create(cwd, dir);
			const loader = new sdk.DefaultResourceLoader({
				cwd, agentDir: dir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
				noContextFiles: role.contextFiles === "none", systemPrompt: role.prompt,
				agentsFilesOverride: (base) => ({ agentsFiles: role.contextFiles === "none" ? []
					: (parent.contextFiles ?? base.agentsFiles).filter((file) => resolve(dirname(file.path)) !== resolve(dir)) }),
				extensionFactories: role.reviewDiff ? [{ name: "subagent-review-diff", factory: (api) =>
					api.registerTool(createReviewDiffTool(request.baseline ? request.baseline.value : captureBaseline(cwd))) }] : [],
			});
			await loader.reload();
			if (!aborted) {
				({ session } = await sdk.createAgentSession({ cwd, agentDir: dir, modelRuntime: runtime, model,
					...(thinkingLevel ? { thinkingLevel } : {}), tools: [...role.tools], resourceLoader: loader,
					sessionManager: sdk.SessionManager.inMemory(cwd), settingsManager,
					sessionStartEvent: { type: "session_start", reason: "startup" } }));
				if (aborted) onAbort();
				if (!session.model || session.model.provider !== model.provider || session.model.id !== model.id) throw new Error("Subagent session selected a different model than requested.");
				unsubscribe = session.subscribe((event) => {
					// Host retry/compaction may remove messages from the final transcript.
					if (event.type === "message_end" && isAssistant(event.message)) {
						assistantEvents++;
						addUsage(eventUsage, sumUsage([event.message]));
					}
					if (event.type === "tool_execution_start") { toolCalls++; onEvent?.({ type: "tool_start", name: event.toolName }); }
					else if (event.type === "tool_execution_end") onEvent?.({ type: "tool_end", name: event.toolName });
				});
				const extensionErrors: string[] = [];
				await session.bindExtensions({ mode: "print", onError: (error) => extensionErrors.push(diagnostic(error.error)) });
				if (extensionErrors.length) throw new Error(`Subagent tool setup failed: ${extensionErrors.join("; ")}`);
				const active = session.getActiveToolNames();
				const missing = role.tools.filter((name) => !active.includes(name));
				const extra = active.filter((name) => !role.tools.includes(name));
				if (missing.length || extra.length) throw new Error(`Subagent ${role.name} tool set mismatch (missing: ${missing.join(", ") || "none"}; unexpected: ${extra.join(", ") || "none"}).`);
				if (!aborted) {
					onEvent?.({ type: "start", model: modelLabel });
					try { await session.prompt(`Task: ${request.task}`, { expandPromptTemplates: false }); }
					catch (error) { failure = diagnostic(error); phase = requestFailurePhase(failure, false); }
				}
				messages = [...session.messages];
				const last = [...messages].reverse().find(isAssistant);
				if (last?.stopReason === "aborted") aborted = true;
				if (!failure && last && (last.stopReason === "error" || last.errorMessage)) {
					failure = diagnostic(last.errorMessage || "The model request failed.");
					phase = requestFailurePhase(failure, true);
				}
			}
		} catch (error) { failure = diagnostic(error); phase = "setup"; }
		finally {
			if (session) messages = [...session.messages];
			signal?.removeEventListener("abort", onAbort);
			unsubscribe?.();
			session?.dispose();
		}
		const base = { agent: role.name, model: modelLabel, durationMs: Date.now() - started, toolCalls, usage: assistantEvents ? eventUsage : sumUsage(messages), warnings };
		if (aborted || signal?.aborted) return { ...base, status: "aborted", output: "", preview: "Aborted.", error: "Aborted.", phase: "cancelled" };
		const output = finalText(messages);
		if (!failure && !output) { failure = "The subagent finished without a final text answer."; phase = "task"; }
		if (failure) return { ...base, status: "failed", output: "", preview: failure, error: failure, phase };
		let outputFile: SavedOutput | undefined;
		try { outputFile = writeOutput(join(outputDir(parent.sessionFile), outputFileName(role.name, request.index, now())), output); }
		catch (error) { warnings.push(`Could not save the full output: ${diagnostic(error)}`); }
		return { ...base, durationMs: Date.now() - started, status: "completed", output, preview: previewOutput(output, outputFile), outputFile };
	}

	async function runChain(request: ChildRequest, parent: ParentContext, candidates: Candidate[], signal?: AbortSignal,
		onEvent?: (event: ChildEvent) => void): Promise<ChildResult> {
		const started = Date.now();
		const attempts: ChildAttempt[] = [];
		const usage = { ...ZERO_USAGE };
		const warnings: string[] = [];
		let toolCalls = 0;
		let result = failureResult(request.role.name, "(unresolved)", "No usable model candidates.", "resolution");
		for (const candidate of candidates) {
			if (signal?.aborted) { result = failureResult(request.role.name, result.model, "Aborted.", "cancelled"); break; }
			const label = candidate.prepared ? modelIdentity(candidate.prepared) : `${diagnostic(candidate.spec ?? "(parent)")} (unresolved)`;
			if (attempts.length) onEvent?.({ type: "fallback", model: label, reason: attempts.at(-1)?.error ?? "Model unavailable." });
			if (signal?.aborted) { result = failureResult(request.role.name, label, "Aborted.", "cancelled"); break; }
			result = candidate.prepared ? await run({ ...request, model: candidate.spec }, parent, signal, onEvent, candidate.prepared)
				: failureResult(request.role.name, label, candidate.error ?? "Model unavailable.", "resolution");
			attempts.push({ requestedModel: diagnostic(candidate.spec ?? "(parent)"), model: result.model,
				...(candidate.prepared?.thinkingLevel ? { thinkingLevel: candidate.prepared.thinkingLevel } : {}),
				status: result.status, ...(result.phase ? { phase: result.phase } : {}), ...(result.error ? { error: result.error } : {}),
				durationMs: result.durationMs, toolCalls: result.toolCalls, usage: result.usage });
			addUsage(usage, result.usage); toolCalls += result.toolCalls; warnings.push(...result.warnings);
			if (result.status !== "failed" || (result.phase !== "model" && result.phase !== "resolution")) break;
		}
		if (result.status === "failed" && (result.phase === "model" || result.phase === "resolution")) {
			const error = `All configured model candidates failed:\n${attempts.map((a) => `- ${a.model}: ${a.error}`).join("\n")}`;
			result = { ...result, error, preview: error };
		}
		return { ...result, durationMs: Date.now() - started, attempts, usage, toolCalls, warnings };
	}
	return { prepare, prepareChain, run, runChain, reset() { shared = undefined; } };
}
export type ChildRunner = ReturnType<typeof createChildRunner>;
