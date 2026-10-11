/**
 * tui-check observer (test-only pi extension).
 *
 * Appends one JSON line per model call to TUI_CHECK_MODEL_LOG with the final
 * model input: the full transcript including system messages (after every
 * `context` handler ran) and the active tools. Read-only: never changes the
 * request. Load it last (`-e observer.ts` after other extensions) so later
 * `context_with_system` handlers do not run after it.
 *
 * Call numbers continue from the existing log, so they stay unique when a session
 * replacement or relaunch re-creates this extension.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { summarizeMessage } from "./lib.ts";

export default function tuiCheckObserver(pi: ExtensionAPI): void {
	const logPath = process.env.TUI_CHECK_MODEL_LOG;
	if (!logPath) return;
	let call = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter((line) => line.trim()).length : 0;
	pi.on("context_with_system", async (event, ctx) => {
		call += 1;
		const record = {
			call,
			session: ctx.sessionManager.getSessionFile(),
			at: new Date().toISOString(),
			model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
			activeTools: pi.getActiveTools(),
			messages: event.messages.map((message) => summarizeMessage(message as unknown as Record<string, unknown>)),
		};
		appendFileSync(logPath, `${JSON.stringify(record)}\n`);
	});
}
