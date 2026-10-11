---
title: pi-subagents architecture and design analysis
date: 2026-10-11
session: 01a128d8-5cfb-767b-ad59-fc905ec35d3a
based_on: []
sources:
  - repo: nicobailon/pi-subagents
    path: .references/pi-packages/nicobailon/pi-subagents
    version: 0.77.0
    commit: 69673c7
  - repo: nicobailon/pi-subagents
    url: https://github.com/nicobailon/pi-subagents/issues
    accessed: 2026-10-11
---

# pi-subagents architecture and design analysis

## Scope

This research supports building subagent delegation in this repository by
studying how `nicobailon/pi-subagents` implements it. It does not decide
whether to install the package as-is.

- In scope: the whole package. This covers child launch (foreground and
  background), agent definitions and builtin roles, prompt and context
  assembly, tool, extension, and permission limits, recursion limits, model
  selection, result handoff, workflows and parallelism, child-to-parent
  coordination, evidence and observability, and the pi extension API
  patterns the package relies on.
- Out of scope: comparison with other harnesses and with this repository's
  earlier reviewer spike. External CLI runners (Claude Code, Codex, Cursor),
  Herdr remote machines, missions and schedules, and TUI rendering are only
  summarized.
- Depth: detailed, with citations into the pinned source. The package has
  about 108k lines of TypeScript under `src/`, so the study read the
  documented contracts and then checked the core mechanisms in the source.
  It did not trace every code path. Nothing was installed or executed.
- Usage (questions 12-13): the documented intent comes from the pinned
  source. Observed usage comes from a keyword survey of the repository's
  GitHub issues through the GitHub API (read only), plus a reading of
  selected issues. The limits of that survey are listed in finding 13.

## Summary

- **Children are SDK sessions, not `pi` subprocesses.** A foreground child is
  an `AgentSession` created with `createAgentSession` inside the parent pi
  process. A background child is the same kind of session inside a detached
  Node "runner" process that the parent spawns and communicates with through
  files.
- **Isolation is assembled explicitly.** Each child gets a fresh resource
  loader with its own tool allowlist, extension list, skills, and context
  files. Inline hook extensions rewrite the child's system prompt, strip
  parent-only messages from its context, and append a "you are a child"
  boundary. Custom agents start with a replaced (clean) system prompt by
  default.
- **Recursion is denied by default.** A child gets the `subagent` tool only
  when its resolved tools include `subagent`. A depth guard (default 2) and
  spawn budgets also apply. When the extension is loaded inside a runner
  process, an environment flag keeps it inert.
- **Results are the child's last assistant text.** Foreground results come
  back as the tool result. Background results are written to a result file;
  a watcher turns the file into a `sendMessage` custom message with
  `triggerTurn`, which wakes the parent.
- **Orchestration is code.** Sequences and fan-out are expressed as a
  JavaScript "workflow script" that runs in a `node:vm` context inside a
  worker thread, with a small `runs.*` API. Legacy declarative chains were
  removed.
- **Authority and cost are first-class.** Delegation must be authorized by
  the user or their instructions; complexity alone never authorizes it.
  Tool schemas are hidden behind a loader tool, and declarations are
  "pinned", to protect the provider prompt cache.
- **Mostly review and read-only work, invoked on request.** The bundled
  recipes center on parallel review, review loops, research, and context
  gathering. Children are launched only when the user or their instructions
  ask; nothing launches subagents automatically. In the issues, `worker`
  (implementation, usually async) is the most-named role, followed by
  `delegate`, `reviewer`, and `scout`.
- **The size comes from hardening.** Most of the code covers lifecycle
  recovery, fail-closed checks, observability, and integrations. The core
  launch path (child session factory, tool plan, prompt runtime) is a small
  part of it.

## Questions

1. What is the overall architecture and footprint?
2. How are child agents launched in the foreground and the background?
3. How are agents defined, discovered, and overridden, and what do the
   builtin roles look like?
4. How is the child's prompt and context assembled, and how do fresh and
   forked contexts differ?
5. How are tools, extensions, and permissions limited, and how is recursion
   bounded?
6. How is the child model selected?
7. How do results reach the parent, and how is the parent woken?
8. How do sequences, parallelism, and workflows work?
9. How do children and the parent communicate during a run?
10. Which pi extension API patterns does the package rely on?
11. What evidence, acceptance, and observability mechanisms exist?
12. What are subagents intended for, and what invokes them?
13. How do users actually use them, as far as GitHub issues show?

## Findings

### 1. Architecture and footprint

- The package is a pi package with one extension, a parent-only skill, and
  prompt templates (`.references/pi-packages/nicobailon/pi-subagents/package.json:69-80`).
  Pi packages are peer dependencies; runtime dependencies are `acorn`,
  `jiti`, `undici`, `yaml`, and a Temporal polyfill
  (`.references/pi-packages/nicobailon/pi-subagents/package.json:81-110`).
- The extension entry chooses one of three behaviors. It registers a
  Herdr bridge in Herdr pane mode. It registers nothing in a child runner
  process (`PI_SUBAGENT_CHILD=1`). Otherwise it registers the full
  extension. It also refuses to run when the installed version differs from
  the loaded one, because `/reload` cannot replace loaded Node modules
  (`.references/pi-packages/nicobailon/pi-subagents/index.ts:6-18`).
- `src/` holds about 108k lines. `src/runs/` alone is about 58k lines. The
  two largest files are `subagent-executor.ts` (8,151 lines) and
  `subagent-runner.ts` (5,222 lines). There are 553 test files (observed with
  `wc -l` and `find`).
- The product boundary is stated in `VISION.md`: one parent orchestrates and
  decides; children get bounded contracts; completion requires evidence;
  background work must stay visible; no reviewer runs on every edit by
  default (`.references/pi-packages/nicobailon/pi-subagents/VISION.md:10-28`,
  `.references/pi-packages/nicobailon/pi-subagents/VISION.md:81-89`).

### 2. Child launch: foreground and background

**Foreground (in-process).**

- A child is a pi `AgentSession` created inside the owning process. The
  factory wraps `createAgentSession` from the host's pi package
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:1-9`).
- Each launch builds a `DefaultResourceLoader` with per-child options:
  `noExtensions`, `noSkills`, `noContextFiles`, extra extension paths,
  inline hook factories, and a `systemPrompt` or `appendSystemPrompt`
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:455-478`).
- The session is created with the resolved model, thinking level, tool
  allowlist, and exclusions, then bound in `print` mode
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:523-560`).
- The run is driven by `session.prompt("Task: <task>")`
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/foreground/execution.ts:1451`).
  Steer, follow-up, and abort map to the matching session methods
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:583-608`).
- **Shared-process workarounds.**
  - Launches are serialized from environment application through
    `session_start` (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:230-231`).
  - A private loader flag is set to force a fresh extension module cache per
    child (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:233-245`).
  - The theme is not reinitialized, so the parent's theme is not
    overwritten (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:439-444`).
  - The parent's registered providers are copied into the child's model
    runtime, so provider extensions do not have to load twice
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:166-190`,
    `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:501`).
- Foreground children never load the parent's ambient extensions. Loading
  them would start a second copy of every extension, including
  pi-subagents itself. As a result, ambient MCP adapters and similar tools
  are available only to background children
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:520`).

**Background (detached runner).**

- The parent spawns a runner with `node [--experimental-strip-types] runner
  cfgPath`, or through jiti, or as a compiled pi binary in RPC mode. The
  spawn uses `detached: true` (except on Windows) and `unref()`, and
  stdout/stderr go to log files
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/background/async-execution.ts:767-792`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/background-process-options.ts:1-9`).
- The runner sets `PI_SUBAGENT_CHILD=1` before it loads anything, so an
  ambient copy of pi-subagents in its sessions stays inert
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/background/subagent-runner.ts:170`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-runtime-config.ts:11-16`).
- All coordination goes through files under
  `<tmp>/pi-subagents-<scope>/`: `async-subagent-runs/<id>/status.json`,
  `events.jsonl`, output logs, control inboxes, startup handshake files, and
  `async-subagent-results/<id>.json`
  (`.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2873-2877`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/observability.md:191-212`).
- Launch is guarded by a startup handshake, initial status persistence, and
  "process-terminal proof" sidecars. A failure before the runner is told to
  proceed terminates the runner and records the error
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/background/async-execution.ts:870-940`).
- Background is the default: `asyncByDefault` is true unless set to `false`
  (`.references/pi-packages/nicobailon/pi-subagents/src/extension/config.ts:241-243`).
  The guidance is to launch async and consume each result when a later step
  needs it (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:15`).
- An optional `launcher` wraps the runner command, for example in a sandbox.
  Only user config defines what a launcher runs; agent files can only name
  one (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:285-334`).

### 3. Agent definitions, discovery, and builtin roles

- An agent is a Markdown file: YAML frontmatter plus a system-prompt body
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:1-13`).
- **Discovery order**, lowest to highest priority: builtin, installed
  package, user `~/.pi/agent/agents/**`, project `.pi/agents/**` (plus
  legacy `.agents/`). Project agents are ignored when the session declined
  project trust
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:15-35`).
- **Frontmatter** covers:
  - routing: `description`, `aliases`, `advertise`
  - capability: `tools`, `excludeTools`, `extensions`,
    `subagentOnlyExtensions`, `allowNestedSubagents`, `allowedAgents`,
    `maxSubagentDepth`
  - model: `model`, `thinking`
  - context: `systemPromptMode`, `inheritProjectContext`,
    `inheritGlobalContext`, `inheritSkills`, `defaultContext`, `skills`,
    `skillPath`
  - output: `output`, `defaultReads`, `defaultProgress`
  - execution: `async`, `timeoutMs`, `toolTimeoutMs`, `acceptance`,
    `acceptanceRole`, `memory`, `launcher`

  See `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:362-446`
  and the parsed shape at
  `.references/pi-packages/nicobailon/pi-subagents/src/agents/agents.ts:137-201`.
- **Code defaults are narrow.** `systemPromptMode` is `replace` except for
  `delegate`. Project context is inherited only by `delegate`. Skills are
  not inherited
  (`.references/pi-packages/nicobailon/pi-subagents/src/agents/agents.ts:48-58`).
  The builtin files opt back in to project context explicitly (for example
  `.references/pi-packages/nicobailon/pi-subagents/agents/reviewer.md:7`).
- **Overrides without copying.** `subagents.agentOverrides.<name>` in user or
  project `settings.json` can replace selected fields, including model,
  tools, prompt, and `disabled`. Tool actions such as `eject`, `disable`, and
  `reset` manage those overrides
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:220-260`).
- **Builtin roles.** These are the role frontmatter, observed in
  `agents/*.md`:

  | Role | Tools | Context default | Notes |
  |---|---|---|---|
  | `scout` | read, grep, find, ls, bash, write, contact_supervisor | fresh | Writes `context.md`; thinking low |
  | `reviewer` | read, grep, find, ls, watchdog_diff, contact_supervisor | fresh | No shell or edits; P0/P1/P2 findings plus a merge verdict |
  | `worker` | read, grep, find, ls, bash, edit, write, contact_supervisor | `fresh` | `acceptanceRole: writer`; escalates unapproved decisions |
  | `oracle` (`advisor`) | read, grep, find, ls, bash | `fork` | Advisory critique without edits |
  | `delegate` | read, grep, find, ls, bash, edit, write, contact_supervisor | fresh | `systemPromptMode: append` |

- **A discrepancy.** The README describes `reviewer` as "Code review and
  small fixes"
  (`.references/pi-packages/nicobailon/pi-subagents/README.md:65`). The role
  file grants no edit or shell tools and says "Do not use shell commands,
  mutate the repository"
  (`.references/pi-packages/nicobailon/pi-subagents/agents/reviewer.md:4`,
  `.references/pi-packages/nicobailon/pi-subagents/agents/reviewer.md:25`).
  The frontmatter is authoritative at runtime (inferred).
- **Parent-side discovery is opt-in.** `advertise: true` adds a bounded
  catalog (16 agents, 12 KiB) to the parent prompt as a prompt section, so
  cached prompts survive mid-session changes
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:336-344`).
- **Per-agent memory is opt-in.** The first 200 lines of a role-scoped
  `MEMORY.md` are injected. The memory is read-only for agents without write
  tools (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:457-481`).

### 4. Prompt and context assembly; fresh and forked contexts

- **Prompt rewriting.** An inline "prompt runtime" extension is loaded first
  and a "prompt boundary" extension last
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:196-204`).
  - In `before_agent_start`, the runtime filters `systemPromptOptions` in
    place. It drops context files and skills unless inherited, and always
    removes the parent-only `pi-subagents` skill
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:236-243`,
    `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:582-597`).
  - The boundary hook then appends the child boundary text
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:250-256`).
- **Boundary text.** A normal child is told it is not the orchestrator and
  must not propose or run subagents. A fan-out child is told it may use
  `subagent` only for the fan-out its task requested
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:39-54`).
- **Context filtering.** A `context` hook removes parent-only custom message
  types and earlier `subagent` tool calls and results from the child's
  messages. It also sanitizes tool IDs for some provider APIs
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:56-64`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:340-360`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:558-568`).
- **Fresh vs fork.**
  - `fresh` starts an empty child session.
  - `fork` branches the parent's persisted session at its current leaf with
    `createBranchedSession`. The new file goes in
    `<parent-session>/forks/`, so `pi -c` does not pick it up as the most
    recent session. Signed Anthropic thinking blocks are stripped
    (`.references/pi-packages/nicobailon/pi-subagents/src/shared/fork-context.ts:142-221`).
  - An explicit `fork` fails if the parent has no persisted session or leaf.
    A default `fork` falls back to `fresh`
    (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:130-136`).
  - Forked tasks are wrapped in a preamble that tells the child to treat
    history as reference only
    (`.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2901-2905`,
    `.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2930-2936`).
- **Pruned forks.** An optional `forkContext.mode: "pruned"` keeps up to
  64 KiB of the inherited session exactly. Items beyond that budget are
  summarized by a configured model. Any failure stops the launch; there is
  no fallback to a full fork
  (`.references/pi-packages/nicobailon/pi-subagents/docs/configuration.md:258-273`,
  `.references/pi-packages/nicobailon/pi-subagents/src/shared/pruned-fork.ts:12-25`).
- **Skills.** Selected skills are listed in the child prompt as
  `<available_skills>` entries. `read` is added automatically when a strict
  tool allowlist would otherwise block loading them
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:566-610`).

### 5. Tools, extensions, permissions, and recursion

- **The tool plan** is computed in one pure function,
  `resolvePiLaunchToolPlan`
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-tool-plan.ts:289-516`).
  - A `tools` list is a strict allowlist. Omitting `tools` keeps pi's
    default builtins. An empty `tools:` gives no tools.
  - `excludeTools` is applied afterwards. Path-like entries are treated as
    extension paths. `mcp:` entries select direct MCP tools
    (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:506-536`).
  - An allowlisted name does not load its provider. Before the first turn,
    every explicit tool is checked against the final registry, and a missing
    one fails the run with guidance
    (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:564`,
    `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:534-539`).
- **Extensions.** Omitting `extensions` keeps ambient discovery (background
  children only). A listed value disables ambient discovery and loads
  exactly those extensions. `subagentOnlyExtensions` adds paths only for
  that agent's children. The runtime hook extensions are always added
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-tool-plan.ts:408-444`).
- **Fan-out authorization.** A child can delegate only if its effective
  tools include `subagent` or `allowNestedSubagents: true`. Only then is the
  child-side `fanout-child` extension loaded
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-tool-plan.ts:330-334`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-tool-plan.ts:408-413`).
  `allowedAgents` narrows which roles it can launch and cannot widen an
  inherited restriction
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:421`).
- **Depth guard.** The default maximum depth is 2 (main → child →
  grandchild). `PI_SUBAGENT_MAX_DEPTH` sets it for the top-level parent;
  config and agent frontmatter can only tighten it, and children inherit the
  limit through their runtime config
  (`.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2898`,
  `.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2939-2992`).
  The executor checks it before launching
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/foreground/subagent-executor.ts:7403`).
- **Budgets.** Separate limits cover active concurrency, a cumulative spawn
  budget per session, and `maxSubagentSpawnsPerRun` (default 64)
  (`.references/pi-packages/nicobailon/pi-subagents/README.md:103`).
  Defaults are 8 parallel tasks and a concurrency of 4
  (`.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts:2870-2871`).
- **Runtime gates in the child.** These are installed as `tool_call` hooks:
  - Permission rules can allow, deny, or ask a watchdog arbiter. The arbiter
    fails closed on timeout or error
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:372-419`).
  - Tool budgets send a soft nudge as a steer message and then block tools
    at the hard limit
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:421-441`).
- **Capability ceilings.** A host extension can impose a ceiling that is
  intersected with the agent's own limits. The ceiling can restrict tools,
  agents, or extensions
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-tool-plan.ts:292-327`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/extension-api.md:371-404`).

### 6. Model selection

- **Precedence**, strongest first: per-run override, provider-scoped role
  override, `agentOverrides.<name>.model`, frontmatter `model`,
  `subagents.defaultModel`, then the parent session model. Builtins pin no
  provider model, so by default they inherit the parent's model
  (`.references/pi-packages/nicobailon/pi-subagents/docs/models.md:5-16`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/model-resolution.ts:400-424`).
- A `:level` suffix sets the thinking level. `subagents.maxThinking` is a
  hard ceiling, checked before launch
  (`.references/pi-packages/nicobailon/pi-subagents/docs/models.md:108-139`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/foreground/execution.ts:360-363`).
- In the child, the model string is resolved with pi's own `resolveCliModel`
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:523-526`).
- **No automatic fallback.** Each launch resolves one model, and provider
  errors, including 429s, are returned as-is
  (`.references/pi-packages/nicobailon/pi-subagents/docs/models.md:18`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/models.md:106`).
- **Policy.** `subagents.modelScope` can enforce glob allowlists globally and
  per agent. By default it warns for configured or inherited models and
  rejects explicitly requested out-of-scope models; `strict` rejects all
  of them
  (`.references/pi-packages/nicobailon/pi-subagents/docs/models.md:191-223`).

### 7. Result handoff and parent wake-up

- **Output.** A child's output is the text of its last non-error assistant
  message
  (`.references/pi-packages/nicobailon/pi-subagents/src/shared/utils.ts:249-280`).
  By default, output longer than 2,000 characters is returned as its
  first 2,000 characters plus the path, size, and line count of the file
  that holds all of it. Output with no readable file stays whole
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/single-output.ts:168-204`).
  This default arrived in v0.77.0 to cut long reports, about 38,000
  characters each, from the parent context
  (`.references/pi-packages/nicobailon/pi-subagents/CHANGELOG.md:47`).
  The docs still describe the inline path as uncapped
  (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:159-163`),
  which appears outdated (inferred). `outputMode: "file-only"` returns
  only a file reference.
  An `outputSchema` adds a `structured_output` tool that the child must call
  last (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:33-37`).
- **Foreground.** The result is returned as the `subagent` tool result.
- **Background.** The runner writes `<resultsDir>/<runId>.json`. The
  parent's watcher sends it as a `subagent-notify` custom message through
  `pi.sendMessage(..., { triggerTurn })`. The file is deleted only after
  `sendMessage` accepts the message
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/background/notify.ts:1-7`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/background/notify.ts:642-680`).
- **Wake-up instruction.** The wake-up message tells the parent to resume
  the already-authorized task, not to infer new authorization. If the user
  stopped the parent with Esc, the message only reports results at the next
  prompt
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/background/notify.ts:640-641`,
  `.references/pi-packages/nicobailon/pi-subagents/CHANGELOG.md:7`).
- **Waiting.** `bg_wait` exists for background work without native
  notifications. The parent skill tells the model not to poll ordinary async
  children (`.references/pi-packages/nicobailon/pi-subagents/skills/pi-subagents/SKILL.md:69-80`).

### 8. Sequences, parallelism, and workflows

- **Launch shapes.** A direct `{ agent, task }` call runs one child. Anything
  more is a workflow script: a JavaScript statement body using
  `runs.run(key, …)`, `runs.all([...])`, `runs.lanes([...])`, and
  `runs.steer(...)`. The script is supplied as a ```` ```js workflow ````
  block in the same assistant reply as `subagent({ workflow: true })`, as a
  file path, or as a named resource
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:50-66`).
- **Sandbox.** Scripts run in a worker thread inside
  `vm.createContext(…, { codeGeneration: { strings: false, wasm: false } })`
  (`.references/pi-packages/nicobailon/pi-subagents/src/workflows/scripted-workflow.ts:1017-1025`,
  `.references/pi-packages/nicobailon/pi-subagents/src/workflows/scripted-workflow.ts:2145`).
  - They have no filesystem, shell, or Pi tools. Only named resources can
    grant `runs.host` command authority
    (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:64`,
    `.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:104-116`).
  - Nested async functions are rejected so that launch tracking stays
    portable (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:54`, `.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:163`).
- **Static validation.** `action: "validate"` checks syntax, literal keys,
  and literal agent names without launching anything
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:74-80`, `.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:148`).
- **Without a script.** The builtin `parallel` named workflow runs a list of
  `{ agent, task }` items in one batch. The changelog says it was added
  because models found writing scripts costly
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:116`,
  `.references/pi-packages/nicobailon/pi-subagents/CHANGELOG.md:30`).
- **Removed shapes.** Legacy top-level `chain`/`tasks`/`parallel` and
  `.chain.md` execution were removed in favor of scripts
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:367-372`).
- **Worktree isolation.** With `worktree: true`, each writer gets a managed
  git worktree from a clean HEAD. Its patch and handoff manifest are
  captured, and the worktree is removed afterwards. Dirty sources are
  rejected before any child starts
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:442-464`).
- **Retained children.** A completed child can be resumed with a follow-up
  (`resume` instead of `agent`). It keeps its stored agent, model, and tool
  contract
  (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:169-188`).

### 9. Communication during a run

- **Child to parent.** Children get a `contact_supervisor` tool with reasons
  `need_decision`, `interview_request`, and `progress_update`. The parent
  answers with `subagent_supervisor({ action: "reply" })`. Requests are
  scoped to the exact parent session ID
  (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:495-519`).
  - The transport is request and reply files under
    `<tmp>/supervisor-channels/`. The default timeout for a question is
    10 minutes
    (`.references/pi-packages/nicobailon/pi-subagents/src/intercom/native-supervisor-channel.ts:20-26`,
    `.references/pi-packages/nicobailon/pi-subagents/src/intercom/native-supervisor-channel.ts:263-266`).
  - In A → B → C, C's question belongs to B, not A
    (`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:525`).
- **Parent to child.**
  - Steering in the foreground uses the session's `steer` and `followUp`.
  - Steering in the background uses a file control inbox and reports
    correlated consumption, not just inbox acceptance
    (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:138-145`).
  - Steering text is framed as guidance to incorporate "at the next safe
    point"
    (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:362-370`).

### 10. pi extension API patterns used

- **Delayed tool exposure.**
  - In the default `auto` mode, a fresh session exposes a small
    `subagents_enable` tool instead of the large `subagent` schema, but only
    when the model's compat flags show that it can accept new tools in the
    middle of a conversation without losing the prompt cache.
  - The loader calls `pi.setActiveTools` so that `subagent` appears on the
    next request. The selection is replayed from the session's tool-change
    records on resume
    (`.references/pi-packages/nicobailon/pi-subagents/src/extension/tool-activation.ts:28-83`,
    `.references/pi-packages/nicobailon/pi-subagents/src/extension/tool-activation.ts:100-146`,
    `.references/pi-packages/nicobailon/pi-subagents/docs/configuration.md:81-101`).
  - The loader's own description repeats the authorization rule
    (`.references/pi-packages/nicobailon/pi-subagents/src/extension/tool-activation.ts:103-104`).
- **Declaration pinning.** A session keeps the tool definitions and prompt
  sections it already declared. An upgrade then does not change the
  declarations and cost the session its cache
  (`.references/pi-packages/nicobailon/pi-subagents/src/extension/declaration-pinning.ts:6-10`,
  `.references/pi-packages/nicobailon/pi-subagents/src/extension/declaration-pinning.ts:45-51`).
- **Events used in the parent.** `before_agent_start`, `agent_start`,
  `agent_end`, `agent_settled`, `message_start`, `tool_result`,
  `session_start`, `session_shutdown`, `session_before_compact`, and
  `session_compact`, plus `pi.events` for internal async events
  (`.references/pi-packages/nicobailon/pi-subagents/src/extension/index.ts:714-1154`).
- **Events used in the child.** `before_agent_start` filters the prompt,
  `context` filters messages, `tool_call` enforces gates,
  `before_provider_request` rewrites the cache key, and
  `agent_start`/`agent_end` handle diagnostics and drain
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/subagent-prompt-runtime.ts:486-598`).
- **Other surfaces.** The package also registers message renderers for its
  custom message types, about 20 slash commands (`/run`, `/subagents`,
  `/subagents-fleet`, `/subagents-doctor`, `/prompt-workflow`, and others),
  and an in-process RPC on the event bus for other extensions
  (`.references/pi-packages/nicobailon/pi-subagents/src/extension/index.ts:595-620`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/extension-api.md:96-143`).
- **SDK surface.** The package depends on the host pi SDK exports
  `createAgentSession`, `DefaultResourceLoader`, `ModelRuntime`,
  `SessionManager`, `resolveCliModel`, and `createBashTool`. It loads the
  host's own copy by absolute path
  (`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts:358-376`).
  The locally installed pi 1.1.0 (`~/.local/share/pi-fork`) exports all of
  these names in `dist/index.d.ts`. That was checked for names only; runtime
  compatibility was not tested.
- **Parent-only skill.** The bundled `pi-subagents` skill gives orchestration
  rules to the parent and is stripped from children. Its first rule is that
  the parent works directly unless the user authorized delegation
  (`.references/pi-packages/nicobailon/pi-subagents/skills/pi-subagents/SKILL.md:11-26`).

### 11. Evidence, acceptance, and observability

- **Acceptance gates.** Every run resolves an acceptance policy:
  `auto | none | attested | checked | verified`. Inference uses only the
  declared `acceptanceRole`. For example, a `writer` gets checked evidence
  plus a required reviewer for async runs; task wording never escalates it
  (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:396-464`).
  A `gate` is shorthand for one host-run verification command
  (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:122`).
- **Watchdog.** An opt-in second model reviews each turn that changed the
  repository, and optionally every N tool calls. High-importance findings
  are steered back to the model; the others are kept for the user
  (`.references/pi-packages/nicobailon/pi-subagents/docs/watchdog.md:1-14`).
- **Observability.** Foreground runs stream progress. Background runs are
  shown by a FleetView widget, a `/subagents-fleet` inspector, and
  machine-readable artifacts (`status.json`, `events.jsonl`, output logs,
  replay and archive records)
  (`.references/pi-packages/nicobailon/pi-subagents/docs/observability.md:191-234`).
- **Fail closed.** Missing tools, providers, required extensions, invalid
  models, failed prunes, and unknown launchers all stop the launch instead
  of degrading (for example
  `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:564`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:304`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/configuration.md:273`).

### 12. Intended uses and invocation paths

**Invocation paths:**

| Path | Who calls | Evidence |
|---|---|---|
| User asks in plain language ("Use reviewer to review this diff") | Parent model, through `subagents_enable` then `subagent` | `.references/pi-packages/nicobailon/pi-subagents/README.md:19-39` |
| User or project instructions ("run a reviewer subagent before summarizing") | Parent model | `.references/pi-packages/nicobailon/pi-subagents/README.md:49-53` |
| Prompt templates `/parallel-review`, `/review-loop`, `/parallel-research`, `/gather-context-and-clarify`, `/parallel-cleanup`, `/council` | User, then parent model | `.references/pi-packages/nicobailon/pi-subagents/prompts/*.md` |
| `/run <agent> [task] [--bg] [--fork]`, `/prompt-workflow` | User directly | `.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:440`, `:553-577` |
| Schedules | Timer | `.references/pi-packages/nicobailon/pi-subagents/docs/missions.md:85-100` |
| RPC `spawn` from another extension | Extension | `.references/pi-packages/nicobailon/pi-subagents/docs/extension-api.md:122` |
| `refine` | Management action launches one read-only proposal child | `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:499` |

**What does not launch children automatically:**
- The tool description, the parent skill, and `VISION.md` all repeat that
  task size or complexity is not authorization
  (`.references/pi-packages/nicobailon/pi-subagents/src/extension/tool-description.ts:17-21`,
  `.references/pi-packages/nicobailon/pi-subagents/skills/pi-subagents/SKILL.md:11-15`,
  `.references/pi-packages/nicobailon/pi-subagents/VISION.md:88`).
- The advertised catalog and the installed skill are described as "not
  automatic routing"
  (`.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:340`,
  `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md:616`).
- An inferred required review for a writer is a status; the parent must
  launch the reviewer
  (`.references/pi-packages/nicobailon/pi-subagents/docs/tool-reference.md:463`).
- The watchdog is a separate model call, not a subagent
  (`.references/pi-packages/nicobailon/pi-subagents/docs/watchdog.md:3`).

**Bundled recipes:**

| Recipe | Roles | Context | Edits | Flow |
|---|---|---|---|---|
| parallel-review | 2-4 `reviewer`s with distinct angles | fresh | none | Parent synthesizes, then asks before applying fixes |
| review-loop | `worker` → parallel `reviewer`s → fix `worker`, up to 3 rounds | fresh reviewers; forked fix worker | one writer | Async stated explicitly |
| parallel-research | `researcher` + `scout` | fresh | none | Parent synthesizes |
| gather-context-and-clarify | `scout` (+ `researcher`) | not stated | none | Parent then interviews the user |
| parallel-cleanup | 2 `reviewer`s (deslop, verbosity) | fresh | none | Parent synthesizes |
| council | 2-3 advisors, else `oracle` + `reviewer` | fork for the oracle fallback | none | Parent writes a decision memo |

Sources: `.references/pi-packages/nicobailon/pi-subagents/prompts/parallel-review.md`,
`review-loop.md`, `parallel-research.md`, `gather-context-and-clarify.md`,
`parallel-cleanup.md`, `council.md`. The recommended implementation loop is
`clarify → scout → worker → fresh reviewers → worker`
(`.references/pi-packages/nicobailon/pi-subagents/docs/workflows.md:10`).

**Role intent:**
- `oracle` is an escalation for drift, root cause, or hard tradeoffs, not
  routine review.
- Reviewers are fresh-context by default.
- One writer is allowed per working directory.

See `.references/pi-packages/nicobailon/pi-subagents/skills/pi-subagents/references/review-and-validation.md:19-28`
and `.references/pi-packages/nicobailon/pi-subagents/skills/pi-subagents/references/prompting-and-roles.md`
(Builtin Agents table).

### 13. Observed usage in GitHub issues

**Survey method.**
- Fetched all 1,081 issues (pull requests excluded) through the GitHub API
  on 2026-10-11.
- Stored title, author, date, labels, and the first 3,000 characters of
  each body. Comments were not read.
- 306 issues are by the owner and were excluded. The remaining 775 issues
  come from 512 authors and were created between 2026-02 and 2026-10, with
  most in 2026-07 to 2026-09.
- The repository showed 3,897 stars and 788 forks at access time.

**Roles named in launch syntax.** These are `agent: "…"` and `/run …`
patterns in non-owner issues:

| Role | Mentions | Distinct authors |
|---|---|---|
| `worker` | 57 | 34 |
| `delegate` | 29 | 20 |
| `reviewer` | 26 | 19 |
| `scout` | 26 | 18 |
| `researcher` | 9 | 5 |
| `oracle` | 5 | 4 |

About 30 custom role names appear once each, for example `planner`,
`code-reviewer`, `implementer`, `codebase-analyzer`, and `prd-writer`.

**Async vs foreground.** Bodies with async markers (`async: true`, `--bg`,
"background run", and similar) number 194; bodies with foreground markers
(`async: false`, "foreground run", "blocking") number 78. Keyword matching
is approximate.

**Usage patterns described by users** (issue numbers on the GitHub
repository):
- *Plan in the parent, delegate the work.*
  - #1328: "start with a powerful model, do the discussion and plan, then it
    will spawn subagents to work", with only `reviewer`, `worker`, and
    `scout` enabled. The parent and reviewer use a strong model; the worker
    and scout use a smaller one.
  - #339 and #1597 ask for one default subagent model, or for provider-scoped
    overrides, for the same reason.
- *Async implementation.*
  - #2758: "I use only worker in async=true mode exclusively."
  - #383: "used async subagents on most of my workflows."
  - #394: background agents keep the conversation promptable.
- *Review fan-out and loops.* #343 describes heavy delegation as "parallel
  review with 3+ reviewers, or repeated worker→reviewer→fix-worker loops"
  and asks for cost visibility.
- *Read-only analysis fan-out.*
  - #2579 runs 6 `scout` lanes with file outputs.
  - #426 runs parallel read-only codebase analyzers.
  - #538 fans out OCR over image pages.
- *Foreground on purpose.* #242 keeps some workflows foreground so that Esc
  aborts the tool call, prompts queue, and the result arrives in the same
  turn. It asks for a foreground timeout rather than switching to async.
- *Long pipelines and heavy orchestration.*
  - #130 mentions a 47-minute multi-step chain.
  - #1472 runs up to 6 interactive sessions, each with up to 20 concurrent
    async children.
- *Restricted delegation with plan mode.* #585 and #719 use read-only roles
  (`plan-scout`, `plan-researcher`, `plan-reviewer`) from a plan-mode parent
  and ask for a parent-imposed ceiling. This led to capability ceilings.
- *Unwanted recursion.* #63: "a scout just starts another scout instance
  inside of the subagent", which led to per-agent depth limits.
- *Programmatic use by other extensions.* Several issues (#634, #637,
  #1072, #1494, #2472) come from extension authors who launch children
  through the API for policy, durable actors, or one-shot oracles.

**Limits of this evidence.**
- Issues over-represent problems, power users, and integrators, so they do
  not measure typical usage.
- Keyword counts are approximate, and bodies were truncated.
- Many reports appear AI-assisted.
- The counts describe what people report, not how often they run each
  shape.

## Design takeaways for this repository

These are recommendations inferred from the findings above, not decisions.
An implementation plan should choose among them.

1. **Launch mechanism.** In-process `createAgentSession` children avoid
   process startup and give direct steer and abort control. They also force
   a set of workarounds: launch serialization, the extension cache reset, no
   ambient extensions in foreground children, provider copying, and theme
   handling. A minimal implementation could start foreground-only on the SDK
   path and add a detached runner only if background work is needed.
2. **Isolation by construction.** The core pattern is small and reusable:
   - a per-child `DefaultResourceLoader` with explicit `noExtensions`,
     `noSkills`, `noContextFiles`, and `tools`;
   - an inline hook extension that filters `systemPromptOptions`, strips
     parent-only messages in `context`, and appends a child boundary.
3. **Deny recursion structurally.** Granting `subagent` only through an
   explicit allowlist, plus a depth number passed in the child's runtime
   config, is simpler than prompt-only rules and fails closed.
4. **Plain-text results first.** "Last assistant text" plus an optional file
   mode covers most uses. Structured output through a dedicated terminal
   tool is a clean upgrade path.
5. **Authorization and cache economics.** The loader-tool pattern and the
   "complexity is not authorization" rule fit this repository's approval
   conventions. They depend on pi's tool-selection records and model compat
   flags.
6. **Avoid scope growth early.** Workflows in a VM sandbox, missions,
   worktree lanes, external CLI adapters, the watchdog, and FleetView make
   up most of the 108k lines. `VISION.md` itself warns against parallel
   paths and unmeasured hot-path cost. A first version can defer all of
   them.
7. **Target the common shapes first** (from findings 12-13). The shapes
   that recur in both the recipes and the issues are:
   - one read-only child, such as a review or a scout;
   - parallel read-only reviewers or analyzers;
   - a single async writer;
   - a plan-then-delegate split with a cheaper child model.

   Foreground remains a deliberate choice for some users (#242), and
   unwanted recursion and restricted delegation from plan mode came up
   early (#63, #585).

## Open questions

- Does the in-process child factory work against the local pi 1.1.0 fork at
  runtime? Answered by
  [the SDK child session spike](../spikes/2026-10-11-sdk-child-session-from-extension.md):
  yes, with manual provider copying and shared extension module state as gaps.
  The fork's experimental durable runtime is covered in
  [pi-durable subagents](2026-10-11-pi-durable-subagent.md).
- How much of the foreground/background split is needed here? This decides
  whether the file-based runner protocol (status, result, control inbox,
  handshake) is worth reproducing.
- Do `pi.setActiveTools` and the tool-selection records behave the same way
  in the local pi version and with the providers used here? This affects
  whether the loader-tool pattern is worth adopting.
- The README and the `reviewer` role disagree about edit capability. The
  role frontmatter is assumed authoritative; this was not checked by
  running it.

## References

- `.references/pi-packages/nicobailon/pi-subagents/README.md`, `VISION.md`,
  `CHANGELOG.md`
- `.references/pi-packages/nicobailon/pi-subagents/docs/agents.md`,
  `workflows.md`, `tool-reference.md`, `models.md`, `configuration.md`,
  `observability.md`, `watchdog.md`, `extension-api.md`
- `.references/pi-packages/nicobailon/pi-subagents/index.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/extension/index.ts`,
  `tool-activation.ts`, `declaration-pinning.ts`, `config.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/child-session.ts`,
  `child-tool-plan.ts`, `subagent-prompt-runtime.ts`,
  `child-runtime-config.ts`, `model-resolution.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/runs/foreground/execution.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/runs/background/async-execution.ts`,
  `subagent-runner.ts`, `notify.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/shared/types.ts`,
  `fork-context.ts`, `pruned-fork.ts`, `utils.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/workflows/scripted-workflow.ts`
- `.references/pi-packages/nicobailon/pi-subagents/src/intercom/native-supervisor-channel.ts`
- `.references/pi-packages/nicobailon/pi-subagents/agents/*.md`,
  `skills/pi-subagents/SKILL.md`

## Amendments

### 2026-10-11 — Link follow-up spike and durable research
- Change: Linked the first open question to its follow-up spike and added a
  link to the durable runtime research.
- Reason: The spike answered whether in-process children work on the local
  fork.
- Impact: The open question is resolved; the other open questions and the
  takeaways are unchanged.
- Evidence: `docs/spikes/2026-10-11-sdk-child-session-from-extension.md`.

### 2026-10-11 — Add intended usage and observed issue usage
- Change: Added questions 12-13, findings on invocation paths, bundled
  recipes, and a GitHub issue survey, a Summary bullet, takeaway 7, a scope
  note, and the issues URL as a web source.
- Reason: Deciding foreground versus background was premature without
  knowing what subagents are used for and when they are invoked.
- Impact: Adds usage evidence; earlier findings and takeaways 1-6 are
  unchanged. The survey is approximate and biased toward reported problems.
- Evidence: GitHub API read of `nicobailon/pi-subagents` issues on
  2026-10-11; raw extract kept locally at
  `/tmp/pi-subagents-issues/issues.jsonl` (not durable).

### 2026-10-11 — Correct the default result-size behavior
- Change: Finding 7 now states the default 2,000-character preview plus
  file reference and notes that the docs' "no default cap" text is
  outdated.
- Reason: The earlier text followed `docs/tool-reference.md`; the source
  and the v0.77.0 changelog show a default preview cap.
- Impact: The subagent plan's result decision (S14) follows the corrected
  behavior; other findings are unchanged.
- Evidence: `src/runs/shared/single-output.ts:168-204`, `CHANGELOG.md:47`.
