---
title: Codex CLI plan mode
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: codex (openai/codex, Codex CLI)
    path: .references/codex
    version: 0.0.0-dev (unversioned dev checkout)
    commit: 806d9732c9
---

# Codex CLI plan mode

## Scope

Implementation-level analysis of Plan mode in OpenAI's Codex CLI, at the
same depth as the OpenCode analysis. Codex is the reference for a
**prompt-driven** plan mode with no tool or sandbox changes. Paths are
relative to `.references/codex/codex-rs/`.

## Summary

- Plan is one of two TUI-visible **collaboration modes** (`Default`,
  `Plan`). A mode is a preset mask: name, mode kind, optional model,
  **reasoning effort** (Plan: `Medium`), and **developer instructions**.
- **No tool, permission, or sandbox change.** The only hard restrictions
  are: `update_plan` (the TODO tool) errors in Plan mode, and automatic
  (non-user) turns cannot run in or leave Plan mode. File edits and shell
  commands are governed by the normal sandbox/approval settings; the
  instructions forbid "mutating" actions but explicitly allow tests and
  builds that only write caches or build artifacts.
- Mode instructions are a **developer message** wrapped in
  `<collaboration_mode>` tags, emitted only **when the mode changes**
  (world-state diff). The Default instructions say "Any previous
  instructions for other modes (e.g. Plan mode) are no longer active",
  acting as the leave reminder.
- The Plan instructions define a conversational process: ground in the
  environment first, then intent chat, then implementation chat; ask via
  `request_user_input` (multiple choice, blocking in Plan mode); finish with
  a **decision-complete** plan in a `<proposed_plan>` block.
- The client parses `<proposed_plan>` from the stream into a plan item.
  After a turn with a plan, the TUI asks **"Implement this plan?"**: switch
  to Default and send "Implement the plan.", or **clear context** and start
  a fresh thread seeded with the plan, or stay in Plan mode.
- There is no plan file; the plan is the `<proposed_plan>` text.
- Toggle: `Shift+Tab` cycles modes, `/plan` switches to Plan. Plan mode has
  its own reasoning-effort override (`plan_mode_reasoning_effort`).

## Questions

1. How is Plan mode represented and toggled?
2. What is enforced?
3. How are instructions delivered?
4. Is there a plan artifact?
5. How does plan → implementation work?
6. Subagents, models, and automation?
7. Limitations?

## Findings

### 1. Representation and toggling

- `ModeKind` has `Plan` and `Default` as TUI-visible modes
  (`protocol/src/config_types.rs:674-701`).
- Built-in presets: Plan with `reasoning_effort: Medium` and the bundled
  plan instructions; Default with default instructions
  (`models-manager/src/collaboration_mode_presets.rs:6-24`). Instructions
  are templates in
  `collaboration-mode-templates/templates/{plan,default}.md`; a model
  catalog may override them.
- TUI: `Shift+Tab` (`BackTab`) cycles presets when no task is running and no
  popup is open (`tui/src/chatwidget/interaction.rs:243-255`,
  `tui/src/chatwidget/settings.rs:704-714`,
  `tui/src/collaboration_modes.rs:44-60`); `/plan` "switch to Plan mode"
  (`tui/src/slash_command.rs:137`).
- Plan reasoning effort is separate from the global effort: config/profile
  key `plan_mode_reasoning_effort`, applied when submitting in Plan mode
  (`config/src/config_toml.rs:399`, `tui/src/chatwidget/settings.rs:185-221`,
  `tui/src/chatwidget/input_flow.rs:388-392`).

### 2. Enforcement

What changes in Plan mode at runtime (all `ModeKind::Plan` checks in
`core/`):

| Location | Effect |
|---|---|
| `core/src/tools/handlers/plan.rs:87-91` | `update_plan` returns "update_plan is a TODO/checklist tool and is not allowed in Plan mode" |
| `core/src/tools/handlers/request_user_input.rs:73-86` | `request_user_input` is available and **blocking** in Plan; unavailable in Default unless enabled (`request_user_input_spec.rs:91`) |
| `core/src/session/turn_input.rs:70-85` | Automatic turns may not run in, enter, or leave Plan mode |
| `core/src/session/turn.rs:2604-2606` | Stream parser runs in plan mode to extract `<proposed_plan>` |
| `core/src/stream_events_utils.rs:122-130` | Mailbox delivery deferral considers plan mode |
| `ext/goal/src/accounting.rs:108` | Goal accounting excludes Plan mode |

No tool is removed and no sandbox or approval policy changes with the mode
(no other `ModeKind::Plan` checks in core; inferred from the search).
Write prevention is entirely instruction-based:

- Allowed: reading/searching, static analysis, dry runs, and "tests,
  builds, or checks that may write to caches or build artifacts (for
  example, `target/`, `.cache/`, or snapshots) so long as they do not edit
  repo-tracked files".
- Not allowed: editing/writing files, formatters that rewrite files,
  patches/migrations/codegen, side-effectful commands that carry out the
  plan. "When in doubt: if the action would reasonably be described as
  'doing the work' rather than 'planning the work,' do not do it."
  (`collaboration-mode-templates/templates/plan.md:17-39`)

### 3. Instructions

**Delivery.** `CollaborationModeState` is a world-state section. It picks
the catalog override or the mode's developer instructions, strips
`update_plan` guidance when that tool is disabled, and hashes the result.
`render_diff` emits a new `developer` fragment wrapped in
`COLLABORATION_MODE_OPEN_TAG`/`CLOSE_TAG` only when the snapshot (mode,
model, instruction hash) changes
(`core/src/context/world_state/collaboration_mode.rs:18-170`). Retained
fragments are recognized for history handling.

**Plan template** (`templates/plan.md`, 128 lines), sections:

- Mode rules: Plan mode lasts until a developer message ends it; user
  intent or imperative language does not change it; execution requests
  become "plan the execution" (`:5-9`).
- Plan Mode vs `update_plan` (`:11-15`).
- Execution vs mutation (`:17-39`).
- Phase 1 ground in the environment: explore before asking; at least one
  targeted exploration pass before questions (`:41-49`).
- Phase 2 intent chat; Phase 3 implementation chat until "decision
  complete" (`:51-58`).
- Asking questions via `request_user_input`, meaningful multiple choice,
  discoverable facts vs preferences, recommended defaults recorded as
  assumptions (`:60-90`).
- Finalization: exactly-formatted `<proposed_plan>` block, compact plan
  (Summary, Key Changes, Test Plan, Assumptions), at most one per turn,
  revisions must be complete replacements, never ask "should I proceed?"
  (`:92-128`).

**Default template** (`templates/default.md`): "You are now in Default mode.
Any previous instructions for other modes (e.g. Plan mode) are no longer
active." plus `request_user_input` usage rules.

### 4. Plan artifact

No file. The plan is the latest `<proposed_plan>` block. `PlanModeStreamState`
defers agent-message items and tracks a `ProposedPlanItemState` while
streaming (`core/src/session/turn.rs:1889-1900`); the TUI records
`latest_proposed_plan_markdown` and `saw_plan_item_this_turn`.

### 5. Handoff

`maybe_prompt_plan_implementation` opens the prompt after a Plan-mode turn
that produced a plan item, when no follow-ups are queued and no popup is
open (`tui/src/chatwidget/turn_runtime.rs:226-265`). Options
(`tui/src/chatwidget/plan_implementation.rs:9-120`):

| Option | Action |
|---|---|
| Yes, implement this plan | Submit "Implement the plan." with the Default mode mask (mode switch + message) |
| Yes, clear context and implement | Clear UI/context and submit "A previous agent produced the plan below… Implement the plan in a fresh context. Treat the plan as the source of user intent, re-read files as needed, and carry the work through implementation and verification." + plan markdown; shows current context usage |
| No, stay in Plan mode | Dismiss |

Users can also switch modes manually at any time; the next turn receives the
Default developer instructions.

### 6. Subagents, models, automation

- Model/effort: Plan mask may set a model and sets effort; users can
  override plan effort separately.
- Automatic turns (e.g. goal continuations) are excluded from Plan mode.
- Subagents: no Plan-specific handling found (not investigated further).

### 7. Limitations

- No hard guarantee against edits; relies on sandbox/approval policy and
  instructions. With a permissive sandbox, a misbehaving model could edit
  files in Plan mode.
- No persistent plan file; "clear context and implement" copies the plan
  text into the new thread instead.
- Mode changes only take effect between turns (Shift+Tab disabled while a
  task runs).

### Comparison with OpenCode

| Aspect | OpenCode V2 | Codex CLI |
|---|---|---|
| Model | Separate primary agent | Collaboration mode preset |
| Guard | Edit permission deny | None (instructions + normal sandbox) |
| Shell | allow | allow, tests/builds explicitly OK |
| Prompt | Enter/leave reminders (user role) | Developer message on mode change |
| Plan artifact | Optional file | `<proposed_plan>` block |
| Handoff | Manual switch | "Implement this plan?" with fresh-context option |
| Per-mode settings | Model, prompt, permissions per agent | Reasoning effort (and model) per mode |
| Questions | `question` tool | `request_user_input`, blocking in Plan |

## Open questions

- How are subagents spawned from Plan mode configured (mode inheritance)?
- How is `<proposed_plan>` rendered and persisted in history/resume?
- Does the app server expose plan approval to IDE clients differently?

## References

- `collaboration-mode-templates/templates/{plan,default}.md`
- `models-manager/src/collaboration_mode_presets.rs`
- `protocol/src/config_types.rs`
- `core/src/context/world_state/collaboration_mode.rs`
- `core/src/session/{turn,turn_input}.rs`, `core/src/stream_events_utils.rs`
- `core/src/tools/handlers/{plan,request_user_input,request_user_input_spec}.rs`
- `tui/src/collaboration_modes.rs`, `tui/src/slash_command.rs`,
  `tui/src/chatwidget/{interaction,settings,input_flow,turn_runtime,plan_implementation}.rs`
- `config/src/{config_toml,profile_toml}.rs`
