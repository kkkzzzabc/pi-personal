---
id: BL-008
title: Support concurrent requests in the tui-check faux model
status: done
kind: Implementation
---

# BL-008 — Support concurrent requests in the tui-check faux model

- Outcome: The tui-check faux model answers concurrent model requests, such as parallel subagent children, from the scenario instead of failing with "No more faux responses queued".
- Next action: None; implementation and offline verification are complete.
- Done when: A faux scenario with two concurrent children answers both, covered by a tui-check test.
- References: [Subagent plan, verification evidence](../plans/2026-10-11-subagent-extension.md#verification-evidence) (faux limitation observed in `/tmp/subagent-p2/run`).
- Approval: Concurrent faux request fix, regression tests, and offline verification approved in session `01a12ad2-18bd-77be-b1c3-8042383628f1`.
- Closure: Done — Request-time response admission fixes concurrent requests; deterministic and real-TUI parallel-child regressions pass. See [design and verification](../plans/2026-10-11-tui-check-concurrent-faux.md).
