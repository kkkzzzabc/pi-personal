/**
 * Pure per-turn timing state machine. Fed by extension events; returns records to write.
 * No I/O, no pi imports: tests drive it with a fake clock and memory sampler.
 *
 * Lifecycle facts this relies on (pi fork, agent-session.ts / agent-loop.ts):
 * - `turn_start` precedes the user message and the assistant stream; `turnIndex` restarts per prompt.
 * - The stream `start` arrives as `message_start`; deltas arrive as `message_update`.
 * - `turn_end` may be skipped by the host, so a pending turn is flushed by later events.
 */
export interface MemorySample {
	rss: number;
	heapUsed: number;
	external: number;
	arrayBuffers: number;
}
export interface Clock {
	/** Monotonic milliseconds (performance.now). */
	now(): number;
	/** Wall-clock ISO timestamp for the `at` field. */
	wall(): string;
	memory(): MemorySample;
}

export type FirstKind = "text" | "thinking" | "toolcall";
export type FlushReason = "session_start" | "agent_start" | "turn_start" | "agent_end" | "shutdown";

interface Base {
	v: 1;
	at: string;
	sessionId: string | undefined;
	pid: number;
}
export interface SessionRecord extends Base {
	type: "session";
	reason: string;
	rss: number;
	heapUsed: number;
}
export interface TurnRecord extends Base, MemorySample {
	type: "turn";
	promptSeq: number;
	turnIndex: number;
	provider: string | null;
	model: string | null;
	stopReason: string | null;
	connectMs: number | null;
	ttftMs: number | null;
	firstKind: FirstKind | null;
	providerMs: number | null;
	turnMs: number;
	toolCount: number;
	toolMs: number;
	toolNames: string[];
	outputTokens: number | null;
	overheadMs: number | null;
	turnEndMissing: boolean;
	flushedBy?: FlushReason;
	/** Reserved for render-frame statistics from a future fork hook. */
	frames: null;
}
export interface PromptRecord extends Base {
	type: "prompt";
	promptSeq: number;
	promptMs: number;
	turns: number;
}
export type PerfRecord = SessionRecord | TurnRecord | PromptRecord;

/** Shape of the assistant message fields the recorder reads at `message_end`. */
export interface AssistantEndInfo {
	provider?: string;
	model?: string;
	stopReason?: string;
	durationMs?: number;
	usage?: { output?: number };
}

interface Pending {
	turnIndex: number;
	t0: number;
	connectMs: number | null;
	ttftMs: number | null;
	firstKind: FirstKind | null;
	provider: string | null;
	model: string | null;
	stopReason: string | null;
	providerMs: number | null;
	outputTokens: number | null;
	toolCount: number;
	toolMs: number;
	toolNames: string[];
}

const DELTA_KINDS: Record<string, FirstKind> = { text_delta: "text", thinking_delta: "thinking", toolcall_delta: "toolcall" };

export class Recorder {
	private readonly clock: Clock;
	private readonly getSessionId: () => string | undefined;
	private pending: Pending | undefined;
	private promptSeq = 0;
	private promptT0: number | undefined;
	private promptTurns = 0;

	constructor(clock: Clock, getSessionId: () => string | undefined) {
		this.clock = clock;
		this.getSessionId = getSessionId;
	}

	private base(): Base {
		return { v: 1, at: this.clock.wall(), sessionId: this.getSessionId(), pid: process.pid };
	}

	sessionStart(reason: string): { flushed?: TurnRecord; session: SessionRecord } {
		const flushed = this.flushPending("session_start");
		this.promptSeq = 0;
		this.promptT0 = undefined;
		this.promptTurns = 0;
		const memory = this.clock.memory();
		return { flushed, session: { ...this.base(), type: "session", reason, rss: memory.rss, heapUsed: memory.heapUsed } };
	}

	agentStart(): TurnRecord | undefined {
		const flushed = this.flushPending("agent_start");
		this.promptSeq++;
		this.promptT0 = this.clock.now();
		this.promptTurns = 0;
		return flushed;
	}

	turnStart(turnIndex: number): TurnRecord | undefined {
		const flushed = this.flushPending("turn_start");
		this.pending = {
			turnIndex, t0: this.clock.now(), connectMs: null, ttftMs: null, firstKind: null, provider: null, model: null,
			stopReason: null, providerMs: null, outputTokens: null, toolCount: 0, toolMs: 0, toolNames: [],
		};
		return flushed;
	}

	assistantMessageStart(): void {
		if (this.pending && this.pending.connectMs === null) this.pending.connectMs = this.elapsed(this.pending.t0);
	}

	/** O(1): records the first content delta only. Called for every streamed delta. */
	assistantUpdate(eventType: string): void {
		const pending = this.pending;
		if (!pending || pending.ttftMs !== null) return;
		const kind = DELTA_KINDS[eventType];
		if (!kind) return;
		pending.ttftMs = this.elapsed(pending.t0);
		pending.firstKind = kind;
	}

	assistantMessageEnd(message: AssistantEndInfo): void {
		const pending = this.pending;
		if (!pending) return;
		pending.provider = message.provider ?? null;
		pending.model = message.model ?? null;
		pending.stopReason = message.stopReason ?? null;
		pending.providerMs = typeof message.durationMs === "number" ? message.durationMs : null;
		pending.outputTokens = typeof message.usage?.output === "number" ? message.usage.output : null;
	}

	toolEnd(toolName: string, durationMs?: number): void {
		const pending = this.pending;
		if (!pending) return;
		pending.toolCount++;
		if (typeof durationMs === "number") pending.toolMs += durationMs;
		pending.toolNames.push(toolName);
	}

	turnEnd(): TurnRecord | undefined {
		return this.finalize(false);
	}

	agentEnd(): { flushed?: TurnRecord; prompt: PromptRecord } {
		const flushed = this.flushPending("agent_end");
		const promptMs = this.promptT0 === undefined ? 0 : this.elapsed(this.promptT0);
		const prompt: PromptRecord = { ...this.base(), type: "prompt", promptSeq: this.promptSeq, promptMs, turns: this.promptTurns };
		this.promptT0 = undefined;
		this.promptTurns = 0;
		return { flushed, prompt };
	}

	shutdown(): TurnRecord | undefined {
		return this.flushPending("shutdown");
	}

	/** Whole milliseconds since `start`. */
	private elapsed(start: number): number {
		return Math.round(this.clock.now() - start);
	}

	private flushPending(reason: FlushReason): TurnRecord | undefined {
		return this.pending ? this.finalize(true, reason) : undefined;
	}

	private finalize(turnEndMissing: boolean, flushedBy?: FlushReason): TurnRecord | undefined {
		const p = this.pending;
		if (!p) return undefined;
		this.pending = undefined;
		this.promptTurns++;
		const turnMs = this.elapsed(p.t0);
		const memory = this.clock.memory();
		const record: TurnRecord = {
			...this.base(),
			type: "turn",
			promptSeq: this.promptSeq,
			turnIndex: p.turnIndex,
			provider: p.provider,
			model: p.model,
			stopReason: p.stopReason,
			connectMs: p.connectMs,
			ttftMs: p.ttftMs,
			firstKind: p.firstKind,
			providerMs: p.providerMs,
			turnMs,
			toolCount: p.toolCount,
			toolMs: p.toolMs,
			toolNames: p.toolNames,
			outputTokens: p.outputTokens,
			overheadMs: p.providerMs === null ? null : Math.max(0, turnMs - p.providerMs - p.toolMs),
			rss: memory.rss,
			heapUsed: memory.heapUsed,
			external: memory.external,
			arrayBuffers: memory.arrayBuffers,
			turnEndMissing,
			frames: null,
		};
		if (flushedBy) record.flushedBy = flushedBy;
		return record;
	}
}

export function systemClock(): Clock {
	return {
		now: () => performance.now(),
		wall: () => new Date().toISOString(),
		memory: () => {
			const m = process.memoryUsage();
			return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers };
		},
	};
}
