---
title: Independent contextual next-prompt suggestions
date: 2026-10-12
session: 01a12b89-d473-7178-96d0-29dd15f8ee44
based_on:
  - docs/research/2026-10-12-post-turn-assistance.md
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
---

# Independent contextual next-prompt suggestions

## Goal

After a completed turn, show an optional useful next-user prompt as ghost text.
Tab accepts editable text; only the user's ordinary submit action sends it.
Luna/Haiku may run continually; model roles are selected for latency, quality,
and simplicity rather than cost minimization. One build item covers design and
implementation: [BL-5qvq](../backlog/BL-5qvq-build-contextual-next-prompt-suggestions.md).

The implementation, documentation, offline checks and bounded synthetic live
checks were approved through `/Users/kkkzzzabc/.pi/plans/20261012-003155-lively-fern.md`
in the creating session. Existing global configuration is not edited.

## Non-goals

No auto-submission, parent continuation, document mutation, summary, long-term
memory, todo tracker, project seed, preference learning, Jev, or background/writer
subagents. No external runtime/reference-package dependency, fork modification,
install, global settings update, commit, or raw transcript persistence.
Summary work remains [BL-9vg3](../backlog/BL-9vg3-build-post-turn-summaries-and-next.md);
instruction completion auditing remains BL-yun3.

## Design

### Public host contracts

Planning inspected Pi 1.1.0 installed at the local fork release
`4787ab4ac-perf-batch-20261012-000822`. Its `docs/extensions.md`, `docs/tui.md`,
`docs/keybindings.md`, exported declarations and examples were read. The actual
runtime evidence records exact tested builds; the user's existing session is
not assumed to have reloaded.

- `agent_settled` is a notification-only final boundary. Generate outside the
  parent operation only after normal text completion, with idle/queue guards.
- `ctx.sessionManager.getBranch()/getSessionId()/getLeafId()` binds a request to
  the active branch; switching, input, compaction and UI prompts invalidate it.
- `ctx.modelRegistry.find()/streamSimple()` uses request-time host authentication.
  No private auth/provider bridge or credential copying.
- `CustomEditor`, `ctx.ui.getEditorComponent()/setEditorComponent()` and public
  TUI helpers implement empty-editor ghosts without private editor-field casts.

### Modules and independence

`extensions/prompt-suggestions/index.ts` loads public host dependencies;
`extension.ts` owns lifecycle/commands; `controller.ts` invalidates async work;
`config.ts` validates independent configuration; `suggestion.ts` owns bounded
text-only inference; `editor.ts` implements interaction/rendering.

No production import or runtime dependency on another local feature. The existing
`tui-check` skill and `tests/pi-package.mjs` are test infrastructure, not runtime
coupling. Reference ideas are documented in the research record; no code was
copied. Preserve licenses if substantial code is adapted in future work.

### Inference and data

Default chain: `openai/gpt-6-luna` then `anthropic/claude-haiku-5-5`, exact IDs
already present in the inspected local model list. Fallback is for unavailable
auth/model or provider/timeout failure, not quality escalation. Strict single-model
selection does not fall back to the parent or other providers.

One total 30-second budget is divided among remaining configured attempts. Output
budget defaults to 1024 tokens, with lowest supported thinking. A valid abstention
ends the chain; malformed/unsafe/length-limited output is rejected without retry.

The model sees up to six recent active-branch user/assistant text messages, capped
at 12,000 characters with explicit truncation, not thinking, images, raw tool
arguments/results, system/global instructions, other branches, or repository
files. Output is exactly `{ "suggestion": string | null }`, single-line, at most
240 Unicode code points by default. Control/ANSI characters and executable
slash/shell prefixes are rejected. Conversation text is untrusted data; the prompt
preserves read-only scope, unanswered choices and explicit stopping.

Production context/candidates live in memory only. `/prompt-suggestions` shows
actual model attempts, latency and provider-reported aggregate request/usage/cost
metadata; these are not the main agent's native totals. Unreported usage remains
unknown. Sanitized errors never echo raw provider bodies or config contents.

### Lifecycle and interaction

- Initialize on session start, not in the factory. Skip non-TUI modes, errors,
  aborts, incomplete/tool-only output, nonempty editors and pending work.
- Async request cancellation plus generation identities rejects late output even
  when a provider ignores cancellation. Check identity/idle/editor ownership
  again before presentation or acceptance.
- Invalidate on input/paste/history, new run, model/session/branch change,
  compaction, blocking UI prompt, disable, reload and shutdown. No auto-generation
  on resume/tree/fork and no revival after typed text is cleared.
- Ghost text leaves real input empty. Tab inserts it as an undoable edit without
  submitting. Enter on an unaccepted ghost never submits the candidate.
- Preserve default keys, completions and cursor/IME marker; theme-aware muted
  display wraps to bounded height with a truncation indicator. Application
  shortcuts are delegated to CustomEditor.
- Keep one editor instance for on/off toggles. Use only public history methods;
  do not replace another installed editor or clear another owner's factory.
  Conflicts skip inference with an explicit diagnostic.

Configuration: optional `<agentDir>/prompt-suggestions.json` and trusted project
`.pi/prompt-suggestions.json` overrides. Invalid/unknown fields fail closed.
Automatic TUI inference is enabled when the loaded feature is activated, within
the approved bounded recent-text transmission to configured models. No config
file is created automatically. `/prompt-suggestions on|off` and
`/prompt-suggestions model provider/id` are session-only controls.

## Phases

### Phase 1: records

Create one active implementation item and one deferred summary candidate. Connect
BL-yun3 without duplicating it. Write source-cited research and this accepted plan.

### Phase 2: implementation and offline checks

Implement the independent feature and tests for configuration/data/output policy,
fallback/abstention, deadlines, cancellation, stale identity, mode/queue/dialog
behavior, editor ownership and submit boundaries.

Verify `npm test`, `npm run test:integration` with `PI_PACKAGE_DIR` pinned, and
isolated real TUI tests using test-only faux providers. Check fullscreen/regular,
narrow Unicode rendering, inherited controls/completion/history, Tab no-submit,
input/abort races, session changes, off/on and cleanup. Do not claim skipped or
missing prerequisites as passing coverage.

### Phase 3: bounded live evaluation

Six synthetic conversation cases per model cover useful continuation, completion,
unresolved choice, read-only scope, explicit stop, and untrusted instructions.
Use no tools, real user transcripts, repository content or other providers. Record
validity, grounding, language, abstention, latency/usage and incomplete coverage.
Add an isolated live-generation-to-Tab check when possible. Keep synthetic evidence
under ignored artifacts; destroy owned sessions and check configuration fingerprints.

### Phase 4: delivery

Document usage/config/data/activation in README, link actual verification evidence,
and close the build item only when implemented behavior is supported. Do not
start summaries or steering. The user activates via `/reload` or a new session;
rollback is ordinary resource disabling/reload, with no persisted transcript data.

## Implementation and verification outcome

Completed in the creating session. [Verification evidence](../spikes/2026-10-12-next-prompt-suggestions-verification.md)
records 342 passing unit checks, 65 passing integration checks (including isolated
fullscreen/regular TUI), a separate current-host check, six synthetic live cases
per model, and one live generation-to-Tab check without submission. No tests were
skipped. The small live sample does not prove general recommendation quality.

The implementation uses a strict JSON output, original empty-editor rendering,
public history APIs, one generation deadline split across configured attempts,
and in-memory aggregate usage distinct from parent native usage. Stale completion
without an explicit lifecycle event is marked discarded rather than left generating.
The provider output budget stayed at 1024 after all live cases succeeded.

No reference source was copied. No dependencies were installed or global settings
edited. Activation remains user-initiated; the summary and audit candidates were
not started. A separate user request added the already-committed `perf-audit` skill
row to README; concurrent edits to that skill's reference files were left intact.

### Review follow-up

The user-requested configured Opus/Sol review completed with 2/2 coverage after
an earlier cancelled attempt. The user authorized all four verified P2 repairs
and the optional remapped-submit-key hint improvement. Changes are limited to
startup-specific history seeding, registered shortcut precedence without double
dispatch, failure-warning deduplication, and clearing the extension's status key
independently of editor ownership. No second model evaluation was needed.

Regression tests failed before the fixes and passed afterward. Additional isolated
faux TUI checks exercise an actual saved-session startup and a real registered Tab
override. Final follow-up verification: 390 unit and 70 integration tests, zero
failures/skips, plus 18 feature host checks on the current PATH release. The unit
total includes 43 session-skill tests added by another session; five additional
unit checks, three host checks, and two TUI checks belong to this repair.

Other-session additions to the shared README/resource table and package test script
were preserved. No fixes or review were applied to perf-audit or session-skill
implementations, and no commit or global settings change was made.

## Risks and open questions

Model recommendations are suggestions, not correctness or authorization proofs.
Private-field/fork changes are a stop condition if public APIs cannot support the
interaction. Cancellation is guarded independently of provider cooperation.
Parallel two-model consensus/ranking is not necessary for this first version.
Actual IME candidate-window behavior and open-ended natural-use quality cannot be
proven by faux tests. Exact checks and remaining limits belong in the verification
spike, not execution logs here.
