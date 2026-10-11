---
id: BL-yun3
title: Decide an automatic session wrap-up mechanism
status: done
kind: Design
---

# BL-yun3 — Decide an automatic session wrap-up mechanism

- Outcome: Stop the user from having to ask whether a session can end or whether docs are in sync, through a hybrid wrap-up audit: deterministic misses in files changed this request trigger at most one bounded in-scope continuation; judgment obligations are reported only.
- Next action: Use `/reload` or a new session to activate. No follow-ups remain.
- Done when: An independently usable audit extension with this repository's rules, unit/host/TUI checks, a bounded synthetic Luna/Haiku evaluation, and README documentation is recorded.
- References: [ADR 0002](../adr/0002-lean-approval-rules-and-backlog-files.md#consequences), [Post-turn precedents and scope mapping](../research/2026-10-12-post-turn-assistance.md), [Summary candidate](BL-9vg3-build-post-turn-summaries-and-next.md).
- Approval: Hybrid design, implementation, documentation, offline verification, a tracked `.pi/wrapup-audit.json`, and bounded synthetic Luna/Haiku calls approved through plan mode in session `01a12bfa-f0ef-7178-96d0-29ead0487e69`; no trust changes; the global instruction sentence of ADR 0005 was approved in the same session.
- Closure: Done — [Verification](../spikes/2026-10-12-wrapup-audit-verification.md) records the design checks, a two-model review with all six findings fixed (including the shared turn-start fix in `turn-summary`), 43 unit/9 host/1 TUI feature tests, full suites of 537 unit and 94 integration tests passing, Luna/Haiku re-evaluation (Haiku 7/7, first), and a live TUI smoke check; [ADR 0005](../adr/0005-finish-in-session-work-before-registering-candidates.md) resolved BL-4rjt, BL-36sg, and BL-u5hs in-session.
