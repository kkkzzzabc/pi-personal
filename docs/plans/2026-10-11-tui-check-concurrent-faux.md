---
title: Concurrent tui-check faux requests
date: 2026-10-11
session: 01a12ad2-18bd-77be-b1c3-8042383628f1
based_on:
  - docs/plans/2026-10-11-subagent-extension.md
  - docs/backlog/BL-008-support-concurrent-requests-in-the-tui.md
---

# Concurrent tui-check faux requests

## Goal

Allow simultaneous faux-model requests, including parallel subagent children,
to receive scenario responses without `No more faux responses queued`. Preserve
serial behavior, streaming, templates, persistent position, and exhaustion.

## Non-goals

No subagent production changes, runtime coupling, custom streaming engine,
scenario routing by child name, multi-process state coordination, global
configuration changes, installations, or live-model calls.

## Design

The host removes a queued factory synchronously at stream admission, then runs
it asynchronously after response hooks. Previously, the extension kept one
factory queued and replenished it inside that factory. Simultaneous streams
could empty the queue before the first factory ran.

Use `getApiProvider` to capture the faux implementation's `streamSimple` delegate
and supply a wrapper through `pi.registerProvider`. The wrapper reserves and
persists the scenario index, captures template inputs, enqueues one factory,
and immediately delegates synchronously. Each request therefore owns one
response, without a queue-size cap or serialization. Streaming, usage, hooks,
and cancellation remain delegated to the host faux provider.

Scenario assignment follows admission order, not factory invocation or stream
completion order. An admitted request consumes its index even if aborted later.
For requests whose session ID matches the owning TUI session, `lastUser` comes
from its context event before custom notes are converted to user-role messages.
This preserves the existing template meaning. Children and requests without a
matching session ID use their own request transcript, including a child's task.
The cwd/custom entries use the owning TUI session's latest context snapshot.
Environment inputs are copied at admission. Child branches are not accessible
through this owning-session snapshot. The provider remains unregistered on
session shutdown, and extension recreation reloads the persisted position.

## Phases

### Phase 1: Deterministic regression and bounded fix

- Changes: `skills/tui-check/scripts/faux-model.ts` and
  `tests/tui-check.integration.test.mjs`.
- Verify (automated): start three streams in one turn, delay the first response
  hook, and allow later streams to finish first. Check distinct responses,
  captured template context, owner custom-note exclusion, child transcript
  selection, tool-call follow-up, template errors, persisted
  position, unregistering, recreation, twelve simultaneous exhaustion requests,
  and an already-aborted request.
- Verify (manual): not required for this layer.

### Phase 2: Real TUI and documentation

- Changes: add a faux real-TUI test loading `extensions/subagent/index.ts`
  explicitly; update `skills/tui-check/references/scenario.md` and close BL-008.
  This reuses subagent only in test infrastructure.
- Verify (automated): assert two completed explorer child results with distinct
  expected texts, parent completion, four consumed responses, no queue errors,
  and agent-tty cleanup.
- Verify (manual): retain a run directory for inspecting the real TUI evidence.

## Verification evidence

On installed Pi 1.1.0, before the fix the deterministic regression produced
stop reasons `stop, error, error` rather than three successful responses. After
the fix it passed, including delayed-hook admission ordering. Review also found
that reading the owner's final transcript could select a converted custom note
rather than its user message. The added regression reproduced `NOTE` instead of
`OWNER`; selecting the pre-conversion context by session ID fixes it while
preserving child transcript selection. Both full suites were rerun after this
review fix.

- Focused tui-check suite: 41 tests passed, none skipped.
- `npm test`: 256 tests passed, none skipped.
- `npm run test:integration`: 41 tests passed, none skipped.
- Mode: offline faux model `faux/faux-1`; no real-model behavior was tested.
- Explicit resources: faux provider, model-input observer, and subagent extension;
  default resource discovery disabled by tui-check.
- Retained run:
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/tui-check-int-sdvXId/parallel-run`.
- Parent session tool result records both children as `completed`, with texts
  `PARALLEL-CHILD-ONE` and `PARALLEL-CHILD-TWO`. The scenario state is `next: 4`.
  `parallel-screen.txt` records parent completion. The owner model-input log
  contains two calls; child requests belong to separate runtimes.
- `finish.json`: `ok: true`, `piExited: true`, `ttySessionDestroyed: true`.

These results resolve the concurrent faux limitation recorded in the original
subagent plan; that historical experiment remains unchanged.

## Risks and open questions

The implementation depends on the host's public compatibility faux API,
already used by tui-check; a future host migration may require adapting it.
Independent processes sharing one state file are not coordinated. Parallel
scenarios must not assume a fixed child-to-response mapping. No unresolved
follow-up is required for this goal.
