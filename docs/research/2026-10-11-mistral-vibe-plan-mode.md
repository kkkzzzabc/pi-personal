---
title: Mistral Vibe plan mode
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: mistral-vibe
    path: .references/mistral-vibe
    version: 2.26.1
    commit: 4ae5c595
---

# Mistral Vibe plan mode

## Scope

Implementation-level analysis of plan mode in Mistral Vibe (Python), at the
same depth as the OpenCode analysis. Vibe is a compact example of a
profile-based plan mode with a plan file, an exit tool, and a
clear-context handoff. Paths are relative to `.references/mistral-vibe/`.

## Summary

- Plan is a built-in **agent profile** among primary modes `ask`, `plan`,
  `accept-edits`, `smart-approve`, `auto-approve`. Profiles are
  **permission presets** applied as tool-config overrides; the system prompt
  and tool set stay the same.
- Plan overrides only file tools: `write_file` and `edit` get permission
  `never` with an allowlist of `~/.vibe/plans/*`; `read_file` allowlists the
  plans dir. The agent scratchpad is always writable.
- **Bash is unchanged** from the default (`ask`) behavior: a read-only
  command allowlist runs automatically, interactive tools are denylisted,
  and anything else asks the user. This mirrors early OpenCode V1.
- `exit_plan_mode` is available only in plan (disabled in every other
  profile). It asks the user with four choices: clear context and
  auto-approve edits, auto-approve edits, manual approval (ask mode), or
  stay. Free-text answers become feedback.
- Instructions are injected by a middleware **only on transitions**: a
  `<vibe_warning>` reminder when plan becomes active (with the plan file
  path) and an exit message when it ends.
- The plan file is `~/.vibe/plans/<timestamp>-<slug>.md`, global, one per
  plan session. Users can edit it during review (`Ctrl+G`); edits are
  detected by content snapshot and re-injected as the source of truth.
- "Clear context" resets history and seeds the new context with the approved
  plan text.
- `Shift+Tab` cycles modes; in the Unified Harness picker, plan is hidden
  from the cycle.

## Questions

1. How is plan mode represented and toggled?
2. How is read-only behavior enforced?
3. How are instructions delivered?
4. How does the plan file work?
5. How does plan → execution handoff work?
6. Subagents and other tools?
7. Limitations?

## Findings

### 1. Representation and toggling

- `BuiltinAgentName` and `AgentProfile` (name, display name, description,
  safety level, agent type, overrides, optional instructions)
  (`vibe/core/agents/models.py:17-60`).
- Plan profile: "Read-only agent for exploration and planning", safety
  `SAFE`, overrides from `_plan_overrides()` (`models.py:63-87`).
- Every other primary profile sets `disabled_tools: ["exit_plan_mode"]`
  (`models.py:74-117`).
- Primary order: ask, plan, accept-edits, smart-approve, auto-approve, then
  custom profiles (`vibe/core/agents/manager.py:146-160`).
- TUI: `Shift+Tab` → `action_cycle_mode` → next agent
  (`vibe/cli/textual_ui/app.py:689`, `5928-5933`); `Ctrl+G` opens the plan
  in an editor (`app.py:695`).
- Unified Harness clients hide plan from the mode picker/cycle; it remains
  selectable via `--agent`, resume, or explicit switch
  (`vibe/app_server/_projection.py:236-239`).

### 2. Enforcement

**File tools.** `resolve_file_tool_permission` checks, in order: scratchpad
path → `ALWAYS`; denylist/allowlist glob match on the resolved absolute
path → `NEVER`/`ALWAYS`; sensitive patterns; workdir boundary
(`vibe/core/tools/utils.py:148-235`). With plan's config permission
`never`, any write outside `~/.vibe/plans/*` (and the scratchpad) is denied.
Paths are resolved with `Path.resolve()`, so symlinks are followed.

Overrides (`models.py:63-71`):

```python
"write_file": {"permission": "never", "allowlist": [PLANS_DIR/*]},
"edit":       {"permission": "never", "allowlist": [PLANS_DIR/*]},
"read_file":  {"allowlist": [PLANS_DIR/*]},
```

**Bash.** Plan does not override `bash`. Defaults
(`vibe/core/tools/builtins/bash.py:64-145`, `411-430`): permission `ask`;
allowlist `cd`, `echo`, `git diff`, `git log`, `git status`, `tree`,
`whoami` plus a POSIX read-only list (`basename`, `cat`, `cut`, `diff`,
`find`, …); denylist interactive programs (`vim`, `nano`, `tmux`,
`bash -i`, …); standalone denylist (`python`, `ipython`). Shell commands
are parsed for permission analysis (`_shell_permission_analysis.py`, not
reviewed). Non-allowlisted commands require user approval.

**Tool visibility.** Write tools stay visible; denial happens per call.
`exit_plan_mode` is hidden outside plan through `disabled_tools`.

### 3. Instructions

`ReadOnlyAgentMiddleware` runs before each turn and injects a message only
when the active profile changes into or out of plan
(`vibe/core/middleware.py:183-220`). It is registered with a lazily built
reminder that knows whether `ask_user_question` and `exit_plan_mode` are
available (`vibe/core/agent_loop/_loop.py:1928-1941`).

Reminder (`middleware.py:145-178`), wrapped in `<vibe_warning>`:

- "Plan mode is active. You MUST NOT make any edits (except to the plan
  file below, or in your scratchpad), run any non-readonly tools (including
  changing configs or making commits), or otherwise make any changes to the
  system. This supersedes any other instructions you have received."
- Plan File Info: create/edit the plan at `<path>` with `write_file`/`edit`,
  build it incrementally, create it early.
- Instructions: research with read-only tools; use `ask_user_question` when
  unsure; write the plan to the file; call `exit_plan_mode` for approval
  (or tell the user to switch modes if the tool is unavailable).

Exit message `PLAN_AGENT_EXIT`: "Plan mode has ended. If you have a plan
ready, you can now start executing it…" (`middleware.py:180`).

### 4. Plan file

- `PLANS_DIR = ~/.vibe/plans` (`vibe/core/paths/_vibe_home.py:34`).
- `PlanSession.plan_file_path` lazily creates
  `<PLANS_DIR>/<unix timestamp>-<slug>.md` (`vibe/core/plan_session.py:11-42`).
- Review editing: when `exit_plan_mode` is called, the loop snapshots the
  file content and emits `PlanReviewRequestedEvent`; when the review ends,
  if the content changed, it injects "The user has manually updated the
  plan file. Here is the updated version -- use this as the source of truth
  for implementation: …" (`_loop.py:2519-2545`).

### 5. Handoff

`ExitPlanMode.run` (`vibe/core/tools/builtins/exit_plan_mode.py:65-155`):

1. Errors unless the active profile is plan and the UI is interactive.
2. Asks "Plan is complete. Switch to accept-edits mode and start
   implementing?" with footer "Plan: <path> (Ctrl+G to edit)".

| Choice | Result |
|---|---|
| Yes, clear context and auto approve edits | switch to `accept-edits`, then clear context |
| Yes, and auto approve edits | switch to `accept-edits` |
| Yes, and request approval for edits | switch to `ask` |
| No | stay in plan, "Continue refining the plan." |
| Free text ("other") | stay in plan, "User feedback: …" |
| Cancel | stay in plan |

3. Clear context runs at a turn boundary: history is cleared and a
   `<vibe_warning>` user message is added: "The conversation context was
   cleared after the plan was approved. Implement the approved plan below
   -- it is the source of truth: <plan>" (`_loop.py:3725-3762`).

### 6. Subagents and other tools

- `task` (subagent) is not overridden by plan, so subagents can be
  launched. The built-in `explore` subagent is read-only (`grep`,
  `read_file`, `skill`) (`models.py:119-129`); custom subagents follow their
  own profiles (inferred).
- Web tools, MCP, and others keep their default permissions.

### 7. Limitations

- Bash can modify files if the user approves a non-allowlisted command; no
  plan-specific bash policy exists.
- The plans directory is global across projects; file names are
  timestamp+slug, not task names.
- Reminders are injected only on transitions, so long plan sessions rely on
  one early reminder (compaction behavior not reviewed).

### Comparison with OpenCode

| Aspect | OpenCode V2 | Mistral Vibe |
|---|---|---|
| Model | Primary agent | Primary profile (permission preset) |
| Edit guard | `edit` deny + plan dir allow | `never` + plans dir allowlist (+ scratchpad) |
| Shell | allow | read-only allowlist auto, others ask |
| Plan file | Optional, `~/.opencode/plan/` | Expected, `~/.vibe/plans/<ts>-<slug>.md` |
| Prompt | Enter/leave reminders, reconciled per request | Enter/exit messages on transition only |
| Exit | User switches agent | `exit_plan_mode` with 4 choices incl. clear context |
| User plan edits | No | `Ctrl+G` edit, change detected and re-injected |

## Open questions

- How does `_shell_permission_analysis.py` treat redirections and pipes in
  allowlisted commands?
- Is the plan reminder re-injected after compaction?
- Can custom profiles reuse plan behavior (exit tool, middleware) by name?

## References

- `vibe/core/agents/{models,manager}.py`
- `vibe/core/middleware.py`, `vibe/core/plan_session.py`,
  `vibe/core/paths/_vibe_home.py`
- `vibe/core/tools/{base,utils}.py`,
  `vibe/core/tools/builtins/{bash,exit_plan_mode}.py`
- `vibe/core/agent_loop/_loop.py`
- `vibe/cli/textual_ui/app.py`, `vibe/app_server/_projection.py`
