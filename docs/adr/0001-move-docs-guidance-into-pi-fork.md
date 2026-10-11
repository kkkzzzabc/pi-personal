---
title: Move documentation guidance into the local Pi fork
date: 2026-10-11
session: 01a1273a-a357-76b6-9393-bfabd85f46e3
based_on:
  - docs/spikes/2026-10-11-pi-subagent-for-review.md
supersedes: null
---

# 0001. Move documentation guidance into the local Pi fork

## Context

The local Pi fork previously retained Pi's default documentation section.
Registering this package loaded `extensions/claude.ts`, which replaced that
section with guidance to use the `pi-docs` skill. Installing the fork alone
did not incorporate the extension.

The goal is to prevent the default documentation text associated with the
observed Anthropic OAuth failure from returning when skills or tools are
disabled, including in subagents. Moving the extension unchanged is insufficient.

Pi session `01a12690-1865-75c0-9dfb-1de20eb1d908` isolated the failure:
the full Pi prompt returned HTTP 400, removing only `<docs>` returned HTTP 200,
and swapping Pi and Aside OAuth tokens did not change those outcomes.
An actual Pi call with neutral documentation guidance also succeeded.
The local JSONL evidence is at
`~/.pi/agent/sessions/--Users-kkkzzzabc-workspace-projects-personal-pi-personal--/2026-10-10T16-05-40-069Z_01a12690-1865-75c0-9dfb-1de20eb1d908.jsonl`,
lines 167 (section isolation), 253 (token crossover), and 280 (Pi success).
The later [reviewer spike](../spikes/2026-10-11-pi-subagent-for-review.md)
also observed failure with `--no-skills` and success without it.
These results establish the effect of the default docs in the tested requests;
they do not identify an individual blocking substring or guarantee every request.

Implementation was performed in Codex; its session identifier is not recorded
here. The frontmatter `session`, `01a1273a-a357-76b6-9393-bfabd85f46e3`, identifies
the initial migration's isolated faux-model Pi validation, not implementation
or an authenticated provider experiment. Its local record is:

`~/.local/share/pi-fork/verification/docs-20261011-190847/sessions/2026-10-10T19-11-56-759Z_01a1273a-a357-76b6-9393-bfabd85f46e3.jsonl`

### Decision evolution

The initial migration selected neutral skill guidance when available but kept
the original docs fallback otherwise. The later correction removed that
fallback, including with skills disabled. The Decision below describes the
corrected policy; the two validation groups in Consequences refer to those
separate stages. This ADR already contained both stages before the current
maintenance pass; it is retained as one record rather than reconstructed into
separate historical ADRs. Future changes to the decision require a replacement
ADR under [the maintenance rules](../README.md).

## Decision

Select the default documentation guidance in the fork's
`packages/coding-agent/src/core/system-prompt.ts`:

- Use exactly the former extension's text when an automatically exposed
  `pi-docs` skill and a selected `read` or `bash` tool are available.
- A selected reader still counts when its declaration is hidden.
- Otherwise omit the default documentation section. Remove the original
  `Pi documentation` fallback entirely, including when skills are disabled,
  readers are unavailable, or a forced prompt is set.
- Preserve custom prompts, exact forced prompts (including empty strings),
  and nonempty explicit `docs` options. An empty explicit `docs` option omits
  the default section rather than restoring the original text.
- Leave the preamble, skill metadata, other sections, and provider selection
  unchanged. Add no configuration option.

Retire `extensions/claude.ts` and its two dedicated test files after validating
and activating the new fork installation. Keep `skills/pi-docs` and the rest
of the package registered. Move the prompt policy coverage to the fork's
`packages/coding-agent/test/system-prompt.test.ts`.

## Alternatives considered

- Keep the extension: leaves this fork's desired default policy dependent on
  separately loading a personal extension.
- Bundle the same extension into the fork: retains an unnecessary event handler
  and loading order when the prompt builder already has the required inputs.
- Retain the original fallback: reintroduces the prompt text associated with
  the observed failure when skills or readers are unavailable.
- Always reference the skill: would instruct models to use a missing or
  unavailable skill.

## Consequences

The guidance is now computed on every prompt render, including initial and
updated prompts, rather than being written to `sections.docs` by
`before_agent_start`. Extensions inspecting raw options no longer see that
injected override. Explicit documentation supplied by another extension still
has priority; changes to selected readers are reevaluated.

The local fork must be rebuilt and installed to apply the change.
An already-running process must restart to use the new core. Other Pi builds
will use their own default guidance after the extension is removed.
This change only affects default prompt generation. It does not rewrite saved
session history or text explicitly supplied by users or extensions.

The isolated TUI launcher disables skill discovery. With no explicit skill,
the default docs section is omitted; pass `--skill skills/pi-docs` to obtain
the neutral skill guidance. No
`--extension extensions/claude.ts` argument is needed.

Validation of the initial extension migration:

- Seven newly added expectations failed before the core change.
- Prompt construction and update tests passed: 43 tests.
- The previous installed host plus the retired extension matched the new host
  without that extension in 13 cases, comparing all rendered sections and the
  complete prompt after normalizing installation paths.
- The remaining personal package unit and integration tests passed: 78 tests.
- The checks covered by the fork's `npm run check` passed without auto-fixing.
- A faux-model TUI run loaded only `pi-docs`, the faux provider, and its observer.
  Its recorded model input contained the skill guidance and metadata.
- No real model request was sent. Authenticated Anthropic behavior remains
  unverified for that migration, separate from the earlier authenticated
  experiments described above.

Correction validation:

- Nine updated expectations failed before removing the fallback.
- Prompt construction and update tests passed: 43 tests, covering missing and
  disabled skills, missing readers, empty docs, forced prompts, and reader changes.
- All checks covered by `npm run check` passed without auto-fixing. The local
  installation passed offline package and CLI smoke checks; installed prompt
  checks covered eight omission cases and preserved neutral, explicit, custom,
  and forced guidance. No new authenticated model call was made.
- This correction replaces the initial fallback decision and the corresponding
  test expectations. Initial extension equivalence is not the correction's goal.

At migration time, historical documents and `scripts/anthropic-probe.py` were
left unchanged. Later documentation maintenance may add scoped corrections and
follow-up links; this does not change the recorded experiments or the probe.

### Authenticated follow-up

[The later Claude reviewer experiment](../spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md)
records successful authenticated requests with skills enabled, with
`--no-skills`, and for a read-only review on the corrected tested build.
It ran in pi session `01a1274f-21fa-75eb-a7cb-e17000a84e8a`. This supplements,
not retroactively upgrades, the offline migration/correction validation above;
it does not establish universal provider reliability or review quality.

## Amendments

### 2026-10-11 — Clarify decision evolution and validation provenance
- Change: Distinguished initial fallback retention from its later removal,
  identified the frontmatter session as faux validation with its storage path,
  and linked authenticated follow-up evidence. Scoped the unchanged-documents
  statement to migration time.
- Reason: One ADR contained two stages, and the phrase "session above" could
  confuse implementation, earlier authenticated diagnostics, and faux validation.
- Impact: The current decision and original session/date remain unchanged.
  Readers can distinguish the evidence for each stage; missing Codex provenance
  is not invented, and future decision changes use replacement ADRs.
- Evidence: The faux-session path above,
  [authenticated follow-up](../spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md),
  and pi session `01a126e5-63ba-72b8-af15-e9d632953a12` (the initial ADR text
  was read before correction).
