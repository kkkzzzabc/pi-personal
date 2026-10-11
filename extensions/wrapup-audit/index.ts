/** Standalone wrap-up audit: rule misses steer once per request; model judgments are report only. */
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { createWrapupAuditExtension } from "./extension.ts";

export default createWrapupAuditExtension({
	agentDir: getAgentDir,
	lowestThinking: (model) => { const level = getSupportedThinkingLevels(model)[0]; return level === "off" ? undefined : level; },
});
