---
title: Independent local user-question extension
date: 2026-10-11
session: 01a12936-147d-70ab-a076-0e34d5b60802
based_on:
  - docs/research/2026-10-11-pi-user-question-tools.md
  - docs/plans/2026-10-11-plan-mode-extension.md
  - docs/plans/2026-10-11-tui-check-skill.md
---

# Independent local user-question extension

## Goal

Build a project-owned `ask_user` tool that collects structured human decisions in
Pi's parent TUI, preserving selected values, custom answers, and separate comments.
Support review/edit, explicit discussion, and cancellation without depending on
other project features. The user approved implementation and offline verification
in the session above, against the execution plan
`~/.pi/plans/20261011-142154-clever-falcon.md`.

Why: the references solve complementary problems, but none supplies the selected
contract unchanged. Stable identity and explicit intent matter more than copying
a complete package. The standing direction in `AGENTS.md` requires local
implementation and default bidirectional independence.

## Non-goals

- BL-005's general verification workflow and todo tracking.
- Replacement plan approval, RPC parity, headless pending files, child routing,
  resumed unfinished forms, or arbitrary SDK root-identity enforcement.
- Overlays, display configuration, option previews, external editors, secret
  input, per-option/form-level comments, automatic repeated questions.
- Package installs, reference updates, new runtime dependencies, core/fork
  changes, automatic reviewers, or real-model/paid calls.

## Design

### Reference selection and evidence

Reinvestigation re-read the existing pinned checkouts without executing
upstream suites. These are design references, not runtime dependencies:

- edlsh/pi-ask-user `e8b59a5114bb1cf4fca239b75976483703c9783f`:
  `.references/pi-packages/edlsh/pi-ask-user/index.ts:2174-2192,2486-2568,2841-2850`
  for incomplete settlement, signal/cleanup ownership, and focused independent
  batches. Do not adopt its bundled gate skill or presentation configuration.
- mrclrchtr/supi `77f9caf12ba7b603306b8e175fcbbae8d8155046`:
  `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/session/controller.ts:223-233,275-314`
  for `submitted` versus `needs_discussion`;
  `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/tool/ask_user/execute.ts:71-81`
  for cancellation control flow, and
  `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/form-api.ts`
  for editor-area interaction ownership.
- FadhelHaidar/pi-ask-user `99410ecb057183dd5d53608896a4bea80ff9eb42`:
  `.references/pi-packages/FadhelHaidar/pi-ask-user/state/key-router.ts:201-214`
  permits partial submission, and
  `.references/pi-packages/FadhelHaidar/pi-ask-user/tests/ask-user-question-multi-custom.test.ts:44-100`
  distinguishes selections,
  custom text, and comments. Do not inherit its label-based identity or cancellation
  retention policy.

The earlier discussion draft proposed mandatory answers before submission. That
proposal was never selected and is superseded here: incomplete intentional
submission returns discussion, not a fabricated answer or a blocked form.

### Contract

- One model-facing, sequential, model-only `ask_user` tool.
- 1-4 independent questions; prefer one and respect conversational pacing.
- Flat question schema: stable `id`, prompt, `single`/`multi`/`text` mode;
  2-8 choice options with stable values, labels, descriptions, and optional
  recommended values. Validate conditional fields internally.
- Single: predefined choice OR custom alternative. Multi: selections plus
  supplemental custom text, including custom-only answers. Text: free text.
- One optional comment per question, never confused with an answer.
- Recommendations are marked, not preselected; focus is not committed selection.
- Final review permits edits and explicit submission. Blank/whitespace answers
  stay unanswered; comments alone do not satisfy the answer.
- Fully answered Submit returns `submitted`. Incomplete Submit or explicit
  Discussion returns `needs_discussion`, with missing IDs and partial context
  clearly labeled as nonfinal. Missing answers never imply permission.
- Cancel stops the turn and discards unsent drafts. Abort is distinguished from
  decline. Unavailable/invalid input is an explicit error, not an answer.

### UI, persistence, and lifecycle

Use an editor-area custom component with Pi's Editor, semantic keybindings,
Unicode width/wrapping, focus propagation, and bounded scrolling. Back from an
answer/comment editor preserves drafts; whole-form Cancel is separate. Opening
an unchanged alternative draft and going Back preserves the active predefined
selection. A changed draft is retained on Back; explicit Save can activate an
unchanged historical custom alternative. Restore normal input after the form
closes. No default human-response timeout.

One active form; reject overlap. Connect pre-aborted/live signals, guard completion
once, and release ownership/listeners on every path and shutdown. Normal submitted
or intentionally sent discussion content is kept in tool details and faithful
model-facing output. Cancellation/abort retains outcome/reason, not drafts. No
external state, answer broadcast, or reopened pending forms on restore.

### Independent integration

Use public host APIs and `readOnlyHint: true`: asking does not mutate project or
application state or execute the chosen action. Existing generic plan filtering
can retain an already-active tool without changing plan-mode code. Preserve
intentional disabling; old saved plan loadouts do not gain new tools silently.
Existing child resource isolation excludes this tool without subagent changes.
TUI availability is not a universal proof of root identity.

Sequential execution is not authorization: earlier sibling calls may already
execute. Guidance forbids answer-dependent siblings. Test stopping later benign
calls on cancellation; do not promise a universal permission gate.

### Layout and authority

`extensions/ask-user/index.ts` is the single discovered entry point. Local modules
separate input validation, controller, UI, execution, and results. Use injectable
public-library capabilities for host-independent tests. Pi coding-agent and TUI
packages are declared as host-provided peers, not installed or bundled by this
work. No runtime import of other project extensions or reference packages. Any necessary coupling requires
explaining the reason, alternatives, directions, and impacts and obtaining user
approval before acting.

## Phases

### Phase 1: Contract and state

- Changes: schema/normalization, answer/draft controller, review/outcomes.
- Verify (automated): uniqueness, bounds, conditional fields, all answer modes,
  comments, draft preservation, incomplete outcomes, no implicit selections.

### Phase 2: Registration, UI, and lifecycle

- Changes: testable factory/entry point, custom form and result renderers,
  signal/ownership/shutdown handling, unsupported-mode guards.
- Verify (automated): fake UI for pre/live abort, late/double completion, overlap,
  exceptions, cleanup, cancellation privacy, and unavailable modes.

### Phase 3: Host and isolated faux TUI

- Verify (automated): pinned host loader/schema/metadata, model-only exposure,
  plan/build coexistence and disabling, submit/discussion follow-up, Cancel/abort,
  later benign sibling calls, actual model-facing outcomes.
- Verify (interactive): isolated faux TUI for selection/custom/multi/text/comments,
  batch review/edit, partial submission, Discussion, Back/Cancel, paste, Korean
  display/focus, small/resize/regular/fullscreen screens, restore and cleanup.
- Record actual limitations; faux checks do not establish model judgment, provider
  acceptance, or physical Korean IME behavior.

### Phase 4: Documentation and closure

- Changes: README, explicit test script entries, this record's result evidence,
  and BL-004's accepted design/implementation scope and coarse state.
- Verify (automated): `npm test` and pinned `npm run test:integration`.
- Leave BL-005, unrelated cards, reference material, and other feature code alone.

## Risks and open questions

- Cancellation error persistence depends on the exact host; verify it rather than
  assuming a clean receipt or relying solely on batch-level `terminate`.
- Inspected host: installed Pi 1.1.0 release
  `b1a78306c-openai-fast-20261011-125046`. Pin integration tests explicitly; this
  does not identify the loaded code of the preexisting parent session.
- Real-model schema/usability and physical IME behavior require separate evidence.
- Any host/fork or cross-feature change is outside approval. Report a blocker
  rather than silently widening implementation.
- Disable through normal resource/tool selection; no migrations or external state.

## Verification evidence

Implementation and verification were performed by the parent coding agent in
session `01a12936-147d-70ab-a076-0e34d5b60802`. The implementation is locally
authored; no reference package modules were vendored or imported. Source consists
of `extensions/ask-user/{index,extension,schema,controller,ui}.ts`. Production
imports are local modules and public Pi libraries, not other project features.
No plan-mode, subagent, tui-check, or reference implementation files were edited.

### Initial implementation checks

Before the review follow-up below, the implementation passed without skips:

- `npm test`: **203 tests passed**, including **53 ask-user tests**.
- `PI_PACKAGE_DIR=<pinned root> npm run test:integration`: **31 tests passed**,
  including **11 ask-user host integration tests**.
- Pinned root:
  `~/.local/share/pi-fork/releases/b1a78306c-openai-fast-20261011-125046/node_modules/@earendil-works/pi-coding-agent`;
  package `@earendil-works/pi-coding-agent` 1.1.0; Node 26.10.0.

The host checks establish loader/schema metadata, model-only/sequential/read-only
registration, faithful submitted and discussion results on subsequent model input,
unsupported-mode errors, generic plan coexistence and disabled-tool preservation,
cancellation stopping later benign sibling calls, and caller abort. Cancel/abort
results retained outcome/reason without the nonsensitive unsent test drafts.
Public TUI component checks cover Unicode column bounds, focus/cursor markers,
multiline paste, editing Back, and resizing down to 12 columns.

### Isolated actual TUI checks

Used existing tui-check, agent-tty 0.5.0, the pinned installed Pi, and `faux/faux-1`.
No network, credentials, real models, or reviewer calls were used in these TUI
runs. Explicit resources and temporary agent/work/session directories were used
for every run. The later separately authorized reviews are described below.

Initial-implementation evidence is retained under `/tmp/ask-user-verification-20261011/`:

| Mode | Run directory | Pi session |
|---|---|---|
| Regular | `regular-final2/` | `01a1297e-a6e7-7526-bfea-928628f1d147` |
| Fullscreen | `fullscreen-final2/` | `01a1297e-a68b-73b4-8e34-a835dbf85d1d` |

Each run's `assertions.json` passed these observations:

- No initial recommendation was selected.
- A two-question form returned multi selections plus custom text and a separate
  comment, and Korean multiline text preserved through Back, review and editing.
- A single custom alternative replaced, rather than combined with, a prior choice.
- Incomplete Submit returned `needs_discussion` and its missing ID; explicit
  Discussion with complete drafts remained `needs_discussion`.
- Back retained a text draft; whole Cancel discarded it from tool results and
  model-facing history. Regular mode used Esc, fullscreen used Ctrl+C.
- Resize from 80x28 to 32x14 and back preserved editor content and usable focus;
  snapshots include `multiline.txt`, `short-editor.txt`, and `batch-review.txt`.
- Quit/relaunch of the same session restored historical result rendering without
  reopening a form. A new user message successfully continued afterward.
- Every recorded model input began with a system message and included `ask_user`.
- `finish.json` reports `piExited: true` and `ttySessionDestroyed: true`; isolated
  agent-tty session listings were empty after cleanup.

The scenario and scripted driver are retained as temporary evidence at
`/tmp/ask-user-verification-20261011/{scenario.json,drive.mjs}`. Run directories
also contain session JSONL, observer logs, snapshots, settings and launcher files.
These are retained scratch artifacts, not permanent project assets.

### Limits and cancellation nuance

Each final run consumed **10 faux responses** and recorded **11 observer inputs**.
After cancellation the host prepared a context with the cancelled tool result,
but the already-aborted provider path did not consume another faux response.
The next response was consumed only after restoration and a new user message.
Thus the claim is stopped automatic execution/response, not that the host never
constructs another context. The native TUI also displays
`Error: This operation was aborted` after whole-form Cancel; no fork behavior
was changed to suppress it.

Faux checks do not establish real-model judgment or provider schema acceptance.
Physical Korean IME candidate positioning, arbitrary remapped keybindings,
other host versions, arbitrary SDK child setups, and a comprehensive terminal
security audit remain unverified. RPC/print/JSON were tested for explicit
unavailability, not equivalent interaction support. No additional work is
silently authorized by these limitations.

## Review follow-up and corrected verification

After initial closure, the user authorized a file-based review (this workspace
has no Git metadata) and explicitly selected `anthropic/claude-opus-5-5` and
`zai/glm-5.3`. Both reviewers read source without edits. The parent re-read the
claims and reproduced the selected defect using the installed native TUI Editor.
The same parent session then received approval for exactly two fixes:

1. An unchanged Back from the alternative editor must not change the active
   answer. Previously `saveEditor()` always called `set("custom", ...)`, enabling
   `customActive` even when nothing changed. This cleared Alpha after inspecting
   an empty editor, or reactivated historical C after selecting Beta.
2. Declare the already-used `@earendil-works/pi-tui` package in `peerDependencies`
   alongside coding-agent. No installation, runtime import, lockfile, or other
   feature dependency was added.

The UI now records the initial editor value. Back updates the controller only
when the value changed; explicit Save updates it even when unchanged. Existing
active state therefore survives an unchanged Back, while intentional saving or
editing still changes the answer. Controller result semantics were not changed.

### Regression evidence

- Four focused unit cases cover empty unchanged Back, historical unchanged Back,
  explicit Save of the historical alternative, and changed-draft Back.
- Before the fix, the first two failed with empty `selectedValues` instead of
  the original choice; the other two passed. After the fix all four pass.
- Three native host tests verify empty/historical Back and explicit Save through
  actual model-facing submission results. Loader verification also checks the
  TUI peer declaration.
- Post-fix `npm test`: **207 passed**, including **57 ask-user tests**.
- Post-fix pinned `npm run test:integration`: **34 passed**, including
  **14 ask-user host tests**. No skips. Host artifact and Node version are unchanged
  from the initial verification above.

A fresh isolated regular-mode faux TUI run at
`/tmp/ask-user-back-fix-20261011/run/` verified the user paths end to end:

- Alpha remains selected after an untouched empty alternative editor's Back.
- Beta remains selected after viewing historical C and going Back.
- Explicit Save activates C instead of Beta.
- All three intentional submissions returned `submitted`, with selected values
  or custom text matching the reviewed answer.

Pi session: `01a1299c-bd01-74e1-944b-a6dddd414d79`; six faux responses/model inputs.
`assertions.json` passed; text snapshots, session JSONL, model-input logs,
scenario, and launcher are retained in the run directory. Scenario/driver source
is retained under `/tmp/ask-user-back-fix-20261011/`.
`finish.json` reports both `piExited: true` and `ttySessionDestroyed: true`.
No additional reviewer or real-model calls were made to apply these fixes.
The original fullscreen/resize/restore observations remain historical evidence,
not a claim that the entire original TUI matrix was re-executed after this patch.

Duplicate error display, broader key/scroll test improvements, and speculative
reload/bidi concerns were not selected for this follow-up. Real-model question
usability and physical IME evidence remain unverified; source-review model calls
are not evidence of the tool's real-model interaction quality.

## Amendments

### 2026-10-11 — Preserve active answers on unchanged Back and declare the TUI peer
- Change: Corrected alternative-editor Back behavior, added unit/native/TUI
  regression evidence, and declared the existing host TUI peer. Qualified the
  initial results as historical and recorded the separately authorized reviews.
- Reason: Review and parent reproduction found that merely inspecting an
  unchanged alternative deactivated a predefined answer; the peer manifest also
  did not reflect its documented host-package policy.
- Impact: Unchanged Back no longer changes user intent. Explicit Save and edited
  drafts retain their intended behavior. No cross-feature coupling, installation,
  or broadened interaction scope was introduced; deferred feedback remains outside
  the selected fixes.
- Evidence: `extensions/ask-user/ui.ts`, `tests/ask-user{,.integration}.test.mjs`,
  `package.json`, retained regression run above, and pi session
  `01a12936-147d-70ab-a076-0e34d5b60802`.
