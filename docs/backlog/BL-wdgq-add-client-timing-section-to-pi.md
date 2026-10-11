---
id: BL-wdgq
title: Add client timing section to pi-session-stats from pi-perf-log records
status: done
kind: Implementation
---

# BL-wdgq — Add client timing section to pi-session-stats from pi-perf-log records

- Outcome: `pi-session-stats` reads `<agentDir>/perf/<sessionId>.jsonl` (schema v1 in `extensions/pi-perf-log/SCHEMA.md`) and adds a `## Client timing` section: TTFT and connect percentiles per model, overhead per turn, tool span versus summed tool time, render frames for TUI turns (per-turn `frames.p95Ms` and `maxMs` distributions, share of `over16Ms` frames, `null` turns counted as unmeasured), RSS trend per session. Joins turns to session files by `messageEntryId`.
- Next action: Design the join and the section layout; decide how to handle sessions without perf records (omit the section).
- Done when: The section appears only when perf records exist; numbers are covered by fixture-based tests; SKILL.md documents the new limits.
- Trigger: Enough real perf records exist to make percentiles meaningful (a few days of use with `pi-perf-log` enabled).
- References: [pi-perf-log plan](../plans/2026-10-12-pi-perf-log.md); [session skills plan](../plans/2026-10-12-pi-session-skills.md).
- Approval: Design and implementation approved (session `01a12bfb-c9ab-735a-8d64-9cb2385d9b31`).
- Closure: Done — [plan amendment "Client timing section"](../plans/2026-10-12-pi-session-skills.md#2026-10-12--client-timing-section-from-pi-perf-log-records-bl-wdgq); `lib/pi-perf-records.mjs`, 22 tests in `tests/pi-session-stats.test.mjs`. README row update deferred to BL-svze while another session edits README.
