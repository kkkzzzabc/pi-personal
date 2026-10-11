---
title: Can all four local extension UI baselines be captured offline?
date: 2026-10-11
session: 01a12b4b-28aa-777e-a1b2-b9c05ca7607a
based_on:
  - docs/plans/2026-10-11-ask-user-extension.md
  - docs/plans/2026-10-11-subagent-extension.md
  - docs/plans/2026-10-11-pi-computer-use.md
result: yes
---

# Can all four local extension UI baselines be captured offline?

## Question

Can representative states of `ask-user`, `plan-mode`, `subagent`, and `computer-use` be captured from the actual Pi TUI without live models, real app operations, production UI changes, or global configuration changes?

## Setup

The user approved the capture plan through plan-mode approval in the originating session. Execution used the existing `skills/tui-check` isolated offline harness and new development-only tooling in [`scripts/ui-captures/`](../../scripts/ui-captures/README.md).

- Host: local Pi fork, package `@earendil-works/pi-coding-agent` 1.1.0, fork release `b1a78306c-openai-fast-20261011-125046`.
- Tooling: Node v26.10.0, agent-tty 0.5.0, ghostty-web PNG renderer, reference-dark render profile.
- Presentation: built-in dark Pi theme, fullscreen mode, default keybindings; 120×40 cells / 1080×640 pixels and 80×30 cells / 720×480 pixels. Hardware cursor hidden; Pi's fake editor cursor remains visible.
- `ask-user` and `plan-mode`: production entry points driven by scripted parent responses and actual keyboard input. Plan paths were explicitly redirected into each run directory.
- `subagent`: production entry point and real child orchestration, with a local `ui-fixture` provider. Progress was held at file/abort gates; results, failures, fallback, and partial coverage were synthetic. Recorded durations include these gates and retries and are not inference benchmarks.
- `computer-use`: production entry point with its subprocess's `PI_CUA_HELPER` set to a fake JSON-lines executable. Only a generated fixture app identity/state and a synthetic PNG were returned. No native helper was invoked and no real app contents were accessed.
- Resource discovery, context-file discovery, MCP, and network/model access were disabled. Isolated faux runs have generated dummy authentication material, not copied user credentials.

Initial workspace revision was `c1ece3ac806163621334e1ad83fcdd793b5e8888`. An independent workspace commit landed during capture; the final revision was `79e804a`. The manifest preserves both revisions and initial dirty-state disclosure. Production entry-point hashes remained unchanged. Unrelated work was not edited by this task.

Reproduction:

```bash
node scripts/ui-captures/capture.mjs --group baseline --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group ask-user --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group plan-mode --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group subagent --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group computer-use --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/verify.mjs artifacts/ui-captures/my-baseline
```

## Result

**Yes:** 35 final PNGs and corresponding text snapshots cover all four extensions, the shared idle screen, and four narrow layouts. Every final PNG was inspected using the image-read tool. The expanded ask-user result needed an additional top-of-transcript frame beyond the planned matrix. No required state is missing.

| Group | Final PNGs | Coverage |
|---|---:|---|
| Shared baseline | 1 | Idle host screen |
| ask-user | 13 | Single/multi choices; text, alternative, and comment editors; completed and partially unanswered review; submitted collapsed/expanded results; supplemental expanded top frame; discussion, cancellation, and narrow layout |
| plan-mode | 6 | Enter confirmation; active notification/status; approval choices; feedback editor; approved build-mode result; narrow approval layout |
| subagent | 9 | Single/parallel running; completed collapsed/expanded results; mixed success/failure; fallback; abort; partial configured review; narrow parallel progress |
| computer-use | 6 | Approval; collapsed/expanded app-state output; rejection; synthetic permission error; narrow expanded state |

**Rendering limitation:** computer-use's generated image attachment appears as `[Image: [image/png] 240x120]`, not inline image pixels. The actual fallback is captured and marked in the gallery/manifest. This does not verify graphics-capable terminal rendering or real macOS screenshots.

### Capture-tool adjustments and cleanup

The agent-tty 0.5 screenshot CLI uses a fixed 5-second RPC deadline even when its global timeout is set. Some live captures timed out. The local `screenshot.mjs` adapter uses the same installed capture RPC and renderer with a bounded 60-second deadline; no installed tool files were changed. This adapter depends on tool internals and is a development-only compatibility measure.

Narrow screenshots start in fresh sessions at 80×30 rather than resizing an existing session. This baseline therefore does not test dynamic resize behavior.

A 300-second outer command deadline interrupted the subagent batch during startup of run 21, before `start.mjs` wrote `run.json`. Its metadata was reconstructed solely from that isolated session listing for cleanup, and `finish.json` confirms exit/destruction. No final capture uses that recovered run. The review fixture was retried successfully in run 22. The capture script now recovers its own isolated session for cleanup if its bounded startup subprocess fails before writing metadata; abrupt termination of the entire orchestrator remains a follow-up.

**All 27 created Pi/agent-tty runs, including failed attempts and the recovered startup, exited and were destroyed.**

## Evidence

Workspace-local generated artifacts (ignored, not uploaded or committed):

- [Offline gallery](../../artifacts/ui-captures/2026-10-11-baseline/index.html)
- [Markdown image index](../../artifacts/ui-captures/2026-10-11-baseline/index.md)
- [Manifest: state matrix, key sequences, source hashes, visual checks, and environment](../../artifacts/ui-captures/2026-10-11-baseline/manifest.json)
- [Automated artifact verification](../../artifacts/ui-captures/2026-10-11-baseline/verification.json): 35 images, 27 cleaned-up runs, 22 fixture-provider requests, 7 fixture-helper requests; all local links and dimensions valid.
- [Fixture tests](../../artifacts/ui-captures/2026-10-11-baseline/fixture-tests.txt): 7 passed.
- [Existing `npm test` suite](../../artifacts/ui-captures/2026-10-11-baseline/regression-tests.txt): 280 passed.
- [Offline host integration tests](../../artifacts/ui-captures/2026-10-11-baseline/host-integration-tests.txt): 36 passed (`ask-user`, `plan-mode`, `subagent`).
- Raw scenarios, launch scripts, request logs, screenshot metadata, and `run.json`/`finish.json` are retained under the artifact directory's `runs/` folder.

The verifier checks file signatures, dimensions, state tokens, local gallery links, isolated plan configuration, fixture model identities/helper methods, and cleanup. Gallery links were checked statically; a browser interaction test of the gallery was not performed. The PNGs themselves were visually inspected. No real model behavior, real app behavior, user theme/font, inline image graphics, or dynamic resize behavior was verified.

## Implications

### Observed facts

- Ask-user selection and editor screens occupy the lower interactive area, while call metadata stays in the transcript.
- At 80 columns, ask-user's keyboard guidance is truncated on the right. The screenshot retains the actual behavior.
- Expanded ask-user results include the entire form and answers as JSON; the fixture needs more than one transcript viewport.
- Plan approval headings wrap the full plan path over multiple lines, especially in the narrow fixture. The workspace-local artifact path is intentionally long and can amplify this effect compared with ordinary plan paths.
- Subagent results use semantic icons/colors and collapse long answers to three lines; fallback and partial-review warnings are visible.
- Computer-use has no custom tool renderer: approval uses the host dialog, and results use the host's default text/image fallback rendering.

### Recommendations, not implementation decisions

Use this gallery as the before-state reference. Prioritize compact/complete narrow-screen keyboard guidance and a more user-oriented expanded decision summary before making aesthetic changes. Compare plan-path density using ordinary paths as well as this stress fixture. Do not interpret fixture duration, token counts, or errors as real-provider performance evidence.

Unfinished follow-ups are registered as candidates, not approved UI changes:

- [BL-yz3u](../backlog/BL-yz3u-improve-narrow-screen-keyboard-guidance-and.md): improve narrow keyboard guidance and verbose decision-result presentation.
- [BL-pvue](../backlog/BL-pvue-harden-ui-capture-tooling-against-screenshot.md): replace the screenshot-internal adapter when a supported timeout path exists and harden abrupt-interruption cleanup.
