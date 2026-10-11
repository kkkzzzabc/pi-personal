---
name: pi-session-stats
description: >
  Aggregate statistics from local pi session files (~/.pi/agent/sessions):
  cost and tokens, per-model response time percentiles and output
  throughput, cache hit ratio, per-tool duration and error rates, and real
  workload sizes (largest tool-call arguments and results, longest sessions,
  compactions), plus client timing from pi-perf-log records when present
  (connect, time to first token, overhead, render frames, memory). Use when
  the user asks how much pi usage cost, which model or tool is slow or
  failing, whether the pi client itself is slow, how large real inputs get
  (for perf-audit), or for a usage summary over a period or project.
  Read-only; prints to stdout.
  To find or read a specific session use pi-session-find.
compatibility: Node 22.18+, pi 1.1.x session format v3. No dependencies.
---

# pi-session-stats

Run the script relative to this skill directory (`$SKILL` below).

## When to use

| Need | Use |
|---|---|
| Cost, tokens, model/tool timing over sessions | this skill |
| Real input sizes before a performance audit | this skill, "Workload sizes" section, then `perf-audit` |
| Which session, or what happened in it | the `pi-session-find` skill |
| pi client performance (render time, memory, time to first token) | this skill, "Client timing" section (needs pi-perf-log records) |

## Safety

- Read-only. Reads session files and, for sessions in scope, their
  pi-perf-log records (`<perfDir>/<sessionId>.jsonl`); prints to stdout and
  writes nothing.
- Output includes session ids, working directories, and model names but no
  conversation text. Session ids still identify private history; do not
  send the output to external services.
- Never edit session files.

## Command

```bash
node $SKILL/scripts/stats.mjs [--since 7d|12h|ISO] [--until ...] [--cwd <substring>] \
    [--provider <substring>] [--model <substring>] [--sessions-dir <dir>] [--perf-dir <dir>] [--top N] [--json]
```

The sessions directory is resolved like pi does: `PI_CODING_AGENT_SESSION_DIR`,
then `PI_CODING_AGENT_DIR/sessions`, then `~/.pi/agent/sessions`. A session
is in scope when it overlaps the `--since/--until` window and matches the
substring filters (`--provider`/`--model` match any model used in the
session). `--top` (default 10) bounds the workload, top-session, memory and
slowest-turn lists. `--perf-dir` points at pi-perf-log records; default
`PI_CODING_AGENT_DIR/perf`, then `~/.pi/agent/perf` (pass it when
`pi-perf-log.json` sets a custom `dir`).

## Sections

**Overview.** Session count, time span, user turns (host-injected skill
messages excluded), assistant messages, tool calls and errors, total cost
and tokens. The cost line separates "non-message usage entries": cache
warming and compaction summaries that pi records outside assistant
messages.

**Models.** One row per `provider/model`:
- `CALLS`, `ERR` (assistant messages with `stopReason: error` or an error
  message).
- `P50`, `P95`, `MAX` of `durationMs`: the provider round trip per
  assistant message. It includes streaming of tool-call arguments, so a
  model that writes large files shows larger durations.
- `OUT TOK/S`: median of output tokens ÷ duration per message. A
  throughput proxy, not time to first token.
- `CACHE`: cache-read tokens ÷ (input + cache-read + cache-write tokens).
  Providers report `input` without cached tokens, so all three are needed.
- `IN TOK`, `OUT TOK`, `COST` as recorded by pi.

**Tools.** One row per tool name: calls, errors (`isError` results),
duration percentiles, median and maximum result size in bytes (text plus
base64 image data).

**Client timing (pi-perf-log).** Shown when the perf files of in-scope
sessions contain turn records (`clientTiming` is `null` in JSON when they
have none). Reads `<perfDir>/<sessionId>.jsonl` for in-scope sessions only,
once per session id, following the schema in
`extensions/pi-perf-log/SCHEMA.md` (v1); other versions and malformed lines
are skipped and counted. When only skipped lines exist (for example after a
schema change), the section shows the coverage and skip counts alone.
Times print as ms below 1 s and as seconds with one decimal below 1 min.
- Coverage: turn records, sessions with records / in scope, turns joined to
  session entries by `messageEntryId`, turns flushed without `turn_end`,
  turns with frame data.
- Per model: `CONNECT` and `TTFT` P50/P95 (measured from `turn_start`),
  `OVERHEAD` P50/P95/MAX (turn time not attributed to the provider or the
  tool span: an upper bound for client work).
- Tools: summed tool time versus wall-clock span over turns with tools
  that recorded a span; a sum larger than the span means tools ran in
  parallel. Older records without a span are excluded and counted.
- Render frames (TUI turns only): total frames, mean frame time and the
  share of frames over 16 ms (frame-weighted), the P50/P95 of per-turn
  `p95Ms` values, and the longest frame. Turns without complete frame data
  (print, RPC, older pi builds, non-numeric fields) are counted as
  unmeasured.
- Memory by session (highest RSS first): first → last RSS, max RSS, max
  heap.
- Largest overhead and longest frames: turns with session id and entry id
  for `pi-session-find show <id>`.

**Workload sizes.** The evidence `perf-audit` needs to pick realistic test
sizes: largest tool-call arguments per tool (bytes of the JSON arguments;
for `write` this is mostly file content), largest tool results per tool,
longest session by entries and by bytes, largest single assistant text,
sessions with compaction. Each line names the session id (first 8 chars)
and entry id so `pi-session-find show <id>` can open it.

**Top sessions by cost.** Id, start, cwd, cost, user turns, assistant
calls, models.

`--json` emits the full model (`overview`, `models`, `tools`,
`clientTiming`, `workload`, `topSessions`, `sessionsDir`) with unrounded
numbers.

## Limits

- Time to first token, overhead, render frames and memory come only from
  `pi-perf-log` records; sessions recorded without the extension (or
  before it existed) have no client timing. Render frames need TUI mode and
  a pi build with `ctx.ui.takeFrameStats()`.
- Per-turn `p95Ms` is an approximate histogram value; per-turn p95 values
  are summarized as a distribution, not merged into one exact percentile.
  Memory is process-wide and includes subagents in the same process.
- Every entry in each file is counted, including abandoned branches; the
  footer says so. Cost therefore reflects what was actually billed, while
  turn counts can exceed what a linear replay would show.
- Percentiles use nearest rank on the available samples; a model with few
  calls has unstable P95.
- Costs are the values pi computed from its model price table at the time
  of the call.
