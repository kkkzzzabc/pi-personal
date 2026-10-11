---
title: Does a custom message appended before the first prompt displace the system prompt?
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/plans/2026-10-11-plan-mode-extension.md
  - docs/spikes/2026-10-11-plan-approval-flow.md
  - docs/plans/2026-10-11-tui-check-skill.md
result: yes
---

# Does a custom message appended before the first prompt displace the system prompt?

## Question

plan-mode Phase 2 sent its enter note with
`pi.sendMessage({ customType, content, display: false }, { triggerTurn: false })`
at toggle time. When a user enters plan mode in a new session before sending
any prompt, where does that message land relative to the system prompt, and
what do later model requests start with?

## Setup

- pi 1.1.0 (managed install at the time); source reference fork tag `v1.1.0`
  (`abe508e1b`).
- plan-mode as of Phase 2: enter/leave notes appended immediately with
  `sendMessage(…, { triggerTurn: false })`; short reminder via `context`.
- tui-check faux run (isolated agent dir, observer extension logging the
  final model input on `context_with_system`):
  1. New session, `/plan on` before any prompt.
  2. Prompt `question one` → faux reply.
  3. Toggle plan mode off (Ctrl+Alt+P).
  4. Prompt `question two` → faux reply.
- Inspected `logs/model-input.jsonl` and the session JSONL.

## Result

**yes.** pi persists the system message when the first prompt is
processed. A custom message appended while idle before that prompt is
written ahead of it, so every later request starts with the custom message
and the system prompt comes second. The first request is still correct
because pi builds it with the current system prompt at the head; only
requests rebuilt from the session history are affected. Delivering the note
with the next prompt avoids it.

## Evidence

Model input per call (roles in order; observer log):

```text
call 1: system, custom(plan-mode-enter), user "question one", user(reminder)
call 2: custom(plan-mode-enter), system, user "question one", assistant, custom(plan-mode-leave), user "question two"
```

Session entry order (session JSONL):

```text
session, model_change, thinking_level_change, custom(plan-mode), thinking_level_change,
custom_message(plan-mode-enter), message(system), message(user), message(assistant), …
```

pi source (v1.1.0, `packages/coding-agent/src/core/agent-session.ts`):

- `sendCustomMessage` appends immediately when idle and `triggerTurn` is not
  set (`_appendCustomMessage`), defers to the end of the turn while
  streaming, and queues `deliverAs: "nextTurn"` messages (`:2293-2329`).
- Queued next-turn messages are injected right after the user message of the
  next prompt (`:2088-2092`); `before_agent_start` messages follow the same
  path, after the user message (observed in
  `docs/spikes/2026-10-11-plan-approval-flow.md`: `system, user,
  custom_message`).
- The `context_with_system` documentation warns that a request without a
  leading system message "has no prompt or initial tool declarations"
  (`packages/coding-agent/src/core/extensions/types.ts:876-880`). Whether a
  given provider then drops or demotes the system prompt was not tested.

After switching to next-turn delivery (Phase 2) and then to one note per
prompt from `before_agent_start` (Phase 4), the plan-mode integration test
asserts a leading system message on every call, and a real-model run
(anthropic/claude-haiku-4-5, 15 calls) started every call with the system
prompt.

## Implications

- Extensions should not append custom messages while idle before the first
  prompt of a session. Use `before_agent_start` (one message per prompt, only
  when needed) or `sendMessage(…, { deliverAs: "nextTurn" })`.
- When verifying prompt-related changes, check that `messages[0]` is the
  system prompt in the tui-check observer log for every call, not only the
  first.
- This is pi core behavior; the local fork is not upstreamed, so it is
  recorded here rather than reported.
