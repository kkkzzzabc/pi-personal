---
title: Todo and task tracking across pi and coding-agent references
date: 2026-10-11
session: 01a12919-ee97-74ae-8f9a-5af58b90b8a7
based_on:
  - docs/research/2026-10-11-pi-plan-mode-example.md
  - docs/research/2026-10-11-codex-cli-plan-mode.md
  - docs/research/2026-10-11-opencode-plan-build.md
sources:
  - repo: earendil-works/pi
    path: /Users/kkkzzzabc/workspace/projects/personal/pi
    version: v1.1.0 example baseline
    commit: abe508e1b89912adde45528136c3221eb69acdd7
  - repo: kkkzzzabc/pi
    path: /Users/kkkzzzabc/workspace/projects/personal/pi
    version: 1.1.0 fork source checkout
    commit: 01aa35b6f61bc948cf6aabe720bb6398aa044211
  - repo: anomalyco/opencode
    path: .references/harnesses/anomalyco/opencode
    version: github-v1.2.26
    commit: 5caf1f9f6f5f
  - repo: anomalyco/opencode
    path: .references/harnesses/anomalyco/opencode
    version: historical parent of todo removal 7feefb697f
    commit: d4155f290680506d80b76dc7cda5e24820956d3b
  - repo: openai/codex
    path: .references/harnesses/openai/codex
    version: commit snapshot; release version not established
    commit: 806d9732c974
  - repo: google-gemini/gemini-cli
    path: .references/harnesses/google-gemini/gemini-cli
    version: v0.49.0-preview.0-212-g9b6e0265d
    commit: 9b6e0265d16b
  - repo: MoonshotAI/kimi-code
    path: .references/harnesses/MoonshotAI/kimi-code
    version: '@moonshot-ai/kimi-code@2.1.1-24-gc9f01f073'
    commit: c9f01f07388a
  - repo: QwenLM/qwen-code
    path: .references/harnesses/QwenLM/qwen-code
    version: commit snapshot; release version not established
    commit: a238b91e7c6f
  - repo: mistralai/mistral-vibe
    path: .references/harnesses/mistralai/mistral-vibe
    version: v2.26.1
    commit: 4ae5c5955da8
  - repo: charmbracelet/crush
    path: .references/harnesses/charmbracelet/crush
    version: v0.98.1-1-gdf5b024a
    commit: df5b024a929d
  - repo: aaif-goose/goose
    path: .references/harnesses/aaif-goose/goose
    version: gdk-v0.1.0-alpha.11-65-g3bd852002
    commit: 3bd852002903
  - repo: anthropics/claude-code
    path: .references/harnesses/anthropics/claude-code
    version: v2.1.296
    commit: 2301018b1f61
  - repo: obra/superpowers
    path: .references/customizations/obra/superpowers
    version: v7.0.0
    commit: bb92a7774141
  - repo: github/spec-kit
    path: .references/customizations/github/spec-kit
    version: commit snapshot
    commit: 0443760542e7
  - repo: eyaltoledano/claude-task-master
    path: .references/customizations/eyaltoledano/claude-task-master
    version: commit snapshot
    commit: c0c98d367c55
---

# Todo and task tracking across pi and coding-agent references

## Scope

Research the behavior of work-item trackers, not development comments containing
“TODO.” The goal is to understand pi's official standalone example and contrasting
reference implementations before considering a personal design. No implementation
or adoption decision is made here.

The investigation uses local code, tests, documentation, and Git history. It does
not establish the latest remote release or exercise actual models. The historical
OpenCode comparison is deliberately separated from the checked-out implementation.
Existing plan-mode records are supporting context, not authority for the current
reference snapshots.

### Provenance and citation conventions

- The selected pi installation resolved to
  `/Users/kkkzzzabc/.local/share/pi-fork/releases/b1a78306c-openai-fast-20261011-125046/node_modules/@earendil-works/pi-coding-agent`
  and reports package version `1.1.0`. This identifies the selected installation,
  not conclusively the release that started this already-running session.
- Its `examples/extensions/todo.ts` is byte-identical to the source checkout.
  `git diff v1.1.0 HEAD -- packages/coding-agent/examples/extensions/todo.ts`
  is empty. Thus the standalone example can be described as the official tagged
  example, rather than an unverified fork modification.
- Pi code citations below use `pi/<path>:<lines>` as an explicit abbreviation for
  `/Users/kkkzzzabc/workspace/projects/personal/pi/<path>:<lines>`. Core API claims
  refer to the pinned fork checkout; example claims refer to the unchanged example.
- OpenCode citations marked **historical** refer to Git objects at
  `d4155f290680506d80b76dc7cda5e24820956d3b`, not files present in the current checkout.
- Tests described as covering behavior were **read**, not necessarily executed.
  Executed isolated probes and their limitations are identified separately.

## Summary

1. Pi's standalone `todo` is a small optional extension, not a built-in planner:
   per-item `add`/`toggle`, boolean completion, tool-result snapshots, branch replay,
   and a read-only `/todos` viewer.
2. Pi's plan-mode example is a different system: parse `Plan:` text, accept an
   execution choice, and recognize `[DONE:n]` in assistant output. It is not the
   standalone todo tool and is less branch-aware in its restoration code.
3. Full-list replacement is common, but it does not imply common persistence:
   Gemini uses display/history data, Kimi durable per-agent events, Vibe live memory,
   Crush session storage, and Qwen session JSON files.
4. Current local OpenCode removed its todo tool. Its historical implementation
   illustrates transactional replacement and permission checks, not current behavior.
5. Gemini's task tracker and Task Master are richer ID-addressable task systems;
   Goose intentionally uses an unstructured persistent note instead of completion tracking.
6. State persistence, model reminders, and continuation guards are independent.
   A surviving UI list does not guarantee the model sees it after compaction.
7. “Exactly one in progress” and “only complete verified work” are often instructions,
   not runtime invariants. Gemini's simple todo validator enforces at most one;
   Codex and Kimi do not enforce it in the reviewed handlers/schemas.
8. Most completion labels are assertions by the caller. Qwen can run blocking hooks;
   Superpowers has a test-gated ledger helper. Neither makes every todo intrinsically verified.

## Questions

1. How does the official pi todo example mutate, persist, restore, and display items?
2. How does it differ from pi's plan-mode execution tracker?
3. How do reference harnesses implement updates, persistence, instructions, and UI?
4. What changes when a list becomes a durable workflow or project task system?
5. Which behaviors are enforced, which were verified, and what remains undecided?

## Findings

### 1. Pi standalone todo: branch-sensitive tool state

**Registration and data model.** The extension registers `todo` and `/todos`.
Items are `{ id: number, text: string, done: boolean }`; result details contain
`action`, the complete `todos` array, `nextId`, and optional `error`. There are no
priorities, owners, dependencies, or `in_progress` state. Parameters permit
`list`, `add`, `toggle`, and `clear` (`pi/packages/coding-agent/examples/extensions/todo.ts:1-33,105-140`).

| Action | Actual behavior | Important consequence |
|---|---|---|
| `list` | Returns the complete checkbox list and a state snapshot | Can recover model-visible state explicitly |
| `add` | Appends a not-done item and increments `nextId` | Duplicate text is allowed; no rename/update action |
| `toggle` | Finds the ID and inverts `done` | Repeating a successful call reopens the item; not an idempotent “complete” operation |
| `clear` | Removes every item and resets `nextId` to 1 | IDs are reusable, not globally stable |

The action implementation is at
`pi/packages/coding-agent/examples/extensions/todo.ts:142-219`. Missing text,
missing ID, and unknown ID return error text plus `details.error`; they do not
throw. Empty text is rejected via `!params.text`, but whitespace-only strings are
not trimmed/rejected. There is no external-work verification before `toggle`.
Pi's current extension documentation distinguishes returning an object from a
failed result: these example error paths do not explicitly set `isError`.
See the installed `docs/extensions.md:131-148` and example lines 157-189.

**Storage and replay.** Every result, including reads and error paths, includes a
full snapshot. `reconstructState` resets closure state and scans only
`ctx.sessionManager.getBranch()`, accepting `todo` tool-result details in order.
The last applicable result wins. It runs on `session_start` and `session_tree`
(`pi/packages/coding-agent/examples/extensions/todo.ts:105-133`). This is not an
external todo file or `appendEntry` database.

`getBranch()` traverses parent links and includes all entry types, whereas context
building is a separate compaction-aware operation
(`pi/packages/coding-agent/src/core/session-manager.ts:1464-1487`). Session entries
are JSON-serialized for persistence (same file: 1129,1187). In the reviewed fork,
session replacement constructs a new runtime with `session_start` reasons such as
`new`, `resume`, and `fork`
(`pi/packages/coding-agent/src/core/agent-session-runtime.ts:218-251,305-345`).
Consequently this example's two registered events are not evidence that those
operations necessarily miss restoration.

**Compaction and model memory.** Stored entries are retained by pi compaction
(installed `docs/sessions.md:33-43`), so replay can still find old snapshots.
However this extension has no `before_agent_start`, context injection, or
compaction-specific reminder. Only `list` prints the whole list for the model;
`add` and `toggle` return short messages. `details` supplies rendering/replay,
not a substitute for model-facing `content` (installed `docs/extensions.md:131-148`).
It is therefore possible for durable state and model knowledge to diverge after
compaction **(inferred)**; the safe recovery path available in the example is a
new `todo { action: "list" }` call.

**UI.** `/todos` opens a terminal-only custom viewer showing completed/total and
all IDs; Escape or Ctrl+C closes it. It does not offer interactive toggling,
editing, or deletion. The `list` result renderer shows five items when collapsed
and all when expanded. There is no sticky widget or footer status in this example
(`pi/packages/coding-agent/examples/extensions/todo.ts:38-102,221-297`).

**Snapshot hazard, directly observed in isolation.** Result arrays use
`[...todos]`, but the item objects remain shared. `toggle` mutates `todo.done`.
An isolated source-execution probe retained the first `add` result, toggled its
item, and observed the *earlier result object's* `details.todos[0].done` become
`true`. JSON-serializing and parsing the result before later operations preserved
the earlier value correctly. This demonstrates aliasing in returned objects, not
an established on-disk corruption or end-to-end branch bug
(example: 164-168,191-195). Actual host/UI impact requires a separate spike.

**Workflow authority.** The description lists actions but provides no usage policy
about task complexity, mandatory progress updates, stopping with incomplete work,
or approval. The tool does not decide when implementation may begin. It also has
no shared-subagent protocol (example: 105-297).

### 2. Pi plan-mode tracker is independent

The plan-mode extension registers `/todos` too, but not a `todo` tool. Its items
are `{ step, text, completed }`. It extracts numbered lines after a `Plan:` header,
cleans text, truncates it to 50 characters, and renumbers accepted items. On a UI
execution choice it restores tools, sends an execution message, and asks for
`[DONE:n]` tags. Tags are recognized in assistant text at `turn_end`, not from test
outcomes. All-complete state produces a message and clears the tracker.
Sources: `pi/packages/coding-agent/examples/extensions/plan-mode/utils.ts:103-168`
and `.../plan-mode/index.ts:146-156,230-336`.

This tracker has a footer count and persistent execution widget; remaining steps
are injected before agent starts. It saves custom `plan-mode` entries using
`appendEntry`. Crucially, restoration scans `getEntries()` and the last saved
entry across the file, not `getBranch()`, and no `session_tree` handler is
registered. Its branch semantics should not be assumed equivalent to standalone
`todo` (`pi/packages/coding-agent/examples/extensions/plan-mode/index.ts:59-87,116-123,340-389`).

Both examples use the command name `/todos`. Their coexistence needs command
registration/precedence investigation; this research did not test loading both.
It is a potential integration conflict, not evidence that either example's state
is automatically shared.

### 3. Harness comparison

This matrix summarizes the implementations below. A caller-supplied completion
status does not itself verify real-world work; other product policies, hooks,
or extensions may impose additional checks.

| System | Update and identity | Source of truth / scope | Model feedback or control | Completion meaning |
|---|---|---|---|---|
| pi standalone | Per-item add/toggle; integer ID | Branch tool-result snapshots | Explicit list; no automatic reminder | Caller toggled boolean |
| pi plan-mode example | Text extraction and completion tags | Custom entries; restore scans all entries | Remaining-step injection and UI handoff | Assistant emitted a marker |
| OpenCode historical | Replace array; content/status/priority, no item ID | Session SQL rows + update event | Full JSON output; permission assertion | Caller supplied status |
| OpenCode checked out | Todo removed | Not applicable | Migration warns old callers | Not applicable |
| Codex `update_plan` | Replace step array; no item ID | PlanUpdate event + tool-call history | Short acknowledgement; TUI progress; blocked in Plan mode | Caller supplied status |
| Gemini `write_todos` | Replace array; description/status | Returned display data / CLI history | Full list output; at-most-one validation | Caller supplied status |
| Gemini tracker | Create/update/get/list/dependencies; six-character ID | Per-task project-temp JSON files | Same todo tray as a projection | Dependency closure check, not work verification |
| Kimi `TodoList` | Optional read; replace array; title/status | Per-agent durable wire events | Full list, write reminder, stale reminder, compaction summary | Caller supplied status |
| Qwen `todo_write` | Replace array; string ID and dependencies | Per-session JSON + plan ID | Active reminder, blocking hooks, optional stop guard | Caller assertion, optionally hook-validated |
| Vibe `todo` | Read/replace; string ID, priority | Live tool state; resumed process starts empty | List result and pinned UI | Caller supplied status |
| Crush `todos` | Replace array; transitions matched by content | Persisted session Todos | Counts + metadata; summary prompt includes list | Caller supplied status |
| Goose todo extension | Replace free-form text | Session extension metadata | Automatically supplied planning notes | Explicitly not a closure checklist |

#### 3.1 OpenCode: removal and a pinned historical implementation

Current checkout's V1 migration explicitly lists `todowrite` under removed tools
and tells the model not to call it
(`.references/harnesses/anomalyco/opencode/packages/core/src/database/v1-migration.bun.ts:899-901,918-944`).
Git history identifies removal commit `7feefb697f279fe08677512f08abf72a9f418d5a`
(`refactor: remove todo tool (#35989)`), deleting tool, storage, prompts, tests,
and UI. This is stronger evidence than merely failing to find a file.

**Historical**, at the pinned parent commit:

- `todowrite` accepts the full array, asserts wildcard permission, writes state,
  and returns the full JSON list to the model
  (`.references/harnesses/anomalyco/opencode/packages/core/src/tool/todowrite.ts:10-55`).
- Storage performs a transaction: delete this session's rows, insert the new array
  with positions, then publish `todo.updated`; reads preserve position order
  (`.references/harnesses/anomalyco/opencode/packages/core/src/session/todo.ts:32-73`).
- Schema fields are strings. The status description mentions pending/in_progress/
  completed/cancelled, but the schema is **not an enum**, nor does it enforce
  one active item (`.references/harnesses/anomalyco/opencode/packages/schema/src/session-todo.ts:7-15`).
- Tests cover ordered replacement, clearing, update events, registration, and
  denial leaving persisted state unchanged
  (`.references/harnesses/anomalyco/opencode/packages/core/test/session-todo.test.ts:41-94`;
  `.../packages/core/test/tool-todowrite.test.ts:97-142`).

These historical mechanisms remain useful design references. They are not a
claim that the current OpenCode exposes todo tools or a todo dock.

#### 3.2 Codex: checklist events are not Plan mode

`update_plan` is registered only when `update_plan_enabled`. Its schema accepts an
optional explanation and steps with pending/in_progress/completed states. The
“at most one in_progress” rule is descriptive text; the handler parses the typed
arguments and emits `EventMsg::PlanUpdate` without a count check.
It returns only `Plan updated` to the model. In Plan mode it fails with an explicit
message that it is a TODO/checklist tool, not the planning-mode mechanism.
Sources: `.references/harnesses/openai/codex/codex-rs/core/src/tools/spec_plan.rs:1333-1334`;
`.../core/src/tools/handlers/plan_spec.rs:7-58`;
`.../core/src/tools/handlers/plan.rs:22-44,67-112`;
`.../protocol/src/plan_tool.rs:7-29`.

TUI updates completed/total from the event and adds a plan-update history cell
(`.references/harnesses/openai/codex/codex-rs/tui/src/chatwidget/turn_runtime.rs:572-586`).
This is progress communication, not a task service with a read/list API or stable
item IDs.

Persistence needs qualification: the rollout policy excludes the *PlanUpdate event*
from its durable event representation
(`.references/harnesses/openai/codex/codex-rs/rollout/src/policy.rs:21-36,165-225`).
That does not prove plan text disappears: tool-call arguments can remain in other
history representations. Dedicated checklist restoration, TUI progress after
restart, and compaction recovery were not verified here. Do not label the event
stream itself a durable task database.

#### 3.3 Gemini: simple todos and a separate task tracker

`write_todos` overwrites the full list. It emits a numbered model-visible list and
`returnDisplay: { todos }`. Allowed states are pending/in_progress/completed/
cancelled/blocked; descriptions must be nonblank. The runtime validator rejects
more than one active item but permits zero and an empty list
(`.references/harnesses/google-gemini/gemini-cli/packages/core/src/tools/write-todos.ts:21-70,100-133`).
Tests directly cover these cases and formatting (same directory:
`write-todos.test.ts:15-121`).

The tool itself holds no durable list. `TodoTray` scans CLI history backwards for
a structured result containing `todos`, including tracker-tool results. It renders
a checklist with a full-view toggle; UI tests cover using the most recent list.
Sources: `.references/harnesses/google-gemini/gemini-cli/packages/cli/src/ui/components/messages/Todo.tsx:17-63`;
`.../Todo.test.tsx:124`;
`docs/tools/todos.md:20-26` (within the same repository).
Exact restoration of that display payload after restart was not traced; documented
“session scope” is not proof of full disk round-trip restoration.

**Availability is conditional.** Config enables simple todos only for a
non-preview Gemini 2 model, when tracker is off, subject to the option. Registration
checks that gate. Tracker is separately configurable (default false in Config).
Sources: `.references/harnesses/google-gemini/gemini-cli/packages/core/src/config/config.ts:1146,1302-1306,4090-4106`.

Tracker is not merely another name for replacement todos. It has per-task JSON,
IDs, epic/task/bug types, parents, dependencies, and open/in_progress/blocked/closed
states. It creates and updates individual records. Closing checks that dependencies
exist and are closed; changing dependencies checks cycles. Creation checks the
parent and schema, but does not call those dependency-validation routines, so the
checks should not be generalized to every write path.
Sources: `.references/harnesses/google-gemini/gemini-cli/packages/core/src/services/trackerTypes.ts:9-39`;
`.../services/trackerService.ts:19-63,139-245`.

Config uses `getProjectTempTrackerDir()`, indicating project-temp storage rather
than a branch-specific transcript snapshot (`.../config/config.ts:3050-3056`).
Tracker tools produce the **same todo tray** by projecting task states into todo
states and flattening the hierarchy
(`.references/harnesses/google-gemini/gemini-cli/packages/core/src/tools/trackerTools.ts:38-159`).
Thus identical UI does not imply identical ownership, mutation, or persistence.

#### 3.4 Kimi: durable per-agent list with reminders

The active feature registers `TodoList` and `AgentTodoService`; the package imports
the feature registration. Older `human/todo` code also exists, but the comparison
uses the registered `features/todo` path, not a merge of both implementations.
Sources: `.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/features/todo/todoFeature.ts:1-17`;
`.../src/index.ts:738-740`.

Omitting `todos` reads; supplying an array replaces; `[]` clears. Items contain
nonempty title and pending/in_progress/done state. The schema has no one-active
constraint. The description nevertheless instructs exactly one active item and
forbids marking failing/partial work done. Those are model instructions, not a
runtime completion verifier.
Sources: `.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/features/todo/tools/todo-list/todo-list.ts:7-24`;
`.../todoListTool.ts:31-64`; `.../todo-list.md:1-30`.

The service dispatches `tools.update_store` with an agent ID and `key: todo`.
Its actor is durable and declared undoable; replay filters malformed values.
Tests cover replace/clear, wire records, restart restoration, feature re-provision,
and isolation between main and subagent
(`.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/features/todo/todoService.ts:119-163`;
`.../test/features/todo/sessionTodo.test.ts:47-217`). Full user-facing undo/fork
semantics were not exercised, even though the service opts into undoability.

On first use, the main agent arms a gentle stale-list reminder, gated on active
tool policy. It needs at least ten assistant turns since a write and ten since the
previous reminder. Reads do not count as writes. Subagents have separate state,
but this main-agent stale reminder is not registered for them.
Sources: `.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/features/todo/todoService.ts:43-60,141-163`;
`.../todoListReminder.ts:7-104`;
`.../test/features/todo/todoListReminder.test.ts:55-109`.

Full compaction explicitly appends the current list to its summary, which preserves
model awareness independently of tool storage
(`.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/agent/fullCompaction/fullCompactionService.ts:844-850`).
The live TUI panel caps collapsed output at five items, preferring active items,
early pending work, and recent done work, with expansion available
(`.references/harnesses/MoonshotAI/kimi-code/apps/kimi-code/src/tui/components/chrome/todo-panel.ts:1-147`).

#### 3.5 Qwen: identity, dependency semantics, hooks, and optional continuation

`todo_write` accepts ID/content/status plus optional `blockedBy`. It replaces the
array in `todos/<sessionId>.json` under the runtime base directory using an atomic
write. State also carries a plan ID. Validation enforces unique IDs, meaningful
text, existing nonduplicate dependency references, no self-dependency, and no
cycles. The description says at most one active task, but `validateTodos` does not
count active statuses.
Source: `.references/harnesses/QwenLM/qwen-code/packages/core/src/tools/todoWrite.ts:35-69,73-97,101-273`.

Replacement is not entirely literal: while the old plan has unfinished items,
omitted dependencies on surviving IDs are preserved; explicit `[]` removes them.
Dropping a dependency target filters preserved edges. If preservation introduces
a cycle, the code falls back to caller-supplied edges
(same file: 322-368; tests: `todoWrite.test.ts:493-570`).

Before persistence, TodoCreated/TodoCompleted validation hooks can block the
operation. Post-write hooks occur after durable success; their failures are
reported without pretending the write failed. An unchanged list skips write/hooks
but refreshes the active reminder. The active reminder includes unfinished items,
truncated to 800 characters, and warns that an intermediate success is not task
completion (same source: 277-303,394-425,429-514,516-626).
These are extensible completion gates, not a built-in proof that tests passed.

The daemon/ACP session optionally adds a stop guard: settings must enable both
`experimental.todoStopGuard` and todoWrite, and bare/safe mode disable it
(`.references/harnesses/QwenLM/qwen-code/packages/cli/src/acp-integration/session/session.ts:2493-2526`).
The guard arms from a permitted structured write result, defers for relevant
background input, and permits at most two committed continuation attempts before
exhaustion. Ordinary prompts reset trust; rejected arming suspends the guard.
Its mere existence is not a default behavior claim
(`.../session/daemon-todo-stop-guard.ts:7,62-169,174-252`).

#### 3.6 Other contrasting implementations

**Mistral Vibe.** `todo` has read/write actions and a full replacement array with
stable string ID, content, four statuses including cancelled, and priority.
It enforces unique IDs and a configurable maximum (default 100), not one-active.
Despite the schema description saying todos are required for write, `run` uses
`args.todos or []`, so a write omitting the array clears state.
Source: `.references/harnesses/mistralai/mistral-vibe/vibe/core/tools/builtins/todo.py:22-103,138-160`.
The UI intentionally does not seed the pinned row from resumed history because
the live tool list starts empty in a resumed process
(`.../vibe/cli/textual_ui/app.py:2968-2972`). History can display old activity while
current authoritative state is empty. This is a concrete reason to distinguish
transcript persistence from tracker persistence.

**Crush.** `todos` replaces persisted session state with content/status/active_form.
It validates status values but not one-active. It matches old items by content to
compute just-started/just-completed metadata, so text edits do not behave like
stable-ID updates. The model gets counts and usage guidance rather than a full
list. Sources: `.references/harnesses/charmbracelet/crush/internal/agent/tools/todos.go:17-135`;
`.../internal/session/session.go:198-215,326-365`.
The tool is registered by the coordinator, and the summary prompt includes todo
state for continued tracking
(`.../internal/agent/coordinator.go:894`;
`.../internal/agent/agent.go:2382-2391`). The short description's “exactly one” is
instructional (`.../internal/agent/tools/todos.md:1`).

**Goose.** The platform todo extension has a single text `content` overwrite tool,
not an array of task records. It persists session extension metadata, applies a
configurable character cap (default 50,000), and exposes content through `get_moim`
as planning notes. Instructions explicitly say items never need to be checked off,
closed out, or verified and should not cause completed work to be repeated.
Source: `.references/harnesses/aaif-goose/goose/crates/goose/src/agents/platform_extensions/todo.rs:21-113,163-181`.
The extension is registered in the platform-extension catalog, not necessarily
selected in every session (`.../platform_extensions/mod.rs:51-60`).
This is a persistent scratchpad with a misleadingly familiar name, not a progress
checklist with incomplete-item pressure.

**Claude Code public evidence only.** The checked-in changelog records tool
availability gating by model family and `CLAUDE_CODE_ENABLE_TODO_TOOLS`, plus a fix
for missing task-tracking tools in foreground subagents
(`.references/harnesses/anthropics/claude-code/CHANGELOG.md:848,2278,3277`).
The local `mods/diff` hook names `TodoWrite` as the tool whose latest input carries
a list (`.../mods/diff/hooks/tools/todo-tool.ts:1-4`), but that customization is not
core source. Storage, dependency validation, and completion enforcement of the
closed runtime cannot be established from it and are not filled in by analogy.

### 4. Workflow lists versus project task systems

#### 4.1 Superpowers: todos are a view, the ledger is recovery memory

The current `executing-plans` skill explicitly distinguishes harness todos from
its plan-owned `progress.md` ledger. It creates one todo per plan task, reads task
briefs, marks work in progress, and only marks complete after the completion
contract. After compaction it tells the agent to trust the ledger and Git history,
not recollection. Sources:
`.references/customizations/obra/superpowers/skills/executing-plans/SKILL.md:114-163,165-236`.

Its `task-done` script actually runs a caller-supplied test command and appends a
completion line only when the exit code is zero. A failing command records no
completion. This is runtime enforcement for **ledger writes through that helper**,
not for arbitrary harness todo writes or manual ledger edits. It does not assess
whether the caller chose sufficient tests
(`.references/customizations/obra/superpowers/skills/executing-plans/scripts/task-done:1-52`).

This is a workflow policy plus a tested-command receipt, rather than a replacement
for the harness's todo storage. This research reads the skill as evidence and does
not adopt its execution or approval policy for this workspace.

#### 4.2 Spec Kit: implementation tasks and review checklists have different meanings

`tasks.md` is an explicit file artifact. Its template uses task IDs, story groups,
and `[P]` markers for independent parallel tasks. The implement command reads it,
respects dependency/order rules, and marks completed tasks `[X]`.
Sources: `.references/customizations/github/spec-kit/templates/tasks-template.md:12-20,50-99`;
`.../templates/commands/implement.md:90-96,143-176`.

The same command explicitly treats files under `checklists/` as a **read-only
review gate**. A reviewer check means a requirements-quality criterion is
satisfied, not that implementation is complete. Incomplete checklists require a
user decision before continuing (same command: 56-88). Identical checkbox syntax
therefore carries different authority depending on the artifact.

The template's tests are optional unless requested by the feature specification
(`.../templates/tasks-template.md:12,83-85`). Completion instructions ask for
validation, but checkbox edits alone do not execute or verify tests. The files
survive session changes as filesystem artifacts; safe shared editing/locking was
not investigated.

#### 4.3 Task Master: project data with addressable operations

Task Master documents IDs, descriptions, statuses, dependencies, priorities,
implementation details, testStrategy, subtasks, and metadata
(`.references/customizations/eyaltoledano/claude-task-master/apps/docs/capabilities/task-structure.mdx:8-25`).
Unlike a single session list, its file backend uses project `.taskmaster` storage
and tagged collections. `TasksDomain.updateStatus` delegates to a task service,
which delegates to the selected storage backend
(`.../packages/tm-core/src/modules/storage/adapters/file-storage/path-resolver.ts:14-40`;
`.../modules/tasks/tasks-domain.ts:242-247`;
`.../modules/tasks/services/task-service.ts:719-763`).

In the reviewed file backend, status changes load the collection, find an ID,
update status/timestamp, and save. Subtask updates can adjust the parent to done,
in-progress, or pending according to sibling statuses
(`.references/customizations/eyaltoledano/claude-task-master/packages/tm-core/src/modules/storage/adapters/file-storage/file-storage.ts:448-594`).
That path does not execute `testStrategy`. The existence of verification metadata
must not be interpreted as automatic completion verification. API storage and AI
expansion have different paths and were not exhaustively audited.

**Distinction from delegated work:** a task record is not necessarily a running
agent job. Kimi explicitly scopes todos per agent; Gemini tracker can carry a
subagent-session reference; neither fact turns every task into a dispatch,
completion callback, or shared ownership protocol.

### 5. Enforcement, verification, and design implications

#### What “one active task” actually means

| Implementation | Instruction | Reviewed runtime enforcement |
|---|---|---|
| Gemini simple todos | At most one | Yes, rejects count > 1; zero allowed |
| Codex | At most one | No count check in typed parser/handler |
| Kimi | Exactly one while working | No count constraint in input schema/service |
| Qwen | At most one | No count constraint in validateTodos |
| Crush | Exactly one | Status validation only in tool handler |
| Vibe | Has active status | Unique IDs and max count, no active-count check |
| pi standalone / Goose | No matching state invariant | Not applicable |

These statements are restricted to the reviewed paths cited above. A product's
other policies, hooks, or model instructions can still affect observed behavior.

#### Checks actually executed in this session

All probes ran through Node `v26.10.0`, with no dependency installation or changes
to project/reference source. They were inline commands, not committed test files.

| Probe | Observed result | Limits |
|---|---|---|
| pi source factory with mocked registration/schema/UI dependencies | Add, toggle/reopen, error paths, clear/ID reset, serialized branch replay, empty-branch reset passed; shallow snapshot aliasing observed | No actual SessionManager, provider, transcript persistence, or TUI |
| Gemini source validation method with mocked base classes/declaration dependencies | Empty list accepted; blank description and two active items rejected; blocked status accepted | Not full JSON-schema validation or tool pipeline |
| Qwen pure stop-guard class | Unarmed inactive, background deferral, two committed attempts, exhaustion, ordinary-prompt reset, rejected-arming suspension passed | Constructor parameter property expanded equivalently in memory for Node strip-only support; no ACP daemon integration |

Initial attempts to strip Qwen's parameter property and then use a transform mode
were unsupported by this Node API. The final probe expanded that constructor
syntax in memory; repository content was not changed. No full upstream suite or
interactive TUI/model test was run. Kimi restoration/reminder tests, Gemini tests,
OpenCode historical tests, and selected Qwen test cases were inspected as evidence,
not reported as passing executions.

#### Recommendations, not decisions

A personal pi tracker should first choose its semantic level:

1. **Branch-local progress:** standalone pi is the closest model. Keep snapshots
   branch-aware, but investigate immutable item snapshots and prefer explicit
   status assignment over non-idempotent toggle if retries matter.
2. **Durable agent memory:** Kimi/Goose show that persistence needs an independent
   model-context strategy. Decide whether to inject the list at prompt start,
   append it during compaction, or require explicit reads.
3. **Executable approved plan:** approval and the tracker should not be conflated.
   Define how approved scope, revision, changed membership, and abandoned work
   relate before adding auto-continuation or incomplete-item stop guards.
4. **Project task management:** file tasks, dependencies, subtasks, and ownership
   need more than a session widget. Task Master and Gemini tracker provide richer
   records, with additional synchronization and lifecycle questions.

Across these choices, define completion authority explicitly: caller assertion,
user confirmation, hook approval, or a verifiable test receipt. Also decide how
cancelled/blocked work avoids perpetual unfinished-task pressure. A richer schema
alone does not settle those questions.

## Open questions

- What is the standalone pi snapshot-aliasing effect with real tool-result retention,
  `/tree`, exports, restart, and parallel calls? A focused isolated TUI/core spike
  is warranted before treating the example as production-ready.
- Should a personal list be session/branch-local, per-agent, or project-shared?
  How should it behave on fork, rollback, reset, and explicit abandonment?
- Which restoration paths retain Gemini structured display data and Codex TUI plan
  progress after restart/compaction? Their reviewed tools do not answer that alone.
- Does Kimi's generic undoable actor provide the desired visible list behavior on
  all fork/undo operations? The reviewed tests establish restart and agent isolation,
  not the full UI lifecycle.
- How should `/todos` name conflicts be handled if both pi examples are loaded?
- Should completion be purely informational, test-gated, or user-confirmed?
  Should reminders be gentle, or should unfinished tasks request continuation?
- Closed Claude Code internals, remote-current versions, concurrency/locking of
  project task files, and the Task Master API backend remain outside verified scope.

## References

- Primary examples: `pi/packages/coding-agent/examples/extensions/todo.ts` and
  `plan-mode/{index.ts,utils.ts}`.
- Selected installed pi docs, read in full: `docs/extensions.md`, `docs/sessions.md`,
  and `docs/message-types.md` under the resolved release path above.
- Harness implementation, registration, UI, storage, and test paths are cited in
  their individual findings; all repository snapshots are pinned in frontmatter.
- Historical OpenCode source is recoverable read-only with
  `git -C .references/harnesses/anomalyco/opencode show d4155f290680506d80b76dc7cda5e24820956d3b:<path>`.
- Scope approval plan: `/Users/kkkzzzabc/.pi/plans/20261011-125640-noble-maple.md`.
