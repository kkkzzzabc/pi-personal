---
id: BL-s9tp
title: Treat agent-tty wait timeouts as failures in TUI tests
status: candidate
kind: Implementation
---

# BL-s9tp — Treat agent-tty wait timeouts as failures in TUI tests

- Outcome: TUI integration tests fail when an expected screen state never appears, instead of passing on a timed-out wait.
- Next action: Make the shared wait checks require `result.timedOut !== true` (or `matched`) in `tests/prompt-suggestions-tui`, `tests/subagent-tui`, and `tests/tui-check` integration tests, and document the behavior in `skills/tui-check/references/pi-tui-notes.md`.
- Done when: Every TUI test wait asserts a non-timeout result, and the full integration suite passes.
- Trigger: Observed while verifying BL-9vg3: `agent-tty wait` returned `ok: true` with `timedOut: true` (exit 11), so `ok`-only assertions cannot detect a missing screen state. A strict temporary copy of the prompt-suggestions TUI test still passed (5/5), so earlier conclusions hold.
- References: [Turn summary verification](../spikes/2026-10-12-turn-summary-verification.md).
- Approval: Candidate only.
