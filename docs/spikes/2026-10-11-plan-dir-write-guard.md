---
title: Can an extension limit write/edit to a plan directory?
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
  - docs/research/2026-10-11-pi-plan-mode-example.md
result: yes
---

# Can an extension limit write/edit to a plan directory?

## Question

OpenCode's plan agent may write only under `~/.opencode/plan/`. Can a pi
extension keep `write`/`edit` active in plan mode but block every target
outside a plan directory, using a `tool_call` handler and only public APIs?

## Setup

- pi 1.1.0 (managed install), Node 26; source reference fork tag `v1.1.0`
  (`abe508e1b`).
- Built-in `write`/`edit` resolve `input.path` with `resolveToCwd(path, ctx.cwd)`
  (`packages/coding-agent/src/core/tools/write.ts:65`, `edit.ts:161`,
  `path-utils.ts:48-50`). `resolveToCwd` is **not** exported from the public
  package entry, so the extension must re-implement it.
- Candidate re-implementation: normalize Unicode spaces, strip a leading `@`,
  expand `~` / `~/`, then `path.resolve(cwd, p)`. Allowed if
  `path.relative(planDir, abs)` is non-empty, not `..`-prefixed, and not
  absolute.
- Script compares the candidate against the installed
  `dist/core/tools/path-utils.js` `resolveToCwd` on 11 inputs, dispatches
  `write` calls through the real `ExtensionRunner.prototype.emitToolCall`
  with the guard registered, and checks a symlink inside the plan directory
  pointing outside.

```js
function candidate(p, cwd) {
  let s = p.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  if (s.startsWith("@")) s = s.slice(1);
  if (s === "~") s = home; else if (s.startsWith("~/")) s = join(home, s.slice(2));
  return isAbsolute(s) ? resolve(s) : resolve(cwd, s);
}
const inside = (abs, dir) => { const r = relative(dir, abs); return r !== "" && !r.startsWith("..") && !isAbsolute(r); };
```

## Result

**yes**, with one caveat. The candidate matched the host resolution on all
inputs, and `emitToolCall` returned `{ block: true, reason }` for paths
outside the plan directory and nothing for paths inside. The caveat: a purely
lexical check can be escaped through a symlink placed inside the plan
directory; resolving `realpath` of the nearest existing parent closes it.

## Evidence

```text
ok   "src/a.ts"                         allow= false
ok   "./src/../b.ts"                    allow= false
ok   "@src/c.ts"                        allow= false
ok   "~/.pi-plan-spike/plan.md"         allow= true
ok   "<home>/.pi-plan-spike/x/y.md"     allow= true
ok   "~/.pi-plan-spike/../evil.md"      allow= false
ok   "<home>/.pi-plan-spike/../evil.md" allow= false
ok   "/etc/hosts"                       allow= false
ok   "~"                                allow= false
ok   "a\u00A0b.md"                      allow= false
ok   "~user/x"                          allow= false
mismatches: 0
emit write src/a.ts -> { block: true, reason: 'Plan mode: writes are limited to <home>/.pi-plan-spike' }
emit write plan -> undefined
symlink lexical allow= true | realpath parent = /private/tmp/pi-spikes/sandbox/outside | real allow= false
```

- `tool_call` handlers receive mutable `event.input` and may return
  `{ block, reason, terminate? }`
  (`packages/coding-agent/src/core/extensions/types.ts:1165-1234`,
  `1426-1434` at v1.1.0). The runner stops at the first blocking result.
- `tool_call` also fires for nested calls (e.g. codemode), identified by
  `parentToolCallId` (`types.ts:1165-1175`), so the guard covers them
  (inferred from types; not exercised).

## Implications

- Plan mode can keep `write`/`edit` visible but restricted, like OpenCode,
  or remove them as the pi example does. Restricting enables saving plan
  files.
- Use the candidate resolver plus a `realpath` check of the nearest existing
  ancestor. Add a unit test that compares it with the host `resolveToCwd`
  through `PI_PACKAGE_DIR` to detect drift on upgrades. The current example is
  `tests/plan-mode.integration.test.mjs`; the former
  `tests/claude.integration.test.mjs` was retired with the docs extension.
- Bash remains the main bypass. A path guard does not apply to shell
  commands; that needs a separate decision (see research doc §2).

## Follow-up

The [implemented plan-mode design](../plans/2026-10-11-plan-mode-extension.md)
chose a narrower allowance: only the current plan file, not the whole plans
directory. It uses the canonical-path guard and resolver-parity tests; this
spike's directory-based experiment remains the feasibility evidence.

## Amendments

### 2026-10-11 — Connect the directory experiment to the implemented file guard
- Change: Linked the implemented single-file design and the current integration
  test, identifying the earlier docs-extension test as retired.
- Reason: The implementation selected a narrower allowance and the referenced
  test file no longer exists.
- Impact: Readers retain the original directory experiment but can find the
  applicable guard and parity test without relying on retired files.
- Evidence: [Plan-mode design](../plans/2026-10-11-plan-mode-extension.md),
  `extensions/plan-mode/paths.ts`, and `tests/plan-mode.integration.test.mjs`.
