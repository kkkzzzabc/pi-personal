---
id: BL-9vg3
title: Build post-turn summaries and next-action display
status: candidate
kind: Implementation
---

# BL-9vg3 — Build post-turn summaries and next-action display

- Outcome: Show concise post-turn work/results, unresolved issues, and next actions using Luna/Haiku, without automatic document mutation or long-term memory in the initial scope.
- Next action: After the user selects this feature, decide current-turn versus cumulative context and summary placement, then plan design and implementation together.
- Done when: An independently usable summary feature and its factuality, stale-result, UI, and live-model checks are recorded.
- Trigger: Selected after [BL-5qvq](BL-5qvq-build-contextual-next-prompt-suggestions.md); this is the agreed sequence, not a runtime dependency.
- References: [Post-turn precedents](../research/2026-10-12-post-turn-assistance.md); instruction/completion auditing remains [BL-yun3](BL-yun3-decide-an-automatic-session-wrap-up.md).
- Approval: Candidate only; recorded in the approved first-feature scope, not authorized for implementation.
