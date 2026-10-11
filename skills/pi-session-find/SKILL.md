---
name: pi-session-find
description: >
  List, search, and inspect local pi session files (~/.pi/agent/sessions).
  Use when the user refers to an earlier pi session ("the previous session",
  "where did we discuss X", "what did the other session change"), needs the
  session id or path for a topic, or wants a timeline of what happened in one
  session (user prompts, model replies, tool calls, model switches,
  compactions). Read-only; prints to stdout. For aggregate numbers across
  sessions (cost, timing, tool stats, workload sizes) use pi-session-stats.
compatibility: Node 22.18+, pi 1.1.x session format v3. No dependencies.
---

# pi-session-find

Run scripts relative to this skill directory (`$SKILL` below).

## When to use

| Need | Command |
|---|---|
| Which sessions exist for a project or period | `list` |
| Which session talked about something | `search <query>` |
| What happened inside one session | `show <id>` |
| Aggregate cost, timing, tool stats | the `pi-session-stats` skill |

## Safety

- Read-only. The script reads session files and prints to stdout. It writes
  no scratch files, caches, or copies of session content. Keep it that way:
  do not redirect output into files in the repository or elsewhere unless the
  user asks.
- Output is the user's private conversation history (prompts, replies, tool
  arguments, command output). Do not send it to external services and do not
  quote more than the task needs; prefer the bounded excerpts the script
  prints over `--full`.
- Session files belong to the running pi installation. Never edit them.

## Commands

```bash
node $SKILL/scripts/find.mjs list [filters] [--limit N]
node $SKILL/scripts/find.mjs search <query> [filters] [--regex] [--role user|assistant|all] [--include tools] [--max-per-session N]
node $SKILL/scripts/find.mjs show <id|prefix|path> [--full] [--query q] [--regex]
```

Filters (`list` and `search`): `--since 7d|12h|ISO`, `--until ...`,
`--cwd <substring>`, `--provider <substring>`, `--model <substring>`.
All commands: `--sessions-dir <dir>`, `--json`. `show` rejects session filters;
it takes one session and the options listed in its section. Count options
(`--limit`, `--max-per-session`) must be non-negative integers.

The sessions directory is resolved like pi does: `PI_CODING_AGENT_SESSION_DIR`,
then `PI_CODING_AGENT_DIR/sessions`, then `~/.pi/agent/sessions`. Use
`--sessions-dir` to point at another installation or at test fixtures.

### list

Newest first, default `--limit 30`. Columns: `ID` (first 8 chars), `STARTED`
(local time), `DUR` (first to last entry), `CWD` (last two path segments),
`MODEL` (last model used, `+N` when more were used), `MSG` (user/assistant
counts), `TOOLS` (tool calls, `!N` errors), `SIZE` (file bytes), and the
first user message that was typed (for a `/skill:` command, the arguments
after the skill body; host-injected text without arguments is skipped).

```
ID        STARTED           DUR    CWD         MODEL      MSG   TOOLS  SIZE   FIRST USER MESSAGE
33333333  2026-10-03 19:00  3s     work/beta   glm-c      1/1   1      1.2K   Rename the config key
11111111  2026-10-01 19:00  40s    work/alpha  gpt-b +1   2/4   3 !1   57.1K  Please refactor the parser module
```

### search

Case-insensitive substring match; `--regex` switches to a JavaScript regex.
Default scope is user messages and assistant text. `--include tools` adds
tool-call arguments (as JSON) and tool results; use it when looking for a
file path, command, or output string. `--role user` or `--role assistant`
narrows the default scope.

Output per matching session: one header line, then up to `--max-per-session`
(default 5) hit lines `#<entry index> <role>  <excerpt>`. Entry indexes are
positions in the file and match `show` output.

```
22222222  2026-10-02 19:00  work/alpha  (2 matches)
  #1 user  Explain the throttle design
  #2 assistant  The throttle reparses when the buffer grows by 1/8.
```

### show

Accepts a full id, a unique id prefix, or a `.jsonl` path. Prints a header
(id, path, cwd, parent session, time span, models with call counts, counts of
entries/user/assistant/tool calls/tool errors/compactions/branches, cost,
subagent output files) and a timeline:

- `U #idx hh:mm  <user text>` (truncated to 200 chars unless `--full`)
- `A #idx hh:mm  <model>  <duration>  <reply text>  tools: read x3, edit x1  [error: ...]`
- `- #idx hh:mm  model: provider/model`, `thinking: level`, `compaction: ...`

`--query q` keeps only timeline entries whose text matches (header stays).
`--json` returns `{ summary, timeline }`.

## Reading the numbers

- `DUR` and the time span are wall-clock from the first to the last entry,
  including idle time between prompts.
- Assistant `<duration>` is pi's `durationMs`: the provider round trip for
  that message, including streaming of tool-call arguments.
- Cost is the sum pi recorded on assistant messages, `usage` entries (for
  example cache warming), and compaction summaries.
- Branches: entries with more than one child (the user went back and sent a
  different message). All branches are shown in the timeline in file order.
- Subagent files are the Markdown outputs stored next to the session file
  under `<session>/subagents/`.

## Limits

- Searches load every session file in scope; with hundreds of sessions use
  `--since` or `--cwd` to narrow.
- Thinking blocks are not searched or shown.
- The parser tolerates malformed lines (counted in the header) and unknown
  entry types; it does not validate the format version.
