---
id: BL-4egs
title: Feed real session workload sizes and timing into perf-audit references
status: candidate
kind: Implementation
---

# BL-4egs — Feed real session workload sizes and timing into perf-audit references

- Outcome: `skills/perf-audit/references/workloads.md` picks test sizes from measured data: `pi-session-stats` workload maxima (largest write arguments, tool results, longest session) and, once available, `pi-perf-log` TTFT, overhead and render-frame (`frames.p95Ms`, `maxMs`, `over16Ms`) distributions. Replaces the guessed sizes with evidence and documents how to refresh them.
- Next action: Add a short "Measured sizes" subsection with the current maxima and the command that produced them.
- Done when: The reference names the measurement date, command, and values, and `perf-audit` instructs agents to refresh them before an audit.
- Trigger: Next performance audit, or when BL-wdgq lands.
- References: [perf-audit skill](../../skills/perf-audit/SKILL.md); [session skills plan](../plans/2026-10-12-pi-session-skills.md).
- Approval: Candidate only.
