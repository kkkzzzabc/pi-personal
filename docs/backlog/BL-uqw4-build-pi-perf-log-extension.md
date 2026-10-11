---
id: BL-uqw4
title: Build pi-perf-log extension
status: done
kind: Implementation
---

# BL-uqw4 — Build pi-perf-log extension

- Outcome: Per-turn client timing (connect, time to first token, provider duration, tool time, overhead) and process memory recorded from pi extension events into `<agentDir>/perf/<sessionId>.jsonl`, without conversation content and without fork changes. Supplies the metrics that session files lack, for `pi-session-stats` and `perf-audit`.
- Done when: `node --test tests/pi-perf-log.test.mjs` passes; a faux-model `tui-check` run produces `session`, `turn` and `prompt` lines; the schema is documented; handlers never propagate errors.
- References: [Plan](../plans/2026-10-12-pi-perf-log.md); [session skills plan](../plans/2026-10-12-pi-session-skills.md).
- Approval: Implementation and offline verification approved (session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`).
- Closure: Done — [plan](../plans/2026-10-12-pi-perf-log.md); 19 tests in `tests/pi-perf-log.test.mjs`; faux-model `tui-check` run produced `session`, two `turn`, and `prompt` lines (session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`).
