---
id: BL-008
title: Support concurrent requests in the tui-check faux model
status: candidate
kind: Implementation
---

# BL-008 — Support concurrent requests in the tui-check faux model

- Outcome: The tui-check faux model answers concurrent model requests, such as parallel subagent children, from the scenario instead of failing with "No more faux responses queued".
- Next action: Propose a fix to `skills/tui-check/scripts/faux-model.ts`, which keeps only one responder queued at a time, with a regression test.
- Done when: A faux scenario with two concurrent children answers both, covered by a tui-check test.
- References: [Subagent plan, verification evidence](../plans/2026-10-11-subagent-extension.md#verification-evidence) (faux limitation observed in `/tmp/subagent-p2/run`).
- Approval: Candidate only.
