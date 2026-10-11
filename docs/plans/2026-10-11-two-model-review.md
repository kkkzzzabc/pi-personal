---
title: Two-model review workflow
date: 2026-10-11
session: 01a12b28-32f7-7547-a484-43de317df55b
based_on:
  - docs/plans/2026-10-11-subagent-extension.md
  - docs/plans/2026-10-11-subagent-model-fallback.md
  - docs/research/2026-10-11-code-review-in-agent-customization.md
  - docs/backlog/BL-7g5t-make-the-review-roster-configurable-for.md
---

# Two-model review workflow

## Goal

Recommend Opus + GPT (Sol) as the personal `/review` roster, reducing the number
of routine review participants while preserving independent review, explicit
coverage, and parent evidence verification. Relax the fixed-four contract without
silently rewriting existing user configuration.

The user approved this design/documentation scope in the originating session and
explicitly narrowed the original candidate to two reviewers only, without optional
expansion. This accepted design completes BL-7g5t. Implementation is separately
tracked as [BL-5fng](../backlog/BL-5fng-implement-the-two-model-review-workflow.md),
completed implementation with evidence below.

**Status: implemented and verified offline.** The user subsequently authorized
implementation and separately authorized global configuration application in the
originating session. The loader now accepts 2–4 models; the project example and
`~/.pi/agent/subagent.json` select Opus + Sol. Explorer settings were preserved.
The already-running parent requires `/reload` for updated extension/prompt
contracts; this task did not independently verify that reload or call real models.

### Evidence and rationale

Observed: `config.ts` requires four model strings; `extension.ts` also requires
four for review expansion. `render.ts` derives coverage from actual child rows
but hard-codes the call label. The existing prompt, README, and example document
four reviewers. The previous plan records an authorized four-model global
configuration application; today's global configuration was not inspected.

BL-7g5t cites a limited local sample of three completed four-model reviews and one
supplemental Opus/GLM review. Its recorded analysis says Grok finished last without
a unique important finding, while GLM's small findings mostly overlapped faster
reviewers. This task did not reproduce or independently audit that sample.

Inference: removing two participants may reduce latency and available aggregate
cost, but no new timing, pricing, or quality benchmark was run. Two reviewers can
miss findings another model might catch. Recommendation and user selection:
retain Opus and Sol, with the existing `high` thinking specifications. This is a
personal workflow choice, not a general model ranking.

## Non-goals

- Optional reviewers, roster profiles, selection UI, `/review-full`, new flags,
  automatic escalation, or follow-up model execution.
- Background work, detached runners, worker roles, review autofix, or changes to
  explorer fallback and generic manual delegation.
- Implementation, global settings, installs, credential changes, live model calls,
  or benchmark studies as part of this design task.
- Fork changes, new runtime dependencies, cross-feature coupling, or modifying
  external references.

## Design

### 1. Configuration and compatibility

Keep the existing optional `<agentDir>/subagent.json` and `review.models` field.
The recommended explicit configuration after implementation is:

```json
{
  "agents": {
    "explorer": {
      "model": "openai/gpt-6-luna:high",
      "fallbackModels": ["anthropic/claude-haiku-5-5:high"]
    }
  },
  "review": {
    "models": [
      "anthropic/claude-opus-5-5:high",
      "openai/gpt-6.1-sol:high"
    ]
  }
}
```

Explorer settings are preserved from the existing project example, not newly
selected or automatically applied. Do not substitute the parent's model, Luna,
or a fast Sol variant for the selected review model. IDs and thinking levels come
from the prior selection; actual provider access remains unverified by this task.

The future loader accepts **2–4** non-empty, trimmed, distinct model strings.
Two is the selected personal roster; four remains valid for compatibility. Three
is an explicitly configured roster within the same bounds, not an optional
expansion feature. Introduce separate review minimum/maximum constants; do not
make the manual `tasks` maximum depend on the recommended review count.

- Missing configuration does not install implicit model defaults. Missing review
  configuration on review invocation remains an error, not model inheritance.
- Invalid JSON, unknown keys, empty/non-string entries, invalid cardinality, and
  duplicate strings remain configuration errors before launch.
- Reject duplicate resolved provider/model identities before launch, including
  aliases or different thinking suffixes for the same model.
- Never truncate, reorder, migrate, or rewrite existing user lists automatically.
  A four-entry list still runs all four models until explicitly changed.
- Preserve explorer fallback, strict overrides, generic single-reviewer behavior,
  and manual `tasks` with 1–4 children.

### 2. Tool and prompt contract

Retain the mutually exclusive call form:

```ts
subagent({ review: { task: "<self-contained target, intent, and criteria>" } })
```

The extension expands the configured list; the parent need not discover model
IDs or guess the roster. Keep `/review [target or focus]` without new flags or
commands. Future tool descriptions, schema descriptions, prompt guidelines, and
`prompts/review.md` refer to the **configured roster**, not exactly four models.
No optional arrays or expansion fields are introduced.

Each reviewer receives the same complete brief, fresh in-memory session,
read-only tools, current reviewer context policy, and shared repository/HEAD
baseline. The parent verifies retained findings and synthesizes a verdict; the
review workflow does not edit files automatically. Preserve the existing baseline
limitations: HEAD consistency is not a frozen working-tree snapshot.

### 3. Execution, failure, and cancellation

Execute the configured slots concurrently using the existing foreground runner.
Wait for all configured slots to terminate. With the selected two-entry list,
GLM and Grok are neither launched nor awaited. Do not add background completion
hooks or return early while unreported reviewers continue running.

Preserve slot-local resolution/authentication/request failures, strict model
selection, no replacements, and host-owned retries. A failed slot does not discard
a healthy review. Configuration/duplicate-identity errors block launch; a shared
local setup failure is not mislabeled as multiple provider failures. Cancellation
aborts pending/running slots without fallback or replacement. Preserve session
cleanup, diagnostic sanitization, and output-save warnings.

### 4. Coverage and accounting

The denominator is the explicitly configured roster, not the recommended count
or a fixed four. Keep existing detail fields and actual child-row accounting.
For the selected two-model configuration:

| Successful slots | Coverage | Result |
|---|---|---|
| 2 | `complete (2/2)` | Both reviewers returned; parent verifies findings |
| 1 | `partial (1/2)` | Keep successful review; name missing model and reason |
| 0 | `none (0/2)` | Tool error; no review verdict available |

Coverage describes completion, not consensus, correctness, or agreement. Report
pending/aborted statuses explicitly and retain requested/resolved identities,
per-slot failure phases/reasons, available usage/cost and tool counts, and run
wall time. Do not sum parallel durations as elapsed time or claim unexposed costs.
Partial usable results retain the existing non-error tool behavior; zero successful
reviewers provide no verdict.

Use a neutral call label such as `configured review`: the call renderer does not
receive resolved configuration, so it must not guess a model count. Progress/final
results show actual counts and identities. Avoid new fields solely to feed the
call renderer or hidden global configuration reads during rendering.

### 5. Alternatives and boundaries

- Keep mandatory four reviewers: compatible, but does not meet the selected
  two-reviewer workflow.
- Optional extra reviewers or separate extended-review commands: excluded by the
  user, not deferred as unfinished work.
- Require exactly two and reject existing four-entry lists: unnecessarily breaks
  previously valid configurations. A bounded 2–4 list preserves them.
- Silently select the first two from legacy lists: changes prior user intent and
  hides coverage; rejected.
- Keep two unspecified-model manual tasks: risks duplicate parent-model reviewers;
  retain extension-owned explicit roster expansion instead.

No new host API is needed. Reuse the local extension and its existing public Pi
SDK paths. No production coupling to another extension or test feature is added.
These are feature-local decisions, not a new standing-rule ADR.

### 6. Migration and rollback

Future implementation updates the project-owned example and README recommendation,
not `<agentDir>/subagent.json`. Global configuration migration requires separate
explicit authorization. A migration replaces only `review.models`, preserving
unrelated settings and retaining the prior list for rollback. No migration is
performed by this task.

Legacy four-entry configurations continue to run four reviewers, with their
existing expense and latency. Merely implementing cardinality support does not
make an existing user's workflow use two models.

Configuration rollback restores the explicit four-entry list, supported by the
new loader. Before rolling source back to the old fixed-four implementation,
restore a four-entry configuration because old code rejects two entries.

## Phases

The phases below were subsequently approved and implemented as BL-5fng in the
originating session. The acceptance matrix remains the verification contract;
completed evidence follows.

### Phase 1: Configuration and expansion

- Changes: in `extensions/subagent/config.ts`, replace exact-four validation with
  separate 2–4 bounds and accurate diagnostics. In `extension.ts`, apply the same
  review bounds without changing manual `MAX_TASKS = 4` or the call shape.
- Verify (automated): trimmed lists of 2/3/4; reject 0/1/5 entries, missing review
  configuration, malformed values, unknown keys, duplicate strings and resolved
  identities; verify manual 1–4 task limits and single-reviewer compatibility.
- Verify (manual): read diagnostics and confirm no implicit roster/migration.

### Phase 2: Reporting, prompts, and examples

- Changes: neutral call label in `render.ts`; roster-neutral tool/schema/guideline
  wording in `extension.ts` and `prompts/review.md`; two-model recommendation and
  compatibility/migration warning in `README.md` and `subagent.example.json`.
- Verify (automated): unchanged `/review` expansion and call schema; actual counts
  in progress/final results; no fixed-four promise in current help. Preserve
  existing result-detail fields and aggregate accounting.
- Verify (manual): isolated faux TUI counts, partial coverage, missing identities,
  and cancellation, using the `tui-check` skill. No real-model calls.

### Phase 3: Offline regression and implementation evidence

- Changes: extend `tests/subagent.test.mjs`, `tests/subagent-runner.test.mjs`, and
  `tests/subagent.integration.test.mjs` using fixtures/faux models; retain the
  existing four-model compatibility cases. Record host and evidence limits.
- Verify (automated): the acceptance matrix below, focused tests, full workspace
  unit tests, and pinned installed-host SDK/integration tests.
- Verify (manual): confirm source, prompts, examples, and docs agree; no global
  settings or unrelated feature changes. Resolve and validate the installed host
  before SDK/TUI checks; do not infer the running session version from a fallback.

### Offline acceptance matrix

| Surface | Required cases |
|---|---|
| Configuration | Valid 2/3/4; trimmed entries; invalid 0/1/5, missing roster, empty/non-string values, invalid JSON, unknown keys, duplicate strings |
| Resolved identity | Aliases/thinking suffix duplicates rejected before launch; no parent inheritance |
| Two-slot execution | Exactly two fresh reviewers, identical complete task and shared baseline; no GLM/Grok, extras, replacements, or history transfer |
| Failures | Both succeed; one resolution failure; one request failure; both fail; shared setup failure distinguished |
| Cancellation | Before launch and during execution; explicit aborted/pending statuses; sessions disposed |
| Reporting | `2/2`, `1/2`, `0/2`; missing identities/reasons; no fabricated agreement or verdict with zero successes |
| Accounting | Available expense and tools aggregated; wall time not summed; save warnings preserved |
| Compatibility | Four-model regressions; manual 1–4 tasks; generic single reviewer; strict overrides; explorer fallback; HEAD movement; existing result keys |
| Prompt/TUI | Unchanged tool call; neutral call label; actual count/partial/cancel display in isolated faux TUI |

Future commands, with `$root` resolved and validated against the installed host:

```bash
node --test tests/subagent.test.mjs tests/subagent-runner.test.mjs
PI_PACKAGE_DIR="$root" node --test tests/subagent.integration.test.mjs
npm test
PI_PACKAGE_DIR="$root" npm run test:integration
```

## Risks and open questions

- Removing reviewers may omit useful findings. The user chose two without optional
  expansion; this design does not claim equivalence to four-model quality.
- Host retries and the slower selected reviewer still determine foreground wait
  time; two participants do not guarantee a particular speedup.
- Existing global configurations remain four-model until explicitly migrated.
- Faux evidence establishes mechanics, not real provider availability, account
  limits, thinking behavior, model quality, or parent adherence to the prompt.
- The old implementation rejects the new recommended list. Implementation must
  precede configuration application; source rollback requires restoring four.

No unresolved substantive design choice remains for this narrowed scope.
Implementation and configuration application were separately authorized and
completed. Reload of the running parent remains a user action.

## Verification evidence

Design-only baseline in session `01a12b28-32f7-7547-a484-43de317df55b`:
`node --test tests/subagent.test.mjs tests/subagent-runner.test.mjs` passed
**86 tests**, zero failures, cancellations, or skips. These tests exercise the
existing implementation, including fixed-four validation and legacy review
behavior; they do **not** establish two-model configuration or execution support.
No SDK/TUI or live provider checks were run for the initial design-only task.

### Subsequent implementation and configuration evidence

The user explicitly requested actual implementation, then approved replacing the
global roster with two models. Implementation and offline verification used the
installed `@earendil-works/pi-coding-agent` 1.1.0, fork release
`b1a78306c-openai-fast-20261011-125046`, pinned through `PI_PACKAGE_DIR` for SDK
tests. This identifies the installed host, not independently the running parent's
release. No live provider calls, installs, or reviewer agents were used.

- Focused unit/runner tests: **100 passed**; SDK integration: **14 passed**.
- Full `npm test`: **280 passed**; pinned `npm run test:integration`: **47 passed**.
  Zero failures, cancellations, or skips. Logs: `/tmp/bl5fng-unit.log`,
  `/tmp/bl5fng-sdk.log`, `/tmp/bl5fng-integration.log`.
- Added `tests/subagent-tui.integration.test.mjs` to the integration suite. Isolated
  real Pi TUI with faux parent and a test-only two-identity provider verified
  `/review README.md` expansion, neutral `configured review` label, `complete
  (2/2)`, `partial (1/2)` with the failed model/reason, and Escape cancellation
  with `2 aborted`. Provider call logs contain exactly identities `a` and `b`,
  each with one user task. Parent session JSONL records actual two-slot results.
- Retained TUI evidence:
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/subagent-tui-UH6UIO/`;
  `complete/run`, `partial/run`, and `cancel/run` hold screen snapshots, model-input
  logs, provider-call logs, sessions, and `finish.json`. All three isolated Pi
  processes exited and agent-tty sessions were destroyed. This demonstrates
  mechanics, not model judgment or real provider behavior.
- After explicit approval, removed only Grok/GLM entries from
  `~/.pi/agent/subagent.json`. The actual `loadConfig` accepted the remaining
  Opus/Sol `high` roster and preserved Luna/Haiku explorer settings. No other
  global settings changed. The prior four-entry list remains recorded in the
  predecessor plan for rollback. Reload and live-provider behavior remain
  unverified, rather than being claimed as completed.
