---
title: OpenCode plan/build modes
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on: []
sources:
  - repo: opencode
    path: .references/opencode
    version: 2.0.26
    commit: 5caf1f9f6f
---

# OpenCode plan/build modes

## Scope

Implementation-level analysis of how OpenCode V2 implements its `plan` and
`build` primary agents ("modes"). The goal is to inform a future pi extension
with similar behavior; mapping to pi APIs is deliberately left to a plan
document. Only the current V2 code is covered (no V1 comparison, no other
agents). Paths below are relative to `.references/opencode/packages/`.

## Summary

- "Modes" are just **primary agents**. `build` is the default agent; `plan` is
  a second primary agent added by a dedicated internal plugin
  (`core/src/plugin/plan.ts`, 120 lines). There is no mode-specific state
  machine.
- Both agents share **the same system prompt and the same tool set**. The only
  differences are (1) permission rules and (2) `<system-reminder>` messages
  injected into the conversation.
- Plan's read-only guarantee is **narrow**: it denies only the `edit`
  permission (used by `edit`, `write`, `patch`, and `worktree_remove`), except
  inside a global plan directory `~/.opencode/plan/`. Shell commands, web
  access, external directories, and subagents remain allowed by the default
  `* * allow` rule.
- Mode entry/exit is communicated to the model by **synthetic user messages**
  (enter/leave reminders), injected on agent switches and reconciled on every
  request so they survive compaction and reverts.
- Switching is a durable session event (`session.agent.selected`). In the TUI,
  `Shift+Tab` cycles a local draft selection; it is committed to the server
  only when the next prompt is submitted.
- There is **no explicit plan→build handoff**. The plan lives in the
  conversation (or optionally in a file under `~/.opencode/plan/`); switching
  to build simply lifts the restrictions and the same transcript continues.
- Weak points: subagents spawned from plan are restricted only by prompt;
  config and session rules appended later can override plan's deny.

## Questions

1. How are the plan and build agents defined?
2. How is plan's read-only behavior enforced?
3. How do prompts differ between the modes, and how are mode instructions
   delivered to the model?
4. How does the user switch modes, and how is the switch persisted?
5. How is a plan handed off to build?
6. How can users customize or extend these modes?
7. What are the limitations and edge cases?

## Findings

### 1. Agent definitions

**Agent model.** An agent is a record with `id`, `name`, `system?`,
`description?`, `mode` (`primary | subagent | all`), `hidden`, `model?`,
`steps?`, and an ordered `permissions` ruleset
(`schema/src/agent.ts:23-35`). Every new agent starts from a default whose
ruleset is `* * allow` plus `ask` for `*.env` reads
(`schema/src/agent.ts:39-52`).

**Registry.** Agents live in a transformable state; plugins register
`transform` callbacks that are replayed in registration order on rebuild
(`core/src/agent.ts:48-70`, `core/src/state.ts:19`). The default agent is
`build` (`core/src/agent.ts:13`); `selectedDefault()` prefers a configured
`default_agent`, then `build`, then the first selectable agent
(`core/src/agent.ts:76-86`). Selectable means `mode !== "subagent"` and not
hidden (`core/src/agent.ts:74-75`).

**build.** Defined in the built-in agent plugin with only a name, description
("The default agent. Executes tools based on configured permissions."),
`mode: "primary"`, and an explicit `question * allow` rule
(`core/src/plugin/agent.ts:80-85`). No custom system prompt.

**plan.** Defined in its own plugin (`core/src/plugin/plan.ts:33-42`):

| Field | Value |
|---|---|
| name | `Plan` |
| description | "Read-only agent for exploring the codebase and planning work before implementation." |
| mode | `primary` |
| permissions (appended to defaults) | `question * allow`, `edit * deny`, `edit ~/.opencode/plan/* allow` |
| system | not set |

The plan directory is `path.join(global.home, ".opencode", "plan")`
(`core/src/plugin/plan.ts:31`): global, not per-project. It is not created on
activation (test: `core/test/plugin/plan.test.ts:242-247`).

Plugin order: `AgentPlugin` then `PlanPlugin` in the `pre` group;
`ConfigAgentPlugin` runs later in the `post` group
(`core/src/plugin/internal.ts:216-258`).

### 2. Read-only enforcement (permissions)

**Evaluation.** `Permission.evaluate` returns the **last** matching rule
(`findLast`), defaulting to `ask` when nothing matches
(`core/src/permission.ts:87-97`). Wildcards are regex-like and `*` matches
across `/` (`core/src/util/wildcard.ts:3-13`), so `~/.opencode/plan/*` covers
nested files.

**Effective rules.** A request is evaluated against agent rules followed by
session rules (`core/src/permission.ts:158-163`). Deny is checked first against
these configured rules only; saved "always allow" approvals are added
afterward (`core/src/permission.ts:173-189`). Consequence: a user's saved
approval cannot override plan's `edit` deny. A `permission.evaluate` plugin
hook can still alter the final effect (`core/src/permission.ts:179-188`).

**Which tools are blocked.** `edit`, `write`, and `patch` all assert the
`edit` action on the target resource
(`core/src/tool/plugin/edit.ts:180-188`, `write.ts:78-86`, `patch.ts:197`),
as does `worktree_remove` (`core/src/tool/plugin/opencode.ts:187-200`). The
resource is a project-relative path for files inside the project and an
absolute path otherwise (`core/src/file-access.ts:93-122`); so `edit * deny`
catches both, and only absolute paths under the plan directory match the
allow rule (tests: `core/test/plugin/plan.test.ts:249-258`).

**What is not blocked.** Everything else inherits `* * allow`:

- `shell`: asserts an action named after the tool with the parsed commands as
  resources (`core/src/tool/plugin/shell.ts:136-145`). No plan rule matches it,
  so shell commands (including file-writing ones) are allowed. Plan relies on
  the reminder text for restraint here.
- `external_directory`: allowed (test: `core/test/plugin/plan.test.ts:260-268`).
- `subagent`, `webfetch`, `websearch`, `read`, `grep`, `glob`: allowed.

**Tool visibility.** Tools are removed from the model's tool list only when
the last rule for their permission is a deny on `*`
(`core/src/tool.ts:228-233`, `core/src/tool.ts:292-295`). For plan, the last
`edit` rule is the plan-directory allow, so `edit`/`write`/`patch` **remain
visible** and fail at call time.

**Error rewriting.** When `edit`/`write`/`patch` fail with
`Permission.BlockedError` under the plan agent, an `execute.after` tool hook
replaces the error with "Cannot use <tool> to modify files outside the Plan
directory: <dir>" (`core/src/plugin/plan.ts:44-53`). Other failures are left
alone (test: `core/test/plugin/plan.test.ts:292-300`).

### 3. Prompts and reminders

**Same system prompt.** The request system part is `agent.system` if set,
otherwise the generic `SessionSystemPrompt` built from tool names
(`core/src/session/model-request.ts:100-119`). Neither build nor plan sets
`system`, so both get the same base prompt and the same instructions bundle
(`core/src/session/context.ts:121-161`).

**Enter reminder** (`core/src/plugin/plan.ts:14-21`), paraphrased:

- You are in Plan mode; discuss the plan in the conversation.
- Do not create/update plan files unless asked; if asked, write only in the
  plan directory.
- Do not modify other files or ask a subagent to do so.
- Stay in Plan mode until the user switches agents; refuse implementation
  requests and tell the user to switch.

**Leave reminder** (`core/src/plugin/plan.ts:23-25`): you are no longer in
Plan mode; earlier Plan instructions no longer apply.

**Delivery, path 1: on events.** The plugin subscribes to `session.created`
and `session.agent.selected` (`core/src/plugin/plan.ts:75-95`). It emits the
enter reminder when a session is created with plan or switches into plan, and
the leave reminder when switching out of plan; switches to the same agent are
ignored (`core/src/plugin/plan.ts:100-112`). Reminders are persisted with
`session.synthetic(..., resume: false)`, which admits a synthetic user input
without starting a run (`core/src/session/session.ts:273-300`).

**Delivery, path 2: per-request reconciliation.** A `context` hook runs before
every model request (`core/src/session/model-request.ts:420-425`). It finds the
last *standalone* reminder in the transcript (a user message whose single text
part equals a reminder exactly; quoted text does not count) and:

- inserts the enter reminder if the agent is plan but the last reminder is not
  the enter reminder;
- inserts the leave reminder if the agent is not plan but the last reminder is
  the enter reminder.

The reminder is spliced just before the latest user prompt (or appended) to
keep the cached prefix stable, and also persisted
(`core/src/plugin/plan.ts:55-73`, `core/src/plugin/plan.ts:114-120`). The
comment states the reason: compaction and reverts can strip reminders while
the agent stays the same. Behavior is covered by
`core/test/plugin/plan.test.ts:157-239`.

**Agent switches are invisible to the model otherwise.** The
`agent-switched` history message maps to no LLM message
(`core/src/session/runner/to-llm-message.ts:255-257`); the reminders are the
only model-facing signal.

### 4. Switching modes

**Server.** `Session.switchAgent` publishes a durable
`session.agent.selected` event carrying `agent` and `previous`
(`core/src/session/session.ts:89-95`, `schema/src/session-event.ts:69-77`).
It is exposed as the `session.switchAgent` handler
(`server/src/handlers/session.ts:241-244`). The projector stores the agent on
the session, and the message updater appends an `agent-switched` message to
history (`core/src/session/message-updater.ts:91-102`).

**TUI.** `agent.cycle` is bound to `Shift+Tab`, `agent.cycle.reverse` is
unbound by default (`tui/src/config/keybind.ts:172-173`). Cycling walks
primary, non-hidden agents in order (`tui/src/context/local.tsx:114-124`,
`57-59`). The choice is stored as a per-session **draft**
(`tui/src/context/local.tsx:97-112`) and committed via `switchAgent` only on
prompt submission, before the model selection is committed
(`tui/src/component/prompt/index.tsx:1273-1293`). A blank Enter commits the
selection without sending a prompt (`tui/src/component/prompt/index.tsx:1294-1298`).
When the agent changes, the current model choice is remembered per agent
(`tui/src/context/local.tsx:104-111`) (inferred: per-agent model memory).

**Defaults.** New sessions use the configured `default_agent` or `build`
(`core/src/agent.ts:76-86`); the config key is read in
`core/src/config/plugin/agent.ts:88-89`.

### 5. Plan → build handoff

There is no handoff mechanism, plan-exit tool, or approval step in V2
(no `plan_exit`/`plan_enter` symbols in the packages). The flow is:

1. In plan, the model discusses the plan in the conversation; plan files are
   written to `~/.opencode/plan/` only on explicit user request.
2. The user switches to build (`Shift+Tab`, then submits).
3. The leave reminder is injected; build continues in the **same transcript**
   with full permissions and sees the earlier plan discussion as context.

### 6. Customization

- **Config agents.** `agents.<id>` (and V1 `agent`/`mode` keys, normalized in
  `core/src/config/normalize.ts:134-156`) can set model, request options,
  `system`, description, mode, hidden, color, steps, and append permissions,
  or remove the agent via `disabled` (`core/src/config/plugin/agent.ts:94-125`).
  Markdown files under `{agent,agents,mode,modes}/` define agents too; e.g.
  `modes/plan.md` sets plan's `system` (test:
  `core/test/config/agent.test.ts:473-503`).
- **Global permissions.** Top-level config permissions are appended to **every**
  agent after built-in rules (`core/src/config/plugin/agent.ts:84-92`).
- **Default agent.** `default_agent` config key.
- **Plugins.** The plan feature itself is a plugin that uses only public
  plugin surfaces: `agent.transform`, `tool.hook("execute.after")`,
  `session.hook("context")`, `event.subscribe`, and `session.synthetic`.
- **Session permissions.** Sessions may carry their own rules
  (`Session.setPermissions`, `core/src/session/session.ts:82-88`), merged after
  agent rules; child sessions inherit them (`core/src/session.ts:285-288`).

### 7. Limitations and edge cases

- **Shell is unrestricted in plan.** `rm`, `sed -i`, `git commit`, redirects,
  etc. are allowed by `* * allow`; only the reminder discourages them.
- **Subagents bypass plan permissions.** `subagent` is allowed; the child
  session runs with the *subagent's* agent rules (e.g. `general` keeps
  `* * allow`) and inherits only session-level rules, not the parent agent's
  (`core/src/tool/plugin/subagent.ts:184-197`, `core/src/session.ts:285-288`).
  "Do not ask a subagent to modify files" is prompt-only.
- **Later rules can override plan's deny.** Because evaluation is
  last-match-wins and config permissions are appended after the plan plugin
  runs, a config rule such as `edit * allow` would re-enable edits in plan.
  Session rules come later still (inferred from rule ordering; not tested).
- **Blocked tools stay visible**, so the model may attempt edits and receive
  the rewritten error instead of not having the tool at all.
- **Plan directory is global**, shared by all projects, with no naming
  convention or index.
- **Reminder matching is by exact text.** The directory is embedded in the
  enter reminder; if the home directory changes, an old enter reminder no
  longer matches and the reconcile logic treats the transcript as having no
  live reminder (inferred).

## Open questions

- How does the generic `SessionSystemPrompt` describe agents, if at all? Not
  reviewed (`core/src/session/system-prompt.ts`).
- How does the desktop/web app (`packages/app`) expose mode switching?
- Is there any UI that surfaces files in `~/.opencode/plan/`?
- Exact behavior of `delivery: "steer"` for synthetic inputs while a run is
  active (`core/src/session/inbox.ts`).

## References

- `core/src/plugin/plan.ts`: entire plan feature
- `core/src/plugin/agent.ts`: built-in agents (build, general, explore, hidden)
- `core/src/agent.ts`, `schema/src/agent.ts`: agent registry and schema
- `core/src/permission.ts`, `core/src/util/wildcard.ts`: rule evaluation
- `core/src/tool.ts`: tool visibility filtering
- `core/src/tool/plugin/{edit,write,patch,shell,subagent,opencode}.ts`
- `core/src/file-access.ts`: permission resource paths
- `core/src/session/{session,context,model-request,message-updater}.ts`,
  `core/src/session/runner/to-llm-message.ts`, `core/src/session.ts`
- `core/src/config/plugin/agent.ts`, `core/src/plugin/internal.ts`
- `tui/src/config/keybind.ts`, `tui/src/context/local.tsx`,
  `tui/src/component/prompt/index.tsx`
- Tests: `core/test/plugin/plan.test.ts`, `core/test/config/agent.test.ts`
