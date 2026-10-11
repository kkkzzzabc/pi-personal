---
title: tui-check skill
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/spikes/2026-10-11-agent-tty-pi-tui-verification.md
  - docs/spikes/2026-10-11-plan-approval-flow.md
  - docs/plans/2026-10-11-plan-mode-extension.md
---

# tui-check skill

## Goal

A general-purpose pi skill that lets the agent verify changes in the **real
pi TUI** on its own: extensions, skills, prompt templates, themes, settings,
and keybindings. It launches an isolated pi inside an `agent-tty` session,
drives it with a scripted (faux) or real model, and records what the model
actually received. It packages the approach proven in the agent-tty spike so
any pi task can use it, not only plan-mode.

## Non-goals

- PNG capture validation and replay of finished PTY recordings; the global
  `cli-display` skill covers those and is referenced instead.
- Verifying non-pi CLIs/TUIs (use `cli-display` / agent-tty directly).
- Copying credentials, CI integration, Windows support.
- Assertion DSL or test runner; the agent asserts with agent-tty waits,
  snapshots, files, and logs.

## Design

### 1. Decisions

| # | Topic | Decision | Basis |
|---|---|---|---|
| T1 | Name / location | `tui-check`, in pi-personal `skills/tui-check/` (available in every pi session where the package is installed) | User |
| T2 | Scope | Any pi resource: `--extension`, `--skill`, `--prompt-template`, `--theme`, agent files (settings, keybindings, extension config), project fixture | User ("general use in pi") |
| T3 | Modes | **faux** (default, scenario file) and **real** (`--real-model provider/id`) | User |
| T4 | Real-mode auth | Use the user's agent dir in place (no credential copy); isolate everything else by flags and temp dirs; fingerprint config files before/after and report changes | Copying `auth.json` risks OAuth refresh-token rotation invalidating the original |
| T5 | Approval | Real mode needs user approval once per task scope (cost, external calls); faux mode needs none. Same rule as `cli-display` | User |
| T6 | Model-input log | Separate `observer.ts` extension using `context_with_system` (final input incl. system prompt), works in both modes | pi 1.1.0 `ContextWithSystemEvent` |
| T7 | Discovery | Disabled by default (`-ne -ns -np --no-themes --no-mcp -nc`, `--offline`); only explicitly passed resources load; `--context-files` opt-in | Spike: `~/.agents/skills` leaked into an isolated agent dir |
| T8 | Interaction | Raw agent-tty commands after launch; skill documents pi-specific pitfalls | Spike |

### 2. Layout

```text
skills/tui-check/
├── SKILL.md                 # When to use, workflow, pitfalls, safety, reporting
├── scripts/
│   ├── start.mjs            # Preflight, isolated dirs, agent-tty session, launch pi, wait ready → run.json
│   ├── finish.mjs           # Quit pi, destroy session, fingerprint diff (real), summary
│   ├── faux-model.ts        # Faux provider driven by a scenario file (faux mode)
│   ├── observer.ts          # Model-input JSONL log (both modes)
│   └── lib.ts               # Scenario parsing, templates, summaries, quoting
└── references/
    ├── start-options.md     # Options, isolation per mode, run.json fields
    ├── scenario.md          # Scenario format, templates, examples (plan-mode Phase 1 as example)
    └── pi-tui-notes.md      # Keys, ready signal, autocomplete, stale waits, resume, inspecting session/log files
tests/
├── tui-check.test.mjs                # Unit: scenario parsing, templates, option parsing, fingerprints
└── tui-check.integration.test.mjs    # End to end with agent-tty + installed pi (skipped if unavailable)
```

### 3. `start.mjs`

Options (repeatable where noted):

| Option | Meaning |
|---|---|
| `--extension <path>` (rep.) | Load extension under test |
| `--skill`, `--prompt-template`, `--theme` <path> (rep.) | Load resources under test |
| `--scenario <file>` | Faux mode (default mode); model `faux/faux-1` |
| `--real-model <provider/id>` | Real mode (requires approval in the calling task) |
| `--thinking <level>` | Passed to pi; real mode defaults to `low` |
| `--tools <list>` | Passed to pi `--tools` to limit tools |
| `--agent-file <name>=<src>` (rep.) | Copy into the temp agent dir (faux mode only; refused in real mode) |
| `--fixture <dir>` | Copy into the temp work dir |
| `--context-files` | Allow AGENTS.md/CLAUDE.md discovery |
| `--pi-arg <arg>` (rep.) | Extra pi arguments (e.g. `--plan`, `--use-theme x`) |
| `--cols`, `--rows` | Terminal size (default 120×40) |
| `--out <dir>` | Run directory (default new temp dir) |
| `--ready-timeout <ms>` | Startup wait timeout (default 60000) |

Behavior:

1. Preflight: locate agent-tty (`TUI_CHECK_AGENT_TTY`, PATH, then
   `~/.local/share/cli-display-tools/node_modules/.bin/agent-tty`), check
   `version`; locate `pi`; fail with a clear message otherwise.
2. Create `<out>/{tty,agent?,sessions,work,logs}`; copy fixture and agent
   files; in real mode record sha256 of `settings.json`, `keybindings.json`,
   `models.json`, `trust.json` in the user agent dir.
3. Create the agent-tty session (cwd = work dir), launch pi with isolation
   flags, `-e observer.ts` last, `-e faux-model.ts` in faux mode, env
   `TUI_CHECK_SCENARIO` and `TUI_CHECK_FAUX_STATE` (faux mode),
   `TUI_CHECK_MODEL_LOG` (both modes), and `PI_CODING_AGENT_DIR` (faux mode only).
4. Wait until the footer shows the model id and the screen is stable.
5. Write and print `run.json`: `ttyHome`, `sessionId`, `mode`, `model`,
   `agentDir`, `sessionDir`, `workDir`, `modelLog`, `command`,
   `fingerprints`, `agentTty`, and `launch` (the reusable launcher script).

### 4. `finish.mjs <run.json>`

Send Ctrl+D (twice if needed), wait for exit, capture the resume command,
`destroy` the agent-tty session, compare fingerprints (real mode), and print
a summary: session file, model log path and call count, settings changes,
leftover state. Never deletes the run directory.

### 5. Faux scenario (`faux-model.ts`)

```json
{
  "responses": [
    { "toolCalls": [{ "name": "write", "args": { "path": "{{entry:plan-mode.planFile}}", "content": "# Plan" } }] },
    { "thinking": "optional", "text": "Done." }
  ],
  "whenExhausted": "Scenario exhausted."
}
```

Templates resolved per call: `{{cwd}}`, `{{env:NAME}}`,
`{{entry:<customType>.<dot.path>}}` (latest custom entry on the current
branch), `{{lastUser}}`. Unresolved templates fail the call with a visible
error text rather than guessing. The response position is persisted through
`TUI_CHECK_FAUX_STATE`, so session replacement and relaunch do not restart the
scenario. The faux provider is unregistered on session shutdown.

### 6. Observer (`observer.ts`)

On every `context_with_system`, append one JSON line to `TUI_CHECK_MODEL_LOG`:
call index, timestamp, active tools, and messages (role, custom type,
text; images elided), including the system message. Read-only: returns
nothing. Loaded last so it sees the final input. Call numbering continues from
the existing log across session replacement/relaunch; records also identify
the session and model.

### 7. SKILL.md outline

1. When to use / not to use (stdout-only checks, non-pi TUIs → `cli-display`).
2. Safety: faux by default; real mode approval and what it touches (user
   agent dir in place, cost); work dir is temp but bash is not sandboxed.
3. Workflow: write scenario → `start.mjs` → interact (agent-tty) → assert
   (snapshot text, files, session JSONL, model log) → `finish.mjs` → report.
4. pi TUI pitfalls (autocomplete Enter, stale waits, ready signal, quitting
   and resuming, notifications are transient).
5. Reporting: mode/model, what was verified vs not, artifacts, settings
   changes, leftover sessions.

## Phases

### Phase 1: Faux mode core

- Changes: `faux-model.ts`, `observer.ts`, `start.mjs` (faux), `finish.mjs`
  (without fingerprints).
- Verify (automated): unit tests for scenario/templates/options;
  integration: launch with a tiny extension + scenario, assert a tool call,
  observer log contents, finish cleans up the session.
- Verify (manual): re-run plan-mode Phase 1 checks through the skill.

### Phase 2: Real mode

- Changes: `--real-model`, user agent dir usage, fingerprints, real-mode
  refusals (`--agent-file`), default thinking `low`.
- Verify (automated): unit tests for fingerprint diff and option rules.
- Verify (manual, approved): one short real-model run (cheap model) with
  observer log and no settings change.

### Phase 3: Skill docs

- Changes: `SKILL.md`, `references/*`, README entry.
- Verify (automated): `npm test`, `npm run test:integration`.
- Verify (manual): `/reload`; skill listed; a fresh agent run follows the
  skill to verify a sample extension.

## Risks and open questions

- Depends on agent-tty 0.5.0 CLI flags and output shape; pin and check the
  version in preflight.
- pi CLI flags or loader behavior may change after 1.1.0; integration test
  catches launch failures.
- Real mode writes in the user agent dir (auth refresh, models cache);
  fingerprints only cover listed config files.
- Other extensions' `context_with_system` handlers loaded after the observer
  would not be reflected; the observer is passed last.
- The implemented launcher uses explicit resources and disables discovery;
  it does not pass `--no-approve`. Trust behavior outside the tested setup
  should still be checked rather than assuming approval prompts are bypassed.
- Bash run by a real model can reach outside the temp work dir; recommend
  `--tools` limits for risky scenarios.

## Amendments

### 2026-10-11 — Align isolation and cross-session behavior with the launcher
- Change: Added MCP isolation, shared helpers, startup timeout/launcher details,
  and persisted faux position/observer numbering; clarified actual trust flags.
- Reason: These implementation details were absent from the initial design.
- Impact: The documented setup matches the maintained scripts and can continue
  a scenario across session replacement. Faux verification is not evidence of
  real-provider behavior, and shell access is still not sandboxed.
- Evidence: `skills/tui-check/scripts/{start.mjs,faux-model.ts,observer.ts,lib.ts}`
  and [launcher reference](../../skills/tui-check/references/start-options.md).
