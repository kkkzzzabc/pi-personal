---
title: Gemini CLI plan mode
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: gemini-cli
    path: .references/gemini-cli
    version: 0.65.0-nightly.20261006.gfb972b2f8
    commit: 9b6e0265d
---

# Gemini CLI plan mode

## Scope

Implementation-level analysis of plan mode in Google's Gemini CLI, at the
same depth as the OpenCode analysis. Gemini CLI is the most policy-driven
design among the references. Paths are relative to `.references/gemini-cli/`;
`core/` means `packages/core/src/`, `cli/` means `packages/cli/src/`.

## Summary

- Plan mode is one value of the global **approval mode**
  (`default`, `autoEdit`, `yolo`, `plan`). It is ordered as the least
  permissive mode.
- Enforcement is a **priority-based TOML policy engine**. In plan mode a
  catch-all `* → deny` applies; read-only tools, two investigation
  subagents, and `.md` writes inside the plans directory are allowed;
  `ask_user`, `web_fetch`, `activate_skill`, and read-only MCP tools ask.
  **Shell is denied**, and unconditionally denied tools are **removed from
  the model's tool declarations**.
- Write/edit get a second layer: in plan mode the tools resolve paths
  **relative to the plans directory** with realpath containment checks, and
  their descriptions are prefixed "ONLY FOR PLANS".
- The **system prompt is regenerated** on plan transitions: the normal
  workflow section is replaced by a "Planning Workflow" section (explore →
  consult → draft → review & approval) that adapts to task complexity and
  interactivity.
- Entry: `Shift+Tab` cycle (`default → autoEdit → plan → default`), `/plan
  [prompt]`, settings `defaultApprovalMode: plan`, or the model via
  `enter_plan_mode` (asks the user in interactive mode).
- Exit: the model calls `exit_plan_mode({ plan_filename })`. The dialog shows
  the plan and offers "Auto" (→ `autoEdit`) or "Manual" (→ `default`) or free
  feedback. Approval sets an **approved plan path** that later prompts must
  read. A manual mode switch injects "User has manually exited Plan Mode."
- **Model routing**: Pro model while planning, Flash once an approved plan
  exists (setting, default on).
- Plans live in a per-session temp directory by default
  (`<projectTemp>/<sessionId>/plans/`), configurable inside the project.

## Questions

1. How is plan mode represented and toggled?
2. How is read-only behavior enforced?
3. How are instructions delivered to the model?
4. How does the plan file work?
5. How does plan → execution handoff work?
6. How are subagents, MCP, and models handled?
7. Limitations and edge cases?

## Findings

### 1. Representation and toggling

`ApprovalMode` enum and permissiveness order
`[PLAN, DEFAULT, AUTO_EDIT, YOLO]` (`core/policy/types.ts:48-62`). The mode
lives in the policy engine; `Config.setApprovalMode` refuses privileged modes
in untrusted folders (plan is allowed), logs the switch, updates the policy
engine and sandbox, emits `ApprovalModeChanged`, and on plan or YOLO
transitions **re-sends tools and regenerates the system instruction**
(`core/config/config.ts:2807-2846`).

User entry points:

- `Shift+Tab` (`app.cycleApprovalMode`, `cli/ui/key/keyBindings.ts:395`)
  cycles `default → autoEdit → plan → default`; YOLO cycles to `autoEdit`
  (`cli/ui/hooks/useApprovalModeIndicator.ts:74-91`). Plan is skipped if
  plan mode is disabled.
- `/plan [prompt]`: switches to plan mode and optionally submits the
  prompt; shows the approved plan file name if one exists
  (`cli/ui/commands/planCommand.ts:51-90`). A `copy` subcommand copies the
  approved plan to the clipboard (`planCommand.ts:30-49`).
- Settings: `general.defaultApprovalMode` may be `plan`; `general.plan`
  has `enabled` (default true), `directory`, and model routing
  (`schemas/settings.schema.json:92-96`, `151-175`).

Model entry: `enter_plan_mode({ reason? })` (`core/tools/enter-plan-mode.ts`).
Policy: `ask_user` in interactive mode, `allow` non-interactive, `deny`
when already in plan (`core/policy/policies/plan.toml:33-51`). On approval
it sets `PLAN` and creates the plans directory
(`enter-plan-mode.ts:89-141`). The confirmation reads "This will restrict
the agent to read-only tools to allow for safe planning." Tool visibility:
`enter_plan_mode` is hidden in plan mode and `exit_plan_mode` outside it
(`core/tools/tool-registry.ts:633-639`).

### 2. Enforcement

**Policy engine.** Rules have tool name(s), optional MCP name, tool
annotations, `argsPattern` regex over serialized args, `modes`, and
`interactive`; the highest priority match wins. Tiers: default 1.x,
extension 2.x, workspace 3.x, user 4.x, admin 5.x
(`core/policy/policies/plan.toml:1-31`).

Plan rules (`core/policy/policies/plan.toml`), in priority order:

| Priority | Rule | Decision |
|---|---|---|
| 70 | `exit_plan_mode` in plan | ask (interactive) / allow |
| 70 | `write_file`, `replace` with `file_path` matching plans-dir `.md` patterns (10 variants: absolute temp path, relative, `./`, `plans/`) | allow |
| 65 | `write_file`, `replace` otherwise | deny: "You are in Plan Mode and cannot modify source code…" |
| 50 | `invoke_agent` with `agent_name` `codebase_investigator` or `cli_help` | allow |
| 50 | `ask_user`, `web_fetch`, `activate_skill` | ask (interactive) |
| 50 | MCP tools with `readOnlyHint = true` | ask (interactive) |
| 50 | `exit_plan_mode` outside plan | deny |
| 40 | `*` | deny: "You are in Plan Mode with access to read-only tools. Execution of scripts (including those from skills) is blocked." |

The default-tier read-only list (glob, grep, list, read, web search,
investigator, task tracker, MCP resource reads) is allowed in all modes at
priority 50 (`core/policy/policies/read-only.toml:30-56`). Non-interactive
sessions turn `ask_user` into deny.

Consequences:

- **Shell (`run_shell_command`) is denied**, including skill scripts.
- `invoke_agent` is allowed for other modes by `agents.toml` but that rule
  excludes `plan`, so only the two investigation agents run in plan mode
  (`core/policy/policies/agents.toml:1-10`).
- User/workspace/admin policies can override any of this (higher tiers).

**Tool declarations.** `getExcludedTools` statically excludes tools whose
highest-priority unconditional rule is deny; argument-conditional allows
keep a tool visible (`core/policy/policy-engine.ts:1130-1200`). So shell and
other denied tools disappear from the model's tool list, while
`write_file`/`replace` remain, with the description prefixed "ONLY FOR
PLANS: … may ONLY use this tool to write or update plans (.md files) in the
plans directory" (`core/tools/tool-registry.ts:663-707`).

**Path resolution.** In plan mode, `write_file` and `edit` resolve
`file_path` through `resolveAndValidatePlanPath` and realpath
(`core/tools/write-file.ts:126-140`, `254-270`, `core/tools/edit.ts:483`,
`1184`). The resolver accepts an absolute path inside the plans dir, a
project-relative path that lands inside it, or otherwise resolves relative
to the plans dir, and throws if the real path escapes
(`core/utils/planUtils.ts:33-83`). A bare `plan.md` therefore lands in the
plans dir, not the project root.

### 3. Instructions to the model

The prompt provider computes `isPlanMode` and swaps sections: the primary
workflow section is omitted and `planningWorkflow` is rendered with the
plan-mode tool list, the relative plans dir, and the approved plan path
(`core/prompts/promptProvider.ts:61-71`, `195-218`).

`renderPlanningWorkflow` (`core/prompts/snippets.ts:598-661`):

- Header "Active Approval Mode: Plan"; goal is a plan in `<plansDir>/` and
  user approval before editing source.
- Rules: read-only; write only `.md` in the plans dir; combine discovery and
  drafting; distinguish **Inquiries** (answer directly, no plan) from
  **Directives** (plan); descriptive file names; if asked to modify code,
  explain and use `exit_plan_mode`; never call `exit_plan_mode` via shell;
  always show the full plan in chat when seeking agreement.
- Workflow: 1 Explore & Analyze; 2 Consult (interactive: simple tasks
  confirm in chat and STOP; standard tasks summarize options via
  `ask_user`; complex tasks present at least two approaches; never draft in
  the same turn as the strategy proposal) or Determine Strategy
  (non-interactive); 3 Draft (structure scales: Changes+Verification →
  Objective/Key Files/Steps/Testing → full design doc with alternatives,
  phases, rollback); 4 Review & Approval via `exit_plan_mode` after
  informal agreement.
- If an approved plan exists: read it first, refine it by default, create a
  new plan only when asked (`snippets.ts:663-671`).

Manual exit (mode switch while idle) appends a user history message
"User has manually exited Plan Mode. Switching to <mode description>."
(`cli/ui/hooks/useGeminiStream.ts:1883-1905`,
`core/utils/approvalModeUtils.ts:31-40`).

### 4. Plan files

- Default directory: `<projectTempDir>/<sessionId>/plans/`
  (`core/config/storage.ts:372-377`). Custom `general.plan.directory` must
  resolve inside the project root (`storage.ts:386-404`); docs note a custom
  directory also needs a policy allowing writes.
- File names are chosen by the model; multiple plans per session are
  possible.
- `exit_plan_mode` requires `plan_filename`, validates the path and that the
  file is non-empty (`core/tools/exit-plan-mode.ts:59-73`, `116-131`,
  `core/utils/planUtils.ts:112-125`).

### 5. Handoff

`exit_plan_mode` (`core/tools/exit-plan-mode.ts:116-268`):

1. Validate path and content; consult policy (`ask_user` interactive,
   `allow` otherwise).
2. Interactive dialog (`cli/ui/components/ExitPlanModeDialog.tsx:241-283`)
   shows the plan content with options:
   - **Auto**: "Approves plan and allows tools to run automatically" →
     `autoEdit`
   - **Manual**: "Approves plan but requires confirmation for each tool" →
     `default`
   - free-text feedback → rejection with feedback; external editor to edit
     the plan.
3. Results to the model:
   - Approved: switch mode, store the **approved plan path**, return "Plan
     approved. Switching to <mode>. The approved implementation plan is
     stored at: <path>. Read and follow the plan strictly during
     implementation." (`exit-plan-mode.ts:215-231`)
   - Feedback: "Plan rejected. User feedback: … Revise the plan…"
   - No feedback: "Plan rejected. No feedback provided… Ask the user…"
   - Cancel: "User cancelled… you are still in Plan Mode."
4. Non-interactive or policy `allow`: exit to `yolo` (non-interactive) or
   `default` (`exit-plan-mode.ts:261-268`).

The plan is passed by path, not content; the approved path persists in
config and is surfaced in later system prompts.

### 6. Subagents, MCP, models

- Subagents: only `codebase_investigator` and `cli_help` may be invoked in
  plan mode. Local subagents running in plan mode get an "Execution
  Constraints" section restricting writes to the plans dir
  (`core/agents/local-executor.ts:1468-1471`); the approval mode and policy
  engine are shared, so the same rules apply inside subagents (inferred
  from the shared config).
- MCP: tools annotated `readOnlyHint` ask; all others are denied.
- Model routing (`general.plan.modelRouting`, default true): plan mode →
  Pro model; approved plan present → Flash model
  (`core/routing/strategies/approvalModeStrategy.ts:40-110`).

### 7. Limitations and edge cases

- No shell at all in plan mode: no `git log`, test runs, or build checks
  while planning, unless a user policy allows them.
- Write allowance depends on regex patterns over serialized arguments plus
  path resolution in tools; the TOML comments describe it as split,
  traversal-safe, and ReDoS-safe. A custom plans dir needs a matching
  policy.
- `ask_user` and `web_fetch` require confirmation in plan mode.
- Plan transitions regenerate the system instruction, which changes the
  prompt prefix (cache impact; inferred).

### Comparison with OpenCode

| Aspect | OpenCode V2 | Gemini CLI |
|---|---|---|
| Model | Separate primary agent | Global approval mode |
| Guard | Agent permission rules | Priority TOML policies + tool path resolution |
| Shell | allow | deny (hidden) |
| Subagents | allow | 2 investigation agents only |
| Plan file | Optional, global dir | Expected, per-session temp dir, model names file |
| Prompt | Reminder messages | System prompt section swap |
| Enter by model | No | `enter_plan_mode` (asks) |
| Exit | User switches agent | `exit_plan_mode` + dialog choosing next mode |
| Model per phase | Configurable per agent | Automatic Pro/Flash routing |

## Open questions

- How does the external-editor path in the approval dialog persist edits?
- What happens to an approved plan path across sessions (`/resume`)?
- Full behavior of `readOnlyHint` MCP tools in non-interactive mode.

## References

- `core/policy/types.ts`, `core/policy/policies/{plan,read-only,agents}.toml`,
  `core/policy/policy-engine.ts`
- `core/config/config.ts`, `core/config/storage.ts`
- `core/tools/{enter-plan-mode,exit-plan-mode,write-file,edit,tool-registry}.ts`,
  `core/utils/{planUtils,approvalModeUtils}.ts`
- `core/prompts/{promptProvider,snippets}.ts`
- `core/agents/local-executor.ts`,
  `core/routing/strategies/approvalModeStrategy.ts`
- `cli/ui/key/keyBindings.ts`, `cli/ui/hooks/{useApprovalModeIndicator,useGeminiStream}.ts`,
  `cli/ui/commands/planCommand.ts`, `cli/ui/components/ExitPlanModeDialog.tsx`
- `schemas/settings.schema.json`, `docs/tools/planning.md` (not reviewed)
