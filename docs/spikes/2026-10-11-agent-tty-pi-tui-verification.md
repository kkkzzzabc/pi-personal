---
title: Can an agent verify pi extension behavior in the real pi TUI with agent-tty?
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/plans/2026-10-11-plan-mode-extension.md
  - docs/spikes/2026-10-11-plan-approval-flow.md
result: yes
---

# Can an agent verify pi extension behavior in the real pi TUI with agent-tty?

## Question

Unit and faux-session tests do not exercise the interactive TUI (commands,
autocomplete, shortcuts, footer status, notifications, resume). Can the agent
itself drive a real pi TUI, without touching the user's configuration or
calling a real model, to verify an extension end to end?

## Setup

- pi 1.1.0 (managed install); `coder/agent-tty` 0.5.0 already installed at
  `~/.local/share/cli-display-tools/node_modules/.bin/agent-tty` (found via
  earlier Codex sessions; the global `cli-display` skill wraps the same
  install).
- Isolation: `/tmp/pi-tui-check/{agent,repo,plans,sessions}`;
  `PI_CODING_AGENT_DIR=/tmp/pi-tui-check/agent`, `PI_OFFLINE=1`,
  `--session-dir /tmp/pi-tui-check/sessions`, `-ne` plus explicit `-e`.
  Extension config `agent/plan-mode.json` pointed `plansDir` into the
  sandbox.
- Model: a test-only extension registered a faux provider (`faux/faux-1`)
  via `@earendil-works/pi-ai/compat` (resolved by pi's extension loader). It
  read the current plan file from the latest `plan-mode` custom entry in
  `before_agent_start` and scripted: call 1 → `write README.md` and
  `write <planFile>`; call 2 → text `FAUX-DONE`.
- Launch inside an agent-tty bash session:

```text
pi -ne -e extensions/plan-mode/index.ts -e /tmp/pi-tui-check/faux-ext.ts \
   --model faux/faux-1 --session-dir /tmp/pi-tui-check/sessions
```

- Interaction with `type`, `send-keys` (Enter, Escape, Ctrl+Alt+P, Ctrl+D),
  `wait --text/--regex/--screen-stable-ms`, `snapshot --format text`, and
  `screenshot`.

## Result

**yes.** The agent drove the real TUI and verified every Phase 1 behavior of
plan-mode: `/plan` entry with notice and `⏸ plan` footer status, `/plan path`,
the write guard (README.md unchanged, block reason rendered), plan file
creation, Ctrl+Alt+P toggling, and restore after quitting and reopening the
session with `--session <id>`. No user files, settings, or sessions were
touched and no network calls were made.

## Evidence

- Footer after `/plan`: `⏸ plan`; notice
  `Plan mode on. Plan file: /tmp/pi-tui-check/plans/20261011-032755-brave-beacon.md`.
- Transcript: `write README.md` rendered as blocked with
  `Plan mode: write may only modify the plan file …`; `write <planFile>`
  succeeded; filesystem: README.md still `original`, plan file contains
  `# Plan\n1. Step one`.
- Ctrl+Alt+P → `Plan mode off. Build mode active.`; again → new plan file
  `…-young-comet.md`.
- Ctrl+D printed `To resume this session: pi --session-dir … --session
  01a12712-…`; relaunch showed `⏸ plan` and `/plan path` reported
  `…-young-comet.md`.
- Screenshot artifact:
  `/tmp/pi-tui-check/att/sessions/01M4KH3SG2QPW2GWDYHKR891NY/artifacts/screenshot-344-reference-dark.png`
  (temporary; not kept).

Pitfalls observed:

- **Slash command arguments open autocomplete.** Enter after `/plan path`
  accepted the completion instead of submitting; the next typed text was
  appended (`/plan pathplease plan`). Close the list with Escape, or check the
  snapshot and press Enter again.
- **Stale matches.** `wait --text` matched text already on screen from an
  earlier step. Wait for text that is new, use `--regex` with distinctive
  content, or `--after-seq`.
- **Batch wait options.** A `batch` with an unrecognized wait option failed
  silently (`ok: false`, no steps); separate `run --no-wait` + `wait` calls
  worked.
- **Discovery leaks into isolation.** With `PI_CODING_AGENT_DIR` isolated,
  skills from `~/.agents/skills` were still listed; `-ns` (and `-np`,
  `--no-themes`, `-nc`) are needed for full isolation.
- Ready signal: the footer shows the model id (`faux-1`) once the TUI is up.

## Implications

- Agent-driven TUI verification of pi resources is practical and cheap with
  a faux model. It complements unit tests rather than replacing them.
- The setup (isolated dirs, flags, faux provider, waits) is generic enough
  to package as a reusable skill for any pi extension, skill, prompt
  template, theme, or setting.
- A model-input log (what the model actually received) would make prompt and
  reminder changes verifiable in the same run.

## Follow-up

The reusable [tui-check skill](../../skills/tui-check/SKILL.md) now implements
this approach, including observer logs; its
[design record](../plans/2026-10-11-tui-check-skill.md) describes the scope.
[The message-order experiment](2026-10-11-custom-message-before-first-prompt.md)
shows why every model call, not only the first, should be checked for a leading
system message. The temporary Phase 1 harness above remains historical setup,
not the current recommended launcher.

## Amendments

### 2026-10-11 — Link the reusable verification skill and ordering finding
- Change: Added the implemented skill, design, and message-order follow-up.
- Reason: The proposed reusable skill and observer logging were implemented.
- Impact: Readers can use the maintained launcher instead of recreating the
  temporary harness; the original Phase 1 observations remain unchanged.
- Evidence: [tui-check](../../skills/tui-check/SKILL.md) and
  [message-order experiment](2026-10-11-custom-message-before-first-prompt.md).
