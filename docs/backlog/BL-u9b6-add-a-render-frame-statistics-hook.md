---
id: BL-u9b6
title: Add a render-frame statistics hook to the pi fork for pi-perf-log
status: done
kind: Design
---

# BL-u9b6 — Add a render-frame statistics hook to the pi fork for pi-perf-log

- Outcome: The pi fork exposes per-turn render-frame statistics (frame count, total, p95, max, frames over 16 ms) through a small TUI hook, and `pi-perf-log` fills the reserved `frames` field. Gives the client-side render measurement that extension events cannot provide.
- Next action: Design the hook in `packages/tui/src/tui.ts` around the three `doRender()` call sites (aggregate per turn, no per-frame disk writes) and how coding-agent or an extension reads it.
- Done when: A fork change with tests exposes the statistics; `pi-perf-log` records `frames` for turns in TUI mode; the schema is bumped or extended and documented.
- Trigger: A reported render slowness that `overheadMs` cannot attribute, or after BL-wdgq ships and needs the breakdown.
- References: [pi-perf-log plan](../plans/2026-10-12-pi-perf-log.md); fork `packages/tui/src/tui.ts` render scheduling.
- Approval: Design, fork and pi-perf-log implementation, local fork install and offline verification approved (session `01a12bfb-c9ab-735a-8d64-9cb2385d9b31`).
- Closure: Done — [plan amendment "Render-frame statistics"](../plans/2026-10-12-pi-perf-log.md#2026-10-12--render-frame-statistics-bl-u9b6); `ctx.ui.takeFrameStats()` in the fork, `frames` filled in TUI mode and `null` in print/RPC (faux-model runs).
