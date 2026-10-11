# pi-perf-log JSONL schema, version 1

One file per session: `<agentDir>/perf/<sessionId>.jsonl` (or the configured
absolute `dir` in `pi-perf-log.json`). One JSON object per line. This file is the only contract between
`pi-perf-log` and readers such as `pi-session-stats`.

Records never contain prompt text, assistant text, tool arguments, tool
results, or file paths. They contain ids, model and tool names, and numbers.

## Common fields

| Field | Type | Meaning |
|---|---|---|
| `v` | `1` | Schema version |
| `type` | `"session" \| "turn" \| "run"` | Record kind |
| `at` | ISO string | Wall-clock time the record was produced |
| `sessionId` | string | Session id at write time (changes on `/new`, resume, fork) |
| `pid` | number | pi process id |

## `session`

Written at every `session_start` (startup, reload, new, resume, fork).

| Field | Meaning |
|---|---|
| `reason` | The `session_start` reason |
| `rss`, `heapUsed` | Process memory baseline in bytes |

## `turn`

Written when a turn ends. A turn is one assistant message and the tool
calls it made.

| Field | Meaning |
|---|---|
| `runSeq` | Agent run number since the preceding `session` line (1-based, counts `agent_start`). Restarts after resume, reload, new and fork, so it is not unique within a file; use `messageEntryId` to join with the session file. |
| `turnIndex` | pi's per-run turn index (restarts at 0 for each run) |
| `messageEntryId` | Session-file entry id of this turn's assistant message, from `turn_end`. `null` when the turn was flushed without `turn_end`. The join key with session files. |
| `provider`, `model`, `stopReason` | From the assistant message; `null` when the message never ended |
| `connectMs` | `message_start` of the streamed assistant message minus `turn_start`; `null` if no stream opened. The host also emits a synthetic `message_start` for a final error or aborted message when no stream opened; those are ignored here. |
| `ttftMs` | First `text_delta`, `thinking_delta` or `toolcall_delta` minus `turn_start`; `null` if none arrived |
| `firstKind` | Which delta came first: `"text"`, `"thinking"`, `"toolcall"`, or `null` |
| `providerMs` | pi's `durationMs` for the assistant message (provider round trip, includes streamed tool-call arguments) |
| `turnMs` | `turn_end` (or flush) minus `turn_start` |
| `toolCount`, `toolNames` | Top-level tool executions in this turn. Nested calls (a tool invoked by another tool, `parentToolCallId` set) are inside their parent and are not counted separately. |
| `toolMs` | Sum of `tool_execution_end.durationMs` where present. Tools run in parallel by default, so this can exceed wall-clock time. |
| `toolSpanMs` | Wall-clock time from the first `tool_execution_start` to the last `tool_execution_end` in this turn; `0` without tools |
| `outputTokens` | `usage.output` of the assistant message |
| `overheadMs` | `max(0, turnMs - providerMs - toolSpanMs)`, or `null` without `providerMs`. Everything not attributed to the provider or to the tool execution span: extension handlers, tool-call preparation hooks, persistence, rendering on the same thread. A ceiling, not a render measurement. |
| `rss`, `heapUsed`, `external`, `arrayBuffers` | `process.memoryUsage()` at turn end, bytes. Process-wide: subagents run in the same process. |
| `turnEndMissing` | `true` when the host did not emit `turn_end` and the turn was flushed by a later event |
| `flushedBy` | Present with `turnEndMissing`: `"turn_start"`, `"agent_end"`, `"session_start"`, `"agent_start"`, or `"shutdown"` |
| `frames` | Render-frame statistics for this turn, or `null` when unavailable: not TUI mode (`ctx.mode !== "tui"`), a pi build without `ctx.ui.takeFrameStats()`, or a failing hook. Records written before this field was filled are also `null`. See [Render frames](#render-frames). |

### Render frames

Filled from the pi fork's `ctx.ui.takeFrameStats()`. A frame is one
synchronous TUI render pass: layout, line generation and the terminal write
call. Asynchronous stdout flushing is not included, and there is no
per-component breakdown. The window runs from `turn_start` to the moment the
record is written (`turn_end` or a flush); frames rendered between turns are
discarded. When the TUI switches between regular and fullscreen mode, the
old renderer's frames carry over.

| Field | Meaning |
|---|---|
| `count` | Frames rendered in the window; `0` is a valid measurement |
| `totalMs` | Sum of frame durations, 0.1 ms precision |
| `maxMs` | Longest frame, 0.1 ms precision |
| `p95Ms` | Approximate 95th percentile: the upper edge of its histogram bucket (1 ms wide below 100 ms, 10 ms wide below 1 s, the maximum above), capped at `maxMs` |
| `over16Ms` | Frames longer than 16 ms (one 60 Hz frame budget) |

`frames.totalMs` is part of `overheadMs` only when rendering ran outside the
provider and tool spans; frames rendered while streaming or while tools run
also fall inside `providerMs` or `toolSpanMs`.

The fork's collector is shared: another extension calling
`takeFrameStats()` would take frames from this window.

## `run`

Written at `agent_end`: one agent run (`agent_start` to `agent_end`) and the
turns it produced. A single user prompt can produce several runs: pi
continues automatically after a retryable failure, and queued follow-up
messages can be absorbed into one run. Retry backoff between runs is not
included in `runMs`.

| Field | Meaning |
|---|---|
| `runSeq` | As above |
| `runMs` | `agent_end` minus `agent_start` |
| `turns` | Turn records produced in this run |

## Timing base

`turn_start` fires a few milliseconds before pi emits the user message and
opens the stream, so `connectMs` and `ttftMs` include that small host cost.
All intervals use a monotonic clock; `at` is wall-clock.
