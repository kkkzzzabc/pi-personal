/**
 * subagent extension entry point. Implementation: ./extension.ts.
 * Plan: docs/plans/2026-10-11-subagent-extension.md
 */
import * as sdk from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { createSubagentExtension } from "./extension.ts";

export default createSubagentExtension({ sdk, tui: { Text } });
