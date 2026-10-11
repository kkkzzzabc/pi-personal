---
id: BL-009
title: Add a read-only Git history tool for the explorer subagent
status: candidate
kind: Design
---

# BL-009 — Add a read-only Git history tool for the explorer subagent

- Outcome: Let `explorer` inspect history (for example log, show, and blame) through a fixed-argument tool, without `bash`, keeping the role read-only.
- Next action: When the trigger is met, define the allowed commands and limits, modeled on `review_diff`.
- Trigger: Real use shows explorers repeatedly needing history to answer questions.
- References: [Subagent plan, next steps](../plans/2026-10-11-subagent-extension.md#next-steps-not-part-of-this-plan); `explorer` without `bash` was decided in that plan (S4).
- Approval: Candidate only.
