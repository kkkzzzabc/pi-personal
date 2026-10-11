---
id: BL-n2mx
title: Verify plan-mode entry and re-entry guidance with a real model
status: candidate
kind: Spike
---

# BL-n2mx — Verify plan-mode entry and re-entry guidance with a real model

- Outcome: Confirm that the BL-ujxs prompt guidance changes real model behavior without new regressions; offline tests only cover the prompt text.
- Next action: Run tui-check in real-model mode with `gpt-6.1-sol-fast` on four scenarios: proposal then "create", approved plan then "proceed", a research-only request, and a material scope change. Inspect the tool-call sequences.
- Done when: Each scenario's plan-mode entries and scope match the guidance, or deviations are recorded with a follow-up.
- References: [BL-ujxs](BL-ujxs-reduce-redundant-plan-mode-planning-rounds.md); [Plan mode extension](../plans/2026-10-11-plan-mode-extension.md).
- Approval: Candidate only.
