/**
 * pi-perf-log — per-turn client timing and process memory, one JSON line per turn.
 *
 * Plan: docs/plans/2026-10-12-pi-perf-log.md. Schema: SCHEMA.md.
 * Every handler swallows errors: a logging failure must never affect the session.
 */
import type {
	AgentEndEvent, AgentStartEvent, ExtensionAPI, ExtensionContext, MessageEndEvent, MessageStartEvent, MessageUpdateEvent,
	SessionShutdownEvent, SessionStartEvent, ToolExecutionEndEvent, ToolExecutionStartEvent, TurnEndEvent, TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { loadConfig, outputDir, type PerfLogConfig } from "./config.ts";
import { type Clock, type FrameStatsRecord, type PerfRecord, Recorder, systemClock } from "./recorder.ts";
import { createWriter, type Writer } from "./writer.ts";

export const PERF_LOG_EVENTS = [
	"session_start", "agent_start", "turn_start", "message_start", "message_update", "message_end",
	"tool_execution_start", "tool_execution_end", "turn_end", "agent_end", "session_shutdown",
] as const;

const tenths = (ms: number) => Math.round(ms * 10) / 10;

/** Frame statistics from the fork's `ctx.ui.takeFrameStats()` hook; null outside the TUI or on hosts without it. */
function takeFrames(ctx: ExtensionContext | undefined): FrameStatsRecord | null {
	if (ctx?.mode !== "tui" || typeof ctx.ui.takeFrameStats !== "function") return null;
	const stats = ctx.ui.takeFrameStats();
	if (!stats) return null;
	return { count: stats.count, totalMs: tenths(stats.totalMs), maxMs: tenths(stats.maxMs), p95Ms: tenths(stats.p95Ms), over16Ms: stats.over16Ms };
}

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
		}, () => (active ? takeFrames(ctx) : null)); // Disabled logging must not reset the shared collector.
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

		pi.on("session_start", guarded((event: SessionStartEvent, context) => {
			const loaded = load(deps.agentDir(), context.cwd, context.isProjectTrusted());
			config = loaded.config;
			const result = recorder.sessionStart(event.reason);
			active = config.enabled;
			if (loaded.error && context.hasUI) context.ui.notify(`pi-perf-log: ${loaded.error}`, "warning");
			write(result.flushed, result.session);
		}));
		pi.on("agent_start", guarded((_event: AgentStartEvent) => write(recorder.agentStart())));
		pi.on("turn_start", guarded((event: TurnStartEvent) => write(recorder.turnStart(event.turnIndex))));
		pi.on("message_start", guarded((event: MessageStartEvent) => {
			// The host synthesizes message_start for a final error/aborted message when no stream opened.
			const message = event.message;
			if (message.role === "assistant" && message.stopReason !== "error" && message.stopReason !== "aborted") recorder.assistantMessageStart();
		}));
		pi.on("message_update", guarded((event: MessageUpdateEvent) => {
			if (event.message.role === "assistant") recorder.assistantUpdate(event.assistantMessageEvent.type);
		}));
		pi.on("message_end", guarded((event: MessageEndEvent) => {
			const message = event.message;
			if (message.role === "assistant") recorder.assistantMessageEnd(message);
		}));
		// Nested calls (for example from a codemode script) are inside their parent's span and count.
		pi.on("tool_execution_start", guarded((event: ToolExecutionStartEvent) => {
			if (!event.parentToolCallId) recorder.toolStart();
		}));
		pi.on("tool_execution_end", guarded((event: ToolExecutionEndEvent) => {
			if (!event.parentToolCallId) recorder.toolEnd(event.toolName, event.durationMs);
		}));
		pi.on("turn_end", guarded((event: TurnEndEvent) => write(recorder.turnEnd(event.messageEntryId))));
		pi.on("agent_end", guarded((_event: AgentEndEvent) => {
			const result = recorder.agentEnd();
			write(result.flushed, result.run);
		}));
		pi.on("session_shutdown", guarded((_event: SessionShutdownEvent) => write(recorder.shutdown())));
	};
}
