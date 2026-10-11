---
id: BL-36sg
title: Track bash-made file changes in the wrap-up audit
status: dropped
kind: Design
---

# BL-36sg — Track bash-made file changes in the wrap-up audit

- Outcome: Files created or modified through `bash` (for example `backlog.py new`, `mv`, generators) are also checked by the wrap-up audit, without inspecting other sessions' changes.
- Next action: Choose a session-safe detection approach (for example per-request snapshots of rule-matched paths) and compare its cost with the current write/edit-only tracking.
- Done when: A design decision, and an implementation with tests if chosen, is recorded.
- Trigger: A missed obligation that came from a bash-made change.
- References: [Wrap-up audit plan](../plans/2026-10-12-wrapup-audit.md#changed-file-tracking).
- Approval: Candidate only.
- Closure: Dropped — the user chose not to track bash-made changes: comparing Git state over a request window would attribute concurrent sessions' changes to this request. The limitation stays documented in the README Wrap-up audit section.
