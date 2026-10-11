/**
 * tui-check faux model (test-only pi extension).
 *
 * Registers provider `faux` with model `faux-1` whose responses come from the
 * scenario file in TUI_CHECK_SCENARIO (see references/scenario.md). Templates
 * use per-request transcript/environment inputs and the owning session's branch
 * and cwd, captured when the request enters the provider.
 * A template that cannot be resolved produces a visible error text instead of
 * a guessed value. After the scenario is exhausted every call returns
 * `whenExhausted`.
 *
 * The position in the scenario is kept in TUI_CHECK_FAUX_STATE (a JSON file), so it
 * continues across session replacement (new session, fork, resume) and relaunches,
 * which re-create this extension. The provider is unregistered on session shutdown.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";
import { getApiProvider, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { type EntryLike, lastUserText, parseScenario, resolveTemplates, type Scenario } from "./lib.ts";

export default function tuiCheckFauxModel(pi: ExtensionAPI): void {
	const scenarioPath = process.env.TUI_CHECK_SCENARIO;
	let scenario: Scenario | undefined;
	let loadError: string | undefined;
	if (!scenarioPath) loadError = "TUI_CHECK_SCENARIO is not set";
	else {
		try {
			scenario = parseScenario(JSON.parse(readFileSync(scenarioPath, "utf8")));
		} catch (error) {
			loadError = `${scenarioPath}: ${(error as Error).message}`;
		}
	}

	let snapshot: { cwd: string; entries: EntryLike[]; sessionId?: string; lastUser?: string } = { cwd: process.cwd(), entries: [] };
	pi.on("context", async (event, ctx) => {
		snapshot = {
			cwd: ctx.cwd,
			entries: ctx.sessionManager.getBranch() as EntryLike[],
			sessionId: ctx.sessionManager.getSessionId(),
			lastUser: lastUserText(event.messages as unknown as Record<string, unknown>[]),
		};
	});

	const statePath = process.env.TUI_CHECK_FAUX_STATE;
	const readNext = (): number => {
		if (!statePath) return 0;
		try {
			const value = JSON.parse(readFileSync(statePath, "utf8")).next;
			return Number.isInteger(value) && value >= 0 ? value : 0;
		} catch {
			return 0;
		}
	};
	let next = readNext();
	const advance = (): number => {
		const current = next++;
		if (statePath) writeFileSync(statePath, `${JSON.stringify({ next })}\n`);
		return current;
	};

	const faux = registerFauxProvider({ models: [{ id: "faux-1", name: "tui-check faux", reasoning: true }] });
	pi.on("session_shutdown", async () => faux.unregister());
	const delegate = getApiProvider(faux.api)!.streamSimple;
	const respond = (index: number, inputs: Parameters<typeof resolveTemplates>[1]) => {
		if (!scenario) return fauxAssistantMessage(`[tui-check] Scenario error: ${loadError}`);
		const step = scenario.responses[index];
		if (!step) return fauxAssistantMessage(scenario.whenExhausted);
		try {
			const resolved = resolveTemplates(step, inputs);
			const blocks = [
				...(resolved.thinking !== undefined ? [fauxThinking(resolved.thinking)] : []),
				...(resolved.text !== undefined ? [fauxText(resolved.text)] : []),
				...(resolved.toolCalls ?? []).map((call) => fauxToolCall(call.name, call.args)),
			];
			return fauxAssistantMessage(blocks);
		} catch (error) {
			return fauxAssistantMessage(`[tui-check] Template error in response ${index}: ${(error as Error).message}`);
		}
	};

	const model = faux.getModel();
	pi.registerProvider(model.provider, {
		baseUrl: model.baseUrl,
		apiKey: "tui-check-faux",
		api: faux.api,
		streamSimple: (requestModel, context, options) => {
			// The host removes a queued factory synchronously but invokes it later.
			// Reserve and enqueue at admission, not inside the response factory.
			const index = scenario ? advance() : 0;
			const inputs = {
				...snapshot,
				// Owner context still distinguishes custom notes from user messages.
				// Child transcripts have a different session ID and their own task.
				lastUser: snapshot.sessionId !== undefined && options?.sessionId === snapshot.sessionId
					? snapshot.lastUser
					: lastUserText(context.messages as unknown as Record<string, unknown>[]),
				env: { ...process.env },
			};
			faux.appendResponses([() => respond(index, inputs)]);
			return delegate(requestModel, context, options);
		},
		models: faux.models.map((entry) => ({
			id: entry.id,
			name: entry.name,
			api: entry.api,
			reasoning: entry.reasoning,
			input: entry.input,
			cost: entry.cost,
			contextWindow: entry.contextWindow,
			maxTokens: entry.maxTokens,
		})),
	});
}
