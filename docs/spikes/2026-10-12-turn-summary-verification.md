---
title: Can a post-turn summary widget stay accurate, independent, and non-intrusive in Pi?
date: 2026-10-12
session: 01a12b89-d473-7178-96d0-29dd15f8ee44
based_on:
  - docs/plans/2026-10-12-turn-summary.md
result: yes
---

# Can a post-turn summary widget stay accurate, independent, and non-intrusive in Pi?

## Question

Can an independent extension summarize each completed turn (scope C) above the
editor without continuing the agent, leaking stale results, interfering with
prompt suggestions, or overstating completion?

## Setup

- Implementation: `extensions/turn-summary/` using public host APIs only; no
  production import from `prompt-suggestions` or any other local feature.
- Host: Pi 1.1.0, release `432b36091-markdown-streaming-20261012-004142` (current
  PATH), pinned with `PI_PACKAGE_DIR` for all offline suites. TUI tests used a
  temporary PATH wrapper to that release's CLI; agent-tty 0.5.0.
- Live: `openai/gpt-6-luna` and `anthropic/claude-haiku-5-5` via existing host
  authentication in place; seven synthetic cases per model; no tools, real
  transcripts, or repository content.

## Result

**Yes, within the tested scope.** The widget appears above the editor only after a
normally settled turn, remains while typing, is cleared by a new prompt or session
change, and rejects late results. It coexists with the prompt-suggestion ghost
(summary above, ghost inside the editor; Tab still accepts without submitting).
In fourteen synthetic live cases neither model described unfinished, failed, or
unverified work as done.

## Evidence

### Offline

```text
node --test tests/turn-summary.test.mjs                    50 passed
PI_PACKAGE_DIR=<host> node --test tests/turn-summary.integration.test.mjs   11 passed
PI_PACKAGE_DIR=<host> node --test tests/turn-summary-tui.integration.test.mjs  3 passed
PI_PACKAGE_DIR=<host> npm test                             468 passed; 0 failed; 0 skipped
PI_PACKAGE_DIR=<host> TUI_CHECK_KEEP_TEST_RUNS=1 npm run test:integration   84 passed; 0 failed; 0 skipped
```

- Unit: config validation and trust; scope-C context with goal, current turn, two
  recent messages, and a trace limited to tool name/success/path (secret
  arguments, commands, results, and thinking absent); caps; unverified previous
  summary only for an ancestor leaf; strict output; fallback, deadline, and
  cancellation; stale rejection on nine lifecycle events and leaf change;
  warning dedupe; non-TUI no-op.
- Host: one nested call and no parent messages or turns; widget placement
  `aboveEditor`; second turn receives `previousSummary`; exact fallback models;
  no call or widget in rpc/json/print; continuation settles before exactly one
  summary; session replacement and `/turn-summary off` discard late work;
  shutdown removes the widget; width-safe Unicode at 4–100 columns; theme changes.
- Faux TUI (fullscreen 100 columns and regular 40 columns, with
  `prompt-suggestions` loaded): `▏Done/▏Open/▏Next` render above the editor and
  the ghost; Tab makes no parent call; the summary stays while typing; submitting
  replaces `SUMMARY-1` with `SUMMARY-2`; `/turn-summary off|on`. A summary request
  pending when the next prompt is submitted never appears. All three owned TUI
  sessions exited and were destroyed.

Initial failures were fixed in the tests, not waived: two host tests assumed the
provider context's message shape, and the TUI fixture assumed a `systemPrompt`
field, which made the fake provider throw. No feature code changed for them.

### agent-tty timeout finding

`agent-tty wait` returned `ok: true` with `result.timedOut: true` (exit 11) for text
that never appeared, so assertions on `ok` alone cannot detect a missing state.
The turn-summary TUI helper now fails on `timedOut`. A strict temporary copy of the
committed `tests/prompt-suggestions-tui.integration.test.mjs` (not saved to the
repository) passed 5/5, so its earlier verification conclusions hold. Remaining
tests are tracked in [BL-s9tp](../backlog/BL-s9tp-treat-agent-tty-wait-timeouts-as.md).

### Live evaluation

`node tests/turn-summary-live.mjs --run` → `artifacts/turn-summary/live-evaluation.json`
(final run). Manual inspection of each case:

| Case | Luna (final) | Haiku (final) |
|---|---|---|
| complete | done incl. 42 tests passing; open/next null | same; next suggests reviewing/committing (not requested) |
| partial (1 of 2) | done 1 fix; open: timeout test still failing | same |
| failing check (claims fixed, test run failed) | open: command failed, not verified | same |
| tool error | open: README not updated | same; next phrased as an offer to act |
| read-only explanation | done = explanation; next null | **abstained** |
| trivial question | abstained | abstained |
| stale previous ("all passing") vs new failure | follows current turn: open = new failure | same |

Latency: Luna 1.9–5.6 s, Haiku 1.0–4.0 s per case (final run). A first run used an
earlier abstention rule; Luna then summarized the trivial case instead of
abstaining, and Haiku summarized the read-only case. Factual cases behaved the same
in both runs. The first run's evidence file was overwritten by the final run; its
outputs were reviewed in the session before the change.

Isolated live TUI (`artifacts/turn-summary/live-tui/`, Luna, no tools): after the
user asked to explain only one of three concepts, the widget showed
`Done` (explained input validation) and `Open` (timeout and retry left
unexplained). `/turn-summary` reported Luna success, 4035 ms, input/output 396/67.
`finish.json`: pi exited, TTY destroyed, `configChanges: []`, one parent call.

### Review fixes (follow-up in the same session)

A configured Opus/Sol review of this session's uncommitted work completed with
2/2 coverage and six findings. Each was re-checked against the code and Pi 1.1.0
host sources before fixing:

| # | Finding | Host or code evidence | Fix |
|---|---|---|---|
| 1 (P1) | Model or thinking change hid the summary | `appendModelChange`/`appendThinkingLevelChange` move the leaf; `current()` compared the raw leaf | Compare the last message entry instead of the raw leaf |
| 2 (P1) | Tool trace and previous summary were outside the 12,000-character cap | Context built from per-part caps only | Whole serialized context bounded; failed tools kept longest |
| 3 (P2) | Steering split the turn and dropped earlier tool failures | `_queueSteer` → `agent.steer` inserts a `user` message mid-run | Walk back past mid-run user messages; request joins all of them |
| 4 (P2) | Output with missing `open`/`next` was accepted | Parser defaulted absent keys to null | Require all three keys |
| 5 (P2) | A thrown error warned with the previous result's outcome | Lookup outside `try`; controller kept old `last` | Clear `last` on a thrown failure |
| 6 (P2) | Record said eleven events; reset test lacked its assertion | Loop covers nine events | Wording fixed; success-reset assertion added |

The success reset in #6 already worked; only its assertion was missing. The
previous "leaf change" unit test was replaced with a new-message test, because a
raw leaf change alone no longer means a new turn.

After the fixes: 57 unit, 11 host, and 3 TUI feature tests pass. Full integration
suite: 84 passed, no failures or skips; the three owned TUI sessions exited and
were destroyed. Full unit suite: 472 of 475 passed; the 3 failures were all in
`tests/pi-perf-log.test.mjs`, whose extension files another session was editing
(uncommitted) during the run and which this work does not touch. Excluding that
file, 456 of 456 passed with no skips. After that session committed its fix
(`fccaf3a`), the full unit suite was rerun: 479 of 479 passed with no skips
(`artifacts/turn-summary/review-fixes-*.txt`). The prompt text did not change, so the live evaluation
was not repeated; the context-size and steering changes affect only larger or
steered turns, which the synthetic live cases did not include.

## Implications

The feature can ship as an independently usable extension, enabled by default in
TUI after `/reload` or a new session, with `/turn-summary off` available. Known
limitations: Haiku may abstain on explanation-only turns and may phrase `Next` as
the agent's offer or add an unrequested suggestion; residual risk of overstated
completion remains outside the tested cases; samples are small and synthetic;
hardware IME and every third-party widget combination were not tested.
No global configuration was changed and no commit was made.
