/**
 * tui-check faux model (test-only pi extension).
 *
 * Registers provider `faux` with model `faux-1` whose responses come from the
 * scenario file in TUI_CHECK_SCENARIO (see references/scenario.md). Templates
 * are resolved per model call from the current session branch and cwd.
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
import { registerFauxProvider } from "@earendil-works/pi-ai/compat";
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

	let snapshot: { cwd: string; entries: EntryLike[]; lastUser?: string } = { cwd: process.cwd(), entries: [] };
	pi.on("context", async (event, ctx) => {
		snapshot = {
			cwd: ctx.cwd,
			entries: ctx.sessionManager.getBranch() as EntryLike[],
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
	const respond = () => {
		faux.appendResponses([respond]);
		if (!scenario) return fauxAssistantMessage(`[tui-check] Scenario error: ${loadError}`);
		const index = advance();
		const step = scenario.responses[index];
		if (!step) return fauxAssistantMessage(scenario.whenExhausted);
		try {
			const resolved = resolveTemplates(step, { ...snapshot, env: process.env });
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
	faux.setResponses([respond]);

	const model = faux.getModel();
	pi.registerProvider(model.provider, {
		baseUrl: model.baseUrl,
		apiKey: "tui-check-faux",
		api: faux.api,
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
