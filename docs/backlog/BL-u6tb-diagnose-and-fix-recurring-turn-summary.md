---
id: BL-u6tb
title: Diagnose and fix recurring turn-summary failures
status: next
kind: Implementation
---

# BL-u6tb — Diagnose and fix recurring turn-summary failures

- Outcome: Identify and fix the recurring turn-summary failures reported by the user without weakening output validation or introducing cross-feature dependencies. Initial read-only diagnosis found no global or project turn-summary config and 58 passing unit tests; the runtime failure cause remains unknown.
- Next action: Obtain the current `/turn-summary` status, especially `Last attempts` and `Elapsed`, through ordinary chat and narrow the runtime failure before proposing changes. Failure details are held in memory, not persisted in session files.
- Done when: The reported failure is explained with evidence, the appropriate fix has regression coverage, and relevant offline checks pass. Ask separately before live/paid model calls or global settings changes.
- Deferred because: The user explicitly deferred diagnosis and requested this as the next job.
- References: [Feature plan](../plans/2026-10-12-turn-summary.md), [Verification record](../spikes/2026-10-12-turn-summary-verification.md); reporting/deferral session `01a12c4f-008e-7447-adf5-1a8eec294d56`.
- Approval: Queued as the next job by the user in session `01a12c4f-008e-7447-adf5-1a8eec294d56`; no implementation or live-call approval yet.
