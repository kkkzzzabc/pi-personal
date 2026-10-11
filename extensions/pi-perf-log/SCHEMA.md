# pi-perf-log JSONL schema, version 1

One file per session: `<agentDir>/perf/<sessionId>.jsonl` (or the configured
`dir`). One JSON object per line. This file is the only contract between
`pi-perf-log` and readers such as `pi-session-stats`.

Records never contain prompt text, assistant text, tool arguments, tool
results, or file paths. They contain ids, model and tool names, and numbers.

## Common fields

| Field | Type | Meaning |
|---|---|---|
| `v` | `1` | Schema version |
| `type` | `"session" \| "turn" \| "prompt"` | Record kind |
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
| `promptSeq` | Number of `agent_start` events since `session_start` (1-based). With `turnIndex` this orders turns and matches the assistant messages in the session file. |
| `turnIndex` | pi's per-prompt turn index (restarts at 0 for each prompt) |
| `provider`, `model`, `stopReason` | From the assistant message; `null` when the message never ended |
| `connectMs` | `message_start` (stream opened) minus `turn_start`; `null` if no stream started |
| `ttftMs` | First `text_delta`, `thinking_delta` or `toolcall_delta` minus `turn_start`; `null` if none arrived |
| `firstKind` | Which delta came first: `"text"`, `"thinking"`, `"toolcall"`, or `null` |
| `providerMs` | pi's `durationMs` for the assistant message (provider round trip, includes streamed tool-call arguments) |
| `turnMs` | `turn_end` (or flush) minus `turn_start` |
| `toolCount`, `toolMs`, `toolNames` | Tool executions in this turn; `toolMs` sums `tool_execution_end.durationMs` where present |
| `outputTokens` | `usage.output` of the assistant message |
| `overheadMs` | `max(0, turnMs - providerMs - toolMs)`, or `null` without `providerMs`. Everything not attributed to the provider or tools: extension handlers, persistence, rendering on the same thread. A ceiling, not a render measurement. |
| `rss`, `heapUsed`, `external`, `arrayBuffers` | `process.memoryUsage()` at turn end, bytes. Process-wide: subagents run in the same process. |
| `turnEndMissing` | `true` when the host did not emit `turn_end` and the turn was flushed by a later event |
| `flushedBy` | Present with `turnEndMissing`: `"turn_start"`, `"agent_end"`, `"session_start"`, `"agent_start"`, or `"shutdown"` |
| `frames` | Always `null` in v1; reserved for render-frame statistics from a future fork hook |

## `prompt`

Written at `agent_end`: one user prompt and all the turns it caused.

| Field | Meaning |
|---|---|
| `promptSeq` | As above |
| `promptMs` | `agent_end` minus `agent_start` |
| `turns` | Turn records produced for this prompt |

## Timing base

`turn_start` fires a few milliseconds before pi emits the user message and
opens the stream, so `connectMs` and `ttftMs` include that small host cost.
All intervals use a monotonic clock; `at` is wall-clock.
