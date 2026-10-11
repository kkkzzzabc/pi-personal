---
id: BL-znnb
title: Build pi-session-find and pi-session-stats skills
status: done
kind: Implementation
---

# BL-znnb — Build pi-session-find and pi-session-stats skills

- Outcome: Two read-only skills that answer questions about local pi session files: which sessions exist and what happened in them (`pi-session-find`), and how models, tools, cost and workload sizes behave across sessions (`pi-session-stats`). The stats feed real workload sizes into `perf-audit`, replacing the reference-fork evidence that earlier performance work depended on.
- Done when: Both skills run from a fresh pi session against the real sessions directory; `node --test` for the three new test files passes; SKILL.md states the read-only, stdout-only boundary and the metric limits (no TTFT, render time or memory).
- References: [Plan](../plans/2026-10-12-pi-session-skills.md); [scratch boundary candidate](BL-nzsc-clarify-read-only-session-analysis-scratch.md).
- Approval: Implementation and offline verification approved (session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`).
- Closure: Done — [plan](../plans/2026-10-12-pi-session-skills.md); 43 tests in `tests/pi-sessions-lib.test.mjs`, `tests/pi-session-find.test.mjs`, `tests/pi-session-stats.test.mjs`; both scripts verified against the real sessions directory (61 sessions, 0.5 s).
