import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createPerfLogExtension } from "./extension.ts";

export default createPerfLogExtension({ agentDir: getAgentDir });
