---
title: Independent post-turn summary widget
date: 2026-10-12
session: 01a12b89-d473-7178-96d0-29dd15f8ee44
based_on:
  - docs/research/2026-10-12-post-turn-assistance.md
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
  - docs/plans/2026-10-12-next-prompt-suggestions.md
---

# Independent post-turn summary widget

## Goal

After each successfully completed TUI turn, show up to three lines above the input
editor: **Done** (what the turn did), **Open** (failed, unfinished, or unverified
results), and **Next** (a suggested next action), so the user can see progress
without rereading the conversation. One build item:
[BL-9vg3](../backlog/BL-9vg3-build-post-turn-summaries-and-next.md).

The user compared options in a visual explanation and chose **scope C** (current
turn plus short session context) and **placement 1** (above-editor widget). Design,
implementation, documentation, offline checks, and bounded synthetic Luna/Haiku
calls were approved through plan mode in the creating session
(`/Users/kkkzzzabc/.pi/plans/20261012-013742-warm-ember.md`).

## Non-goals

No document mutation, persistence or long-term memory, agent continuation, or
steering; instruction/document-update auditing remains
[BL-yun3](../backlog/BL-yun3-decide-an-automatic-session-wrap-up.md). No install,
global settings edit, fork change, or runtime dependency on another local feature.

## Design

### Alternatives considered

| Scope | Outcome |
|---|---|
| A. Current turn only | Fast and easy to verify, but cannot say what remains of the session goal. |
| B. Whole session | Shows long-running progress, but input and latency grow with the session and old or other-branch content can leak in. |
| **C. Current turn + short context (chosen)** | Shows the turn result relative to the goal with bounded input; a wrong previous summary could propagate, so the current turn takes precedence. |

| Placement | Outcome |
|---|---|
| **Above-editor widget (chosen)** | Persistent, non-blocking, does not overlap the prompt-suggestion ghost inside the editor. |
| Below-editor widget | Alternative; sits next to the footer and is less noticeable. |
| Footer status | One line truncates three fields; used only for `summarizing…`/`summary failed`. |
| Notification | Transient and noisy every turn; used only for failures. |
| Transcript entry / overlay | Deferred: would need verified exclusion from model context, or would block work. |

### Public host contracts

Pi 1.1.0 (current PATH release `432b36091-markdown-streaming-20261012-004142`):
`agent_settled`, active-branch `getBranch()/getSessionId()/getLeafId()`,
`modelRegistry.find()/streamSimple()`, and `ui.setWidget(key, factory,
{ placement: "aboveEditor" })`. The host replaces and disposes a widget by key
(`interactive-mode.js` `setExtensionWidget`).

### Modules and independence

`extensions/turn-summary/` contains `index.ts` (public host imports), `extension.ts`
(lifecycle and commands), `config.ts`, `controller.ts` (revision-based stale
rejection), `summary.ts` (context, prompt, parser, model chain), and `widget.ts`.
Patterns proven in `prompt-suggestions` (settle gating, identity checks, bounded
two-model chain, strict JSON, fail-closed config, warning dedupe) are duplicated
in small form rather than imported, so neither feature depends on the other.

### Context and data (scope C)

From the active branch only: the first user message (goal), the latest request
and final assistant text, up to two earlier text messages, and this turn's tool
trace (tool name, success/error, and the `path` argument only). The previous
summary is included only when it was produced on an ancestor of the current leaf
in the same session, and is labeled unverified. Per-part caps keep the current
turn from being displaced, and the whole serialized context, including the tool
trace and previous summary, is held within `maxContextChars` (default 12,000):
successful tool entries, older messages, the goal, and the previous summary are
dropped first, then the request and answer are shortened, and failed tool entries
go last. A steering message sent mid-run stays in the same turn, so earlier tool
failures are not lost. Thinking, images,
other tool arguments, commands, tool results, system or global instructions,
other branches, and files are excluded. Summaries live in memory only.

The tool trace was added to the plan to reduce overstated completion: the model
can see that a test command failed even when the final answer sounds successful.

### Output and lifecycle

Strict JSON `{"summary": {done, open|null, next|null}}` (all three keys required)
or `{"summary": null}`;
single-line fields of at most 120 code points; control/ANSI characters and
command-like prefixes rejected; malformed output is not retried. Fallback to the
second model only for an unavailable model/auth or provider/timeout failure.

Summaries are generated only after normal settlement in TUI mode, idle with no
queued work. A new submitted prompt, new run, session/branch change, compaction,
`/turn-summary off`, and shutdown clear the widget and cancel pending work.
Typing does not clear it, so it can be read while composing. Late results are
rejected by revision plus session identity and the last *message* entry, so model,
thinking-level, name, and label entries that move the raw leaf do not hide or
discard a summary.

## Phases

1. Records: BL-9vg3 active with approval; this plan.
2. Implementation of the six modules.
3. Unit, pinned-host integration, and isolated faux TUI tests, including
   coexistence with `prompt-suggestions`.
4. Bounded synthetic live evaluation (seven cases per model) and one live TUI check.
5. README, verification record, backlog closure. No commit unless requested.

## Implementation and verification outcome

Completed in the creating session; details in the
[verification record](../spikes/2026-10-12-turn-summary-verification.md).
50 unit, 11 host, and 3 TUI tests for this feature; full suites 468 unit and 84
integration tests with no failures or skips. Both models avoided marking
unfinished or failed work as done in all fourteen synthetic cases.

One prompt adjustment followed the first live run: the abstention rule was made
concrete ("a short direct answer to a simple question with no tools, no work
done, and nothing open") after Luna summarized a trivial question. After the
change Luna abstained there; Haiku additionally abstained on a read-only
explanation turn, recorded as a limitation.

Verification found that `agent-tty wait` reports a timeout as `ok: true` with
`timedOut: true`. The new TUI test treats timeouts as failures; a strict temporary
copy of the committed prompt-suggestions TUI test also passed (5/5). Updating the
other existing TUI tests is the follow-up candidate
[BL-s9tp](../backlog/BL-s9tp-treat-agent-tty-wait-timeouts-as.md).

### Review follow-up

A user-requested Opus/Sol review (2/2 coverage, this session's work only) raised
six findings, all confirmed against the code and Pi 1.1.0 host sources, and fixed
minimally: summary hidden by model/thinking changes (P1), total context cap not
including the tool trace and previous summary (P1), steering splitting a turn,
optional output fields accepted, a thrown error reusing the previous attempts in
the warning, and overstated test evidence. Seven new or changed unit tests failed
before the fixes and pass after; see the verification record. Prompt text was not
changed, so live model calls were not repeated.

## Risks and open questions

- Summaries can be wrong; the residual risk is overstating completion or omitting
  open work. Tool trace and prompt rules reduce, not eliminate, it.
- The previous summary is lost on reload; summaries restart from the next turn.
- Three lines limit detail; `/turn-summary` shows the full current summary.
- Small synthetic samples do not establish general quality across languages,
  long sessions, or many tools.
