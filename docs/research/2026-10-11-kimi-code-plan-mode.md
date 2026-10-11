---
title: Kimi Code plan mode
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: kimi-code
    path: .references/kimi-code
    version: 0.1.1 (agent-core-v2 0.4.3)
    commit: c9f01f073
---

# Kimi Code plan mode

## Scope

Implementation-level analysis of plan mode in Kimi Code (Moonshot), at the
same depth as the OpenCode analysis, to inform a pi plan-mode extension.
Kimi Code is relevant because it follows Claude Code's design
(`EnterPlanMode`/`ExitPlanMode`, plan file, approval review) in open source
and its TUI is a fork of pi-tui (`packages/pi-tui`). Paths are relative to
`.references/kimi-code/`; `core/` means `packages/agent-core-v2/src/`.

## Summary

- Plan mode is a **per-agent state flag** (`planKey: { active, id }`), not
  a separate agent. The same agent, tools, and system prompt stay in place.
- Enforcement is a **before-tool-execute guard**: `Write`/`Edit` are allowed
  only when every file access targets the current plan file; `TaskStop`,
  `CronCreate`, `CronDelete` are vetoed. **Bash, subagents, MCP, and web
  are not restricted by plan mode**; they follow the normal permission mode
  (`manual`/`yolo`/`auto`).
- The **plan file** is per session and per agent:
  `<sessionDir>/agents/<agentId>/plans/<hero-slug>.md`, created lazily.
- Entry: user (`/plan`, `Shift+Tab`, config `defaultPlanMode`) or **model**
  via `EnterPlanMode` (auto-approved, no prompt).
- Exit: the model calls `ExitPlanMode` (no arguments except optional
  `options`). The tool reads the plan file, shows a **plan review** dialog
  (Approve, Reject, Reject and Exit, Revise, or one of up to 3 approach
  options), and on approval returns the full plan text to the model as the
  tool result. In `auto` permission mode it exits without asking.
- User toggling off (`/plan off`) **cancels** without review.
- Instructions are `<system-reminder>` user messages injected **before every
  model step** by a reminder service with cadence control: full on entry or
  after a new user message or ≥5 assistant turns, sparse after ≥2, a
  re-entry variant when a plan file already has content, and an exit
  reminder once after leaving.
- Plan revisions are snapshotted to a blob store with sha256 on each
  `ExitPlanMode` review.

## Questions

1. How is plan mode represented and toggled?
2. How is read-only behavior enforced?
3. How are instructions delivered to the model?
4. How does the plan file work?
5. How does plan → execution handoff work?
6. How does it interact with permission modes and subagents?
7. Limitations and edge cases?

## Findings

### 1. State and toggling

**State.** `planKey` is replayable, undoable agent state `{ active, id?,
revisionCount? }`, changed only by durable events `plan_mode.enter`,
`plan_mode.cancel`, `plan_mode.exit`, and `plan.revision`
(`core/features/plan/planOps.ts:10-110`). Undo restores plan state and
re-emits status (`core/features/plan/planService.ts:74-82`).

**Service.** `IAgentPlanService` exposes `enter`, `cancel`, `clear`, `exit`,
`recordRevision`, `status` (`core/features/plan/plan.ts:11-20`). It is an
agent-scoped service registered by `PlanFeature`, which also contributes
the `EnterPlanMode` and `ExitPlanMode` tools
(`core/features/plan/planFeature.ts:12-27`).

- `enter(id = heroSlug, createFile = false)`: throws if already active,
  creates the plan directory, dispatches `PlanModeEnter`; the file itself is
  only created if `createFile` (`planService.ts:160-181`).
- `cancel` / `exit`: dispatch `PlanModeCancel` / `PlanModeExit`; both set
  `active: false` (`planService.ts:183-197`, `planOps.ts:94-107`).
- `clear`: truncates the current plan file (`planService.ts:188-192`).

**User toggles.**

- `Shift+Tab` toggles plan mode in the TUI editor
  (`apps/kimi-code/src/tui/controllers/editor-keyboard.ts:271-287`).
- `/plan` toggles, `/plan on|off`, `/plan clear`
  (`apps/kimi-code/src/tui/commands/registry.ts:177-182`,
  `apps/kimi-code/src/tui/commands/config.ts:85-116`). Turning on shows
  "Plan will be created here: <path>".
- SDK `setPlanMode(enabled)` maps to `enterPlan` / `cancelPlan`
  (`packages/node-sdk/src/sdk-rpc-client-v2.ts:1829-1834`).
- Config `defaultPlanMode` (boolean, default false)
  (`core/features/plan/configSection.ts:5-13`).
- ACP exposes four session modes `default`, `plan`, `auto`, `yolo`, mapped
  to plan toggle + permission mode (`packages/acp-server/src/modes.ts:1-31`).

**Model toggle.** `EnterPlanMode` calls `enter()` with no approval prompt
and returns a workflow message that includes the plan file path
(`core/features/plan/tools/enter-plan-mode/enterPlanModeTool.ts:24-81`).
Its description tells the model to use it proactively for non-trivial work
(new features, multiple approaches, multi-file changes, unclear
requirements) and not for small fixes or pure research
(`enter-plan-mode.md`). Both tools are in the main agent and coder profiles
(`core/session/agentLifecycle/profile/profiles.ts:34-35`, `53-54`).

### 2. Enforcement

`AgentPlanService` registers `onBeforeExecuteTool`
(`planService.ts:86-91`) and `guardToolExecution` (`planService.ts:93-140`):

| Tool | Plan active | Effect |
|---|---|---|
| `ExitPlanMode` | yes, mode ≠ `auto` | wait for plan review approval |
| `Write`, `Edit` | yes | allow only if all write accesses equal the plan file path; otherwise veto with "You may only write to the current plan file: <path>. Call ExitPlanMode…" |
| `TaskStop` | yes | veto ("call ExitPlanMode first") |
| `CronCreate`, `CronDelete` | yes | veto (would mutate work that runs after plan exit) |
| everything else | yes | no plan-specific check |

`writesOnlyPlanFile` uses the tool's declared file accesses
(`execution.accesses`, kind `file`, operation `write`/`readwrite`) and
requires at least one write access and exact path equality
(`planService.ts:259-270`). The tool resolves paths, so the guard compares
canonical paths rather than raw model input (inferred from the contract in
`core/tool/toolContract.ts:81`).

Bash and other tools are governed only by the permission mode. The
reminders say so explicitly: "Use Bash only when needed; Bash follows the
normal permission mode and rules." Display names
(`apps/kimi-code/src/tui/utils/permission-mode.ts:3-13`):

| Mode | Name | Behavior |
|---|---|---|
| `manual` | Always Ask | auto-read only; everything else needs approval |
| `yolo` | Ask When Needed | routine edits/commands run; risky actions, questions, plans ask |
| `auto` | Never Ask | everything runs and is decided automatically |

Tools stay visible in plan mode; nothing is removed from the tool list.

### 3. Reminders

**Mechanism.** The reminder service runs providers before every model step
(`onWillBeginStep`, ordered before full compaction) and appends their
output as a `user` message wrapped in `<system-reminder>…</system-reminder>`
with `origin: { kind: "injection", variant }`
(`core/features/reminder/reminderService.ts:58-73`, `97-162`, `164-200`,
`core/features/reminder/systemReminder.ts:3-15`). Compaction re-arms
injection. Providers receive the positions of earlier injections of the
same variant (`reminderService.ts:76-95`).

**Plan provider** (`core/features/plan/injection/planModeInjection.ts:17-106`):

| Condition | Reminder |
|---|---|
| Plan inactive, was active | exit reminder (once) |
| Plan active, first time, plan file has content | re-entry (read existing plan, replace or update it) |
| Plan active, first time, empty file | full |
| Active; a user message since last injection, or ≥5 assistant turns | full |
| Active; ≥2 assistant turns since last injection | sparse |
| Otherwise | none |

"Inline" variants are used when no plan file path is available. All
active variants append `Plan file: <path>`.

**Full reminder content** (`injection/plan-mode-full-reminder.md`):

- MUST NOT edit except the plan file; prefer read-only tools; Bash follows
  normal permission rules; overrides other instructions.
- Workflow: Understand (Glob/Grep/Read) → Design (one recommendation) →
  Review → Write Plan (plan file) → Exit (`ExitPlanMode`).
- At most 2-3 meaningful approaches; pass them as `ExitPlanMode.options`.
- Use `AskUserQuestion` for missing requirements; never ask for plan
  approval in text.
- **Every turn must end with `AskUserQuestion` or `ExitPlanMode`.**

Exit reminder: "Plan mode is no longer active. The read-only and
plan-file-only restrictions … no longer apply. Continue with the approved
plan…" (`injection/plan-mode-exit-reminder.md`).

### 4. Plan file

- Path: `join(sessionDir, "agents", agentId, "plans", "<id>.md")`
  (`planService.ts:238-240`); id is a random hero slug
  (`planService.ts:156-158`).
- Lifetime: tied to the session; re-entering plan mode creates a new id, so
  a new file (the re-entry reminder applies when the current file is
  non-empty, e.g. after restore).
- Revisions: when `ExitPlanMode` builds its review display, the content is
  stored as `plan/<id>/v<n>.md` in the blob store and a `plan.revision`
  event records version, sha256, and size (`planService.ts:199-222`,
  `exitPlanModeTool.ts:43-66`).
- `ExitPlanMode` takes no plan text; it always reads the file
  (`exit-plan-mode.md`). Empty file → error "Write your plan to <path>
  first" (`exitPlanModeTool.ts:119-152`).

### 5. Handoff

1. Model calls `ExitPlanMode({ options? })`. Options: 1-3 approaches,
   unique labels, reserved labels forbidden (Approve, Reject, Reject and
   Exit, Revise) (`tools/exit-plan-mode/exit-plan-mode.ts:15-48`).
2. The guard waits on `ExitPlanModeReview.requestApproval`, which asks the
   user with a `plan_review` display (plan content, path, options)
   (`core/features/plan/exitPlanModeReview.ts:26-45`).
3. Outcomes (`exitPlanModeReview.ts:47-129`):

| User action | Plan mode | Tool result to model |
|---|---|---|
| Approve (optionally choosing an option) | exit | "Exited plan mode. [Selected approach: X. Execute ONLY the selected approach.] Plan mode deactivated. All tools are now available. Plan saved to: <path>. ## Approved Plan: <content>" |
| Revise / reject with feedback | stays | "User rejected the plan. Feedback: …" or "User requested revisions…" |
| Reject | stays | error, **turn stops** |
| Reject and Exit | exit | error, turn stops |
| Dismiss | stays | "Plan approval dismissed. Plan mode remains active." |

4. In `auto` permission mode no review happens; the result is marked
   "auto-approved, not user-reviewed" and tells the model to follow the
   user's original instruction about whether to execute
   (`exitPlanModeTool.ts:88-96`, `155-158`).

Execution continues in the same conversation; the approved plan text is in
the latest tool result.

### 6. Permission modes and subagents

- Plan mode and permission mode are orthogonal; ACP combines them into four
  presets.
- The plan service is agent-scoped, so subagents have their own (inactive)
  plan state. The `Agent` tool is not blocked by the guard; a spawned
  subagent with write tools is not restricted by the parent's plan mode
  (inferred from scoping; not exercised). Reminders steer toward
  `Agent(subagent_type="explore")`.
- A separate read-only `plan` **subagent profile** exists (Read, Glob,
  Grep, WebSearch, FetchURL, NotifyUser; no shell, no edit) for delegated
  planning (`core/features/plan/profile/plan.ts:8-40`). It is unrelated to
  plan mode itself.

### 7. Limitations and edge cases

- Bash can modify files in plan mode whenever the permission mode allows
  it (e.g. `yolo` runs routine commands, `auto` runs everything).
- Subagents and MCP tools are not guarded.
- `EnterPlanMode` is auto-approved in every permission mode; the model can
  put itself in plan mode.
- Plan file path equality is exact; writing a second file (e.g. notes) is
  denied.
- Turn-ending rule ("end with AskUserQuestion or ExitPlanMode") is
  prompt-only.

### Comparison with OpenCode

| Aspect | OpenCode V2 | Kimi Code |
|---|---|---|
| Model | Separate primary agent | State flag on the same agent |
| Edit guard | Permission rule (`edit` deny, plan dir allow) | Before-execute guard, exact plan file |
| Shell | allow | Permission mode decides |
| Subagents | allow | allow (own state) |
| Plan file | Optional, global dir | Expected, per session/agent, auto path |
| Enter by model | No | `EnterPlanMode` |
| Exit | User switches agent | `ExitPlanMode` + review dialog with options |
| Reminders | Enter/leave, reconciled per request | Full/sparse/re-entry/exit with cadence, per step |
| Revisions | No | Blob snapshots per review |

## Open questions

- How does the TUI render `plan_review` (`components/messages/plan-box.ts`)
  and collect feedback?
- What exactly do `manual` and `yolo` auto-approve for Bash (rule engine in
  `core/agent/permissionPolicy/`)?
- How does `defaultPlanMode` interact with `--yolo`/`auto` at startup?

## References

- `core/features/plan/`: `plan.ts`, `planFeature.ts`, `planOps.ts`,
  `planService.ts`, `exitPlanModeReview.ts`, `configSection.ts`,
  `profile/plan.ts`, `injection/*`, `tools/enter-plan-mode/*`,
  `tools/exit-plan-mode/*`
- `core/features/reminder/{reminderService,systemReminder}.ts`
- `core/session/agentLifecycle/profile/profiles.ts`
- `apps/kimi-code/src/tui/controllers/editor-keyboard.ts`,
  `apps/kimi-code/src/tui/commands/{registry,config}.ts`,
  `apps/kimi-code/src/tui/utils/permission-mode.ts`
- `packages/node-sdk/src/sdk-rpc-client-v2.ts`,
  `packages/acp-server/src/modes.ts`
