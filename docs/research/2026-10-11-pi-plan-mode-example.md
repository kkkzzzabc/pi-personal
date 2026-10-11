---
title: pi plan-mode example extension
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: pi (fork of earendil-works/pi)
    path: /Users/kkkzzzabc/workspace/projects/personal/pi
    version: 1.1.0
    commit: abe508e1b   # tag v1.1.0; the example is unchanged at main 4ac0bd8c7
---

# pi plan-mode example extension

## Scope

How the upstream example `packages/coding-agent/examples/extensions/plan-mode/`
implements a plan mode on top of the pi extension API, and how it compares
with OpenCode's plan/build agents. This informs whether a personal plan-mode
extension should reuse, fork, or replace the example. Paths below are
relative to `packages/coding-agent/examples/extensions/plan-mode/` unless
noted. Version matches the installed pi (1.1.0).

## Summary

- The example is a self-contained extension (`index.ts` 390 lines,
  `utils.ts` 168 lines) using only public extension APIs. No core changes.
- It combines **two features**: a read-only plan mode, and a **plan-execution
  tracker** (extracts a numbered `Plan:` list, offers "Execute the plan",
  tracks `[DONE:n]` markers in a widget). OpenCode has only the first.
- Read-only enforcement is **stronger than OpenCode for tools** (edit/write
  are removed from the active tool set, not just denied) but **weaker for
  bash**: a regex allowlist that is easy to bypass (verified: `find -delete`,
  `curl -o`, `sed -n 'w file'`, `git diff --output`, `env node -e` all pass).
- There is **no plan file**: the plan lives in the transcript and in session
  custom entries. There is no per-mode model or system prompt.
- Mode instructions are injected per prompt via `before_agent_start` and
  removed from context via a `context` filter when plan mode is off.
- Toggle: `/plan`, `Ctrl+Alt+P`, or `--plan`. `Shift+Tab` is unavailable by
  default (reserved for thinking-level cycling); see
  `docs/spikes/2026-10-11-extension-shift-tab-shortcut.md`.
- The prompt references tools/skills that may not exist (`questionnaire`
  tool, `brave-search` skill), so it is example-grade, not a drop-in.

## Questions

1. How is plan mode toggled and persisted?
2. How is read-only behavior enforced?
3. How are mode instructions delivered to the model?
4. How does planning hand off to execution?
5. How does it compare with OpenCode, and what should a personal version
   change?

## Findings

### 1. Toggle and persistence

- Entry points: `--plan` flag (`index.ts:53-57`), `/plan` command
  (`index.ts:141-144`), `Ctrl+Alt+P` shortcut (`index.ts:158-161`); all call
  `togglePlanMode` (`index.ts:125-139`). `/todos` prints progress
  (`index.ts:146-156`). Shortcut history: originally `Shift+P`, changed to
  `Ctrl+Alt+P` (commit `39ee5fee9`).
- State is in closure variables (`planModeEnabled`, `executionMode`,
  `todoItems`, `toolsBeforePlanMode`) and persisted on every change as a
  session custom entry `plan-mode` via `pi.appendEntry`
  (`index.ts:116-123`).
- `session_start` restores the last `plan-mode` entry, honors `--plan`, and
  on resume rescans assistant messages after the last `plan-mode-execute`
  entry to rebuild `[DONE:n]` progress (`index.ts:340-389`).
- Status: footer shows `⏸ plan` or `📋 n/m`; a widget lists todos during
  execution (`index.ts:59-87`).

### 2. Read-only enforcement

**Tool set.** On enable, it snapshots the active tools and sets
`active − {edit, write} + {read, bash, grep, find, ls, questionnaire}`
(`index.ts:22-25`, `index.ts:89-114`). On disable, it restores the snapshot.
Because edit/write are removed from the active set, the model does not see
them at all (unlike OpenCode, where they stay visible and fail).

Gaps:

- Other active tools are kept, so any extension, MCP, or codemode tool that
  writes files remains available (by design: "Other active tools remain
  available").
- `questionnaire` is added by name even if no such tool is registered
  (inferred: harmless only if `setActiveTools` ignores unknown names; not
  verified).

**Bash.** A `tool_call` handler blocks bash commands that fail
`isSafeCommand` with a reason telling the user to run `/plan`
(`index.ts:164-174`). `isSafeCommand` requires a match in `SAFE_PATTERNS`
(command prefix allowlist) and no match in `DESTRUCTIVE_PATTERNS`
(`utils.ts:7-42`, `utils.ts:44-95`, `utils.ts:97-101`).

Verified behavior (running `isSafeCommand` from `utils.ts` on Node 26):

| Command | Result |
|---|---|
| `ls -la`, `cat a.txt \| head`, `git log --oneline`, `rg foo src` | allow |
| `cat a; rm b`, `echo hi > f` | block |
| `npm test`, `python3 -c 'print(1)'` | block (not allowlisted) |
| `find . -name '*.tmp' -delete` | **allow** |
| `curl -o out.html https://example.com` | **allow** |
| `sed -n 'w out.txt' in.txt` | **allow** |
| `git diff --output=patch.diff` | **allow** |
| `env node -e "require('fs').writeFileSync('x','')"` | **allow** |

Only the prefix is allowlisted (`utils.ts:68`, `86`, `89`), so flags and
sub-commands that write are not caught. It also blocks harmless test and
build commands, which matters for planning (e.g. running tests to explore).

**No write allowance.** There is no plan-directory exception; the agent
cannot persist a plan file in plan mode.

### 3. Instructions to the model

- `before_agent_start` returns a hidden custom message
  (`customType: "plan-mode-context"`, `display: false`) on every prompt while
  plan mode is on (`index.ts:201-247`). It describes the restrictions, asks
  for clarifying questions via `questionnaire`, suggests a `brave-search`
  skill via bash (`index.ts:215`), and requires a numbered list under a
  `Plan:` header.
- During execution it injects `plan-execution-context` listing remaining
  steps and the `[DONE:n]` convention.
- A `context` handler removes `plan-mode-context` messages (and any user
  message containing `[PLAN MODE ACTIVE]`) when plan mode is off
  (`index.ts:177-198`). So after leaving plan mode, the model no longer sees
  the plan-mode instructions, but it does see the plan discussion itself.
- Inferred: because the message is injected on every prompt in plan mode,
  multiple copies accumulate in the session while planning; only the
  `context` filter hides them later. Not verified.

There is no system-prompt change and no per-mode model, although the API
supports both (`BeforeAgentStartEventResult.systemPrompt`, `pi.setModel`,
`pi.setThinkingLevel`).

### 4. Planning → execution handoff

- `agent_end` in plan mode (UI only) extracts todos from the last assistant
  message via `extractTodoItems`: a `Plan:` header followed by `1.`/`1)`
  items; texts are cleaned and truncated to 50 chars (`index.ts:262-299`,
  `utils.ts:105-150`).
- It then asks via `ctx.ui.select`: "Execute the plan (track progress)",
  "Stay in plan mode", "Refine the plan" (`index.ts:301-305`).
  - Execute: disables plan mode, restores tools, and sends a visible
    follow-up message that triggers a turn with the remaining steps
    (`index.ts:307-329`).
  - Refine: opens an editor and sends the text as a follow-up user message
    (`index.ts:330-336`).
- During execution, `turn_end` marks steps complete from `[DONE:n]` tags
  (`index.ts:250-260`, `utils.ts:152-168`); when all are done, `agent_end`
  posts "Plan Complete!" and clears state (`index.ts:264-279`).

### 5. Comparison with OpenCode

| Aspect | OpenCode plan/build | pi plan-mode example |
|---|---|---|
| Concept | Two primary agents | One extension toggle (+ execution sub-mode) |
| Toggle | Shift+Tab (draft, committed on submit) | `/plan`, Ctrl+Alt+P, `--plan` |
| Edit/write tools | Visible, denied by permission | Removed from active set |
| Plan file | Allowed only in `~/.opencode/plan/` | None |
| Shell | Unrestricted (prompt only) | Regex allowlist (bypassable) |
| Subagents | Allowed; prompt-only guard | Not handled (no subagent tool by default) |
| Instructions | Enter/leave reminders, reconciled per request | Hidden message per prompt, filtered when off |
| Leave signal | Explicit leave reminder | Plan context removed; no explicit leave notice |
| Handoff | None (user switches agents) | Parse `Plan:` → select → execute with `[DONE:n]` tracking |
| Persistence | Durable agent-switch event | Session custom entries |
| Per-mode model | Configurable per agent | Not used |
| Tests | `core/test/plugin/plan.test.ts` | `test/plan-mode-extension.test.ts`, `test/plan-mode-utils.test.ts` (not reviewed) |

Implications for a personal version (input to a plan document, not
decisions):

- Keep: tool-set removal, `appendEntry`/`session_start` persistence,
  `before_agent_start` + `context` pattern.
- Replace: bash regex allowlist (bypassable and too strict for tests);
  consider OpenCode's approach (allow bash, rely on reminders) or a stronger
  guard.
- Add: plan-directory write allowance with a path guard
  (`docs/spikes/2026-10-11-plan-dir-write-guard.md`), an explicit leave
  reminder, and optionally per-mode model selection.
- Decide: whether the `Plan:`/`[DONE:n]` execution tracker is wanted; it is
  orthogonal to read-only mode.

## Open questions

- Does `setActiveTools` ignore unknown tool names like `questionnaire`?
- Are `before_agent_start` messages persisted to the session on every prompt?
- How do subagents (example `subagent` extension) interact with plan mode?
  They run in a separate pi process with their own extension state.
- What do `test/plan-mode-extension.test.ts` and
  `test/plan-mode-utils.test.ts` cover?

## References

- `examples/extensions/plan-mode/{index.ts,utils.ts,README.md}`
- `packages/coding-agent/src/core/extensions/types.ts` (event and API types)
- `packages/coding-agent/src/core/extensions/runner.ts` (shortcut conflicts,
  `tool_call` dispatch)
- Git history: `e8f1322ee` (step tracking), `39ee5fee9` (shortcut change),
  `542683b29` (fix)
