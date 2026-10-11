---
title: Can the remaining four extensions have complete offline PNG UI evidence?
date: 2026-10-12
session: 01a12c4f-008e-7447-adf5-1a8eec294d56
based_on:
  - docs/spikes/2026-10-11-extension-ui-capture-baseline.md
  - docs/spikes/2026-10-12-next-prompt-suggestions-verification.md
  - docs/spikes/2026-10-12-turn-summary-verification.md
  - docs/spikes/2026-10-12-wrapup-audit-verification.md
  - docs/plans/2026-10-12-pi-perf-log.md
result: yes
---

# Can the remaining four extensions have complete offline PNG UI evidence?

## Question

Can `prompt-suggestions`, `turn-summary`, `wrapup-audit`, and headless `pi-perf-log` gain representative renderer-backed PNG evidence without changing production features, calling live models, or replacing historical captures?

## Setup

The user approved the supplemental capture plan and separately approved a task-local Chromium download after the prerequisite check found no Playwright browser cache. The installed agent-tty's own Playwright CLI downloaded Chromium and its bundled supporting components into ignored `artifacts/ui-captures/browser-cache/`. Only capture-command environment variables select this cache; no global settings or installed tool files were changed.

- Host: installed local Pi fork, `@earendil-works/pi-coding-agent` 1.1.0.
- Tooling: Node v26.10.0, agent-tty 0.5.0, ghostty-web renderer, reference-dark profile; Playwright Chromium revision 1223.
- Presentation: dark theme, fullscreen mode, 120×40 / 1080×640 normal and 80×30 / 720×480 narrow. Narrow runs start at their final geometry.
- Workspace revision at capture start: `6820dd3`; dirty-state disclosure and production entry-point hashes are in the manifest. All eight recorded production entry-point hashes remained unchanged; no files under `extensions/` were edited.
- Parent responses are scripted faux data. Nested calls use the local `ui-nested` provider with explicit fixture model IDs, bounded release/abort gates, and synthetic contract outputs/errors. No remote transport or user credentials are used.
- Audit fixtures are copied workspaces with minimal README rules and glossary judgments. `GIT_CEILING_DIRECTORIES` prevents root discovery from ascending into the real repository. Built-in writes and actual production steering operate only in the fixture.
- Perf output stays within each isolated run; write failure uses an ordinary run-local file as the configured directory, not a real permission change.

Reproduction with the already approved/downloaded cache:

```bash
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/ui-captures/browser-cache"
node scripts/ui-captures/capture.mjs --group prompt-suggestions --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group turn-summary --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group wrapup-audit --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group pi-perf-log --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/verify.mjs artifacts/ui-captures/my-supplemental
```

New schema-v2 manifests declare complete group scopes. The verifier preserves the original fixed 35-state legacy matrix, checks complete/unique/known scoped states, negative and positive text assertions, PNG hashes/dimensions, local links and paths, allowed offline fixture providers, actual perf-log identity/output paths, and session cleanup. Capture waits now fail on `timedOut: true`, even when agent-tty reports `ok: true`. Failed rerun invocations cannot silently pass by retaining old images. The development tooling remains independent of production features.

## Result

**Yes:** 35 additional PNG/text pairs cover all requested groups. Every final PNG was inspected with the image-read tool. The original 35 PNGs and historical live-run text snapshots were preserved, bringing the two PNG galleries to 70 screens across all eight extensions plus the original idle reference.

| Group | PNGs | Coverage |
| --- | ---: | --- |
| prompt-suggestions | 11 | Pending, ghost, accepted, edited, dismissed, status, off, invalid-output warning/footer and separate last-attempt details, provider-error fallback, narrow |
| turn-summary | 11 | Pending, full/partial widget, status, off, invalid-output, fallback, composing, replacement, coexistence with ghost, narrow long-field truncation |
| wrapup-audit | 10 | Checking, one-time steering, findings, status, clean, rules-only, off, invalid-output, narrow detail and supplemental top frame |
| pi-perf-log | 3 | Headless normal turn with actual JSONL evidence, invalid-config warning, write-failure warning |

All 27 created supplemental Pi/agent-tty runs, including failed attempts and superseded captures, exited and were destroyed. The verifier recorded 29 local nested-provider calls and no computer-helper calls. These figures include retries and gate waits; they are not inference-performance measurements.

### Observed behaviors and limitations

- Typing into the suggestion editor dismisses the current suggestion state, including when entering the status command. `idle` with a retained last-attempt failure is therefore captured as actual behavior, not changed to an invented `failed` status. The failure footer has a separate frame.
- Turn-summary keeps labels above the editor, omits null fields, and retains the widget while composing. Its narrow long field is truncated with an ellipsis, not wrapped. The new invalid-output fixture does not explain the user's Luna incident.
- Audit steering is shown once between the answer and continuation, and Lane B only reports advice. Off clears current results/footer while historical warnings remain in the transcript.
- Narrow audit status exceeds one viewport. The top supplemental frame retains steering text; the host's jump-to-latest overlay covers part of its last visible transcript line. This actual behavior was preserved.
- Perf-log has no normal feature UI. The normal screenshot alone is not proof of logging; the associated real session/turn/run records provide that evidence. Both warning fixtures still complete a subsequent parent turn.
- Long artifact paths are truncated in footers. Hardware cursor is hidden but the TUI editor block cursor remains visible. No dynamic resize, light theme, real model behavior, or user-terminal font was tested.

Initial fixture assertions exposed transcript text being mistaken for editor content, suggestion dismissal during status input, and audit root discovery ascending into the repository. These harness issues were corrected in scope and the affected runs retried. A long summary test established actual ellipsis behavior rather than the initially anticipated wrapping. Failed-run screen evidence and cleanup remain alongside final captures.

## Evidence

Ignored, workspace-local artifacts; not uploaded or committed:

- [Landing index: both historical galleries](../../artifacts/ui-captures/index.html)
- [Supplemental gallery](../../artifacts/ui-captures/2026-10-12-supplemental/index.html)
- [Markdown image index](../../artifacts/ui-captures/2026-10-12-supplemental/index.md)
- [Manifest](../../artifacts/ui-captures/2026-10-12-supplemental/manifest.json)
- [Artifact verification](../../artifacts/ui-captures/2026-10-12-supplemental/verification.json)
- [Visual inspection record](../../artifacts/ui-captures/2026-10-12-supplemental/visual-checks.md)
- [Capture fixture tests](../../artifacts/ui-captures/2026-10-12-supplemental/fixture-tests.txt): 13 passed.
- [Feature unit tests](../../artifacts/ui-captures/2026-10-12-supplemental/feature-unit-tests.txt): 192 passed.
- [Standard regression tests](../../artifacts/ui-captures/2026-10-12-supplemental/regression-tests.txt): 540 passed.
- [Offline host integration/TUI tests](../../artifacts/ui-captures/2026-10-12-supplemental/host-integration-tests.txt): 47 passed, no skips.

The legacy gallery also passed the updated verifier via the read-only `verifyEvidence()` API, without rewriting its historical verification file. Landing/gallery links were validated statically; no browser-interaction test of the HTML galleries was performed. Source tooling: [capture README](../../scripts/ui-captures/README.md), `scope.mjs`, `supplemental.mjs`, and `fixtures/nested-{data.mjs,provider.ts}`.

## Implications

The offline PNG inventory now covers all eight local extensions, with headless logging represented honestly. Use these galleries as UI references, not evidence of live-provider correctness or latency. [BL-bsnv](../backlog/BL-bsnv-complete-png-captures-for-remaining-extension.md) is complete. [BL-u6tb](../backlog/BL-u6tb-diagnose-and-fix-recurring-turn-summary.md) remains the separate next job for the real recurring Luna failure; it was not started or fixed by this capture work. No new deferred candidate is required.
