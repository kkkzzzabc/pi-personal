---
name: pi-session-stats
description: >
  Aggregate statistics from local pi session files (~/.pi/agent/sessions):
  cost and tokens, per-model response time percentiles and output
  throughput, cache hit ratio, per-tool duration and error rates, and real
  workload sizes (largest tool-call arguments and results, longest sessions,
  compactions). Use when the user asks how much pi usage cost, which model
  or tool is slow or failing, how large real inputs get (for perf-audit), or
  for a usage summary over a period or project. Read-only; prints to stdout.
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
| pi client performance (render time, memory, time to first token) | not available from session files; see Limits |

## Safety

- Read-only. Reads session files and prints to stdout; writes nothing.
- Output includes session ids, working directories, and model names but no
  conversation text. Session ids still identify private history; do not
  send the output to external services.
- Never edit session files.

## Command

```bash
node $SKILL/scripts/stats.mjs [--since 7d|12h|ISO] [--until ...] [--cwd <substring>] \
    [--provider <substring>] [--model <substring>] [--sessions-dir <dir>] [--top N] [--json]
```

The sessions directory is resolved like pi does: `PI_CODING_AGENT_SESSION_DIR`,
then `PI_CODING_AGENT_DIR/sessions`, then `~/.pi/agent/sessions`. A session
is in scope when it overlaps the `--since/--until` window and matches the
substring filters (`--provider`/`--model` match any model used in the
session). `--top` (default 10) bounds the workload and top-session lists.

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

**Workload sizes.** The evidence `perf-audit` needs to pick realistic test
sizes: largest tool-call arguments per tool (bytes of the JSON arguments;
for `write` this is mostly file content), largest tool results per tool,
longest session by entries and by bytes, largest single assistant text,
sessions with compaction. Each line names the session id (first 8 chars)
and entry id so `pi-session-find show <id>` can open it.

**Top sessions by cost.** Id, start, cwd, cost, user turns, assistant
calls, models.

`--json` emits the full model (`overview`, `models`, `tools`, `workload`,
`topSessions`, `sessionsDir`) with unrounded numbers.

## Limits

- Not measured by pi's session format, so not available here: time to
  first token, TUI render time, process memory. Adding them needs a
  change in the pi fork or an extension.
- Every entry in each file is counted, including abandoned branches; the
  footer says so. Cost therefore reflects what was actually billed, while
  turn counts can exceed what a linear replay would show.
- Percentiles use nearest rank on the available samples; a model with few
  calls has unstable P95.
- Costs are the values pi computed from its model price table at the time
  of the call.
