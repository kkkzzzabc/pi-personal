---
title: Can next-prompt ghosts remain optional and non-submitting in Pi?
date: 2026-10-12
session: 01a12b89-d473-7178-96d0-29dd15f8ee44
based_on:
  - docs/plans/2026-10-12-next-prompt-suggestions.md
  - docs/research/2026-10-12-post-turn-assistance.md
result: yes
---

# Can next-prompt ghosts remain optional and non-submitting in Pi?

## Question

Can an independent extension generate a next-user prompt in the background,
show it without changing input, and accept it with Tab without submitting or
continuing the parent agent, while rejecting stale results?

## Setup

Implemented `extensions/prompt-suggestions/` with public host APIs. No reference
package was installed, no source code was copied, and no other production feature
was imported. Default models are `openai/gpt-6-luna` and
`anthropic/claude-haiku-5-5`, with the latter used for terminal availability/request
failure, not consensus or quality escalation.

Offline full-suite checks used Pi 1.1.0 with `PI_PACKAGE_DIR` pinned to
`/Users/kkkzzzabc/.local/share/pi-fork/releases/4787ab4ac-perf-batch-20261012-000822/node_modules/@earendil-works/pi-coding-agent`.
The suggestion TUI tests also made a temporary PATH wrapper pointing to that
release's CLI, so their executable and imported host matched. agent-tty was 0.5.0.

A separate 15-test host check also passed on the current PATH release
`432b36091-markdown-streaming-20261012-004142` (Pi 1.1.0), after another session
updated the local fork installation. The live TUI used PATH's Pi 1.1.0 rather
than the offline pinned wrapper; its launch did not record an executable release
hash, so it is not claimed as a hash-pinned live experiment.

The explicit live evaluation sent six short synthetic user/assistant pairs per
model, with no tools, actual user transcripts, repository content, or unrelated
providers. Authentication used the existing host runtime in place, never copied.
The isolated live TUI loaded only the suggestion extension and test observer,
disabled discovery/MCP/context files/tools, and used a synthetic explanatory task.

## Result

**Yes within the tested scope.** Optional ghost display, Tab acceptance without
submission, editing and normal submission, native completion, cancellation and
session/lifecycle invalidation were supported without a fork change. Full offline
regression suites passed with no skips. Both live models produced valid bounded
JSON in all six synthetic cases; each suggested twice and abstained four times.
This is not an open-ended semantic reliability or platform-wide IME guarantee.

## Evidence

### Offline automated checks

Final commands and results:

```text
npm test
342 passed; 0 failed; 0 skipped

PI_PACKAGE_DIR=<pinned-host> TUI_CHECK_KEEP_TEST_RUNS=1 npm run test:integration
65 passed; 0 failed; 0 skipped

node --test tests/prompt-suggestions.integration.test.mjs
15 passed on the current PATH host; 0 failed; 0 skipped
```

- Unit tests cover config/trust boundaries, text-only capped context, output
  safety, strict selection/fallback/abstention, deadlines, cancellation and
  stale-identity handling (`tests/prompt-suggestions.test.mjs`).
- Host tests verify no suggestion text enters the parent's messages, no extra
  parent model turn, Tab versus Enter behavior, paste/history, exact fallback,
  non-TUI zero-call behavior, custom-editor conflict, actual session replacement,
  continuation-before-final-settlement, generic blocking UI events, Unicode width,
  theme changes, and inherited application callbacks
  (`tests/prompt-suggestions.integration.test.mjs:74-141`).
- Real faux TUI tests run fullscreen and regular (100/40 columns), showing ghost
  → Tab → edited input → user Enter. The parent-input log includes the edited
  request only after Enter. Slash Tab completion, history and on/off work;
  Escape during delayed inference prevents a later ghost
  (`tests/prompt-suggestions-tui.integration.test.mjs:56-86`).
- The final three owned suggestion TUI sessions all report `piExited: true` and
  `ttySessionDestroyed: true` in their `finish.json` files.

Retained final evidence:

- `artifacts/prompt-suggestions/unit-tests.txt`
- `artifacts/prompt-suggestions/integration-tests.txt`
- `artifacts/prompt-suggestions/current-host-tests.txt`
- `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/suggestions-tui-S00gOV/`
  (fullscreen, regular, pending runs; synthetic screens/logs and cleanup receipts)

These ignored/local artifacts are not portable repository prerequisites. Tests
reproduce the checks; no production transcript persistence was introduced.

### Live-model evaluation

`node tests/prompt-suggestions-live.mjs --run` produced
`artifacts/prompt-suggestions/live-evaluation.json` with synthetic fixtures,
validated outputs, attempts, latency and available usage.

| Model | Useful remaining explanation | Read-only continuation | Complete / unresolved choice / explicit stop / untrusted instruction | Latency range | Median |
|---|---|---|---|---|---|
| `openai/gpt-6-luna` | Suggested the second error explanation | Suggested further timeout explanation without editing | Abstained in all four cases | 2153–3355 ms | 2319.5 ms |
| `anthropic/claude-haiku-5-5` | Suggested the second error explanation | Explicitly retained read-only/no-file-edit scope | Abstained in all four cases | 892–3405 ms | 1003.5 ms |

All 12 outputs matched the expected contract and broad case intent on manual
inspection. The Korean suggestions were grounded in the synthetic remaining
explanation. This is a small, non-blinded, single-sample-per-case evaluation;
it is not a statistically sufficient model ranking or instruction-injection
robustness proof. Reported model cost metadata totals were $0.0002111 for Luna
and $0.0004516 for Haiku; subscription billing can differ from these estimates.
Cost was not an implementation restriction.

### Isolated live TUI

`artifacts/prompt-suggestions/live-tui/` contains synthetic screens and cleanup:

- The primary model explained input validation, leaving timeout/retry for later.
- Ghost suggestion: `타임아웃을 설명해주세요.`
- Tab accepted it, removed acceptance guidance, and left parent-call count at
  **1 before and 1 after Tab**. It was not submitted in this live check.
- Status reported Luna success, 3019 ms, input/output 348/17. Parent native usage
  and extension usage stayed explicitly separate.
- `finish.json`: Pi exited, TTY session destroyed, and `configChanges: []` for
  settings/keybindings/models/trust. The user's own TUI was not touched/reloaded.

### Verification fixes and limits

Initial failures were corrected, not waived: the host test needed theme
initialization; the TUI test read the wrong cleanup field and concatenated a
command with existing completion text; the continuation fixture needed runnable
custom-message context, not a bare continuation flag. Final suites passed after
fixes. The controller also gained an explicit discarded state for an implicit
identity change, preventing a finished stale request from appearing perpetually
in progress.

Hardware IME candidate-window placement, every external-editor program, repeated
natural-use quality, live provider outage/retry races, and coexistence with every
third-party editor were not comprehensively tested. Cursor-marker placement,
application callback delegation, modeled failures and generic ownership conflicts
were tested. The feature declines conflicting custom-editor ownership instead
of promising universal composition. Bounded recent conversation text is not
secret-redacted; users must disable suggestions for data they do not want sent
to the configured providers.

### User-approved review fixes

A configured Opus/Sol review completed with 2/2 coverage (perf-audit excluded).
The parent verified four P2 findings against source, reproduced repeated warning
and stale status behavior in memory, and the user requested all four fixes plus
keybinding-aware submit guidance. The initial checks above did not cover these
specific conditions; their historical results are retained rather than rewritten.

- Skip manual history seeding on `session_start.reason === "startup"`, because the
  host populates that editor afterward. Reload/resume/fork still seed through the
  public API. Actual saved-session TUI Up navigation captured
  `HISTORY-SECOND`, `HISTORY-FIRST`, `HISTORY-FIRST`, without duplicated history.
- Give registered shortcuts priority in the ghost-accept branch without double
  dispatch. The actual TUI Tab override ran once, kept input empty, and made no
  extra parent call. An unhandled shortcut still permits normal acceptance.
- Retain identical-failure warning dedupe through generating/idle states; reset
  it on ready/abstained or explicit feature model/on/off changes. Two unavailable
  turns warn once; a successful turn or explicit model change permits a new alert.
- Clear this extension's status key when editor ownership is lost, on both delayed
  completion and disable, without replacing or clearing the other editor.
- Render submit guidance from `tui.input.submit`, including multiple remapped keys,
  rather than hard-coded Enter.

New regression checks failed before the source fixes (four unit and three host
failures) and passed afterward. Follow-up verification:

```text
npm test
390 passed; 0 failed; 0 skipped

PI_PACKAGE_DIR=<original pinned host> TUI_CHECK_KEEP_TEST_RUNS=1 npm run test:integration
70 passed; 0 failed; 0 skipped

node --test tests/prompt-suggestions.integration.test.mjs
18 passed on current PATH release 432b36091-markdown-streaming-20261012-004142
```

The unit total includes 43 session-skill tests that another session added to the
shared test script. This repair adds five unit, three host, and two TUI checks.
No live suggestion-model calls were rerun; inference prompts/data/fallback were
unchanged. Review delegation was separately authorized by the user.

Evidence:

- `artifacts/prompt-suggestions/review-fixes-unit-tests.txt`
- `artifacts/prompt-suggestions/review-fixes-integration-tests.txt`
- `artifacts/prompt-suggestions/review-fixes-current-host-tests.txt`
- `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/suggestions-tui-4nlcbJ/`
  (five final offline TUI runs and cleanup receipts)

All five final owned TUI sessions were exited and destroyed. The shared README
rows and package test-script additions from the other session were preserved;
those implementations were not part of this review/fix scope. No commit was made.

## Implications

The first feature can be delivered as an independently usable extension. A user
initiates `/reload` or a new session to activate it; it is enabled by default in
TUI, with `/prompt-suggestions off` available immediately. No global configuration edits or manual credential changes were made; host-managed
authentication was used in place. No commit/install was performed.

[BL-5qvq](../backlog/BL-5qvq-build-contextual-next-prompt-suggestions.md) is complete.
[BL-9vg3](../backlog/BL-9vg3-build-post-turn-summaries-and-next.md) remains the next
candidate in the agreed sequence, not started. BL-yun3 remains a later candidate
for instruction/document-update auditing; no automatic steering was implemented.
