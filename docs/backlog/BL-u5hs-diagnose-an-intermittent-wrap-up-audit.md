---
id: BL-u5hs
title: Diagnose an intermittent wrap-up audit TUI test failure
status: dropped
kind: Spike
---

# BL-u5hs — Diagnose an intermittent wrap-up audit TUI test failure

- Outcome: The cause of one unexplained failure of `tests/wrapup-audit-tui.integration.test.mjs` (23.8 s, during a full `npm run test:integration` run) is known and fixed, or ruled out.
- Next action: None. A recurrence prints `[wrapup-audit TUI] last screen:`; open a new item with that evidence.
- Done when: A reproduced cause is fixed, or enough further full runs pass to drop the item with that evidence.
- Deferred because: It did not reproduce in-session (5 more full integration runs, 11 single and 10 parallel runs passed), and the hypothesis that `Enter` on an open completion list does not submit a bare command was tested and refuted. Diagnosis needs another occurrence; the test now records its screen on failure.
- Trigger: Another failure of this test.
- References: [Wrap-up audit verification](../spikes/2026-10-12-wrapup-audit-verification.md#evidence).
- Approval: In-session diagnosis approved in session `01a12bfa-f0ef-7178-96d0-29ead0487e69`.
- Closure: Dropped — not reproducible: 16 stressed TUI runs (original and current versions, two concurrent full suites) and eight full-suite runs passed; the only unique condition was another session's concurrent fork switch and commits, and no evidence remained. See the [verification record](../spikes/2026-10-12-wrapup-audit-verification.md#review-follow-up).
