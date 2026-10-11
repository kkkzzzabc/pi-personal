/**
 * Computer use for pi on macOS.
 *
 * `computer_*` tools backed by the native `pi-cua-helper`.
 * Design: docs/plans/2026-10-11-pi-computer-use.md.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AppApprovals } from "./approval.ts";
import { HelperClient } from "./helper-client.ts";
import { createComputerTools } from "./tools.ts";

const NATIVE_GUIDELINES = [
	"Prefer purpose-built tools, CLIs, or APIs over computer_* tools when they can do the job.",
	"Use computer_get_app_state before acting and after every action; element indexes change between reads.",
	"Prefer element_index over x/y coordinates.",
];

export default function computerUse(pi: ExtensionAPI) {
	if (process.platform !== "darwin") return;

	let helper: HelperClient | undefined;
	let approvals = new AppApprovals();

	pi.on("session_start", async () => {
		approvals = new AppApprovals();
	});
	pi.on("session_shutdown", async () => {
		helper?.close();
		helper = undefined;
	});

	for (const tool of createComputerTools(
		() => (helper ??= new HelperClient()),
		() => approvals,
	)) {
		pi.registerTool({
			name: tool.name,
			label: tool.label,
			description: tool.description,
			promptSnippet: tool.name === "computer_get_app_state" ? "Read and operate macOS app windows (computer_* tools)" : undefined,
			promptGuidelines: tool.name === "computer_get_app_state" ? NATIVE_GUIDELINES : undefined,
			parameters: tool.parameters as never,
			executionMode: "sequential",
			annotations: tool.readOnly ? { readOnlyHint: true, openWorldHint: false } : { destructiveHint: true },
			async execute(_id, params: Record<string, unknown>, signal, _onUpdate, ctx) {
				return tool.run(params, {
					signal,
					hasUI: ctx.hasUI,
					confirm: (title, message) => ctx.ui.confirm(title, message),
				});
			},
		});
	}
}
