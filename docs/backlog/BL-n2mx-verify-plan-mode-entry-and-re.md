---
id: BL-n2mx
title: Verify plan-mode entry and re-entry guidance with a real model
status: done
kind: Spike
---

# BL-n2mx — Verify plan-mode entry and re-entry guidance with a real model

- Outcome: Confirm that the BL-ujxs prompt guidance changes real model behavior without new regressions; offline tests only cover the prompt text.
- Next action: None; the open question from scenario C is [BL-mw7h](BL-mw7h-decide-whether-explicit-plan-requests-for.md).
- Done when: Each scenario's plan-mode entries and scope match the guidance, or deviations are recorded with a follow-up.
- References: [BL-ujxs](BL-ujxs-reduce-redundant-plan-mode-planning-rounds.md); [Plan mode extension](../plans/2026-10-11-plan-mode-extension.md).
- Approval: Spike with real `gpt-6.1-sol-fast` calls limited to four tui-check scenarios approved in session `01a12b62-009e-7178-96d0-29d3408ab23e`.
- Closure: Done — [spike](../spikes/2026-10-12-plan-mode-entry-guidance-real-model.md) (partial): proposal, implementation and material-change scenarios behaved as intended; the research-plan request was answered in chat without plan mode.
