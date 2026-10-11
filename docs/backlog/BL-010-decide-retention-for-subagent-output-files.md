---
id: BL-010
title: Decide retention for subagent output files
status: candidate
kind: Design
---

# BL-010 — Decide retention for subagent output files

- Outcome: Decide whether and how files under `<session>/subagents/` (and the per-process temp fallback) are cleaned up.
- Next action: When the trigger is met, choose a retention rule and where cleanup runs.
- Trigger: Output files accumulate enough to matter, or temp-directory files are needed after the process ends.
- References: [Subagent plan, risks](../plans/2026-10-11-subagent-extension.md#risks-and-open-questions) ("Output files").
- Approval: Candidate only.
