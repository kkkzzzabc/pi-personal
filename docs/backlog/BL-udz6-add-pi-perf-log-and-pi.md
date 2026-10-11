---
id: BL-udz6
title: Add the pi-perf-log row to the README resource table
status: done
kind: Implementation
---

# BL-udz6 — Add the pi-perf-log row to the README resource table

- Outcome: The README resource table lists `pi-perf-log` (extension, enabled by default, writes to `<agentDir>/perf`, no conversation content), so a reader learns from the README that the extension writes files. The skill rows (`perf-audit`, `pi-session-find`, `pi-session-stats`) are already present.
- Next action: Add the row once the README is not being edited by another session: `| \`pi-perf-log/\` | Extension | Per-turn timing (connect, TTFT, provider, tool span, overhead) and process memory to \`<agentDir>/perf/<sessionId>.jsonl\`; no conversation content; \`pi-perf-log.json\` to disable |`
- Done when: The row is present and accurate.
- Trigger: README.md free of other sessions' uncommitted edits.
- References: [pi-perf-log plan](../plans/2026-10-12-pi-perf-log.md); [session skills plan](../plans/2026-10-12-pi-session-skills.md).
- Approval: Approved in session `01a12bfb-c9ab-735a-8d64-9cb2385d9b31`.
- Closure: Done — row added to the [README resource table](../../README.md), including render frames from BL-u9b6 and a schema link.
