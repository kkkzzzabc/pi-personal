---
id: BL-5qvq
title: Build contextual next-prompt suggestions
status: done
kind: Implementation
---

# BL-5qvq — Build contextual next-prompt suggestions

- Outcome: Contextual next-user prompts appear as ghost text after completed turns; Tab accepts editable text and only the user submits it. Luna/Haiku inference remains independent of other features.
- Next action: Use `/reload` or a new session to activate; post-turn summaries remain the separately deferred BL-9vg3 candidate.
- Done when: Standalone implementation, usage/data documentation, offline unit/host/TUI checks, and bounded synthetic Luna/Haiku evaluation are recorded.
- References: [Accepted feature plan](../plans/2026-10-12-next-prompt-suggestions.md), [Post-turn precedents](../research/2026-10-12-post-turn-assistance.md).
- Approval: Implementation, documentation, offline verification, bounded synthetic Luna/Haiku calls, and all verified review fixes approved in session `01a12b89-d473-7178-96d0-29dd15f8ee44`; no installs, global settings edits, summaries, or steering.
- Closure: Done — [Verification](../spikes/2026-10-12-next-prompt-suggestions-verification.md) preserves initial live evidence and records repaired review findings, 390 unit/70 integration checks, and 18 current-host checks with no failures/skips.
