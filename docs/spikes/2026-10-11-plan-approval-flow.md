---
title: Can an extension run the plan approval flow (confirm, fresh-context handoff, reminders)?
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-pi-plan-mode-example.md
  - docs/research/2026-10-11-codex-cli-plan-mode.md
  - docs/research/2026-10-11-mistral-vibe-plan-mode.md
  - docs/spikes/2026-10-11-plan-dir-write-guard.md
result: yes
---

# Can an extension run the plan approval flow?

## Question

The planned extension needs three things that the earlier spikes did not
cover. Can each be done with public extension APIs on pi 1.1.0?

1. A tool's `execute()` (`enter_plan_mode`, `exit_plan_mode`) asks the user
   via `ctx.ui.select` / `ctx.ui.confirm`.
2. "Clear context and implement": after approval, start a fresh session
   seeded with the plan.
3. Reminders: how messages injected via `before_agent_start` and `context`
   reach the model, and whether they are persisted.

## Setup

- pi 1.1.0 managed install (`~/.pi/agent/install/releases/1.1.0`), Node 26.
  Source reference: fork tag `v1.1.0` (`abe508e1b`).
- Harness copied from pi's own regression test
  (`packages/coding-agent/test/suite/regressions/2860-replaced-session-context.test.ts`)
  and pointed at the installed `dist/`: `registerFauxProvider` (scripted
  model responses), `AuthStorage.inMemory()`, `ModelRuntime.create`,
  `createAgentSessionServices` with an inline extension factory,
  `createAgentSessionRuntime`, and `session.bindExtensions` with a fake
  `uiContext` (`select` returns option 2, `confirm` returns true) and
  `commandContextActions.newSession → runtime.newSession`.
- Extension under test:

```js
pi.registerTool({ name: "exit_plan_mode", /* … */
  async execute(_id, _p, _s, _u, ctx) {
    const choice = await ctx.ui.select("Plan ready", ["Approve", "Clear context and implement", "Feedback"]);
    const ok = await ctx.ui.confirm("Enter plan mode?", "test confirm");
    if (choice === "Clear context and implement") pendingFresh = true;
    return { content: [{ type: "text", text: `Approved: ${choice}` }], details: {}, terminate: true };
  } });
pi.registerCommand("plan-implement-fresh", { handler: async (_a, ctx) =>
  ctx.newSession({ parentSession: ctx.sessionManager.getSessionFile(),
    withSession: async (c) => c.sendUserMessage(`Implement this approved plan:\n${PLAN}`) }) });
pi.on("agent_end", async () => { if (pendingFresh) { pendingFresh = false;
  pi.sendUserMessage("/plan-implement-fresh", { expandPromptTemplates: true }); } });
pi.on("before_agent_start", async () => ({ message: { customType: "plan-reminder-bas", content: "REMINDER via before_agent_start", display: false } }));
pi.on("context", async (e) => ({ messages: [...e.messages, { role: "user", content: [{ type: "text", text: "REMINDER via context" }], timestamp: Date.now() }] }));
```

- Faux model: call 1 returns a tool call to `exit_plan_mode`; later calls
  return text. Each call records the messages it received.
- Script was run from `/tmp/pi-spikes/plan-flow.mjs` (not kept in the
  repo); the excerpt above is the substance.

## Result

**yes** for all three.

1. Tool `execute()` gets a UI-capable context (`hasUI: true`); `ui.select`
   and `ui.confirm` work and block until answered. The tool context has
   **no** `newSession`.
2. Fresh-context handoff works indirectly: the tool records the choice and
   returns `terminate: true`; on `agent_end` the extension calls
   `pi.sendUserMessage("/<command>", { expandPromptTemplates: true })`, which
   dispatches the extension command with a **command context**; its
   `ctx.newSession({ withSession })` replaces the session and the callback
   sends the plan as the first user message. Without `terminate: true` the
   model takes one extra turn after the tool result.
3. `before_agent_start` messages are **persisted** as `custom_message`
   entries (once per prompt) and sent to the model as user messages.
   `context` handler additions are **not persisted**; they are applied to
   each model request only.

## Evidence

```text
Q1 tool ctx.hasUI=true newSession=undefined
  ui.select("Plan ready")
  ui.confirm("Enter plan mode?")
Q1 select -> Clear context and implement; confirm -> true
Q2 agent_end -> sendUserMessage('/plan-implement-fresh', expand)
Q2 command ctx.newSession=function idle=false
Q2 session replaced: true
Q2 new session messages: ["user:Implement this approved plan:\n# Plan\n1. Do X\n2. Ve", "custom:REMINDER via before_agent_start", "assistant:…"]
Q3 model call 1 saw: ["system:", "user:Plan the change", "user:REMINDER via before_agent_start", "user:REMINDER via context"]
Q3 model call 2 saw: ["system:", "user:Implement this approved plan:…", "user:REMINDER via before_agent_start", "user:REMINDER via context"]
Q3 old session entries (with terminate): ["model_change:", "thinking_level_change:", "system:", "user:Plan the change", "custom_message:plan-reminder-bas", "assistant:[toolCall exit_plan_mode]", "toolResult:Approved: Clear context and implement"]
```

Without `terminate: true`, the old session also contained
`assistant:Waiting for implementation.` after the tool result, and the
model's second call saw the reminder from `context` appended after the
tool result.

Source references (v1.1.0):

- `ExtensionToolContext` lacks session control; `ExtensionCommandContext`
  has `newSession`/`fork`/`switchSession`
  (`packages/coding-agent/src/core/extensions/types.ts:376-436`).
- `prompt()` dispatches `/command` to extension commands when
  `expandPromptTemplates` is true, "execute immediately, even during
  streaming" (`packages/coding-agent/src/core/agent-session.ts:1968-1983`,
  `2116-2137`); `sendUserMessage` defaults `expandPromptTemplates` to
  false (`agent-session.ts:2357-2394`).
- `terminate` on a tool result: "Hint that the agent should stop after the
  current tool batch" (`packages/agent/src/types.ts:441-445`).

Not tested: real TUI rendering of `select`/`confirm` inside a tool; RPC
mode; behavior when other tools run in the same batch (early termination
requires every result in the batch to set `terminate`).

## Implications

- `enter_plan_mode` confirmation (Q11) and the `exit_plan_mode` approval
  dialog (Q8) can live inside tool `execute()`.
- "Clear context and implement" = record choice → `terminate: true` →
  `agent_end` → self-dispatched command → `newSession({ withSession })`.
  Registering an internal command is required; it is also usable by the
  user (e.g. `/plan implement-fresh`).
- "Approve and continue" can keep the same session: switch to build,
  restore tools, and return the plan in the tool result without
  `terminate`, so the model starts implementing in the same turn.
- Reminder strategy (Q10): inject via the `context` hook on every request.
  It is not persisted, so nothing accumulates and it cannot be lost to
  compaction; on leaving plan mode, nothing needs filtering. A one-time
  persisted transition note can record enter/leave in the transcript if
  desired. Use `before_agent_start` or deferred `sendMessage` delivery, not
  immediate idle delivery before the first prompt; see the follow-up below.
- Use `before_agent_start` only for content that should be persisted;
  injecting the full reminder there would add a copy per prompt (as the pi
  example does).

## Follow-up

[The message-order experiment](2026-10-11-custom-message-before-first-prompt.md)
found that immediate idle `sendMessage` before the first prompt can displace the
system prompt in later requests. The implemented
[plan-mode design](../plans/2026-10-11-plan-mode-extension.md) uses deferred,
state-aware notes and tool-result delivery, sequential plan tools, and a guard
against old-session calls after fresh-session approval. The fake-UI setup and
batch caveat above remain historical observations, not the completed design.

## Amendments

### 2026-10-11 — Qualify transition delivery with later implementation evidence
- Change: Narrowed the transition-note guidance and linked the ordering
  experiment and implemented design.
- Reason: The original approval experiment did not exercise idle delivery
  before the first prompt or the completed extension's guards.
- Impact: Readers should not use unrestricted immediate `sendMessage` delivery
  based on this spike; its original setup and results are preserved.
- Evidence: [Message-order follow-up](2026-10-11-custom-message-before-first-prompt.md).
