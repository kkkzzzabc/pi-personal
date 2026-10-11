---
title: Can codex exec perform a Computer Use task non-interactively?
date: 2026-10-11
session: 01a12764-d3ce-7687-a617-bb698837cf9f
based_on:
  - docs/research/2026-10-11-codex-sky-computer-use.md
  - docs/plans/2026-10-11-pi-computer-use.md
result: yes
---

# Can codex exec perform a Computer Use task non-interactively?

## Question

Can a pi tool delegate a desktop task to `codex exec` and get a usable result
without an interactive codex UI, with ChatGPT.app not running?

## Setup

- codex-cli 0.160.1+personal.1, default `~/.codex/config.toml` (computer-use and
  unified-computer-use plugins enabled), ChatGPT.app not running.
- Command, run from an empty scratch directory:

  ```bash
  codex exec --json --ephemeral --skip-git-repo-check -o last.txt \
    "Use Computer Use to open the Calculator app, compute 12+34 by clicking its \
  buttons, and report the number shown on the display. Do not touch any other app." \
    > events.jsonl
  ```

- No `--approve-for-me` or sandbox overrides.

## Result

yes. The run exited 0 after 19 s, Calculator showed 46, and `-o` received the
final agent message. No approval prompt blocked the run. Whether that is
because Calculator approval was already persisted from earlier ChatGPT use, or
because exec mode skips it, was not isolated.

## Evidence

- `events.jsonl` (9 lines): `thread.started`, `turn.started`, one
  `agent_message`, two `mcp_tool_call` items on server `cua_repl` tool `js`
  (`started` / `completed` pairs), final `agent_message`, `turn.completed`.
- The model used the unified runtime API, not `@oai/sky`:
  `let app = await cua.getApp("Calculator")`, then `app.click(<index>)` calls
  and `app.getAXState()`.
- `turn.completed.usage`: 82,803 input tokens (65,792 cached), 193 output.
- stderr printed `Reading additional input from stdin...`; the caller must close
  stdin to avoid waiting on it.

## Implications

- Option A is viable: the pi tool can spawn `codex exec` with stdin closed,
  stream `item.*` events as progress, and return the `-o` message.
- Cost is dominated by codex's prompt (~83k input tokens per task, mostly
  cached), so A suits coarse tasks, not step-by-step control.
- App approval behavior for never-approved apps remains unverified; the tool
  should surface codex errors verbatim.

## Follow-up

Option A was implemented on the basis of this spike and later dropped by the
user's decision; see the amendments in `docs/plans/2026-10-11-pi-computer-use.md`.
The observations above remain accurate.
