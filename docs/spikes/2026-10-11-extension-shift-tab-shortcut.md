---
title: Can an extension bind Shift+Tab for mode switching?
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
  - docs/research/2026-10-11-pi-plan-mode-example.md
result: partial
---

# Can an extension bind Shift+Tab for mode switching?

## Question

OpenCode toggles plan/build with Shift+Tab. Can a pi extension register
`shift+tab` via `pi.registerShortcut`, and under what conditions?

## Setup

- pi 1.1.0 (managed install, `~/.pi/agent/install/releases/1.1.0`), Node 26.
- Source reference: fork at tag `v1.1.0` (`abe508e1b`).
- Script imports the installed `dist/` and calls the real conflict logic
  `ExtensionRunner.prototype.getShortcuts` with a fake extension registering
  `shift+tab`, against `KeybindingsManager(userBindings).getEffectiveConfig()`:

```js
const km = new KeybindingsManager(userBindings);
const ext = { path: "plan-ext", shortcuts: new Map([["shift+tab", { extensionPath: "plan-ext", handler() {} }]]) };
const fake = { extensions: [ext], shortcutDiagnostics: [], hasUI: () => true };
const result = ExtensionRunner.prototype.getShortcuts.call(fake, km.getEffectiveConfig());
```

- Three cases: default bindings; `app.thinking.cycle` rebound to `ctrl+t`;
  `app.thinking.cycle` unbound (`[]`).

## Result

**partial**: not by default, yes after a one-line user keybinding change.
`shift+tab` is the default for `app.thinking.cycle`, which is on the reserved
list, so the extension shortcut is skipped. The reservation is computed from
the effective (user-resolved) bindings, so moving or unbinding
`app.thinking.cycle` in `~/.pi/agent/keybindings.json` frees `shift+tab` for
the extension.

## Evidence

```text
[default] thinking.cycle = "shift+tab" | registered: false | diag: Extension shortcut 'shift+tab' from plan-ext conflicts with built-in shortcut. Skipping.
[rebind thinking to ctrl+t] thinking.cycle = "ctrl+t" | registered: true | diag: -
[unbind thinking] thinking.cycle = [] | registered: true | diag: -
```

- Reserved list includes `app.thinking.cycle`
  (`packages/coding-agent/src/core/extensions/runner.ts:96-115` at v1.1.0).
- Reservation uses the resolved bindings passed in
  (`runner.ts:119-138`, `runner.ts:673-713`); interactive mode passes
  `this.keybindings.getEffectiveConfig()`, which merges
  `~/.pi/agent/keybindings.json` (`dist/core/keybindings.js:295-313`).
- No other default binding uses `shift+tab` (enumerated effective config).
- `~/.pi/agent/keybindings.json` does not exist yet on this machine.
- Not tested: actual key dispatch in a live TUI session.
- `packages/coding-agent/src/core/keybindings.ts` changed after v1.1.0 (18
  commits ahead); re-check on upgrade.

## Implications

- Default the plan-mode toggle to a non-reserved key (the example uses
  `Ctrl+Alt+P`) plus a `/plan`-style command.
- Offer Shift+Tab as opt-in: move `app.thinking.cycle` to an unused key, e.g.
  `{ "app.thinking.cycle": "ctrl+alt+t" }` in `~/.pi/agent/keybindings.json`,
  then configure the extension shortcut as `shift+tab`. Do not use `ctrl+t`:
  it is already the default for `app.thinking.toggle`. The original experiment
  checked whether Shift+Tab became available, not whether the replacement key
  conflicted with another action.
- For implemented configuration and validation, see
  [Plan mode usage](../../README.md#plan-mode) and
  `tests/plan-mode.integration.test.mjs`.

## Amendments

### 2026-10-11 — Avoid a conflicting replacement shortcut
- Change: Replaced the recommended `ctrl+t` rebinding with `ctrl+alt+t` and
  linked the implemented configuration. Kept the original experiment unchanged.
- Reason: `ctrl+t` is already bound to `app.thinking.toggle`; freeing Shift+Tab
  alone did not validate the replacement shortcut.
- Impact: The opt-in instructions no longer recommend a built-in collision.
- Evidence: [Current usage guidance](../../README.md#plan-mode), installed
  `dist/core/keybindings.js`, and `tests/plan-mode.integration.test.mjs`.
