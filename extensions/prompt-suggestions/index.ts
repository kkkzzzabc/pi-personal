/** Standalone next-prompt assistance; no auto-submit or agent continuation. */
import { CustomEditor, getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import * as tui from "@earendil-works/pi-tui";
import { createGhostEditor } from "./editor.ts";
import { createSuggestionsExtension } from "./extension.ts";

export default createSuggestionsExtension({
	agentDir: getAgentDir,
	editor: (hooks) => createGhostEditor(tui, CustomEditor, hooks),
	lowestThinking: (model) => { const level = getSupportedThinkingLevels(model)[0]; return level === "off" ? undefined : level; },
});
