---
id: BL-svze
title: Mention client timing in the pi-session-stats README row
status: candidate
kind: Documentation
---

# BL-svze — Mention client timing in the pi-session-stats README row

- Outcome: The README resource table tells readers that `pi-session-stats` also reports client timing from pi-perf-log records (BL-wdgq).
- Next action: Replace the row with: `| \`pi-session-stats\` | Skill | Cost, model/tool timing, workload sizes, and client timing from pi-perf-log records, from local pi sessions (read-only) |`
- Done when: The row is present and accurate.
- Trigger: README.md free of other sessions' uncommitted edits (the wrapup-audit session was editing it when BL-wdgq closed).
- References: [session skills plan](../plans/2026-10-12-pi-session-skills.md); [BL-wdgq](BL-wdgq-add-client-timing-section-to-pi.md).
- Approval: Candidate only.
