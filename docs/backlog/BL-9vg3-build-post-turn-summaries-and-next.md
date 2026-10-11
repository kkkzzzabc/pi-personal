---
id: BL-9vg3
title: Build post-turn summaries and next-action display
status: done
kind: Implementation
---

# BL-9vg3 — Build post-turn summaries and next-action display

- Outcome: Show concise post-turn work/results, unresolved issues, and next actions using Luna/Haiku, without automatic document mutation or long-term memory in the initial scope.
- Next action: Use `/reload` or a new session to activate. Instruction/document-update auditing is next in the agreed sequence as BL-yun3.
- Done when: An independently usable summary feature and its factuality, stale-result, UI, and live-model checks are recorded.
- Trigger: Selected after [BL-5qvq](BL-5qvq-build-contextual-next-prompt-suggestions.md); this is the agreed sequence, not a runtime dependency.
- References: [Feature plan](../plans/2026-10-12-turn-summary.md), [Post-turn precedents](../research/2026-10-12-post-turn-assistance.md); instruction/completion auditing remains [BL-yun3](BL-yun3-decide-an-automatic-session-wrap-up.md).
- Approval: Design (scope C, above-editor widget), implementation, documentation, offline verification, and bounded synthetic Luna/Haiku calls approved through plan mode in session `01a12b89-d473-7178-96d0-29dd15f8ee44`; no installs, global settings edits, persistence, or steering.
- Closure: Done — [Verification](../spikes/2026-10-12-turn-summary-verification.md) records 57 unit/11 host/3 TUI feature tests after review fixes, full suites of 479 unit and 84 integration tests passing without skips, 14 synthetic live cases without overstated completion, and a live TUI check.
