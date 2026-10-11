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
| `prompt-suggestions/` | Extension | Optional next-user prompt as ghost text; Tab accepts without submitting (see [Next-prompt suggestions](#next-prompt-suggestions)) |
| `turn-summary/` | Extension | Three-line Done/Open/Next summary above the editor after each turn (see [Turn summaries](#turn-summaries)) |
| `pi-perf-log/` | Extension | Per-turn timing (connect, TTFT, provider, tool span, overhead), TUI render frames, and process memory to `<agentDir>/perf/<sessionId>.jsonl`; no conversation content; `pi-perf-log.json` to disable ([schema](extensions/pi-perf-log/SCHEMA.md)) |
| `review` | Prompt | `/review [target or focus]`: parallel reviewer subagents, verified and summarized; asks before fixing |
| `explain-with-visuals` | Skill | Editorial visual explanations: offline HTML, layered prose, local browser QA and delivery |
| `perf-audit` | Skill | Audit and fix pi performance without a reference fork: measure first, fix only superlinear or unbounded paths, prove with count-based tests |
| `pi-docs` | Skill | Map of pi's documentation |
| `pi-web` | Skill | One web entry point: ego for generic browser work; Aside for service integrations, delegation, and designated existing state |
| `tui-check` | Skill | Verify pi changes in the real pi TUI with agent-tty and a scripted faux model; requires agent-tty 0.5.x |
| `pi-session-find` | Skill | List, search, and inspect local pi sessions (read-only, stdout only) |
| `pi-session-stats` | Skill | Cost, model/tool timing, and workload sizes from local pi sessions (read-only) |

The local Pi fork provides skill-based documentation guidance in its core.
The former `claude.ts` extension was retired; see
[`docs/adr/0001-move-docs-guidance-into-pi-fork.md`](docs/adr/0001-move-docs-guidance-into-pi-fork.md).

## Visual explanations

`explain-with-visuals` combines a concise answer, meaningful figures, mechanism
explanation, and conditions/evidence. It supports relationships, workflows,
comparisons, and simple data, with optional step highlighting or comparison
controls. It uses an editorial light/dark design system with Korean-readable
system fonts, not a dashboard/card template.

```text
/skill:explain-with-visuals Explain this request flow and its exception paths.
/skill:explain-with-visuals Compare these two designs using the same criteria.
/skill:explain-with-visuals Explain this concept in Korean with a step-by-step figure.
```

The model may also select it when a visual materially aids an authorized
explanation; ordinary tables and short answers remain in chat. Loading a skill
does not authorize writes during read-only investigation or active plan mode.

Generated single-file HTML uses no CDN or automatic network requests and lives
under `artifacts/visuals/` in the task workspace. The default is to verify and
show the final page, then return its path, takeaway, and verification limits.
Automated local visual QA uses installed ego-browser and current vendor
instructions; generation does not require another local feature. If browser QA
is unavailable, the file can still be delivered with explicitly missing checks.
No automatic installs, additional model calls, uploads, or global changes.
Complex simulations, maps, and slide decks are outside the initial scope.

After changes use `/reload` for discovery. Design, narrative, and evidence:
[editorial visual explanation plan](docs/plans/2026-10-11-explain-with-visuals-skill.md).

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
with [explorer fallback](docs/plans/2026-10-11-subagent-model-fallback.md)
and the [two-model review workflow](docs/plans/2026-10-11-two-model-review.md).

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
  the distinct configured models on the same complete brief (Opus + Sol recommended).
  The parent verifies findings and asks before applying fixes. Missing/invalid roster configuration is
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
      "openai/gpt-6.1-sol:high"
    ]
  }
}
```

The recommended two-model configuration is also in
[`extensions/subagent/subagent.example.json`](extensions/subagent/subagent.example.json).
It is not automatically installed; existing user settings are not changed.
An invalid configuration blocks launches until fixed. The roster must contain 2–4
models; duplicate resolved provider/model identities are rejected even if their
thinking levels differ. Existing three/four-entry lists run all configured models;
there is no automatic truncation or optional-reviewer expansion. To switch an
existing user configuration to two reviewers, explicitly replace only its
`review.models` list after authorization, preserving unrelated settings. Generic
manual reviewer calls still accept a single role model and do not automatically
expand the roster.

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

## Next-prompt suggestions

`extensions/prompt-suggestions/` independently proposes one next-user prompt after
Pi fully settles a successful text response. It does not continue the agent,
change documents, or require subagents, summaries, plan-mode, or a todo tracker.
Design: [next-prompt plan](docs/plans/2026-10-12-next-prompt-suggestions.md).

- In an empty idle editor, the optional suggestion appears as muted ghost text.
- **Tab accepts into editable input; it does not submit.** Edit it, then use your
  normal submit action (usually Enter). Enter before acceptance never sends the
  ghost suggestion.
- Typing, paste, history navigation, Escape, a new run, session/branch/model
  change, compaction, or a blocking dialog discards the candidate and pending
  work. Clearing your text does not revive an old candidate.
- Normal slash/path completion and application controls remain available.
  Registered extension shortcuts keep priority over ghost acceptance, and the
  acceptance/submit hint uses active keybindings. Suggestions do not complete
  partially typed input in this initial version.
- Errors, aborts, incomplete output, queued work and non-TUI modes do not generate
  suggestions. No suggestion is a valid result, especially for finished tasks,
  explicit stops or unanswered user choices.
- Another custom editor is not overwritten: the feature reports a conflict and
  skips inference. On/off does not repeatedly replace the editor.

After a user-initiated `/reload` or a new session, automatic TUI suggestions are
**enabled by default**. The default model chain is `openai/gpt-6-luna` followed by
`anthropic/claude-haiku-5-5` only for unavailable auth/model or provider/timeout
failures. There is no fallback to the parent model or an unrelated provider.
Malformed output is rejected, not retried until something appears.

```text
/prompt-suggestions              # Status, attempted models, latency and usage
/prompt-suggestions off          # Disable for this session and cancel pending work
/prompt-suggestions on           # Enable for future completed turns
/prompt-suggestions model anthropic/claude-haiku-5-5  # Strict session model
```

These commands do not write settings or change the main agent's model. Optional
persistent config is read from `<agentDir>/prompt-suggestions.json` (agent dir
respects `PI_CODING_AGENT_DIR`), then trusted project `.pi/prompt-suggestions.json`.
No configuration file is created automatically. Unknown/invalid fields disable
inference with an error. Example:

```json
{
  "enabled": true,
  "models": ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5"],
  "timeoutMs": 30000,
  "maxTokens": 1024,
  "maxChars": 240,
  "maxContextChars": 12000,
  "maxMessages": 6
}
```

The total timeout is shared across up to two exact configured models. A single
entry is strict. Bounds: `timeoutMs` 100–60000, `maxTokens` 128–4096, `maxChars`
20–500 Unicode code points, `maxContextChars` 500–24000, `maxMessages` 2–12.

**Data boundary:** each request sends bounded recent active-branch user/assistant
text to the configured provider through Pi's authentication/runtime. Defaults
allow six messages and 12,000 characters, explicitly truncated. Thinking, images,
raw tool arguments/results, system/global instructions, other branches, and
unrelated files are not included. Conversation text already present in a user or
assistant message can contain sensitive material; these bounds are not a secret
redactor. Disable the feature for conversations you do not want sent to the
configured providers. No production transcript/suggestion files or parent-context
entries are written; credentials are never copied. Status usage is this extension's
in-memory provider-reported total, not the native main-agent total; missing usage
is unknown. Error diagnostics do not echo raw provider bodies.

Ghost text is advice, not authorization or proof of completion. Model quality and
latency can vary. See the [verification record](docs/spikes/2026-10-12-next-prompt-suggestions-verification.md)
for tested builds, synthetic live results, and limits. Disable through the session command or ordinary Pi resource selection;
`/reload` refreshes resource discovery. The current user's TUI is never reloaded
by verification scripts.

An explicit synthetic-only live evaluation is available (not part of offline
`npm test`): `node tests/prompt-suggestions-live.mjs --run`. It makes six short
calls per default model and stores synthetic evidence under ignored `artifacts/`.
Run it only when live calls are authorized.

## Turn summaries

`extensions/turn-summary/` independently summarizes each successfully completed
turn in up to three lines above the input editor: **Done** (what the turn did),
**Open** (failed, unfinished, or unverified results), and **Next** (a suggested
next action). It is display only: it does not continue the agent, change files,
or store summaries. It does not require `prompt-suggestions`; both can be loaded
together. Design: [turn summary plan](docs/plans/2026-10-12-turn-summary.md).

- The summary appears after Pi fully settles a normal text response. Errors,
  aborts, incomplete output, queued work, and non-TUI modes produce none.
- It stays visible while you type the next prompt, and is removed when a new
  prompt is submitted, a new run starts, or the session, branch, or compaction
  changes. A late result for an older turn is discarded.
- A trivial exchange can legitimately produce no summary. `Open` and `Next` lines
  are omitted when empty. Labels are fixed English; values follow the user's
  language.
- The footer shows `summarizing…` while pending and `summary failed` on failure.
  An identical repeated failure warns once.

After `/reload` or a new session, summaries are **enabled by default** with
`openai/gpt-6-luna`, falling back to `anthropic/claude-haiku-5-5` only for an
unavailable model/auth or a provider/timeout failure. Malformed output is
rejected without retry.

```text
/turn-summary              # Current summary, status, attempted models, latency, usage
/turn-summary off          # Disable for this session; removes the widget
/turn-summary on           # Enable for future completed turns
/turn-summary model anthropic/claude-haiku-5-5  # Strict session model
```

Commands are session-only. Optional config: `<agentDir>/turn-summary.json`, then
trusted project `.pi/turn-summary.json`. No file is created automatically.
Unknown/invalid fields disable summaries with an error.

```json
{
  "enabled": true,
  "models": ["openai/gpt-6-luna", "anthropic/claude-haiku-5-5"],
  "timeoutMs": 30000,
  "maxTokens": 1024,
  "maxContextChars": 12000,
  "maxLineChars": 120,
  "maxToolTrace": 40
}
```

Bounds: `timeoutMs` 100–60000 (shared across up to two models), `maxTokens`
128–4096, `maxContextChars` 1000–24000, `maxLineChars` 40–300 Unicode code
points, `maxToolTrace` 0–100.

**Data boundary:** each request sends, from the active branch only: the first
user message (session goal), the latest request (including steering messages sent
during that run) and final answer, up to two earlier messages, the previous summary (only if produced on an ancestor of the
current leaf, marked unverified), and this turn's **tool trace**: tool name,
success or error, and the `path` argument when present. Other tool arguments,
commands, and tool results are not sent, nor are thinking, images, system or
global instructions, other branches, or files. The whole serialized request
context, including the tool trace and previous summary, is capped (default 12,000
characters; failed tool calls are kept longest) but not secret-redacted; disable summaries for conversations you do
not want sent to the configured providers. Nothing is written to disk or to the
parent context. Status usage is this extension's in-memory, provider-reported
total, not the main agent's native total.

Summaries are advice and can be wrong; the main risk is overstating completion.
See the [verification record](docs/spikes/2026-10-12-turn-summary-verification.md)
for tested behavior and synthetic live results. A synthetic-only live evaluation
is available outside `npm test`: `node tests/turn-summary-live.mjs --run`; run it
only when live calls are authorized.

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
