# Driving the pi TUI with agent-tty

All commands take `--home <ttyHome>` and the `sessionId` from `run.json`;
add `--json` for machine-readable results. Check options with
`<agent-tty> <command> --help`.

## Input

| Goal | Command |
|---|---|
| Type text | `type <sid> 'text'` |
| Submit | `send-keys <sid> Enter` |
| Slash command with arguments | `type <sid> '/cmd arg'`, `wait --screen-stable-ms 500`, `send-keys <sid> Escape Enter` |
| Shortcut | `send-keys <sid> Ctrl+Alt+P` (agent-tty key names) |
| Quit pi | `send-keys <sid> Ctrl+D` → bash prints `[tui-check] pi exited with status N` |
| Reopen a session | `run <sid> 'bash <runDir>/launch.sh --session <id>' --no-wait`, then wait for the footer model id |

Autocomplete: typing `/cmd arg` opens a completion list; Enter accepts the
highlighted item and does not submit. Text typed afterwards is appended to
the same line. Close the list with Escape before Enter, or snapshot and
press Enter again.

## Waiting

- `wait --text X` succeeds immediately if `X` is already on screen. Wait
  for output that did not exist before the action, or use `--regex` with
  distinctive content, or `--after-seq <n>` from a previous result.
- `wait --screen-stable-ms 500..1000` after typing, before keys that depend
  on the editor state.
- A model turn with tool calls finishes when the scenario's final text
  appears.
- Real mode: the echoed prompt is on screen, so a wait for text contained in
  the prompt succeeds immediately. Ask for a derived answer ("join REAL and
  DONE with a hyphen") and wait for `REAL-DONE|Error: ` so provider errors
  end the wait too. Allow 30-60 s.
- Do not use fixed sleeps.

## Reading state

| What | Where |
|---|---|
| Footer status (`ctx.ui.setStatus`) | Last lines of `snapshot --format text` |
| Notifications (`ctx.ui.notify`) | Transient lines above the editor; capture right after the action |
| Transcript (tool calls, blocks, results) | Snapshot text; long output may scroll |
| Extension state (`pi.appendEntry`) | `custom` entries in `<runDir>/sessions/*.jsonl` |
| Model input | `<runDir>/logs/model-input.jsonl`: `call` (unique across sessions), `session` (session file), `model`, `activeTools`, `messages[]` (`role`, `text`, `customType`, `toolCalls`, …); `messages[0]` should be the system prompt (a different first role is worth investigating) |
| Files | `<runDir>/work/` |

Snapshots render 120 columns by default; long lines wrap. Prefer files and
logs for exact values.

## Startup screen

The header lists loaded `[Extensions]` (and `[Skills]`, `[Prompts]`,
`[Themes]` when given). With isolation, only the resources passed to
`start.mjs` plus `faux-model.ts` and `observer.ts` appear; anything else
means isolation leaked.

In real mode the user's `settings.json` applies; with quiet startup enabled
the resource list is not shown. Check isolation from the model-input log
instead: `activeTools` and the system prompt (`messages[0].text`) reveal
which extensions and skills were active.

## Provider errors

Errors render as `Error: <status> <body>` in the transcript, followed by a
`/bug` hint. A provider error alone does not establish its cause. With the
local Pi fork, pass `--skill skills/pi-docs` to select skill-based documentation
guidance in isolated runs. This does not guarantee provider acceptance.

## Cleanup

`finish.mjs` quits pi (Ctrl+D up to twice), destroys the agent-tty session,
and writes `finish.json`. If it reports `piExited: false`, inspect the
`screen` lines it returns, resolve the blocking state (for example an open
dialog), and run it again. Run directories are never deleted automatically.
