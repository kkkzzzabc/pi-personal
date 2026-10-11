---
name: tui-check
description: >
  Verify pi changes in the real pi TUI by driving an isolated pi session with
  agent-tty and a scripted (faux) model. Use when you need to confirm how an
  extension, skill, prompt template, theme, setting, or keybinding behaves
  interactively in pi: slash commands, shortcuts, footer status,
  notifications, dialogs, tool blocking, session restore, or what the model
  actually received (system prompt, reminders, active tools). A real-model
  mode checks how an actual model reacts. Not for plain stdout checks or
  non-pi terminal apps.
compatibility: pi 1.1.x, Node 22.18+ (native TypeScript), agent-tty 0.5.x (TUI_CHECK_AGENT_TTY, PATH, or ~/.local/share/cli-display-tools).
---

# tui-check

Run scripts relative to this skill directory. Commands below use `$SKILL` for
it and `$TTY` for the agent-tty binary reported in `run.json`.

## When to use

| Need | Use |
|---|---|
| Interactive pi behavior of a change (commands, keys, status, dialogs, restore) | this skill |
| What the model received (system prompt, injected messages, tools) | this skill (model-input log) |
| Logic covered by unit/integration tests | tests first; this skill for the interactive part |
| Screen PNG evidence or replay of a finished recording | the `cli-display` skill (same agent-tty install) |
| A terminal app other than pi | `cli-display` or agent-tty directly |

## Safety

- **Faux mode (default)** runs fully isolated: temporary agent dir, session
  dir, and work dir; extension/skill/prompt/theme/context-file discovery off;
  `--offline`; no network or model cost. It needs no extra approval beyond the
  task itself.
- The model's tools still run for real. The work dir is a temporary copy, but
  `bash` is not sandboxed; avoid scenarios that run destructive commands, or
  limit tools with `--tools`.
- **Real mode** (`--real-model provider/id`) calls an actual model: it costs
  tokens or plan usage and sends the scenario to the provider. Get the
  user's approval for the task first; within an approved task, do not ask
  again per run. It uses the user's agent dir in place for credentials
  (never copied), so the user's `settings.json` applies (theme, quiet
  startup, defaults); packages, skills, prompts, themes, MCP, and context
  files stay disabled unless passed explicitly. `finish.mjs` reports any
  change to `settings.json`, `keybindings.json`, `models.json`, `trust.json`.
- Resource discovery is disabled in real mode. With the local Pi fork, pass
  `--skill skills/pi-docs` to use skill-based host documentation guidance.
  This changes the prompt; it does not guarantee provider acceptance.
- Never copy credentials or point a faux run at the user's agent dir.
- Never type into, resize, or quit the user's own pi sessions; only drive
  sessions created by `start.mjs`.

## Workflow

1. **Decide what to observe** and how: screen text, files in the work dir,
   session JSONL (custom entries), or the model-input log.
2. **Write a scenario** (scripted model responses). Format, templates, and
   examples: [references/scenario.md](references/scenario.md).
3. **Start** an isolated pi:

   ```bash
   node "$SKILL/scripts/start.mjs" --scenario scenario.json \
     --extension path/to/extension.ts [--skill dir] [--prompt-template f] [--theme f] \
     [--agent-file name=src] [--fixture dir] [--pi-arg --flag] [--out dir]
   # real mode: replace --scenario with --real-model <provider>/<id> (no --agent-file)
   ```

   It prints `run.json` (`ttyHome`, `sessionId`, `workDir`, `modelLog`,
   `sessionDir`, `launch`, `agentTty.bin`). `ok: false` includes the last
   screen lines. Options: [references/start-options.md](references/start-options.md).
4. **Drive and observe** with agent-tty, always passing `--home <ttyHome>`:
   `type`, `send-keys`, `wait --text/--regex/--screen-stable-ms`,
   `snapshot --format text`. Read the pi-specific pitfalls first:
   [references/pi-tui-notes.md](references/pi-tui-notes.md).
5. **Assert** on evidence, not on assumptions: snapshot text, files under
   `workDir`, `custom` entries in the session JSONL, and
   `logs/model-input.jsonl` (one line per model call).
6. **Finish**: `node "$SKILL/scripts/finish.mjs" <runDir>/run.json` quits pi,
   destroys the agent-tty session, and prints session files, model-log call
   count, and a `relaunch` command. The run directory is kept.

To test restore: quit pi (`Ctrl+D`), then in the same agent-tty session run
`bash <runDir>/launch.sh --session <id>` (the id is in the session file name),
before calling `finish.mjs`.

## Key pitfalls (details in pi-tui-notes.md)

- Slash commands with arguments open autocomplete; Enter selects the item
  instead of submitting. Send `Escape` then `Enter`.
- `wait --text` matches text already on screen. Wait for new, distinctive
  output (scenario texts like `STEP-2-DONE` help).
- Notifications are transient; capture them with `wait`/`snapshot` right
  after the action.
- Ready signal: the footer shows the model id; `start.mjs` already waits for it.
- Real mode: never put the expected answer verbatim in the prompt (the echoed
  prompt matches the wait). Ask for something derived, e.g. "join REAL and
  DONE with a hyphen" and wait for `REAL-DONE|Error: `. Results vary between
  runs; treat a failure as an observation to investigate, not a bug by
  default.

## Report

State the mode and loaded resources, each behavior verified with its
evidence (screen line, file, log entry), what was not verified, the run
directory, and whether the agent-tty session was destroyed (`finish.json`).
Do not present faux-model results as evidence of real model behavior. For
real runs also report the model, the cost/usage shown in the footer, and
`configChanges` from `finish.json`.
