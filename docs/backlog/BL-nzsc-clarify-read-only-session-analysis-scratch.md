---
id: BL-nzsc
title: Clarify read-only session-analysis scratch artifact boundaries
status: candidate
kind: Design
---

# BL-nzsc — Clarify read-only session-analysis scratch artifact boundaries

- Outcome: Define whether read-only investigation permits local scratch artifacts, and how session-derived content is handled, without silently widening execution authority.
- Next action: Clarify permitted scratch/transcript boundaries from the observed case; the completed instruction diet does not resolve or widen this policy.
- Done when: The accepted boundary and its placement are recorded with explicit exclusions and verification criteria.
- Trigger: BL-qsyq found a read-only investigation writing session-derived conversation content to temporary files.
- References: [Observed case](../spikes/2026-10-11-lean-approval-rules-evaluation.md#post-change-boundary-inspection) and [instruction split exclusions](../adr/0003-curated-global-and-project-instructions.md#remaining-uncertainty-and-maintenance).
- Approval: Candidate only; no scratch-policy or global instruction change has been approved.
