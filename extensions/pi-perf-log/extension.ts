/**
 * pi-perf-log — per-turn client timing and process memory, one JSON line per turn.
 *
 * Plan: docs/plans/2026-10-12-pi-perf-log.md. Schema: SCHEMA.md.
 * Every handler swallows errors: a logging failure must never affect the session.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, outputDir, type PerfLogConfig } from "./config.ts";
import { type Clock, type PerfRecord, Recorder, systemClock } from "./recorder.ts";
import { createWriter, type Writer } from "./writer.ts";

export const PERF_LOG_EVENTS = [
	"session_start", "agent_start", "turn_start", "message_start", "message_update", "message_end",
	"tool_execution_start", "tool_execution_end", "turn_end", "agent_end", "session_shutdown",
] as const;

interface Dependencies {
	agentDir: () => string;
	clock?: Clock;
	load?: typeof loadConfig;
	writer?: (dir: () => string) => Writer;
}

export function createPerfLogExtension(deps: Dependencies) {
	return (pi: ExtensionAPI) => {
		const clock = deps.clock ?? systemClock();
		const load = deps.load ?? loadConfig;
		let ctx: ExtensionContext | undefined;
		let config: PerfLogConfig | undefined;
		let active = false;
		let warned = false;
		const recorder = new Recorder(clock, () => {
			try {
				return ctx?.sessionManager.getSessionId();
			} catch {
				return undefined;
			}
		});
		const writer = (deps.writer ?? createWriter)(() => outputDir(config!, deps.agentDir()));

		const write = (...records: (PerfRecord | undefined)[]) => {
			if (!active) return;
			for (const record of records) {
				if (record && !writer.append(record) && !warned) {
					warned = true;
					if (ctx?.hasUI) ctx.ui.notify("pi-perf-log: could not write the performance log; logging continues silently", "warning");
				}
			}
		};
		const guarded = <E>(handler: (event: E, context: ExtensionContext) => void) => (event: E, context: ExtensionContext) => {
			try {
				ctx = context;
				handler(event, context);
			} catch {
				// Never let logging interfere with the session.
			}
		};

		pi.on("session_start", guarded((event: { reason: string }, context) => {
			const loaded = load(deps.agentDir(), context.cwd, context.isProjectTrusted());
			config = loaded.config;
			const result = recorder.sessionStart(event.reason);
			active = config.enabled;
			if (loaded.error && context.hasUI) context.ui.notify(`pi-perf-log: ${loaded.error}`, "warning");
			write(result.flushed, result.session);
		}));
		pi.on("agent_start", guarded(() => write(recorder.agentStart())));
		pi.on("turn_start", guarded((event: { turnIndex: number }) => write(recorder.turnStart(event.turnIndex))));
		pi.on("message_start", guarded((event: { message: { role: string; stopReason?: string } }) => {
			// The host synthesizes message_start for a final error/aborted message when no stream opened.
			const { role, stopReason } = event.message;
			if (role === "assistant" && stopReason !== "error" && stopReason !== "aborted") recorder.assistantMessageStart();
		}));
		pi.on("message_update", guarded((event: { message: { role: string }; assistantMessageEvent: { type: string } }) => {
			if (event.message.role === "assistant") recorder.assistantUpdate(event.assistantMessageEvent.type);
		}));
		pi.on("message_end", guarded((event: { message: { role: string } & Record<string, unknown> }) => {
			if (event.message.role === "assistant") recorder.assistantMessageEnd(event.message);
		}));
		// Nested calls (for example from a codemode script) are inside their parent's span and count.
		pi.on("tool_execution_start", guarded((event: { parentToolCallId?: string }) => {
			if (!event.parentToolCallId) recorder.toolStart();
		}));
		pi.on("tool_execution_end", guarded((event: { toolName: string; durationMs?: number; parentToolCallId?: string }) => {
			if (!event.parentToolCallId) recorder.toolEnd(event.toolName, event.durationMs);
		}));
		pi.on("turn_end", guarded((event: { messageEntryId?: string }) => write(recorder.turnEnd(event.messageEntryId))));
		pi.on("agent_end", guarded(() => {
			const result = recorder.agentEnd();
			write(result.flushed, result.run);
		}));
		pi.on("session_shutdown", guarded(() => write(recorder.shutdown())));
	};
}
