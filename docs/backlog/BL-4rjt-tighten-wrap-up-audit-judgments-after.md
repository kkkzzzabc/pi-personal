---
id: BL-4rjt
title: Tighten wrap-up audit judgments after natural use
status: done
kind: Design
---

# BL-4rjt — Tighten wrap-up audit judgments after natural use

- Outcome: Wrap-up judgments (Lane B) flag real misses without noise; unverifiable clauses no longer cause false positives.
- Next action: After natural use, review reported judgments; remove the unverifiable "current backlog item's status was updated" clause from the `backlog-followups` judgment in `.pi/wrapup-audit.json` and re-run the synthetic evaluation (live calls need approval).
- Done when: Revised judgment texts are evaluated and the result is recorded in the verification record.
- Trigger: Several natural-use sessions with the audit enabled, or a noticeable false positive.
- References: [Wrap-up audit verification](../spikes/2026-10-12-wrapup-audit-verification.md), [plan](../plans/2026-10-12-wrapup-audit.md).
- Approval: Judgment rewrite and one synthetic Luna/Haiku re-evaluation approved in session `01a12bfa-f0ef-7178-96d0-29ead0487e69`.
- Closure: Done — `backlog-followups` now checks finish/ask/defer-with-reason per ADR 0005 and drops the unverifiable status clause; the re-evaluation (Haiku 7/7, Luna 5/7, no false positives) is in the [verification record](../spikes/2026-10-12-wrapup-audit-verification.md).
