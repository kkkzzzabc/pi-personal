# pi-personal

A local package for managing personal Pi extensions, skills, prompts, and themes.

## Installation

Register it in your personal global settings:

```bash
pi install /Users/kkkzzzabc/workspace/projects/personal/pi-personal
```

Local packages are not copied; Pi loads them from their original path. After making changes, run `/reload` in the running Pi session.

Use `pi list` to check registration, and `pi config` to toggle resource enablement.

## Structure

```text
pi-personal/
├── package.json
├── README.md
├── .gitignore
├── extensions/  # Tools, commands, and event handling code
├── skills/      # Per-task SKILL.md files and supporting materials
├── prompts/     # Reusable prompt Markdown
├── themes/      # Custom theme JSON
├── scripts/     # Standalone verification/utility scripts
├── native/      # Native helpers built separately (e.g. cua-helper, Swift)
├── tests/       # Tests
└── docs/        # Design notes and usage examples
```

This package uses Pi's standard resource directories, so `package.json` declares no extra `pi` path mapping. Extensions in `extensions/` are discovered automatically when the package is loaded.

Project work is indexed in [the backlog](docs/backlog/) (`python3 scripts/backlog.py list`); see
[the documentation guide](docs/README.md) for operating rules and record types.

## Resources

| Resource | Type | Purpose |
|---|---|---|
| `computer-use/` | Extension | macOS app control with native `computer_*` tools (see [Computer use](#computer-use)) |
| `plan-mode/` | Extension | Plan ↔ build modes with a plan file and an approval flow (see [Plan mode](#plan-mode)) |
| `ask-user/` | Extension | Independent parent-TUI `ask_user`: choices, custom answers, comments, review, discussion, and cancellation (see [User questions](#user-questions)) |
| `subagent/` | Extension | `subagent` tool: read-only `explorer` and `reviewer` child agents with fresh context (see [Subagents](#subagents)) |
| `review` | Prompt | `/review [target or focus]`: parallel reviewer subagents, verified and summarized; asks before fixing |
| `pi-docs` | Skill | Map of pi's documentation |
| `pi-web` | Skill | One web entry point: ego for generic browser work; Aside for service integrations, delegation, and designated existing state |
| `tui-check` | Skill | Verify pi changes in the real pi TUI with agent-tty and a scripted faux model; requires agent-tty 0.5.x |

The local Pi fork provides skill-based documentation guidance in its core.
The former `claude.ts` extension was retired; see
[`docs/adr/0001-move-docs-guidance-into-pi-fork.md`](docs/adr/0001-move-docs-guidance-into-pi-fork.md).

## Web workflow

`pi-web` provides one entry point with separate execution responsibilities:

- **ego-browser**: generic search, page reading, UI operations, and web testing.
- **Aside service integration**: documented site functions via `aside repl`.
- **Aside delegation**: bounded independent work via `aside exec`.
- **Existing Aside state**: direct access limited to the designated tab/state.

```text
/skill:pi-web Find current documentation for this library using ego.
/skill:pi-web Read this Google Doc using Aside's documented service integration.
/skill:pi-web Delegate this read-only research task to Aside and return sources.
/skill:pi-web Inspect the unsaved form in my existing Aside tab without changing it.
```

The selected external CLI and its vendor instructions must already be installed.
The skill reads them on demand; it does not install/update tools or change global
settings. Aside is not a generic fallback from ego, and execution failures do not
authorize switching paths or expanding permissions. Delegation and external
changes must be within the approved scope.

This is workflow guidance through pi's existing tools, not a new web tool or a
technical approval guard. The package keeps one discoverable skill and two
supporting references. After installation or changes, use `/reload` to refresh
resource discovery. Design, evidence, and verification limits:
[`docs/plans/2026-10-11-pi-web-skill.md`](docs/plans/2026-10-11-pi-web-skill.md).

## Computer use

`extensions/computer-use` (macOS only) lets pi read and operate desktop apps
through a native helper, `native/cua-helper` (Accessibility tree + CGEvent
input). Design: [`docs/plans/2026-10-11-pi-computer-use.md`](docs/plans/2026-10-11-pi-computer-use.md).

Tools: `computer_list_apps`, `computer_get_app_state`, `computer_launch_app`,
`computer_click`, `computer_type_text`, `computer_press_key`,
`computer_scroll`, `computer_set_value`.

Setup:

```bash
npm run build:cua-helper   # Swift 5.9+; builds native/cua-helper/.build/release/pi-cua-helper
```

`PI_CUA_HELPER` overrides the helper path.

Permissions: macOS attributes Accessibility and Screen Recording to the app
hosting pi (your terminal), not to the helper. Without Accessibility the native
tools fail; without Screen Recording `computer_get_app_state` returns the
accessibility tree without a screenshot. Granting these to a terminal applies to
everything run from it.

Safety:

- Each app needs your approval once per session before pi reads or controls it.
  Without an interactive UI these tools refuse.
- Terminals (including the one hosting pi), System Settings, Keychain Access,
  and Passwords are never allowed.
- Input is sent only after the target app is confirmed frontmost; typing stops
  if another app comes to the front.

## Plan mode

`extensions/plan-mode` adds an OpenCode-style plan mode. In plan mode the agent
explores and writes a plan without changing the project, then asks for approval.
Design and decisions: [`docs/plans/2026-10-11-plan-mode-extension.md`](docs/plans/2026-10-11-plan-mode-extension.md).

| Action | How |
|---|---|
| Toggle | `/plan` or `Ctrl+Alt+P` (configurable) |
| Explicit | `/plan on`, `/plan off` |
| Start in plan mode | `pi --plan` |
| Show the plan file | `/plan path` |
| Implement the last approved plan in a fresh session | `/plan implement-fresh` |

In plan mode:

- `edit`/`write` may only change the current plan file
  (`~/.pi/plans/<timestamp>-<words>.md`); other writes are blocked.
- Only read-only tools stay active: built-in read tools, `bash`, `edit`/`write`,
  tools marked `readOnlyHint`, and configured `extraTools`.
- `bash` is not blocked; the model is instructed not to run mutating commands.
- The thinking level switches to `high` and is restored on leaving.
- The footer shows `⏸ plan`. The state survives resume and tree navigation.

The model can ask to enter plan mode with `enter_plan_mode` (you confirm), and
finishes with `exit_plan_mode`, which offers: approve and implement here,
approve and implement in a fresh session, give feedback, or keep planning. The
approval prompt shows the plan file path; the model summarizes the plan in the
chat before asking. Without an interactive UI (`pi -p`), plan mode can only be
entered with `/plan` or `--plan`, and `exit_plan_mode` returns the plan without
leaving plan mode.

Optional configuration in `~/.pi/agent/plan-mode.json` (agent dir follows
`PI_CODING_AGENT_DIR`):

```json
{ "plansDir": "~/.pi/plans", "thinkingLevel": "high", "extraTools": [], "shortcut": "ctrl+alt+p" }
```

To toggle with `Shift+Tab` like OpenCode, move pi's thinking-level shortcut in
`~/.pi/agent/keybindings.json`, then set the plan-mode shortcut and `/reload`:

```json
{ "app.thinking.cycle": "ctrl+alt+t" }
```

Pick a key that pi does not already use (`ctrl+t` is taken by
`app.thinking.toggle`).

```json
{ "shortcut": "shift+tab" }
```

pi reserves `Shift+Tab` while `app.thinking.cycle` uses it and skips the
extension shortcut with a startup warning.

## User questions

`extensions/ask-user/` adds the model-facing `ask_user` tool. It works on its own
in the parent Pi TUI; it does not require plan-mode, subagents, a todo tracker,
or a verification skill. Reference packages supply design ideas, not runtime
imports. Design and evidence: [local question extension plan](docs/plans/2026-10-11-ask-user-extension.md).

The agent should inspect available facts first and ask only a material unresolved
choice, not every implementation detail. Prefer one question; up to four
independent questions can share a form. Respect a user's requested pacing, and
ask dependent questions after the preceding answer.

- `single`: one predefined option **or** a custom alternative.
- `multi`: selected options **plus** optional supplemental custom text.
- `text`: free text. Every question has one separate optional comment.
- Choice questions use 2-8 options with stable values and labels. Recommended
  values are marked, not preselected. Focus is not a committed answer.
- Review permits edits before submission. Incomplete Submit returns
  `needs_discussion` with missing IDs; no fabricated blank answer or implicit
  approval. Discussion is nonfinal even when every draft has an answer.
- Whole-form Cancel stops the current turn, without choosing or asking again.
  Caller abort/shutdown closes the form. There is no default human-response timeout.

Default keyboard paths (selection/input actions follow Pi's bindings):

| Action | Keys |
|---|---|
| Focus / choose or toggle a row | Up/Down; Enter or Space |
| Next/previous question or review | Tab/Shift+Tab or Right/Left outside text editing |
| Scroll long content | PageUp/PageDown |
| Save a text/comment draft | Pi's input-submit key (normally Enter) |
| Insert a newline | Pi's newline key (normally Shift+Enter or Ctrl+J) |
| Back from text/comment editing, preserving draft | Selection-cancel key, except Ctrl+C (normally Esc) |
| Cancel the whole form | Selection-cancel outside editing; Ctrl+C anywhere |

Submitted answers and intentionally sent discussion context reach the model and
remain in the session. Cancelled/aborted unsent drafts are not returned in tool
results. This is not secret input; do not enter credentials. History restore
renders completed outcomes but never reopens an unfinished form.

RPC/print/JSON modes fail explicitly without pending files. Current subagent
children do not load this extension; there is no child-input routing or universal
root-identity security boundary. Existing plan-mode retains an already-active
question tool through generic `readOnlyHint` metadata, without special integration.
If an old saved plan loadout predates the tool, leave/re-enter plan mode to take a
fresh loadout; intentional tool disabling is preserved. Question answers do not
replace executable plan approval. Sequential execution is not an authorization
barrier: never batch answer-dependent changes with a question.

After changes, `/reload` refreshes the local resource. To disable it, use ordinary
Pi resource/tool selection. No new runtime dependency or migration is required.

## Subagents

`extensions/subagent` adds a `subagent` tool that delegates bounded, read-only
work to child agents. Each child is an in-process pi session with fresh
context; it sees only its task text, cannot edit files or delegate, and returns
its final answer to the parent. Design and decisions:
[`docs/plans/2026-10-11-subagent-extension.md`](docs/plans/2026-10-11-subagent-extension.md),
with [explorer fallback and four-model review](docs/plans/2026-10-11-subagent-model-fallback.md).

| Role | Use | Tools | Context files | Invoked |
|---|---|---|---|---|
| `explorer` | Map unfamiliar code; report locations with `file:line` | `read`, `grep`, `find`, `ls` | none | By the model on its own judgment (broad exploration) |
| `reviewer` | Independent review of a change, files, plan, or document; P0/P1/P2 findings and a merge verdict | the same plus `review_diff` | the parent's, without the global `~/.pi/agent/AGENTS.md` | Only when you or your instructions ask |

- One child: `subagent({ agent, task, model? })`. Parallel:
  `subagent({ tasks: [...] })`, up to 4.
- `review_diff` shows uncommitted changes against HEAD at reviewer launch.
  For a commit range, plans, or documents, the parent passes file paths.
- Long answers return the first 2,000 characters plus the path of a file with
  the full text, saved next to the parent session (`<session>/subagents/`).
- Esc aborts all running children. The tool stays available in plan mode.
- `/review [target or focus]` uses `subagent({ review: { task: "..." } })` to run
  four distinct configured models on the same complete brief. The parent verifies
  findings and asks before applying fixes. Missing/invalid roster configuration is
  an error, not permission to spawn reviewers on the parent's model.
- Review model-resolution and request failures are isolated per slot. Successful
  reviews remain usable, with explicit `complete` / `partial` / `none` coverage
  and missing-model reasons. Failed slots are never replaced; with no successful
  reviews, no review verdict is available. Esc cancellation remains explicit.

Generic manual children use the parent's model unless a role model is configured.
Optional `<agentDir>/subagent.json` (`PI_CODING_AGENT_DIR`, else `~/.pi/agent`):

```json
{
  "agents": {
    "explorer": {
      "model": "openai/gpt-6-luna:high",
      "fallbackModels": ["anthropic/claude-haiku-5-5:high"]
    }
  },
  "review": {
    "models": [
      "anthropic/claude-opus-5-5:high",
      "openai/gpt-6.1-sol:high",
      "xai/grok-4.7:high",
      "zai/glm-5.3:high"
    ]
  }
}
```

The selected configuration is also in
[`extensions/subagent/subagent.example.json`](extensions/subagent/subagent.example.json).
It is not automatically installed; existing user settings are not changed.
An invalid configuration blocks launches until fixed. The roster must contain four
models; duplicate resolved provider/model identities are rejected even if their
thinking levels differ. Generic manual reviewer calls still accept a single role
model and do not automatically expand the roster.

Explorer-only `fallbackModels` is an ordered list of at most eight alternatives.
After host-managed retries, terminal model request/authentication failures or
unresolvable candidates advance to the next model with a fresh session and the
original task. Successful answers do not trigger quality escalation. Local setup,
tool/task, context-limit, and empty-answer failures do not switch models;
output-save failures preserve the answer with a warning. A per-call `model` is
**strict**, overriding role selection and disabling fallback. Missing/empty
fallback lists preserve the original single-model behavior.

Progress/results show actual models and transition reasons; result details include
bounded attempt records and combined usage/tool counts, so failed-attempt expense
is not hidden. Pi's resolved model metadata supplies context/output limits and
pricing; no separate subagent context-window configuration is needed.

## Adding resources

- **Extensions**: put small features in `extensions/<name>.ts`; for features that need multiple files, use `extensions/<name>/index.ts` as the entry point. Local TypeScript extensions load without a separate compile step.
- **Skills**: create `skills/<name>/SKILL.md` with `name` and `description` in the frontmatter. Keep supporting files in the skill's `scripts/`, `references/`, or `assets/` directories.
- **Prompts**: create `prompts/<name>.md` to expose a `/<name>` command. Place Markdown files directly under `prompts/` for default auto-discovery.
- **Themes**: write JSON matching Pi's theme schema to `themes/<name>.json`. Theme names must be unique.
- **Shared code**: add a root-level `lib/` when needed. Avoid placing shared utilities directly under `extensions/`, where they would be discovered as extension entry points.

## Tests

Use Node.js 22.18 or newer with native TypeScript loading enabled.

```bash
npm test                  # Handler unit tests; no host package required
npm run test:integration   # Validate against an installed Pi prompt builder
```

Integration tests locate the pi package with `tests/pi-package.mjs`:
`PI_PACKAGE_DIR`, then a managed installation
(`~/.pi/agent/install/current-version`), then the `pi` on `PATH` (following
symlinks and `exec` wrappers, e.g. a local fork install). To test a specific
version, set the root explicitly:

```bash
PI_PACKAGE_DIR=/absolute/path/to/pi-coding-agent npm run test:integration
```

Both test suites run without network requests or credential access. The
fallbacks test the currently installed release, not necessarily the version of
an already-running session.

## Dependencies and security

- External runtime packages used by extensions are declared in `dependencies`; installing dependencies for this local package is managed manually.
- Host packages provided by Pi, such as `@earendil-works/pi-coding-agent`, are declared in `peerDependencies` with a `"*"` range and are never bundled.
- `private: true` prevents accidental publishing to npm.
- Never store sensitive data in this repository: API keys, auth files, session transcripts, and similar.
