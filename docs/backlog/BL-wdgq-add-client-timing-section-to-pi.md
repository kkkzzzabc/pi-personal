---
id: BL-wdgq
title: Add client timing section to pi-session-stats from pi-perf-log records
status: candidate
kind: Implementation
---

# BL-wdgq — Add client timing section to pi-session-stats from pi-perf-log records

- Outcome: `pi-session-stats` reads `<agentDir>/perf/<sessionId>.jsonl` (schema v1 in `extensions/pi-perf-log/SCHEMA.md`) and adds a `## Client timing` section: TTFT and connect percentiles per model, overhead per turn, tool span versus summed tool time, render frames for TUI turns (per-turn `frames.p95Ms` and `maxMs` distributions, share of `over16Ms` frames, `null` turns counted as unmeasured), RSS trend per session. Joins turns to session files by `messageEntryId`.
- Next action: Design the join and the section layout; decide how to handle sessions without perf records (omit the section).
- Done when: The section appears only when perf records exist; numbers are covered by fixture-based tests; SKILL.md documents the new limits.
- Trigger: Enough real perf records exist to make percentiles meaningful (a few days of use with `pi-perf-log` enabled).
- References: [pi-perf-log plan](../plans/2026-10-12-pi-perf-log.md); [session skills plan](../plans/2026-10-12-pi-session-skills.md).
- Approval: Candidate only.
