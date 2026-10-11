---
title: Can an extension on the unmodified local pi fork run an isolated in-process child session?
date: 2026-10-11
session: 01a128d8-5cfb-767b-ad59-fc905ec35d3a
based_on:
  - docs/research/2026-10-11-pi-subagents.md
result: yes
---

# Can an extension on the unmodified local pi fork run an isolated in-process child session?

## Question

pi-subagents runs each child as an `AgentSession` inside the parent process.
To do that, it works around several gaps in pi
(`docs/research/2026-10-11-pi-subagents.md`, findings 2 and 10).

This spike asks whether a plain extension on the unmodified local pi fork
can do the same using only public SDK exports:

- create a child session with a restricted tool allowlist and no ambient
  resources;
- send it a task and receive its final text;
- abort it;
- leave the parent session unchanged.

It also records which gaps appear in practice, so the team can decide
whether to add pi core APIs (the fork can be modified).

## Setup

- **pi:** installed release
  `~/.local/share/pi-fork/releases/b1a78306c-docs-20261011-190847`, version
  1.1.0. Source reference is the fork at
  `/Users/kkkzzzabc/workspace/projects/personal/pi`, commit `b1a78306c`. The
  cited fork files have no uncommitted changes.
- **Harness:** tui-check faux mode with agent-tty 0.5.0, an isolated agent
  dir, `-ne -ns -np --no-themes --no-mcp --offline -nc`, and model
  `faux/faux-1`. Run directories are `/tmp/subagent-spike/run1` and
  `/tmp/subagent-spike/run2`.
- **Extension under test:** `/tmp/subagent-spike/spawn-spike.ts`, a
  temporary file outside this repository and the fork. Its command
  `/spawn <mode>` does the following:
  1. `ModelRuntime.create()`.
  2. Optionally copies the parent's extension-registered providers through
     `ctx.modelRegistry.getRegisteredProviderIds()`,
     `getRegisteredNativeProvider()`, and `getRegisteredProviderConfig()`,
     then calls `refresh({ allowNetwork: false })`.
  3. Builds `new DefaultResourceLoader({ noExtensions, noSkills,
     noPromptTemplates, noThemes, noContextFiles: true, systemPrompt,
     extensionFactories: [observer], additionalExtensionPaths })`.
  4. Calls `createAgentSession({ modelRuntime, model, thinkingLevel: "off",
     tools, resourceLoader, sessionManager: SessionManager.inMemory(cwd) })`,
     then `bindExtensions({ mode: "print" })`.
  5. Runs `session.prompt("Task: …")`, reads the last assistant text, and
     calls `session.dispose()`.

  All imports come from `@earendil-works/pi-coding-agent`, which pi's
  extension loader aliases to the host package
  (`packages/coding-agent/src/core/extensions/loader.ts:101-103`). The
  inline observer logs what the child's model receives to
  `child-input-<mode>.jsonl`. Each run writes `spawn-<mode>.json`.
- **Modes:**

  | Mode | Child tools | Variation |
  |---|---|---|
  | `basic` | read, grep, find, ls | Scenario calls `edit`, then `read` |
  | `noinherit` | read, grep, find, ls | No provider copy |
  | `sharedext` | read, grep, find, ls | Child also loads `/tmp/subagent-spike/counter.ts`, which the parent loaded with `-e`; the module records a random module ID and an instance counter |
  | `abort` | bash | Child runs `sleep 5; echo SLEPT > slept.txt`; parent calls `session.abort()` after 1 s |

  After the four modes, one parent prompt checked the parent's own model
  input. Run 2 repeated `basic` with an `AGENTS.md` in the work dir and
  `--context-files` enabled for the parent, to capture the child's system
  prompt sections.

## Result

**Yes.** With public exports only, an extension created an in-process child
on the unmodified fork. It enforced the tool allowlist, returned the
child's final text, aborted a running tool within about 10 ms, and left the
parent's active tools, transcript, and model input unchanged.

Two gaps showed up in practice:

- A fresh `ModelRuntime` lacks providers registered by the parent's
  extensions. Copying them by hand through `ctx.modelRegistry` works.
- An extension loaded by both parent and child shares module state, because
  pi caches extension factories per process.

## Evidence

**basic** (`run1/work/spawn-basic.json`):
- `childActiveTools: ["read","grep","find","ls"]`.
- The `edit` call returned `isError: true`, "Tool edit not found".
  `README.md` was unchanged.
- `read` returned the fixture text. `childOutput: "CHILD-BASIC-DONE"`.
- The prompt settled in 24 ms.
- `childSessionFile: null` (in memory). `childExtensions` lists only
  `<inline:spike-child-observer>`.
- `parentToolsBefore` and `parentToolsAfter` are both
  `["read","bash","edit","write"]`.

**noinherit** (`run1/work/spawn-noinherit.json`):
- `ok: false`, "child model not found: faux/faux-1".
- Only the `ModelRuntime.create` step ran. The faux provider is registered
  by an extension through `pi.registerProvider`
  (`skills/tui-check/scripts/faux-model.ts:83`).

**sharedext** (`run1/work/counter.log`):
- The parent instance logged `{"moduleId":"l8sctr","instance":1}`.
- The child logged `{"moduleId":"l8sctr","instance":2,"session":"memory"}`.
- Same module, so module-level state is shared. pi caches factories by path
  in a process-wide map (`packages/coding-agent/src/core/extensions/loader.ts:129-131`,
  `:561`, `:587`). The cache is cleared only on a loader's second
  `reload()` (`packages/coding-agent/src/core/resource-loader.ts:516-518`).
- `clearExtensionCache` is not exported from `src/index.ts`, so an
  extension cannot request isolation without touching private loader state.

**abort** (`run1/work/spawn-abort.json`):
- `abortCalledAtMs: 1017`, `promptSettledAtMs: 1027`.
- The bash result was `isError: true`, "Command aborted".
- `slept.txt` still did not exist 6 s later.

**Parent unaffected** (`run1/logs/model-input.jsonl`):
- The parent observer recorded exactly one model call, the parent's own.
  Child model calls did not run the parent's extensions.
- The parent's `activeTools` stayed `["read","bash","edit","write"]`.
- The parent's messages contain only the four `spawn-spike` custom messages,
  the system prompt, and `parent check`; there are no child messages. The
  parent session JSONL has 3 `message` and 4 `custom_message` entries.
- In this run the custom messages, sent before the first prompt, were
  ordered before the system message. This is the known behavior recorded in
  `docs/spikes/2026-10-11-custom-message-before-first-prompt.md` and is
  unrelated to child sessions.

**Child prompt** (`run2/work/child-input-basic.jsonl`):
- The child's system message sections were `preamble` (the custom
  `systemPrompt`) and `cwd` only.
- The `AGENTS.md` marker text did not appear.

**Not verified:**
- concurrent child launches and `process.env` interference;
- theme side effects (no theme initialization was attempted; the screen
  rendered normally);
- forked context;
- credential refresh across two `ModelRuntime` instances sharing `auth.json`;
- real-model behavior. All model output here is scripted.

## Implications

A foreground subagent is feasible as a pure extension today. Gaps that
would justify small fork APIs if extension code should avoid workarounds:

| Gap | Observed or inferred | Possible core API |
|---|---|---|
| Child runtime lacks extension-registered providers; copying is manual. `ModelRegistry` has getters for providers but none for virtual models (`packages/coding-agent/src/core/model-registry.ts:225-244`) | Observed (providers); virtual models inferred from the code | A way to create a child model runtime from the parent, or to pass the parent runtime |
| Extension module state shared between parent and child | Observed | A loader option for an isolated extension cache, or an exported cache reset |
| A separate `ModelRuntime.create()` builds its own credential store over the same `auth.json` (`packages/coding-agent/src/core/model-runtime.ts:216-217`) | Inferred; refresh races not tested | Sharing or deriving credentials from the parent runtime |
| No single entry point that bundles loader, runtime, session, and binding for a child | Observed as boilerplate (about 60 lines) | Optional `createChildSession` helper |

Next steps that need a decision:
- the isolation-hook and recursion spike (spike 2);
- choosing between an extension-only design, an extension plus small fork
  APIs, or a core subagent.

Nothing here requires a fork change before a foreground prototype.
