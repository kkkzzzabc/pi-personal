---
title: Hybrid wrap-up audit for instruction and document obligations
date: 2026-10-12
session: 01a12bfa-f0ef-7178-96d0-29ead0487e69
based_on:
  - docs/research/2026-10-12-post-turn-assistance.md
  - docs/research/2026-10-11-verification-options-for-pi.md
  - docs/plans/2026-10-12-turn-summary.md
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
---

# Hybrid wrap-up audit for instruction and document obligations

## Goal

At the end of a request, catch project instruction/document obligations the
agent overlooked, so the user does not have to ask whether docs are in sync.
One build item: [BL-yun3](../backlog/BL-yun3-decide-an-automatic-session-wrap-up.md).

The user compared report-only reminders, steering-only, and a hybrid in a visual
explanation and chose the **hybrid**, including the model-judged report lane.
Design, implementation, documentation, offline checks, a tracked project config,
and bounded synthetic Luna/Haiku calls were approved through plan mode in the
creating session (`/Users/kkkzzzabc/.pi/plans/20261012-022700-crisp-tide.md`).

## Non-goals

No automatic file edits by the extension, no retraction of already streamed text,
no persistence, no `git diff` of other sessions' work, no Jev or other new
dependency, no global settings or trust changes, and no runtime dependency on
another local feature. Report quality (unrun checks claimed as passed) stays in
[BL-005](../backlog/BL-005-define-a-personal-pi-verification-workflow.md).

## Design

### Two lanes

| Lane | Obligations | Trigger and action |
|---|---|---|
| **A. Deterministic → bounded steering** | Declared path rules (#1–#4 below) | `agent_before_settle`: on a miss, append one visible custom message and `continue: true`, at most once per user request. No model call. |
| **B. Judgment → report only** | Declared judgment texts (#5–#8) | `agent_settled`: Haiku → Luna strict JSON with abstention; footer, one notification, `/wrapup-audit`. Never continues or edits. |

Splitting by detectability keeps the cost of a false positive proportional: a
deterministic rule rarely misfires, so it may cost one extra turn; a model
judgment can be wrong, so it only informs the user. The steering text permits
declining: fix only within the current request's scope and permissions,
otherwise report each unfixed item.

Jev was not adopted: Lane A needs no classifier, Lane B reuses the bounded
small-model pattern proven in `turn-summary`, no Jev use for this task was found,
and it would add a dependency and possibly external transmission. Revisit only
if Lane B false positives prove unacceptable.

### Generic feature, project rules in config

`extensions/wrapup-audit/` contains no built-in rules. Config is read from
`<agentDir>/wrapup-audit.json`, then trusted project `.pi/wrapup-audit.json`
(later files replace whole fields). Unknown or invalid fields disable the
feature with one error and no file contents in diagnostics. Without rules and
judgments it does nothing.

A bare `.pi/` with only this JSON file is not a trust-requiring project resource
in Pi 1.1.0 (`dist/core/trust-manager.js` `hasTrustRequiringProjectResources`),
so `isProjectTrusted()` is true and the tracked repository config loads without
changing `~/.pi/agent/trust.json`. Adding protected `.pi/` resources later would
make the trust decision apply.

Rule types (repository-relative paths, regex from trusted config):

| Type | Applies to | Passes when |
|---|---|---|
| `mention` | files **created** this request matching `match` | `file` contains `mustContain`, with `$1` replaced by the first capture |
| `frontmatter` | created files matching `match` | frontmatter has every key in `keys` |
| `amendment` | **modified** pre-existing files matching `match` whose frontmatter `session` differs from the current session | an `### <today>` heading follows `## Amendments` |
| `field-line` | changed files matching `match` whose frontmatter `field` is in `values` | a line starts with `linePrefix` |

This repository's `.pi/wrapup-audit.json` maps the inspected obligations:

| # | Obligation (source) | Encoding |
|---|---|---|
| 1 | New extension/skill/prompt gets a README Resources row (`README.md`) | `mention` rules |
| 2 | New record frontmatter (`docs/README.md`) | `frontmatter` |
| 3 | Amendment after the creating session (`docs/README.md`) | `amendment`; typo-only edits may be declined |
| 4 | Closure line for done/dropped items (`docs/README.md`) | `field-line` |
| 5 | Remaining work finished, asked once, or deferred with a reason ([ADR 0005](../adr/0005-finish-in-session-work-before-registering-candidates.md)) | judgment |
| 6 | Replacement records linked both ways (`docs/README.md`) | judgment |
| 7 | ADR for standing-rule changes; glossary for new terms (`docs/README.md`) | judgments |
| 8 | English docs; reuse attribution (project `AGENTS.md`) | attribution as judgment; English not encoded |

English-language checking is not encoded: Lane B sees paths, not file contents,
so it could only guess.

### Changed-file tracking

`tool_call`/`tool_result` for built-in `write` and `edit` record the resolved path
and whether the file existed before the first change in this request; failed
calls are ignored. Only paths inside the project root (Git top level, else `cwd`)
are checked, so plan files under `~/.pi/plans` are excluded without referring to
plan mode. Bash-made changes are not tracked. State resets on an idle submitted
prompt; steering messages typed during a run keep it.

### Lifecycle

- Lane A skips non-TUI modes, `outcome !== "completed"`, no changed files, or a
  request already steered. After the continuation, a re-check records remaining
  misses for display but never steers again. The host itself refuses a
  continuation without runnable context.
- Lane B runs after normal settlement in TUI mode, idle with no queued work, only
  when files changed. Context: messages after the last message entry recorded at
  idle input (the request with its steering messages, the final answer, the tool
  trace with name, success, and `path` only), changed repository-relative paths,
  and judgment texts, capped in total by `maxContextChars`. Output
  `{"findings":[{"id","note"}]}` (at most 3, configured ids only) or `{"findings":[]}`. Malformed output is not retried;
  the second model is used only for unavailable/auth/provider/timeout failures.
  Stale results are rejected by revision, session, and last message entry.
- Results live in memory. A new request, session change, or shutdown clears them.

### Modules

`index.ts` (host imports), `extension.ts` (events, commands), `config.ts`,
`paths.ts`, `rules.ts` (pure Lane A checks), `judge.ts` (context, prompt, parser,
model chain). Patterns from `turn-summary` are duplicated in small form, not
imported.

## Phases

1. Records: BL-yun3 active with approval; this plan.
2. Implementation and `.pi/wrapup-audit.json`.
3. Unit, pinned-host integration, and isolated faux TUI tests.
4. Bounded synthetic live evaluation and one live TUI check.
5. README, verification record, amendments, backlog closure. No commit unless
   requested.

## Implementation and verification outcome

Completed in the creating session; details in the
[verification record](../spikes/2026-10-12-wrapup-audit-verification.md).
38 unit, 9 host, and 1 TUI test for this feature; full suites 520 unit and 94
integration tests passing without skips. One full integration run failed the new
TUI test without captured detail and could not be reproduced
([BL-u5hs](../backlog/BL-u5hs-diagnose-an-intermittent-wrap-up-audit.md)).

Two changes followed the live evaluation:
- The judgment prompt's exclusion ("do not report items the answer reports as
  left open") hid the follow-up registration obligation in both models. It now
  excludes only obligations stated as intentionally skipped or not applicable.
- After the corrected run, Haiku matched 6/6 synthetic cases and Luna 3/6 with
  one false positive, so the default order became Haiku → Luna.

### Review follow-up

A two-model review found six defects, all fixed in the same session (see the
verification record): `file://` path handling, the judgment's request boundary
(now the last message entry recorded at idle input instead of role inference),
a total context cap that ignored changed paths and obligations, the on/off
command resetting the steering guard, unchecked id types, and a missing ADR
amendment. The boundary fix was applied to `turn-summary` as well, with approval.
Under [ADR 0005](../adr/0005-finish-in-session-work-before-registering-candidates.md)
the `backlog-followups` judgment now checks finish/ask/defer-with-reason
(re-evaluated: Haiku 7/7, Luna 5/7, no false positives), bash-made change
tracking was dropped by the user
([BL-36sg](../backlog/BL-36sg-track-bash-made-file-changes-in.md)), and the
unreproduced TUI failure was stress-tested and dropped
([BL-u5hs](../backlog/BL-u5hs-diagnose-an-intermittent-wrap-up-audit.md)).

## Risks and open questions

- A Lane A false positive costs one extra turn; the message permits declining.
- Another session editing the same file concurrently can still trigger a check.
- Streamed success text before steering is not retracted.
- Lane B sends the request, answer, trace, and paths to configured providers;
  `judge: false` disables it.
- A small synthetic sample does not establish general Lane B accuracy.
