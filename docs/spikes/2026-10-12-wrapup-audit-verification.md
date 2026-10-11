---
title: Can a hybrid wrap-up audit steer once on rule misses and report judgments without overreach?
date: 2026-10-12
session: 01a12bfa-f0ef-7178-96d0-29ead0487e69
based_on:
  - docs/plans/2026-10-12-wrapup-audit.md
result: partial
---

# Can a hybrid wrap-up audit steer once on rule misses and report judgments without overreach?

## Question

Can an independent extension (a) request exactly one visible, in-scope
continuation when declared rules are missed in files changed during a request,
(b) report model-judged obligations without continuing the agent, and (c) stay
silent when nothing changed, the run failed, or files are outside the project?
Do small models judge the declared obligations accurately enough to report?

## Setup

- Implementation: `extensions/wrapup-audit/` using public host APIs
  (`agent_before_settle` entries + `continue`, `agent_settled`, `tool_call`,
  `tool_result`, `modelRegistry.streamSimple`, `ui.setStatus`/`notify`). No
  production import from `turn-summary` or another local feature.
- Host: Pi 1.1.0, release `432b36091-markdown-streaming-20261012-004142` (current
  PATH). TUI test: agent-tty 0.5.0, isolated faux run.
- Rules/judgments: the tracked `.pi/wrapup-audit.json` (7 rules, 5 judgments).
- Live: `openai/gpt-6-luna` and `anthropic/claude-haiku-5-5` through existing
  host authentication; six synthetic cases per model (paths, request and answer
  text only; no repository content). Evidence JSON in
  `artifacts/wrapup-audit/` (git-ignored).

## Result

**Partial.** Mechanisms (a) and (c) work as designed in unit, real-host, and
real-TUI checks; (b) works mechanically. Judgment quality differs by model:
after one prompt correction Haiku matched all six synthetic cases, while Luna
matched three, with one false positive. The default order was changed to
Haiku → Luna. Six cases per model do not establish general accuracy.

## Evidence

Offline (all pass, no skips):

| Suite | Feature tests | Full suite |
|---|---|---|
| `npm test` | 38 (`tests/wrapup-audit.test.mjs`) | 520 |
| `npm run test:integration` | 9 host + 1 TUI | 94 |

- Host (`tests/wrapup-audit.integration.test.mjs`): a created extension without
  a README row yields exactly one continuation; the model's next request contains
  the steering text; a still-missing item is reported but not steered again; a
  fix during the continuation makes the re-check clean; a second request steers
  again at most once; no continuation or judgment for no changes, an out-of-root
  write, or a failed edit; RPC/print modes do nothing; fallback uses the exact
  second model; coexisting with `turn-summary` gives one continuation, one
  judgment, and one summary.
- Unit: config fail-closed without echoing contents; each rule type positive and
  negative (amendment date heading in the Amendments section only, own-session
  records exempt); path resolution, created vs modified, failed calls ignored;
  steer-once and idle-input reset (mid-run steering keeps the request);
  abort/error outcomes skipped; strict parser; context size cap; stale judgment
  discarded after a new request.
- TUI: the `[wrapup-audit]` message renders once between the first answer and
  the continuation; footer `wrap-up: 2 to check`; one warning; `/wrapup-audit`
  lists the rule finding, the judgment note, and the model attempt.
- One full `npm run test:integration` run failed the new TUI test without
  captured detail. It passed in 7 single runs, 4 parallel runs, 6 parallel runs
  together with the other two post-turn TUI suites, and 2 further full-suite
  runs. Cause unknown; see the review follow-up below.

Live judgment (exact match of finding ids; clean cases expect none):

| Case | Expected | Luna run 1 | Luna run 2 | Haiku run 1 | Haiku run 2 |
|---|---|---|---|---|---|
| followup-missed | backlog-followups | none | none | none | ✓ |
| followup-registered | none | ✓ | false positive | ✓ | ✓ |
| adr-missed | adr-for-rules | ✓ | ✓ | ✓ | ✓ |
| glossary-missed | glossary | none | none | ✓ | ✓ |
| clean-feature | none | ✓ | ✓ | ✓ | ✓ |
| clean-typo | none | ✓ | ✓ | ✓ | ✓ |

Run 1 exposed a prompt defect: "do not report an item the final answer reports
as left open" excluded exactly the follow-up obligation. The rule was narrowed
to intentionally skipped or not-applicable obligations, noting that describing
unfinished work does not register it. Run 2 used the corrected prompt; no further
reruns were made. Luna's false positive cited the unverifiable "current backlog
item's status was updated" clause of the judgment text. Run 2 totals: 3,331
reported input tokens, about $0.0017.

Live TUI smoke (tui-check real mode, `anthropic/claude-haiku-5-5` as the parent,
tools `read,write,edit,ls`, isolated work dir with this repository's
`.pi/wrapup-audit.json` and a README without rows): asked only to create
`extensions/demo/index.ts`, the model wrote it and answered; the audit showed the
`[readme-extension]` steering once; the continuation **declined** the README
change as outside the request and said so, leaving README unchanged. The footer
kept `wrap-up: 1 to check`, Lane B returned no findings, and `/wrapup-audit`
showed `steered this request: yes`. Footer cost $0.001; judgment $0.000114;
`finish.mjs`: pi exited, tty destroyed, no config changes.

## Review follow-up

A user-requested Opus/Sol review (2/2 coverage, this item's files only) raised
six findings; all were confirmed against the code and host sources and fixed:

| Finding | Fix | Regression |
|---|---|---|
| `file://` paths resolved as relative, so an outside-root write counted as in-root | decode `file://` as the host's `resolveToCwd` does | unit (`resolveToolPath`, tracker) |
| Judgment request start inferred from message roles: merged a previous run ending on a tool result; split a request when steering followed a completed answer | record the last message entry at idle input; judge only messages after it | unit (both cases, missing start), host (second request excludes the first) |
| `maxContextChars` did not cover changed paths or obligations | trim changed paths last; skip the judgment if still over; reject configs whose judgments exceed half the cap | unit (1000/3000/12000 budgets with 80 long paths and 8 judgments) |
| `/wrapup-audit on|off` reset the once-per-request steering guard | toggles clear shown results only | unit (fails on the old code) |
| Missing or non-string ids passed validation (`RegExp.test` coerces) | require string ids | unit invalid-config cases |
| ADR 0002 referred to a missing amendment | amendment added | — |

The same role-inference defect existed in `turn-summary`; with the user's
approval it now records the turn start the same way (role inference remains
only as a fallback), with one unit and one host assertion.

[ADR 0005](../adr/0005-finish-in-session-work-before-registering-candidates.md)
then reclassified the earlier candidates: the `backlog-followups` judgment was
rewritten to check finish/ask/defer-with-reason (BL-4rjt, done), bash-made change
tracking was dropped by the user (BL-36sg), and the intermittent TUI failure was
investigated in-session (BL-u5hs, below).

Live re-evaluation (run 3, approved, rewritten judgment text, one added case for
deferring a defect in the request's own work, no prompt change):

| Case | Expected | Haiku | Luna |
|---|---|---|---|
| followup-missed | backlog-followups | ✓ | ✓ |
| followup-registered (with reason) | none | ✓ | ✓ |
| own-defect-deferred | backlog-followups | ✓ | none |
| adr-missed | adr-for-rules | ✓ | ✓ |
| glossary-missed | glossary | ✓ | none |
| clean-feature | none | ✓ | ✓ |
| clean-typo | none | ✓ | ✓ |

Haiku 7/7, Luna 5/7; no false positives on clean cases.

BL-u5hs: five further full integration runs, the single runs, and the parallel
runs all passed. The hypothesis that `Enter` on an open completion list does not
submit `/wrapup-audit` was tested in an isolated TUI and refuted. The test now
waits for the completion list instead of a fixed 300 ms window and prints the
last screen on failure.

A stress check followed: two full integration suites ran concurrently while the
TUI test ran 16 times (8 with the original 300 ms version, 8 with the current
one). All 16 and both suites passed; the original version once took 29.0 s and
passed, so the failed run's 23.8 s does not indicate a wait timeout. The only
condition unique to the failure window (02:42–02:47 local) was another session's
concurrent work: it switched the Pi fork release to `frame-stats` at 02:36 and
committed pi-perf-log changes at 02:45. All later runs used the same release.
The failed run's scratch directory was removed, so no evidence remains. With
eight passing full-suite runs and over 40 passing TUI runs since, BL-u5hs was
dropped; a recurrence now prints its last screen and gets a new item.

Final offline totals after the follow-up: feature tests 43 unit, 9 host, 1 TUI
(`turn-summary`: 58 unit, 11 host); full suites 537 unit and 94 integration
tests passing without skips (counts include another session's concurrently
committed tests).

## Implications

- Lane A is ready for natural use; its main residual risk is one extra turn on
  a rule false positive, which the message lets the agent decline. The live
  smoke shows the scope clause works: for a narrow request the model reported
  instead of expanding scope, so the item still reaches the user.
- Lane B is advisory. Use Haiku first; review its usefulness after natural use
  before adding judgments or changing the steering boundary.
- No open follow-ups remain. The single TUI failure was not reproducible and was
  dropped (BL-u5hs); the test prints its screen if it recurs.
