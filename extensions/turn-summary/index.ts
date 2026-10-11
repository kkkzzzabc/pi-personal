/** Standalone post-turn summary widget; display only, no continuation or persistence. */
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import * as tui from "@earendil-works/pi-tui";
import { createTurnSummaryExtension } from "./extension.ts";
import { createWidget } from "./widget.ts";

export default createTurnSummaryExtension({
	agentDir: getAgentDir,
	widget: (getSummary) => createWidget(tui, getSummary),
	lowestThinking: (model) => { const level = getSupportedThinkingLevels(model)[0]; return level === "off" ? undefined : level; },
});
