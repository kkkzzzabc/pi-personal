---
id: BL-002
title: Verify pi todo state across real session lifecycle operations
status: candidate
kind: Spike
---

# BL-002 — Verify pi todo state across real session lifecycle operations

- Outcome: Determine whether the observed shared item-object mutation affects actual retained history/UI, tree navigation, restart, or exports. Check replay, compaction, and retry behavior within a deliberately narrowed scenario set.
- Next action: Propose an isolated offline verification plan against a pinned pi host and select the scenarios before execution. Investigate `/todos` command coexistence only if both official examples will actually be used; it is not a confirmed defect.
- Done when: A spike records the selected lifecycle checks, reproduction or negative results, pinned environment, and limitations.
- References: [Observed snapshot hazard](../research/2026-10-11-todo-task-tracking.md#1-pi-standalone-todo-branch-sensitive-tool-state) and [remaining questions](../research/2026-10-11-todo-task-tracking.md#open-questions).
- Approval: Candidate only.
