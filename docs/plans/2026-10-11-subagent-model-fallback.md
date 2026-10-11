---
title: Explorer model fallback and four-model parallel review
date: 2026-10-11
session: 01a1299f-d4ab-70ab-a076-0e49632aada5
based_on:
  - docs/plans/2026-10-11-subagent-extension.md
---

# Explorer model fallback and four-model parallel review

## Goal

Give the local foreground `subagent` extension two independent model policies:
ordered fallback for exploration, and an explicit four-model parallel roster for
`/review`. Prevent the review workflow from silently creating several reviewers
on the parent's model. Make actual models, incomplete coverage, and total expense
visible. This is BL-012's revised scope, extending the original S10 and `/review`
workflow without rewriting the original implementation or verification history.

### Approval and decision provenance

In session `01a1299f-d4ab-70ab-a076-0e49632aada5`, the user selected this follow-up
and approved recording the agreed policies and preparing this plan. Documentation
work was authorized first; that authorization alone did not approve implementation.
The user subsequently approved implementation and offline verification in the same
session. The feature is implemented and its offline evidence is recorded below.
The user then separately authorized applying the selected configuration; it was
written to `~/.pi/agent/subagent.json` and passed the configuration loader. The user
reported completing `/reload`. Actual provider/model calls remain unverified.

User-selected policies:

- Temporary request failures and persistent model unavailability belong to one
  fallback feature, including usage limits, authentication failures, and
  unavailable or invalid model IDs.
- After a mid-run model failure, restart the original task in a fresh session on
  the next model. Do not transfer previous messages or tool results.
- A per-call `model` is strict: use only that model and stop on failure, even when
  the role has a fallback list. The user chose this over automatic fallback with
  a per-call opt-out.

The user subsequently requested separate exploration and review policies and
approved this plan revision. The user reported a session with two reviewers on
the parent's model; that session was not inspected or independently reproduced.
The current prompt and selection code do permit that behavior.

Additional user-selected review policies:

- Use Opus 5.5, Sol 6.1, Grok 4.7, and GLM 5.3 together, one reviewer per model,
  four in parallel. This is a roster, not a priority or fallback list.
- If some models fail, summarize successful reviews and disclose missing models
  and reasons. Do not claim a complete four-model review or replace failed slots
  with another participant or the parent's model.

The user selected Luna 6.0 as the explorer primary and Haiku 5.5 as its error
fallback after the pricing/performance comparison. The selected thinking level is
`high`. This is failure recovery, not a second quality review of successful Luna
answers. The user corrected the GLM version to 5.3, matching `zai/glm-5.3` in the
local Pi model catalog. All six direct-provider IDs are identified. Catalog
presence does not verify credentials or successful model calls. The subsequent
offline host resolver accepted all six `high` specifications; provider behavior
was not tested.

Supporting boundaries are cancellation without replacement, excluding tool/task
failures from model fallback, evidence verification by the parent, and no automatic
fixes. Zero successful reviewers means no review verdict. Configuration, tool-call
shape, retry ownership, and lifecycle details below describe the implemented design.
Reviewer fallback is outside the selected `/review` workflow; the earlier generic
fallback proposal must not be read as requiring replacements for review slots.

## Non-goals

- Further model benchmark experiments or live provider access checks. The selected
  explorer priority and thinking level are recorded below; live configuration is
  not changed by this plan.
- Reviewer-slot fallback or reducing the selected review roster to 2–3 models.
- Selecting unconfigured replacements or silently upgrading to expensive models.
- Continuing one model's conversation on another model.
- Background work, writer roles, nested delegation, and review autofix.
- Fork changes, reference-package runtime dependencies, or cross-feature coupling.
- Changing live user configuration, installing packages, or changing credentials.
- Fixing the unrelated concurrent faux TUI queue issue (BL-008).
- Real-model checks without separately approved scope and cost.

## Design

### 1. Baseline implementation and host context

Observed code boundaries before this follow-up (preserved as design context):

- `prompts/review.md`: instructs 2–3 reviewers with different angles but does not
  require distinct models. Model inheritance can therefore produce duplicates.
- `extensions/subagent/config.ts`: validates an optional role configuration with
  a single `model`; unknown keys and malformed files are errors.
- `extensions/subagent/extension.ts`: merges per-call and role models before
  preparation, resolves every model before any child starts, and runs up to four
  children concurrently. A new implementation must retain model-selection origin.
- `extensions/subagent/runner.ts`: creates one fresh in-memory child, collects
  assistant errors and usage, disposes the session, and saves successful output.
  Setup errors, prompt exceptions, assistant errors, and missing final text are
  not yet differentiated for fallback eligibility.
- `extensions/subagent/render.ts`: displays one model/status per logical child.
- `extensions/subagent/review-diff.ts`: captures repository root and HEAD as a
  baseline and rejects a review if HEAD moves.
- `tests/subagent.test.mjs` and `tests/subagent.integration.test.mjs`: provide
  configuration, output, SDK/faux-provider, preflight, parallel, and abort coverage.

The installed CLI was resolved through
`/Users/kkkzzzabc/.local/share/pi-fork/current`, release
`b1a78306c-openai-fast-20261011-125046`, package
`@earendil-works/pi-coding-agent` version `1.1.0`. Its `docs/sdk.md` specifies that
`prompt()` resolves after automatic retries. Public `SettingsManager` declarations
provide `getRetrySettings`, `getSettings`, `inMemory`, and `applyOverrides`.
This identifies the currently installed CLI, not independently the exact release
of the already-running parent. Revalidate the installed package before future
SDK tests and do not treat these observations as runtime verification.

### 2. Configuration and selection

Keep explorer selection separate from review-roster selection in the existing
optional `<agentDir>/subagent.json`. The extension supports explorer `fallbackModels`
and an independent `review.models` roster:

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
      "openai/gpt-6.1-sol:high",
      "xai/grok-4.7:high",
      "zai/glm-5.3:high"
    ]
  }
}
```

The supported example is also in `extensions/subagent/subagent.example.json`.
It was subsequently applied to `~/.pi/agent/subagent.json` with the user's explicit
approval. All six IDs were observed in the
local Pi catalog and resolved offline with `high`; credentials/model calls were
not tested. Array order in `review.models` is presentation order, not priority.
Explorer order is explicitly Luna first, Haiku on eligible failure. Explorer lists
are capped at eight fallback entries to bound attempt records and repeated expense.

| Use | User-supplied model name | Observed direct-provider/model ID |
|---|---|---|
| Explorer primary | Luna 6.0 | `openai/gpt-6-luna` |
| Explorer error fallback | Haiku 5.5 | `anthropic/claude-haiku-5-5` |
| Review participant | Opus 5.5 | `anthropic/claude-opus-5-5` |
| Review participant | Sol 6.1 | `openai/gpt-6.1-sol` |
| Review participant | Grok 4.7 | `xai/grok-4.7` |
| Review participant | GLM 5.3 | `zai/glm-5.3` |

The user clarified that the intended GLM version is 5.3, not 4.3. This is a corrected
selection, not an automatic substitution. `high` is selected and accepted by the
installed offline resolver for all six models; actual provider behavior is untested.

Use Pi's resolved model metadata for context limits, maximum output, and pricing;
do not add duplicate subagent-specific context-window settings. Public Luna docs
list a 1.05M context window, whereas the observed local chat catalog entry lists
272K in the raw chat catalog inspected during research. The subsequent offline
resolver check returned the effective Pi-configured limit of 872K for Luna and
Sol. This confirms why the extension uses resolved Pi metadata, not raw-catalog
values or separate hard-coded limits. No Pi context configuration was changed.

Selection rationale (public sources checked 2026-10-11): both models' base Standard
rates are $0.10 input / $0.50 output per million tokens. Haiku's higher-price band
starts above 100K input tokens; Luna's starts above 272K. Artificial Analysis's
`high` comparison reports intelligence scores 38 vs 33 and approximate costs per
index task $0.08 vs $0.03 for Haiku vs Luna. This supports the cost-first selection,
not a claim that Luna performs better on our explorer tasks. No local model
benchmark was run. Sources: [Anthropic pricing/performance](https://www.anthropic.com/claude-haiku-5-5),
[OpenAI Luna specifications](https://developers.openai.com/api/docs/models/gpt-6-luna),
and [Artificial Analysis comparison](https://artificialanalysis.ai/models/releases/comparisons/claude-haiku-5-5-vs-gpt-6-luna).

Explorer policy:

- Missing/empty fallback lists preserve existing single-model behavior.
- A per-call `model` is strict and ignores the explorer fallback list.
- Otherwise use the role model, or inherit the parent's model/thinking level,
  followed by the configured fallback list.
- Skip unresolvable candidates with recorded reasons when fallback is enabled.
- Use the existing resolver/thinking suffix rules independently per candidate.
  Deduplicate provider/model/effective-thinking combinations without creating cycles.

Review policy:

- The selected roster contains four members, fitting the existing `MAX_TASKS = 4`.
  Do not change concurrency limits or inherit the parent's model for missing slots.
- Missing/malformed roster configuration is a configuration error before execution.
  Validate array shape, four entries, and trimmed nonempty model specifications.
- Reject duplicate resolved provider/model identities before launching reviews;
  different thinking settings must not create duplicate-model participants.
- A valid but unresolvable roster specification is a failed slot, not a reason to
  replace it or discard healthy members. Never use another slot as its fallback.
- Retain existing generic manual single-reviewer behavior for compatibility. The
  roster applies to `/review`, not implicitly to every manual reviewer call.

Validate all JSON structure and known keys before launch. Malformed configuration
is not model unavailability. Generic reviewer fallback is not added by this scope.

### 3. Failure provenance and retry ownership

Keep host-managed request retries. Do not add a second extension-level retry or
backoff loop. After host recovery ends with a model error, an explorer may advance
to its next candidate; a review participant fails its own slot without replacement.
Authentication/resolution errors need no extension-owned same-model retries.
Existing strict/manual requests retain host retry behavior.

Use explicit failure phases rather than retrying every exception. The table's
advance rules apply only to explorer fallback; review slots never switch models:

| Failure | Treatment |
|---|---|
| Model resolution/unavailability | Advance when fallback is enabled |
| Authentication, usage limit, terminal model request/server/transport error | Advance after applicable host recovery |
| Input/context limit | Stop in the first version; do not assume another model accepts the input |
| Resource loading, binding, tool allowlist, or other local setup failure | Stop; not a model failure |
| Tool error or task-level inability reported in ordinary assistant text | No automatic model switch |
| Empty final answer | Fail without fallback |
| Cancellation | Abort without fallback |
| Output-save failure | Preserve successful output and existing warning behavior |

Recognize model errors through terminal assistant error messages, supported
provider error contracts, or explicit model-resolution evidence. Do not classify
an arbitrary `prompt()` or session-creation exception as model unavailability
solely because it occurred during execution. An ambiguous exception stops with
its actual phase rather than triggering speculative retries. Input/context-limit
errors take precedence over generic assistant-error fallback classification.

Do not modify persistent host retry settings via file-backed setters. If a test
needs deterministic retry budgets, use test-local in-memory settings or fixtures.
Exact provider errors and host retry behavior must be confirmed by offline tests;
private host retry methods are not a production API to import.

### 4. Preparation, attempts, and parallel behavior

Separate one-attempt execution, explorer-chain orchestration, and review-roster
expansion. Retain one logical child/index per explorer task or review slot; dispose
attempt sessions before switching explorer models. Share the existing runtime.

The extension exposes a dedicated, mutually exclusive call form:

```ts
subagent({ review: { task: "<self-contained target, intent, and review criteria>" } })
```

The extension reads `review.models` and creates four strict-model reviewer slots.
It avoids requiring the parent to read hidden configuration, guess IDs, or
correctly assign four models each time.
It remains inside the independently usable extension with public Pi APIs.

`prompts/review.md` invokes this roster form after identifying the target, instead
of the original 2–3 unspecified-model tasks. All four reviewers receive
one complete review brief and the same target/focus. Optional secondary angles
must not make one participant exclusively responsible for essential checks.
Preserve parent evidence verification, synthesis, and the no-edits boundary.

Validate call/configuration structure and preflight before launching any child:

- Preserve whole-call rejection for invalid strict/manual model calls and existing
  legacy no-fallback preflight failures.
- For explorer chains, skip unresolvable candidates with recorded reasons; exhausted
  chains produce failed child results while healthy siblings may run.
- For the dedicated review form, resolve each roster slot independently. Model
  resolution failures produce failed slots while healthy reviewers still launch.
  Runtime authentication/request failures likewise stop only the affected slot.
  Strict means no model replacement, not whole-roster failure.
- Missing/malformed/duplicate roster configuration fails before launch. Shared
  runtime/setup failure may fail the run; do not mislabel it as four provider errors.

Explorer chains and the dedicated review form intentionally extend the old model
preflight contract. Local errors must not be silently skipped as model failures.

Execute chains independently, with at most the existing four logical children
running concurrently. Check the abort signal before/after preparation, between
attempts, and before each next prompt. Cleanup must cover session creation and
binding failures as well as normal prompt completion. Clear stale current-tool
state when an attempt ends, and never restart an aborted child.

Each explorer attempt receives the original task, unchanged role prompt, tools,
cwd, and existing project-context policy. Reviewers each start fresh and receive
one shared logical review's repository/HEAD baseline; do not silently retarget
slots to different HEADs during preparation. Preserve the existing HEAD-moved
report. A baseline is not a filesystem snapshot: working-tree content can change
between reads, and the plan makes no snapshot guarantee.

### 5. Reporting and accounting

Preserve current result fields and add bounded structured attempt metadata:
requested and resolved model, effective thinking when available, failure phase,
status, duration, tool calls, usage/cost, and switching reason. Do not retain raw
provider payloads or credentials. Sanitize diagnostic text before exposing it.

- `model` identifies the successful model, or the last attempted/resolved
  candidate on failure; label unresolved candidates clearly.
- Aggregate wall-clock duration, usage/cost, and tool calls across all attempts.
  Do not hide failed-attempt expense; report available provider usage rather than
  claiming accounting for usage the host does not expose.
- Progress shows actual model changes and concise transition reasons.
- Final text and expanded TUI output explain fallback; result details retain the
  attempt list without flooding the parent context.
- Exhaustion reports an ordered, concise failure summary.
- Save only the successful final answer using existing preview/output handling.
  Failed attempt text must not be returned as a successful final answer.

For review runs, also expose intended roster, requested/actual identities, per-slot
statuses, success/failure counts, missing models and reasons, and coverage
`complete` / `partial` / `none`. Cancellation remains explicit rather than being
hidden by a coverage count. Partial usable results need not set tool `isError`,
but must be visibly incomplete. With zero successful reviewers, report failure
and no merge verdict. Aggregate slot usage/tool costs and measure run wall time
without summing concurrent durations as elapsed time. The parent verifies kept
findings and must not claim four-model agreement from partial coverage.

## Phases

The following implementation phases were approved and executed in the originating
session. Detailed execution remains in the session; verification evidence follows.

### Phase 1: Separate configuration and call policies

- Changes: explorer fallback validation, independent four-member `review.models`,
  dedicated review call form, model-origin tracking, and selection helpers.
- Verify (automated): explorer missing/empty lists, strict overrides, inherited
  primary, thinking/order/deduplication; review missing/malformed roster, duplicate
  model identities across thinking levels, mutually exclusive call forms, and
  legacy manual single-reviewer compatibility.

### Phase 2: Attempt lifecycle and fallback runner

- Changes: separate one-attempt execution, classify failure provenance, orchestrate
  fresh explorer restarts, aggregate accounting, and clean up all attempt exit paths.
- Verify (automated): resolution/authentication/request/usage-limit transitions,
  no history transfer, disposal, exhaustion, cancellation, non-model failures,
  output persistence warnings, and HEAD movement.

### Phase 3: Four-model review orchestration and visibility

- Changes: roster expansion and per-slot preflight, shared review baseline,
  explorer-chain integration, progress/results and coverage, updated `/review`
  prompt, tool help, and README usage examples.
- Verify (automated): four distinct models, one slot each, no parent substitution,
  no priority semantics, one-model preflight/runtime failures with healthy siblings,
  all-failed runs, no replacement duplicates, shared target/fresh context/no edits,
  cancellation, coverage/counts/costs, and legacy strict/manual preflight behavior.

### Phase 4: Offline verification and evidence

- Changes: expand the existing tests using deterministic multi-model faux providers
  or injected attempt fixtures; do not depend on BL-008 or another extension at
  runtime. Record the exact installed package and verification limits here.
- Verify (automated), after resolving a valid installed package root:

```bash
node --test tests/subagent.test.mjs
PI_PACKAGE_DIR="$root" node --test tests/subagent.integration.test.mjs
npm test
PI_PACKAGE_DIR="$root" npm run test:integration
```

- Required matrix: model resolution, authentication, transient failure after host
  recovery, usage limits, mid-run restart using the original task only, strict
  explicit models, exhaustion, thinking/order/deduplication, setup/tool/context/
  empty-answer/output-save exclusions, abort before/during/between attempts,
  disposal, combined usage/tool totals, independent parallel chains, and reviewer
  HEAD movement. Add four-member roster identity checks, absent/duplicate roster
  rejection, partial preflight/runtime failures, all-failed runs, no parent-model
  inheritance/replacement, original target preservation, and complete/partial/none
  reporting. Use deterministic fixtures for generic candidate policies and verify
  the intended Luna-primary / Haiku-fallback configuration separately; no real
  model calls are needed for ordering tests.
- Verify (manual, offline): an isolated faux TUI check using the `tui-check` skill
  can confirm model-transition visibility and cancellation. Use sequential
  scenarios if the existing faux queue cannot support concurrent responses; do
  not expand scope to fix unrelated infrastructure.
- Real provider compatibility, account limits, and actual model quality are not
  established by faux checks. Live model calls require separate approval.

## Risks and open questions

- Host-managed retry budgets may delay fallback. The first version deliberately
  avoids duplicate retry loops; measure timing in offline integration tests.
- Fresh restarts duplicate reads and token costs. Keep aggregate expense visible.
- Backups sharing a provider/account may share the same outage or usage limit.
- A backup may have a smaller context window or different thinking support.
  Preserve resolver warnings and explicit input-limit failure behavior.
- Provider error provenance may be incomplete. Confirm the available public
  evidence during implementation; unsupported ambiguous exceptions must not
  silently become fallback-eligible.
- Reads across retries can observe changed working-tree content. HEAD baseline
  preservation prevents silent retargeting but does not freeze files.
- Four-model review costs more than the old 2–3-reviewer workflow; show all slot
  costs and do not launch extra replacement reviewers. Shared accounts/providers
  can still fail together, leaving limited or no review coverage.
- Explorer priority, `high` thinking, and GLM 5.3 identity are selected. All six
  model IDs are confirmed as local catalog entries, not live-access verification.
  Revalidate effective model metadata and thinking mappings through Pi rather than
  duplicating limits.
- Offline success does not verify live model quality, credentials, rate limits,
  provider-specific thinking behavior, or whether an actual parent follows the
  `/review` prompt. Deterministic faux responses verify mechanics, not model judgment.

## Verification evidence

Implementation and offline verification were performed by the parent Pi coding
assistant in session `01a1299f-d4ab-70ab-a076-0e49632aada5`, without reviewer agents
or real-model calls. Host package: `@earendil-works/pi-coding-agent` 1.1.0, installed
fork release `b1a78306c-openai-fast-20261011-125046`; Node 26.10.0. Integration tests
were pinned with `PI_PACKAGE_DIR` to that installation and used isolated faux
providers, temporary workspaces, and in-memory credentials.

- Focused unit/fixture tests: **85 passed** across `tests/subagent.test.mjs` and
  `tests/subagent-runner.test.mjs`. Covered configuration/call validation, ordered
  fresh restarts, strict overrides, failure provenance, exclusion rules, abort
  before/during/between attempts and setup, disposal, resolution/alias handling,
  sanitization, output-write warnings, failed/retried usage accounting, roster
  identity checks, failed-slot isolation, partial/all-failed coverage, and cancellation.
- Subagent SDK integration: **13 passed**, including the original nine cases and
  four new checks: mid-run fresh fallback and strict override; host retries before
  switching; distinct four-model roster with resolution/runtime failure isolation;
  and a common reviewer baseline when HEAD changes during execution.
- Full workspace regression: `npm test` — **250 passed**; pinned
  `npm run test:integration` — **38 passed**, including the workspace's existing
  isolated TUI lifecycle test. No failures, cancellations, or skipped tests.
- Offline resolution of all six configured `:high` specifications succeeded and
  returned `high`, without authentication or a model request. Effective context
  windows were Luna/Sol 872K, Haiku/Opus/GLM 1M, and Grok 500K; they were observed,
  not overridden by the extension.
- Isolated real TUI, faux mode: `/tmp/bl012-tui/run`, agent-tty 0.5.0, subagent
  extension plus `/review` prompt. The screen showed a missing-primary-to-faux
  explorer transition with its reason, followed by `Review coverage: partial
  (1/4 succeeded, 3 failed, 0 aborted, 0 pending)` and each missing model's reason.
  Parent model-input log calls 2 and 4 contained the fallback reason and partial
  coverage respectively; call 3 contained the expanded `/review` target/instructions.
  This scenario used only one resolvable roster model to avoid the unrelated
  single-queue limitation; four-model concurrency was verified by SDK integration.
  `finish.json` confirmed `piExited: true` and `ttySessionDestroyed: true`.
- New cancellation paths are covered by fixtures/SDK checks, not a dedicated new
  TUI cancellation scenario. No actual provider access or model-quality comparison
  was performed. After the offline implementation work, the user authorized live
  configuration application. The selected example was written to
  `~/.pi/agent/subagent.json` (previously absent) and passed `loadConfig` validation.
  The user subsequently reported `/reload`; no live model invocation was used to
  independently verify post-reload execution.

## Amendments

### 2026-10-11 — Separate exploration fallback from four-model review
- Change: Replaced the generic reviewer-fallback proposal for `/review` with an
  independent Opus 5.5 / Sol 6.1 / Grok 4.7 / GLM 4.3 roster, one reviewer per model,
  partial-results handling, explicit coverage, and extension-owned roster expansion.
  Recorded Haiku 5.5 and Luna 6.0 as unordered explorer candidates.
- Reason: The user reported same-parent-model parallel reviewers and requested
  separate policies, then chose all four review models and partial results on
  failures. Fallback order alone does not establish parallel model diversity.
- Impact: BL-012 now includes `/review` model assignment and preflight isolation;
  failed slots are not replaced. Explorer priority and canonical IDs remain open.
  Documentation revision is approved, not implementation or model execution.
- Evidence: User discussion and question-tool response in pi session
  `01a1299f-d4ab-70ab-a076-0e49632aada5`; `prompts/review.md` and
  `extensions/subagent/extension.ts` confirm the existing inheritance path.

### 2026-10-11 — Select cost-first explorer order and high thinking
- Change: Recorded Luna 6.0 primary, Haiku 5.5 error fallback, and selected `high`
  thinking. Added observed direct-provider IDs, the unresolved GLM 4.3 identity,
  source-backed selection rationale, and Pi-owned context-metadata handling.
- Reason: After public pricing/performance research, the user accepted the
  cost-first explorer recommendation and clarified that context limits should use
  existing Pi model configuration rather than separate subagent settings.
- Impact: Explorer priority and thinking preference are no longer open choices.
  GLM identity and runtime verification remain outstanding; no code, live settings,
  or actual model execution is authorized by this selection.
- Evidence: Public sources linked in configuration/selection, local Pi catalog
  inspected 2026-10-11, and pi session `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Correct the selected GLM version
- Change: Corrected the current review roster from GLM 4.3 to GLM 5.3 and replaced
  its unresolved example with the observed `zai/glm-5.3:high` specification.
- Reason: The user clarified that 5.3 was the intended model version.
- Impact: All six intended model IDs are identified; the GLM clarification is no
  longer a prerequisite. Runtime/provider mapping verification and implementation
  approval remain separate. Earlier amendment entries retain the discussion history.
- Evidence: User correction in pi session `01a1299f-d4ab-70ab-a076-0e49632aada5`
  and the local Pi catalog inspected in the same session.

### 2026-10-11 — Implement and verify the approved follow-up
- Change: Implemented explorer-only fallback lists (maximum eight), strict explicit
  models, fresh attempt lifecycle and provenance, retry-safe usage accounting,
  independent four-model review expansion, coverage reporting, shared HEAD baseline,
  and `/review` guidance. Added the selected project-owned example and tests.
- Reason: The user approved implementation and offline verification after settling
  all model policies. Bounded lists prevent unbounded attempts; assistant message-end
  accounting retains available costs that host retries may remove from transcripts.
- Impact: The documented call/configuration forms are now supported. 250 workspace
  unit/fixture tests and 38 pinned offline integration tests passed; focused
  subagent checks passed 85/13. Faux TUI evidence verifies transition/partial display,
  not actual model judgment. Live settings were not changed and real models were
  not called. Pi's effective context metadata and all selected high specs were
  resolved offline without hard-coded subagent limits.
- Evidence: Verification evidence above; test logs `/tmp/bl012-unit.log` and
  `/tmp/bl012-integration.log`; `/tmp/bl012-tui/run`; pi session
  `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Apply the selected user configuration
- Change: Applied the selected Luna/Haiku explorer configuration and four-model
  high-thinking review roster to `~/.pi/agent/subagent.json`, then validated it.
- Reason: The user explicitly requested configuration application after implementation.
- Impact: Configuration application is complete; the user reported `/reload`.
  Live provider access/quality remains unverified and is not a completion prerequisite
  for the approved implementation/configuration scope.
- Evidence: Successful `loadConfig` validation and the user's reload report in pi
  session `01a1299f-d4ab-70ab-a076-0e49632aada5`.
