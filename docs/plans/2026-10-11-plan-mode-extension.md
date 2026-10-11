---
title: Plan mode extension
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
  - docs/research/2026-10-11-opencode-plan-mode-history.md
  - docs/research/2026-10-11-pi-plan-mode-example.md
  - docs/research/2026-10-11-kimi-code-plan-mode.md
  - docs/research/2026-10-11-gemini-cli-plan-mode.md
  - docs/research/2026-10-11-codex-cli-plan-mode.md
  - docs/research/2026-10-11-mistral-vibe-plan-mode.md
  - docs/spikes/2026-10-11-extension-shift-tab-shortcut.md
  - docs/spikes/2026-10-11-plan-dir-write-guard.md
  - docs/spikes/2026-10-11-plan-approval-flow.md
---

# Plan mode extension

## Goal

Add an OpenCode-style **plan ↔ build** mode to pi as a pi-personal
extension. In plan mode the agent explores and writes a plan without
changing the project; when the plan is ready it asks for approval and hands
off to build mode, optionally in a fresh context. The extension uses only
public extension APIs of pi 1.1.0; no fork changes.

## Non-goals

- Subagent restrictions (no subagent extension in use; reminder text only).
- Hard bash restrictions (bash stays allowed; see Design §3).
- Plan execution tracking (`Plan:` parsing, `[DONE:n]` widget).
- Per-mode model switching (thinking level only).
- Approach options at approval time, user-edit detection of the plan file,
  project plan templates.
- Promoting working plans into `docs/plans/` (manual, if ever).

## Design

### 1. Decisions

| # | Topic | Decision | Basis |
|---|---|---|---|
| Q1 | Modes | Two modes, `plan` and `build` (build = unrestricted pi) | OpenCode, Kimi |
| Q2 | edit/write | Visible in plan; allowed only for the current plan file (realpath check) | OpenCode, Kimi; write-guard spike |
| Q3 | bash | Allowed; restrained by reminder ("no mutating actions; tests/builds that only write caches are fine") | OpenCode V2, Codex |
| Q4 | Subagents | Out of scope; reminder says not to delegate edits | — |
| Q5 | Other tools | Plan-mode allowlist: built-in read tools, bash, edit, write, plan tools, tools with `annotations.readOnlyHint === true`, plus configured extras | Gemini (readOnlyHint), pi `ToolAnnotations` |
| Q6 | Plan file | `~/.pi/plans/<YYYYMMDD-HHmmss>-<slug>.md` (slug: D1), directory configurable | OpenCode, Vibe |
| Q7 | Model tools | `enter_plan_mode` and `exit_plan_mode` | Kimi, Gemini |
| Q8 | Approval | Approve and implement here → build here; Approve and implement in a fresh session → new session; Give feedback / Keep planning → stay | Codex, Vibe; approval-flow spike |
| Q9 | Execution tracking | None | — |
| Q10 | Reminders | At most one persisted transition note per prompt via `before_agent_start`, only when the delivered state differs; plan-tool results also record delivery; short reminder per request via `context` (not persisted) | Approval-flow and custom-message follow-up spikes |
| Q11 | Model entry | `enter_plan_mode` always asks the user | Gemini |
| Q12 | Toggle | `/plan`, `/plan on\|off`, `Ctrl+Alt+P`, `--plan`; Shift+Tab documented as opt-in | Shift+Tab spike |
| Q13 | Per-mode settings | Plan thinking level (configurable), restored on leaving | Codex, Gemini |
| Q14 | Resume | Restore mode, plan file, saved pre-plan tools/thinking and delivered state from the branch; reapply the tool set; current thinking is persisted by the host | pi example; implemented restore logic |
| Q15 | Plan format | Free-form file; reminder gives complexity-scaled structure and "answer inquiries directly" | Gemini |
| D1 | Plan file slug | Two random words (e.g. `brave-otter`) after the timestamp | Simple, collision-free, sortable |
| D2 | Plan thinking level | Default `high`; pi clamps to what the model supports | Planning benefits most from reasoning |
| D3 | Config | Optional `~/.pi/agent/plan-mode.json`; defaults when absent | — |
| D4 | No UI (`pi -p`) | `enter_plan_mode` refuses; `exit_plan_mode` returns the plan and stays in plan mode | Safe default; allows `pi -p --plan` to produce a plan |
| D5 | `/plan path` | Included | Cheap; shows the plan file location |

### 2. Layout

```text
extensions/plan-mode/
├── index.ts        # Wiring: state, commands, shortcut, flag, hooks
├── state.ts        # Mode state, persistence (appendEntry), restore
├── tools.ts        # Tool allowlist computation, enter/exit tools
├── paths.ts        # Path resolution mirroring host resolveToCwd + realpath guard
├── prompts.ts      # Full transition note, short reminder, leave note, tool texts
├── delivery.ts     # Delivered state, next-note selection, branch restoration
└── config.ts       # Load optional config
tests/
├── plan-mode.test.mjs              # Unit: paths, allowlist, state transitions
└── plan-mode.integration.test.mjs  # Host: resolver parity, faux-provider flows
```

Sibling files under `extensions/plan-mode/` are not entry points; only
`index.ts` is discovered.

### 3. Behavior

**State** (`plan-mode` custom entry, written on every change):

```ts
{ mode: "plan" | "build", planFile?: string, toolsBefore?: string[],
  thinkingBefore?: ThinkingLevel, approvedPlanFile?: string }
```

**Entering plan** (command, shortcut, flag, or `enter_plan_mode` after
confirmation):

1. Create the plans directory and assign a new file path (the file itself is
   not created; the model writes it).
2. Save active tools and thinking level; set the plan-mode tool set
   (`setActiveTools`) and plan thinking level (`setThinkingLevel`).
3. For command/shortcut/flag entry, deliver a hidden full transition note on
   the next prompt through `before_agent_start`, only if the model has not
   already been told about the current plan state. The `enter_plan_mode` tool
   instead communicates the rules and file path in its result and records
   `details.planModeDelivered`, so no duplicate enter note is needed.
4. Footer status `⏸ plan`.

**In plan mode**:

- `tool_call` on `edit`/`write`: resolve `input.path` like the host
  (`@` prefix, `~`, Unicode spaces, cwd), then realpath of the nearest
  existing ancestor; block unless it equals the plan file, with a reason
  naming the plan file and `exit_plan_mode`.
- `context`: append a short reminder user message to every request
  (mode, plan file path, "no mutating actions", "end with a question or
  `exit_plan_mode`").
- `exit_plan_mode` visible; `enter_plan_mode` hidden.

**Leaving plan** (command, shortcut, or approval):

1. Restore saved tools and thinking level.
2. For manual exit, deliver a leave note on the next prompt only if the model
   was previously told it was planning. Approval tool results communicate build
   mode directly and record delivery; same-session approval returns the plan
   content, while fresh-session approval seeds a new session with the plan.
3. Clear status; keep `approvedPlanFile` when approved.

**`enter_plan_mode`** (build mode only): `ui.confirm("Switch to plan
mode?")`. Yes → enter plan and return the plan file path and workflow.
No → "User declined plan mode; continue in build mode." No UI → refuse
with a message to ask the user to run `/plan`.

**`exit_plan_mode`** (plan mode only): read the plan file; empty or
missing → error "Write your plan to <path> first". Then `ui.select`:

| Choice | Effect | Tool result |
|---|---|---|
| Approve and implement here | Leave plan, same session | "Plan approved. Build mode active. Implement the plan at <path>:" + content |
| Approve and implement in a fresh session | Record choice, `terminate: true`; block remaining old-session calls; on `agent_end` self-dispatch `/plan implement-fresh` → `newSession` seeded with build state and the plan | "Plan approved; continuing in a fresh session." |
| Give feedback | `ui.editor` for text; stay in plan | Nonempty feedback asks for revision; empty feedback dismisses with `terminate: true` |
| Keep planning / dismiss | Stay in plan; `terminate: true` ends the turn | "Approval dismissed; still in plan mode." |

No UI → return the plan content and stay in plan mode.

**Commands**: `/plan` toggle; `/plan on|off`; `/plan implement-fresh`
(also used internally); `/plan path` prints the current/approved plan file.

**Config** (optional `~/.pi/agent/plan-mode.json`):

```json
{ "plansDir": "~/.pi/plans", "thinkingLevel": "high", "extraTools": [], "shortcut": "ctrl+alt+p" }
```

### 4. pi API mapping

| Need | API |
|---|---|
| Tool set per mode | `pi.getActiveTools`, `pi.setActiveTools`, `pi.getAllTools` (`annotations`) |
| Write guard | `pi.on("tool_call")` → `{ block, reason }` |
| Per-request reminder | `pi.on("context")` (not persisted) |
| Transition notes | `before_agent_start` returns a hidden message with `details.planModeDelivered`; tool results record delivery directly |
| Model tools | `pi.registerTool` with `executionMode: "sequential"` and `ctx.ui.confirm` / `select` / `editor` |
| Stop after approval | tool result `terminate: true` |
| Fresh session | `agent_end` → `pi.sendUserMessage("/plan implement-fresh", { expandPromptTemplates: true })` → `ctx.newSession({ parentSession, setup, withSession })` |
| Thinking level | `pi.getThinkingLevel`, `pi.setThinkingLevel` |
| Toggle | `pi.registerCommand`, `pi.registerShortcut(config.shortcut)`, `pi.registerFlag("plan")` |
| Persistence | `pi.appendEntry("plan-mode", state)`; `session_start` / `session_tree` restore state and delivery from `ctx.sessionManager.getBranch()` |
| Status | `ctx.ui.setStatus` |

### 5. Prompt content (outline)

Full transition note: you are in plan mode; do not modify the project or
system; read-only tools and non-mutating commands are fine (tests or builds
that only write caches/artifacts are allowed; formatters, codegen, commits,
installs are not); do not delegate edits; the only writable file is the
plan file; answer inquiries directly without a plan; for directives,
explore → clarify (ask the user when trade-offs matter) → write the plan →
`exit_plan_mode`; scale the plan (simple: changes + verification;
standard: objective, key files, steps, testing; complex: background,
scope, solution, alternatives, phases, verification, rollback). Short
reminder: two or three lines restating the rules and plan file path. All
text in English.

## Phases

### Phase 1: Mode core

- Changes: `state.ts`, `paths.ts`, `config.ts`, `tools.ts` (allowlist
  only), `index.ts` with `/plan`, `/plan on|off`, `/plan path`,
  `Ctrl+Alt+P`, `--plan`, status, tool set switching, write guard,
  persistence/restore.
- Verify (automated): unit tests for path resolution (incl. `@`, `~`,
  `..`, Unicode spaces, symlink escape), allowlist computation, state
  round-trip; integration test comparing the resolver with the installed
  host `resolveToCwd`.
- Verify (manual): `/reload`; toggle with `/plan` and `Ctrl+Alt+P`; edits
  outside the plan file are blocked; plan file write succeeds; resume
  restores mode.

### Phase 2: Reminders and thinking level

- Changes: `prompts.ts`, `delivery.ts`; deferred transition/leave notes via
  `before_agent_start`; `context` short reminder; plan thinking level save/restore.
- Verify (automated): faux-provider integration test asserting the model
  sees the short reminder only in plan mode and the transition notes are
  persisted once.
- Verify (manual): ask a question in plan mode (answered without a plan);
  ask for a change (plan written to the file).

### Phase 3: Plan tools and approval

- Changes: `enter_plan_mode`, `exit_plan_mode`, `/plan implement-fresh`,
  `agent_end` dispatch, no-UI behavior.
- Verify (automated): faux-provider tests for each approval choice,
  including fresh-session seeding and `terminate`.
- Verify (manual): full loop in the TUI: model enters plan with
  confirmation, writes plan, approval dialog, both implement paths.

### Phase 4: Docs and wiring

- Changes: README section (usage, config, Shift+Tab opt-in via
  `~/.pi/agent/keybindings.json` moving `app.thinking.cycle`);
  `package.json` test scripts.
- Verify (automated): `npm test`, `npm run test:integration`.
- Verify (manual): fresh install path via `/reload`.

## Risks and open questions

- The approval-flow spike found a batch-level `terminate` caveat. The
  implemented plan tools use sequential execution, and pending fresh-session
  approval blocks later old-session tool calls. Automated tests cover that guard
  and fresh handoff; arbitrary interactions with other extensions are not proven.
- `setActiveTools` during `enter_plan_mode` execution originally needed
  confirmation; this document does not claim coverage of every same-batch case.
- Immediate idle `sendMessage` delivery before the first prompt displaced the
  system prompt in later requests. The implemented deferred delivery avoids
  that path; integration tests check a leading system message on every call.
  See [the message-order follow-up](../spikes/2026-10-11-custom-message-before-first-prompt.md).
- `readOnlyHint` is author-provided and unverified.
- Bash can still mutate files; this is an accepted trade-off (Q3).
- The resolver mirrors a non-exported host function; the parity test
  guards against drift on pi upgrades. Keybindings changed after v1.1.0.
- The approval-flow spike used a fake UI; later TUI verification exercised
  interactive approval. The spike's original limitation is not a claim that
  the completed extension was never checked interactively.
- Config lives in a standalone JSON file (D3); revisit if pi offers
  extension settings.

## Amendments

### 2026-10-11 — Align the design with verified delivery and approval behavior
- Change: Updated transition delivery, branch restoration, approval choices,
  fresh-session guards, layout, configuration, and API descriptions to match
  the implementation; qualified resolved experimental limitations.
- Reason: The initial plan retained immediate-message delivery and API/UI
  descriptions that changed during implementation.
- Impact: Readers should use deferred notes or tool results, not idle
  `sendMessage` delivery. Original goals, phases, and historical observations
  remain intact; this is not an implementation progress ledger.
- Evidence: `extensions/plan-mode/{index,delivery,state,tools}.ts`,
  `tests/plan-mode{,.integration}.test.mjs`, and
  [the message-order experiment](../spikes/2026-10-11-custom-message-before-first-prompt.md).
