# start.mjs options

```bash
node scripts/start.mjs --scenario <file> [options]            # faux mode
node scripts/start.mjs --real-model <provider>/<id> [options]  # real mode (approval required)
```

| Option | Repeatable | Meaning |
|---|---|---|
| `--scenario <file>` | | Faux mode: model responses. Copied to `<runDir>/scenario.json`. |
| `--real-model <provider>/<id>` | | Real mode: exact model (no patterns, no `:thinking` suffix). Mutually exclusive with `--scenario`. |
| `--extension <path>` | yes | Extension under test (`pi -e`). Loaded before the faux model and observer. |
| `--skill <path>` | yes | Skill file or directory (`pi --skill`). |
| `--prompt-template <path>` | yes | Prompt template file or directory. |
| `--theme <path>` | yes | Theme file or directory. Select it with `--pi-arg --use-theme --pi-arg <name>`. |
| `--agent-file <name>=<src>` | yes | Faux mode only. Copy `<src>` to `<agentDir>/<name>` (e.g. `settings.json`, `keybindings.json`, `plan-mode.json`). Name must be relative without `..`. |
| `--fixture <dir>` | | Copy into the work dir (pi's cwd). |
| `--context-files` | | Allow AGENTS.md / CLAUDE.md discovery (off by default). |
| `--thinking <level>` | | `pi --thinking`. Real mode defaults to `low`. |
| `--tools <list>` | | `pi --tools` allowlist. |
| `--pi-arg <arg>` | yes | Extra pi argument, one token per flag (e.g. `--pi-arg --plan`). |
| `--cols`, `--rows` | | Terminal size, default 120×40. |
| `--out <dir>` | | Run directory (default: new temp dir). Must not contain `run.json`. |
| `--ready-timeout <ms>` | | Startup wait, default 60000. |

## Isolation

pi runs from `<runDir>/launch.sh` with, in both modes:

- `PI_OFFLINE=1`, `-ne -ns -np --no-themes --no-mcp --offline -nc` (no discovery, no MCP),
  `--session-dir <runDir>/sessions`, cwd `<runDir>/work`
- `TUI_CHECK_MODEL_LOG` for the observer (loaded last)

| | Faux mode | Real mode |
|---|---|---|
| Agent dir | `<runDir>/agent` (temporary) | User's agent dir (`PI_CODING_AGENT_DIR` or `~/.pi/agent`), in place |
| Credentials | none needed | user's `auth.json`, never copied; token refresh updates it in place |
| `settings.json` effects | only `--agent-file` copies | user's settings apply (theme, quiet startup, defaults) |
| Model | `-e faux-model.ts --model faux/faux-1` | `--model <provider>/<id>`, `--thinking low` by default |
| Config fingerprints | — | sha256 of `settings.json`, `keybindings.json`, `models.json`, `trust.json` in `run.json`; `finish.mjs` reports `configChanges` |

Skill discovery is disabled in real mode. With the local Pi fork, pass
`--skill skills/pi-docs` explicitly to use skill-based documentation guidance.
The policy is provided by the fork's core; it needs no separate extension
and does not guarantee provider acceptance.

Extra arguments to `launch.sh` are passed to pi, e.g.
`bash launch.sh --session <id>` to reopen a session with the same setup.

## Run directory

```text
<runDir>/
├── run.json          # start result
├── finish.json       # finish result
├── launch.sh         # exact pi invocation
├── scenario.json
├── agent/            # isolated agent dir (+ --agent-file copies)
├── sessions/         # pi session JSONL files
├── work/             # pi cwd (+ --fixture copy)
├── logs/model-input.jsonl
└── tty/              # agent-tty home (recordings, screenshots)
```

## run.json fields

`ok`, `ready`, `mode` (`faux` | `real`), `model`, `thinking`, `agentTty`
(`bin`, `version`, `supported`), `ttyHome`, `sessionId`, `runDir`,
`agentDir`, `userAgentDir` (true in real mode), `sessionDir`, `workDir`,
`modelLog`, `scenario` (faux) or `fingerprints` (real), `launch`,
`command`, `piArgs`, `cols`, `rows`; on failure `error` and `screen` (last
lines).

`finish.json` adds `mode`, `model`, `piExited`, `ttySessionDestroyed`,
`resumeCommand`, `relaunch`, `sessionFiles`, `modelLog.calls`, and in real
mode `userAgentDir` and `configChanges`.

## Locating agent-tty

`TUI_CHECK_AGENT_TTY`, then `agent-tty` on `PATH`. Install the official CLI
with `npm install -g agent-tty@0.5.0` (Node `>=24 <27`). Versions other than
0.5.x are reported as `agentTty.supported: false`; check behavior before
relying on them.

This workflow uses text snapshots and render-backed waits, not PNG or WebM.
Without Chromium, the optional native `libghostty-vt` renderer must be available.
`agent-tty doctor --json` should report `snapshot` and `wait` as available;
its overall result may fail because browser and screenshot checks fail.
The `ghostty-web` fallback and visual artifacts require Playwright Chromium.
Do not automatically download browsers for text-only checks.
