---
title: pi computer use — native macOS tools
date: 2026-10-11
session: 01a12764-d3ce-7687-a617-bb698837cf9f
based_on:
  - docs/research/2026-10-11-codex-sky-computer-use.md
---

# pi computer use — native macOS tools

## Goal

Let pi operate macOS desktop apps. OpenAI's `SkyComputerUseService` cannot be
reused directly because it authenticates senders by code signature (see the
research record), so pi gets its own path:

- **B — native tools**: a pi-owned Swift helper exposing accessibility-tree
  reads and input actions, wrapped as fine-grained pi tools.

Option A (delegating whole tasks to `codex exec`) was built and verified, then
dropped by the user's decision; see Amendments.

## Non-goals

- Reusing or bypassing OpenAI's service, protocol, or signature gate.
- Surveying existing open-source automation projects (explicitly declined).
- Windows/Linux support, audio recording, distribution signing or notarization.
- Delegating desktop tasks to codex (option A, dropped).

## Design

### A — codex delegation (dropped)

- Was a tool `computer_use_codex({ task })` that confirmed with the user, then
  spawned `codex exec --json --ephemeral` and returned codex's last message.
  Feasibility: `docs/spikes/2026-10-11-codex-exec-computer-use.md`.
- Removed because B covers the need without a second model in the loop.

### B — native helper and pi extension

- `native/cua-helper/` is a SwiftPM executable `pi-cua-helper`. It is a
  long-lived process speaking JSON lines over stdio
  (`{id, method, params}` → `{id, result}` or `{id, error}`) so element indexes
  from `get_app_state` stay valid for later actions.
  - `permissions` / `request_permissions`: Accessibility, event posting, and
    Screen Recording status (or system prompts).
  - `list_apps`: regular running applications. `resolve_app` identifies a
    running or installed app (bundle id, localized name, or bundle file name)
    without touching it, for approval checks. `launch_app` opens or activates it.
  - `get_app_state({app})`: indexed, indented accessibility-tree text with depth
    and node caps, plus a JPEG window screenshot as a data URL.
  - Actions: `click` (AXPress by index, CGEvent fallback or coordinates),
    `type_text`, `press_key` (`cmd+shift+a` chords), `scroll`, `set_value`.
  - Input safety: synthesized events go to the HID tap only after the target
    app is confirmed frontmost (activation falls back to LaunchServices,
    because cooperative activation can refuse a background caller); typing
    re-checks per character. Coordinates outside the window are rejected.
  - Delivery details found in testing: modifier chords need real modifier
    key events (flags alone did not trigger `cmd+n`); text goes one character
    per event (Calculator read only the first character of a multi-character
    event); a 200 ms settle after each action lets an immediate state read
    see the result.
- `extensions/computer-use/` owns the helper process per session: spawn on
  first use, stop on `session_shutdown`. Tools: `computer_list_apps`,
  `computer_get_app_state` (read-only), `computer_launch_app`, `computer_click`,
  `computer_type_text`, `computer_press_key`, `computer_scroll`,
  `computer_set_value`.
  - Per-app approval before the first read or action, remembered for the
    session (reads expose window contents, so they are gated too). Never
    allowed: terminals, the app hosting pi (`__CFBundleIdentifier`), System
    Settings, Keychain Access, Passwords. Gated tools refuse without an
    interactive UI.
  - A missing helper binary yields an error naming the build command.
- `npm run build:cua-helper` builds the helper; the extension never builds it.
- The tool surface follows the shape of `@oai/sky`'s mac window API as
  documented in the research record; no OpenAI code is copied.

## Phases

### Phase 0: plan and codex spike (done; A later dropped)
- Changes: this plan; spike `docs/spikes/2026-10-11-codex-exec-computer-use.md`.
- Verify (manual): `codex exec` performs a Calculator task end to end.

### Phase 1: codex delegation tool (built, then removed)
- Changes: `extensions/computer-use/codex.ts`, JSONL parser tests.
- Verify (automated): `npm test`. Verify (manual): one Calculator task from pi.

### Phase 2: helper, read-only
- Changes: `permissions`, `list_apps`, `get_app_state`.
- Verify (manual): CLI prints Calculator state text and screenshot size.
- Check early which process TCC attributes Accessibility and Screen Recording
  to (helper vs. the terminal running pi).

### Phase 3: helper actions and pi tools
- Changes: actions, extension tools, approval flow.
- Verify (automated): `npm test` with a mocked helper.
- Verify (manual): Calculator 12+34; typing into a new TextEdit document.

### Phase 4: wrap-up
- Changes: README resources and usage.

## Risks and open questions

- TCC attribution (observed): an unsigned, freshly built helper reported
  Accessibility and event posting as granted without any prompt, so macOS
  attributes them to the app hosting pi (here Ghostty), not to the helper.
  Granting them widens what every process in that terminal can do. Screen
  Recording, once granted to Ghostty, applied to the helper the same way.
  A signed `.app` helper with its own TCC identity is the option
  if this attribution is unacceptable.
- Large accessibility trees: mitigated by caps and an optional query filter.
- ScreenCaptureKit from a CLI: the helper must initialize `NSApplication`
  (activation policy `.prohibited`) at startup, or capture aborts in
  `CGS_REQUIRE_INIT`. Verified: 460x816 px Calculator capture, and a
  coordinate click in screenshot pixels mapped to the right button.

## Amendments

### 2026-10-11 — Design adjusted after implementation and testing
- Change: Added `computer_launch_app` and helper methods `resolve_app`,
  `launch_app`, `request_permissions`; approval now gates reads as well as
  actions and denies the host app and Passwords; recorded input-delivery
  details, the frontmost guard, and the observed TCC attribution.
- Reason: Manual end-to-end tests showed that apps must be identifiable
  before approval, menu shortcuts and per-key apps need different event
  delivery, and background activation can be refused.

### 2026-10-11 — Option A dropped
- Change: Removed the `computer_use_codex` tool and its code and tests
  (`extensions/computer-use/codex.ts`); the plan now covers only the native
  tools. The spike record is kept as historical evidence.
- Reason: The user decided codex delegation is not needed.

### 2026-10-11 — Screenshot path verified and fixed
- Change: The helper now initializes `NSApplication` before handling requests;
  screenshot capture and screenshot-pixel coordinate clicks are recorded as
  verified, replacing the earlier "unverified" notes.
- Reason: After Screen Recording was granted to Ghostty, the first capture
  aborted with `CGS_REQUIRE_INIT` because a bare CLI process had no window
  server connection.
