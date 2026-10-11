---
title: Targeted English extension UI copy improvements
date: 2026-10-11
session: 01a129ca-0a4e-70d5-b9c1-397ecbfbcb1f
based_on:
  - docs/plans/2026-10-11-ask-user-extension.md
  - docs/plans/2026-10-11-plan-mode-extension.md
  - docs/plans/2026-10-11-subagent-model-fallback.md
  - docs/research/2026-10-11-codex-sky-computer-use.md
---

# Targeted English extension UI copy improvements

## Goal

Make the reviewed user-facing English explain actual actions and outcomes without
changing their behavior. The user approved implementation and offline verification
of `/Users/kkkzzzabc/.pi/plans/20261011-162648-tidy-comet.md` in the session above.
BL-013 tracks this work. The preceding BL-012 work is complete and is not reopened.

The initial copy review used three read-only reviewers with separate extension
scopes; the parent verified the findings against source. Its main lesson was that
Back, cancellation, discussion, pause, and model switching need truthful action
labels, not a translation or a blanket rewrite.

## Non-goals

- Translation, global copy rewrite, host changes, dependencies, cross-feature
  runtime coupling, settings changes, actual providers, or real app control.
- Changes to IDs, structured outcomes, approvals, answer selection, draft retention,
  cancellation, fallback policies, roster, accounting, or computer permissions.
- The separately reported plan-mode missing-approved-plan error, subagent
  missing-input diagnostic, and unrelated error/help messages.

## Design

Keep presentation changes local to each independent extension:

- `ask-user/ui.ts`: friendly field headings; Back keeps edits, explicit Save
  returns; consistent cancellation and its discard/stop explanation; discussion
  sends answers; short Submit label with incomplete-submission guidance; single
  alternative versus multi additional answer labels; clearer key hints. Account
  for wrapped guidance without sacrificing bounded rendering or cursor visibility.
- `ask-user/extension.ts`: friendly collapsed submitted/discussion labels only;
  preserve model-facing content and expanded diagnostic contracts.
- `plan-mode/index.ts` and `prompts.ts`: rename the pause choice using the shared
  dispatch constant and describe all non-approval paths neutrally.
- `subagent/extension.ts` and `render.ts`: attribute switch reasons to the previous
  attempt; separate returned-review coverage from verdict agreement. Preserve
  model-facing incomplete-review safety guidance.
- `computer-use/tools.ts`: action-specific acknowledgments and a state-check
  reminder; retain helper JSON in content and unchanged structured details.

## Phases

### Phase 1: Baseline and recording
- Changes: This scoped record and BL-013, maintained only at material transitions.
- Verify (automated): Baseline `npm test`; compare any failure with preexisting work.

### Phase 2: Copy and presentation
- Changes: Only the selected surfaces and necessary small local rendering helpers.
- Verify (automated): Focused assertions for copy plus unchanged behavioral contracts.

### Phase 3: Automated and actual TUI checks
- Verify (automated): Full `npm test` and pinned offline `npm run test:integration`.
- Verify (interactive): Isolated faux TUI for ask-user navigation/editing/submission/
  cancellation, regular/fullscreen and resize; plan pause; model switching and
  incomplete review. Use fake helpers only for computer-use, not live apps.
- Record screen/model-input evidence and cleanup; do not infer real-model quality.

### Phase 4: Closure
- Changes: Record actual evidence and limitations here, close BL-013 with references,
  and summarize changed files and remaining exclusions in chat.

## Risks and open questions

- Longer hints can truncate or hide editor content at small sizes; verify actual
  terminal layout, not merely string assertions.
- Shared result text can reach both user and model; retain data and safety guidance.
- Back and explicit Save are not identical for unchanged historical alternatives.
- The baseline installed host is Pi 1.1.0 release
  `b1a78306c-openai-fast-20261011-125046`; this does not prove which code was loaded
  by the preexisting parent. Pin offline integration and isolated TUI explicitly.

## Verification evidence

Implementation and verification were performed by the parent Pi assistant in the
session above. No fresh reviewer calls or actual model/provider calls were used.

### Automated checks

- Baseline `npm test`: **250 passed**, no skips, before source edits;
  `/tmp/ui-copy-baseline-unit.log`.
- Final `npm test`: **256 passed**, no failures or skips;
  `/tmp/ui-copy-unit.log`.
- Final pinned `npm run test:integration`: **39 passed**, no failures or skips;
  `/tmp/ui-copy-integration.log`. Package: Pi 1.1.0 release
  `b1a78306c-openai-fast-20261011-125046`, Node 26.10.0.
- New assertions cover remapped editor key labels, all field headings, bounded
  short editor guidance/cursor, draft/review/action wording, friendly collapsed
  outcomes including fully answered discussion, neutral pause results, causal
  model-switch progress/history, review coverage states, and five fake-helper
  action acknowledgments with retained JSON/content/details.
- Existing Back/Save activation, comment, incomplete submission, cancellation
  privacy/stop, plan approvals, fallback/strict behavior, and accounting tests pass.

The short-editor native test initially exposed a cursor omission when the longer
help left only one editor row. The viewport start is now clamped to include the
cursor row (`cursor - cap + 1` rather than `+ 2`). This is a scoped presentation
fix, not a change to editing semantics. Old exact-copy assertions were updated.

### Isolated actual TUI checks

Used tui-check with agent-tty 0.5.0, faux/faux-1, isolated agent/work/session
folders, resource discovery disabled, and the pinned release's executable on PATH.
No user settings or live app permissions were touched. Scenarios, drivers,
snapshots, model-input/session logs, assertions, and cleanup receipts are retained
under `/tmp/ui-copy-verification/` (temporary evidence, not project assets).

| Surface | Final run | Pi session | Observer calls |
|---|---|---|---|
| ask-user regular | `regular-final2/` | `01a129e6-bf1e-74cf-99f9-c0f00e844ebc` | 11 |
| ask-user fullscreen | `fullscreen-final2/` | `01a129e6-bf1b-7584-855b-f12499b3804a` | 11 |
| plan-mode | `plan/` | `01a129e5-9698-77b6-b06c-814b4175ee8d` | 4 |
| subagent | `subagent/` | `01a129e5-968c-7045-93c3-3b430edec5b5` | 4 |

All four final `assertions.json` files passed:

- ask-user: initially unselected recommendation; multi selection with additional
  answer and separate comment; Korean multiline text retained through Back; Save
  returning to the question; unchanged alternative Back preserving Alpha;
  explicit alternative Save replacing it; review and complete/incomplete Submit;
  explicit discussion with complete answers; cancellation discarding unsent drafts
  and stopping automatic response. New user input continued afterward.
- Screen snapshots show field headings, action descriptions, friendly outcomes,
  and the cancellation key before less urgent navigation hints. Resizing 80x28 to
  32x14 and back retained text and all four editor hints. Public native rendering
  tests additionally retain cursor/width/height bounds down to 12 columns.
- plan-mode: actual approval menu showed `Stay in plan mode and pause`; selecting
  it retained plan mode and did not consume another faux response until the next
  user message. The non-approval result reached the subsequent model input.
- subagent: final screen/history attributes the failure to the previous model
  attempt; partial review shows 1/4 returned and all missing-model reasons plus
  the no-all-model-agreement instruction. Corresponding text reached model input.
  Progress `Trying` wording is verified by fixture/SDK updates, not a separate
  transient screen capture. The isolated roster used one faux model and three
  intentionally missing models; no configured real model was invoked.

The intermediate `regular-final/` and `fullscreen-final/` attempts failed only a
scratch assertion that assumed a single cancel binding; the host correctly showed
`escape/ctrl+c`. The driver assertion was corrected, then both final2 runs passed.
All eight isolated runs, including intermediate attempts, have `piExited: true`,
`ttySessionDestroyed: true`, and empty per-home session listings.

### Limits and exclusions

At extremely narrow/short sizes, editor guidance is clipped to retain an editable
cursor-bearing row; full hint visibility is established at 32x14, not 12 columns.
The main menu footer still truncates to width; cancellation is prioritized, while
navigation/scroll hints can require more width. No physical IME, live-model quality,
provider acceptance, or native app action was tested. Computer-use was checked
with fake helpers, not a live-app TUI run. Expanded diagnostic IDs/outcomes,
external app/child/user content, and helper JSON remain unchanged. The separately
excluded plan-mode error and subagent diagnostic remain outside this work.
