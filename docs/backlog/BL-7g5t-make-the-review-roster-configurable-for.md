---
id: BL-7g5t
title: Define a two-model review workflow
status: done
kind: Design
---

# BL-7g5t — Define a two-model review workflow

- Outcome: Define Opus + GPT (Sol) as the recommended two-model roster, retaining independent review without optional reviewer expansion. Preserve existing explicit four-model configuration behavior until a separately authorized migration.
- Next action: Implementation and authorized configuration application are complete in [BL-5fng](BL-5fng-implement-the-two-model-review-workflow.md); reload the active parent to refresh extension/prompt definitions.
- Done when: An accepted scoped design specifies the two-model recommendation, configuration compatibility, unchanged prompt/tool call contract, accurate partial-coverage reporting, and offline regression checks; implementation remains a separate execution decision.
- References: [Subagent extension plan](../plans/2026-10-11-subagent-extension.md); [Review customization research](../research/2026-10-11-code-review-in-agent-customization.md); review-value analysis in session `01a12b0b-46cd-7547-a484-43d93515df5d`, including the BL-011 review completed at 2026-10-11T13:00:22Z in session `01a12aec-6bcb-77be-b1c3-804cf025e6ca`. Across three completed four-model reviews and one supplemental Opus/GLM review, Grok finished last without a unique important finding; GLM added small findings but mostly overlapped faster reviewers. This is a limited local sample, not a general model ranking.
- Approval: Design and documentation approved in session `01a12b28-32f7-7547-a484-43de317df55b`; the user excluded optional expansion and selected two reviewers only. Implementation and global configuration application were subsequently separately approved under BL-5fng; live model calls are not approved.
- Closure: Done — [accepted two-model design](../plans/2026-10-11-two-model-review.md), including backward compatibility, coverage, migration boundaries, and future offline acceptance criteria. Subsequent implementation/configuration evidence is recorded under BL-5fng.
