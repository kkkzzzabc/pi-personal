---
title: Verification options for personal pi workflows
date: 2026-10-11
session: 01a1291c-0c2f-7706-9e56-bd64ae7009a1
based_on:
  - docs/research/2026-10-11-verification-processes-and-loops.md
  - docs/research/2026-10-11-code-review-in-agent-customization.md
  - docs/research/2026-10-11-pi-subagents.md
  - docs/plans/2026-10-11-subagent-extension.md
  - docs/plans/2026-10-11-tui-check-skill.md
  - docs/spikes/2026-10-11-agent-tty-pi-tui-verification.md
  - docs/spikes/2026-10-11-custom-message-before-first-prompt.md
  - docs/spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md
sources:
  - repo: earendil-works/pi
    path: /Users/kkkzzzabc/.local/share/pi-fork/releases/b1a78306c-openai-fast-20261011-125046/node_modules/@earendil-works/pi-coding-agent
    version: 1.1.0
    commit: unavailable-in-installed-artifact
    artifact: b1a78306c-openai-fast-20261011-125046
  - repo: nicobailon/pi-subagents
    path: .references/pi-packages/nicobailon/pi-subagents
    version: HEAD
    commit: 69673c7fbf3351e54a5b0786a7e9d9fff625a749
---

# Verification options for personal pi workflows

## Scope

Translate the [reference survey](2026-10-11-verification-processes-and-loops.md)
into implementable personal pi options. This is research and recommendation,
not an adopted design, implementation plan, or approval to install a package,
change the fork, run paid models, auto-fix, or block completion.

The rationale is to add trustworthy proof without duplicating the existing
plan-mode, reviewer, and TUI-testing surfaces or importing an entire framework.
Source capability inspection and historical execution observations are separated
below. No runtime or real-model experiment was performed in this session.

## Summary

- Start with one verification skill, explicit acceptance conditions, and three
  profiles: code, pi interactive/resource behavior, and research evidence.
- Use existing project checks and `tui-check`; ask a read-only reviewer to
  investigate only when authorized. Keep execution, interpretation, and review
  separate.
- If reliable structured history is needed, add an explicit verification runner
  and a small evidence ledger. Prefer this to parsing success prose or transcript
  substrings.
- Recommend no verification-result caching for the first runner. Freshness must
  include new/untracked files and runtime state, not just HEAD/tracked diff.
- A host extension can expose tools, persist branch-sensitive state, and request
  bounded continuation before settlement. This does not prove every streamed
  success claim can be suppressed or semantic correctness mechanically enforced.
- Do not begin with automatic reviewers, auto-fix orchestration, or a hard stop
  gate. Establish false-pass, stale-evidence, cancellation, and TUI behavior first.
- Proposed usage names below are illustrative; none of the proposed resources or
  commands has been created.

## Questions

1. What verified source capabilities exist in the installed host and local code?
2. Which integration options fit each verification dimension?
3. What minimal workflow, evidence, freshness, and loop policy should be tried?
4. What must be decided and tested before implementation?

## Findings

### 1. Current host and local capability assessment

#### Installed host provenance

`PI_PACKAGE_DIR` was not set. The executable on PATH was
`~/.local/bin/pi` → `~/.local/share/pi-fork/bin/pi`, whose wrapper executes
`current/node_modules/.bin/pi`. The package root resolved to the pinned release
in frontmatter; package name is `@earendil-works/pi-coding-agent`, version `1.1.0`.
`README.md`, `docs/`, and `examples/` exist. The complete host extension, skill,
prompt-template, and SDK documents were read, along with the relevant exported
boundary declarations and permission/todo examples.

**Version limitation:** the executing session's exact loaded release was not
independently established; PATH/current-symlink resolution alone does not identify
the code an existing process loaded. Recommendations below describe the inspected
installed release, not a proven API
contract for the already-running session or upstream pi. The release directory's
commit-like prefix is not proof of the complete build's source commit; hence the
explicit unavailable commit field.

In citations, `HOST/` means the absolute installed package path in frontmatter.
These hashes pin the important inspected artifacts independently of the mutable
`current` symlink:

| Artifact under HOST | SHA-256 |
|---|---|
| `package.json` | `0d7cba980eead336b8fc4feafb4f899f085e9bbdc04320b3eb79aec27f18f36e` |
| `docs/extensions.md` | `bd2ed1f728173c1defc035e90c3894c308ae153fa08575c12b4a9988e11f8108` |
| `docs/skills.md` | `5b9805525b194474ef1fe5455a0917ef15ed7f710aa9bec2eee11879556469e5` |
| `docs/prompt-templates.md` | `ad5113cce0d05ef0ac77b3c71f9ebe41ea68c072275f9273b9616e4924feda42` |
| `docs/sdk.md` | `d9034ccbf2219a58712d8dd4fcdf47e687d77131e71dd5d119d8a71e9bd2a2e8` |
| `dist/core/extensions/types.d.ts` | `61fae1c4347b04a0a486589f96fba1ca9676a89ae0a02e639c677e1f1e061298` |

#### Source-confirmed host surfaces

| Surface | Observed contract | Appropriate use / limit |
|---|---|---|
| Skill | Instructions and supporting scripts, loaded on demand; model can fail to load it | Verification procedure; explicit `/skill:name` invocation when needed. Not an enforcement boundary |
| Prompt template | Markdown expands into agent input | Short repeatable verification request. Does not collect execution evidence by itself |
| Custom tool / command | `registerTool` / `registerCommand` | Host-owned checker runner and inspectable results; commands need not be model-driven |
| Tool events | `tool_call` can block/mutate; `tool_result` composes | Execution-policy checks and recording; sibling calls can run concurrently |
| Boundary events | `turn_end` / `agent_before_settle` can append entries and request one continuation | Bounded missing-evidence reminder or follow-up; avoid unconditional continuation |
| Settlement | `agent_settled` is final, notification-only; `agent_end` may precede recovery/queued work | Final observation, not the place to request repair |
| Persistence | Tool `details`, `appendEntry`, `getBranch` | Evidence metadata that restores on the active branch, not abandoned histories |
| SDK | `createAgentSession`, explicit resource/tool controls, dispose | Existing fresh read-only reviewer; no need to create a new orchestration framework |

Sources: `HOST/docs/skills.md:3-7`, `HOST/docs/skills.md:41-53`,
`HOST/docs/prompt-templates.md:1-5`, `HOST/docs/prompt-templates.md:30-36`,
`HOST/docs/extensions.md:60-89`, `HOST/docs/extensions.md:95-125`,
`HOST/docs/extensions.md:222-235`, `HOST/docs/sdk.md:30-58`,
`HOST/docs/sdk.md:93-117`, `HOST/dist/core/extensions/types.d.ts:754-782`.

Custom tools support output schemas and structured content; errors can carry
structured data through `isError: true`. Nested tool execution has event and
usage contracts but does not automatically add nested result entries to the
model transcript. The proposed runner should explicitly report its own receipt.
Source: `HOST/docs/extensions.md:132-148`.

The installed Bash declarations separate text/details from a structured output
schema including `exit_code`; `BashToolDetails` alone only supplies truncation and
full-output location. Do not infer a universal `details.exitCode` property or
parse a human-facing phrase as the only authoritative exit status. Choose and
verify the runner's exact execution interface in implementation.
Source: `HOST/dist/core/tools/bash.d.ts:13-51`.

#### Current pi-personal surfaces

| Resource | Source-confirmed capability | Verification implication |
|---|---|---|
| `extensions/subagent/` | Foreground fresh-context reviewer/explorer; fixed read-only tools, no shell/edit/write/delegation; reviewer includes `review_diff` | Reviewer can inspect evidence and suggest tests, but parent/runner must execute checks |
| Reviewer invocation | Prompt guideline requires user or applicable instruction to ask for review; parent re-reads relied-on file/line claims | Task risk alone does not authorize automatic review |
| `review_diff` | Current staged/unstaged diff against launch HEAD; lists untracked paths; detects moved HEAD; no Git reports unavailable | Not an immutable reviewed snapshot or evidence ledger; non-Git work needs explicit files |
| `extensions/plan-mode/` | Plan-file write guard, persisted approval state, prompt-delivered notes | Approval boundaries exist; plan mode is not proof that arbitrary shell checks are side-effect-free |
| `skills/tui-check/` | Isolated faux TUI, explicit resources, observer, retained run artifacts; separately approved real-model mode | Reuse for interactive and prompt-delivery proof; faux mode does not establish model judgment or provider behavior |
| Project test scripts | `npm test` and `npm run test:integration` identify local checks | Discover/read actual current scripts before use; no test pass is claimed in this source-only research |

Sources: `extensions/subagent/agents.ts:12-35`,
`extensions/subagent/extension.ts:18-33`,
`extensions/subagent/agents/reviewer.md:14-30`,
`extensions/subagent/review-diff.ts:21-44`,
`extensions/subagent/review-diff.ts:76-97`,
`extensions/plan-mode/index.ts:291-317`,
`skills/tui-check/SKILL.md:29-51`,
`skills/tui-check/SKILL.md:55-82`, `package.json:7-11`.

At the re-read during concurrent local development, reviewer context policy used
parent context files minus the global agent-dir file; explorer policy used no
context files. Tool allowlists still excluded command execution. The original
subagent plan describes more phases than the entry implementation initially
exposed; do not infer completed parallel/background/acceptance functionality
from the plan. Re-read actual code before extending it.
Sources: `extensions/subagent/agents.ts:14-30`,
`extensions/subagent/runner.ts:209-228`.

**Evidence limitation:** this session observed other local work adding subagent
tests and changing subagent source while research was in progress. The reference
manifest also gained four entries after the approved 27-repository inventory;
those are listed as unresearched follow-up scope in the comparison report.
Local source observations are time-scoped, not a clean immutable release. This research task
did not edit those files or certify that concurrent implementation.

The current reviewer prompt explicitly says it cannot run commands, and a
successful child return merely indicates it produced a final answer without the
runner's failure conditions. Neither the header's `completed` status nor its
merge verdict is host-owned behavioral proof. A separate verification receipt
must not inherit success from that label.
Sources: `extensions/subagent/agents/reviewer.md:14-30`,
`extensions/subagent/runner.ts:278-304`.

#### Historical observations, not re-executed here

- The earlier [TUI spike](../spikes/2026-10-11-agent-tty-pi-tui-verification.md)
  exercised plan-mode Phase 1 using isolated directories and a faux model. Its
  follow-up points to the reusable current skill. It is not evidence of today's
  host build or a new verification extension working.
- The [message-order spike](../spikes/2026-10-11-custom-message-before-first-prompt.md)
  shows why prompt delivery must be checked on every model call, not only the
  first. Current observer logging is source-confirmed in
  `skills/tui-check/scripts/observer.ts:16-31`; observers still depend on ordering
  relative to later context transformations.
- The [Claude follow-up](../spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md)
  succeeded on a specifically identified earlier fork build and model. It
  establishes tested execution conditions, not review-quality superiority or
  universal provider compatibility.

### 2. Integration options and trade-offs

All rows are options, not decisions. Reference rationale comes from the
corresponding sections of the [survey](2026-10-11-verification-processes-and-loops.md).

| Option | Covers | Benefits | Costs / limits | Proposed verification |
|---|---|---|---|---|---|
| A. Verification skill | C/L/A/R procedures | Small, portable; direct use of existing tools and TUI recipe | Model may omit it or misstate evidence; instructions do not enforce results | Discovery test, faux prompt delivery, worked fixtures for all profiles |
| B. Prompt shortcut | Explicit invocation of A or a compact checklist | Convenient recurring request | No independent execution guarantee; names may collide with commands | Expansion/arguments test and command-collision check |
| C. Explicit runner + ledger | Host execution evidence, freshness, result inspection | Structured receipts; deterministic failure/status behavior; reusable outside model prose | Storage/privacy, subprocess cleanup, command authorization, snapshot scope | Unit fixtures + host integration + isolated TUI + abort/reload/branch cases |
| D. Settlement reminder / acceptance gate | Missing evidence before automatic settlement | Can make an opted-in workflow harder to silently skip | Extra model turns, loop hazards, streamed claims already visible, semantics still uncertain | Dedicated bounded-continuation spike before production implementation |
| E. Existing reviewer as optional verifier | Requirement/doc/research/finding inspection | Fresh context, fixed read-only tools, optional model selection | Cannot execute checks; correlation/noise/cost; needs authorization and parent triage | Planted findings and clean controls; source-citation checking; separate execution checks |
| F. Adopt full pi-subagents acceptance | Writer/report/command/review orchestration | Existing rich acceptance mechanism | Wider lifecycle and policy footprint, integration overlap, tracked-only cache limits | Separate compatibility/evidence-freshness spike; not approved for install |

Recommended sequence: **A first; C when structured receipts become useful; E only
on request or a separately approved policy; D only after a spike.** B is optional
convenience. F is not the default recommendation for this repository's narrower
foreground reviewer design.

Why: the reference survey shows useful small procedures (superpowers completion,
pstack real-app recipes, GSD goal-backward checks, BMAD claim verification), while
host-owned evidence solves a different trust problem (Aider execution,
gstack recorder, pi-subagents acceptance). Importing all orchestration is not
required to obtain those benefits. This is a design recommendation, not evidence
that these options have already been built or evaluated together.

### 3. Recommended minimal workflow

Proposed resource name: `verification` (illustrative, not installed).
One skill with a small set of supporting references can select the profile;
it need not create four independent discoverable skills immediately.

```text
user goal + approved scope
  → observable acceptance conditions + relevant input snapshot
  → choose code / pi-interactive / research profile
  → preflight authority, isolation, prerequisites, exact checks
  → execute or inspect primary evidence
  → compare actual with expected; record gaps
  → authorized fix? diagnose → bounded repair → invalidate old evidence → re-check
  → optional authorized fresh reviewer → parent triage
  → completion report tied to conditions, evidence, and remaining limitations
```

#### Profiles

| Profile | Minimum evidence strategy | Not sufficient |
|---|---|---|
| Code | Repository-native targeted checks plus appropriate regression/suite/build/static checks; original symptom or user scenario; explicit requirement mapping | "Edited successfully", imports compile, linter alone, or one green weak test |
| Pi interactive/resource | Logic tests where applicable plus isolated TUI actions, resulting screen/state, prompt/tools on relevant calls, and cleanup receipt | Source keywords, stdout-only smoke, matching echoed input, or faux evidence of real-model reasoning |
| Research | Pinned actual consulted sources, checked load-bearing claims and citations, fact/inference distinction, contradictions and coverage gaps | Search snippets, source-count target, plausible model memory, or two copies of one underlying source |

Recommended requirement mapping is lightweight, not a new spec-management
framework. For a small task, a few explicit conditions in the response suffice.
A larger task can reuse the approved plan's existing criteria and stable IDs.
Do not invent requirements merely because a generic profile includes a check.

#### Evidence fields for a later runner

Proposed schema concept, not a TypeScript/API contract:

| Field | Why it is needed |
|---|---|
| `id`, task/criterion reference, profile | Identify which claim the evidence supports |
| target/cwd/scope; snapshot before and after | Bind observations to actual deliverable and detect changes during a check |
| expected behavior and source of expectation | Interpret results against an external contract, not implementation output |
| producer: host command / source inspection / human / model review | Prevent self-attestation from being presented as execution proof |
| exact argv or command, timeout, environment names, runtime/tool version | Reproducibility without saving secrets |
| start/end, exit code or signal, stdout/stderr artifact paths | Accurate execution outcome, including partial/timeout evidence |
| observed state and checked side effects | Success message or 2xx alone is not final effect |
| outcome, reason, limitations, affected inputs | Honest coverage and evidence strength |
| supersedes / invalidated-by | Avoid retaining an obsolete green result as current proof |
| cleanup result and artifact retention | Report owned-process/fixture leaks separately from behavioral success |
| session/run/branch provenance | Reconstruct correct active-branch history after resume/navigation |

The host supplies execution metadata; the model may interpret a result but must
not create a fictitious receipt. Source-reading and human observations remain
separate evidence kinds even when they support the same criterion.

#### Status and completion semantics

Proposed check outcomes:

- **passed:** the applicable check completed and its declared expectation held.
- **failed:** the check observed a contradiction or configured failure outcome.
- **blocked:** prerequisites, permissions, environment, or safe execution prevent
  the check. Include the unblock action.
- **skipped:** an applicable check was deliberately not run under the selected
  scope/budget/authorization. Include the reason; it is not green.
- **unverified:** a claim remains without adequate evidence or observation is
  inconclusive. Use for missing/ambiguous/stale evidence rather than inventing a
  pass.
- **not applicable:** the contract/check does not apply; justify it separately
  from skipped coverage.

Keep **execution outcome** separate from **criterion satisfaction** and **review
verdict**. A negative test can pass by observing the expected rejection. A process
with exit zero can still fail a behavioral expectation. A user's accepted risk or
waiver should be recorded as accepted risk, not changed into `passed`.

Recommend completion descriptions such as `verified within stated scope`,
`implemented with named verification gaps`, or `blocked`, with no global
"everything works" claim. Missing optional review does not invalidate an
otherwise verified task unless the approved policy requires that review.

#### Freshness and snapshots

For the first runner, recommend fresh runs rather than cached verdicts:

1. Include changed, untracked/new, and relevant ignored inputs in a content
   fingerprint or explicitly declared input list. A Git HEAD alone is not enough.
2. In non-Git work, use relevant file/content hashes and runtime identity. This
   project currently has no `.git`, so Git-only verification cannot be its base.
3. Capture before and after a check. If relevant inputs change during execution,
   label the evidence stale/inconclusive rather than current proof.
4. Re-run affected checks after source, tests, prompts, fixtures, commands,
   configuration, or external-state changes. When affectedness is uncertain,
   treat the check as affected.
5. A resumed/branched session can restore evidence metadata, but must revalidate
   freshness against actual workspace/runtime state before using it.
6. Do not assume content hashes freeze services, databases, time, credentials,
   network, or toolchain state. Stateful checks need isolated fixtures and
   explicit freshness limits.

Basis: gstack's current-input revalidation and the survey's pi-subagents cache
limitation. The latter's code hashes tracked changes and intentionally reuses
results across untracked additions:
`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1222-1244`,
`.references/pi-packages/nicobailon/pi-subagents/test/unit/acceptance.test.ts:1360-1388`.

#### Repair budget and authority

Proposed default to discuss: at most **two repair attempts per failing check**,
then reconsider the shared assumption and report a blocker/residual. This is a
personal workflow recommendation motivated by Compound's two-fix diagnosis,
Aider's cap, and mattpocock's convergence warning; it is not a universal threshold
proven by the references.

Each attempt needs a changed causal hypothesis or new observation, not just
re-running the same model review. Stop earlier for unclear intent, unapproved
scope, inaccessible prerequisites, unrelated edits, or rising blast radius.
Reproducing a failure can be worthwhile without repairing it during a research
or review-only task. Default report-only outside an approved implementation task.

A verification purpose does not authorize installing tools, mutating production,
sending external data, deleting user files, or running costly models. Test/build
commands can execute arbitrary project scripts and alter caches/files; a
`readOnlyHint` is not a sandbox. Mutation experiments need an owned copy and
restoration; browser/desktop driving needs its own approved target and state.
Do not weaken tests or auto-revert unrelated user changes to obtain green.

### 4. Feasibility boundary: what an extension can and cannot guarantee

The inspected public host API supports an explicit runner/ledger and bounded
continuation reminder without an evident need for fork changes. This is a
source-based feasibility inference, to be confirmed on the exact host build.

For an optional completion reminder, `agent_before_settle` is more appropriate
than notification-only `agent_settled`. The exported result accepts entries and
`continue`; it is not a generic `block completion` result. A bounded handler can
ask the model for missing checks or a truthful gap report, but should not retry
when aborted or `canContinue` is false. Confirm actual behavior in a spike.
Sources: `HOST/docs/extensions.md:60-68`, `HOST/docs/extensions.md:113-125`,
`HOST/dist/core/extensions/types.d.ts:754-782`.

Important limits:

- A reminder runs after earlier assistant output; it does not retroactively
  retract a streamed success assertion. Replacing a finalized message via an
  event is not demonstrated to erase already displayed or externally consumed
  text. Do not promise a universal "no unverified success text" gate.
- Arbitrary natural-language task satisfaction cannot be derived from a command
  exit alone. Deterministic gates need declared predicates; ambiguous criteria
  require source/human judgment or explicitly limited model interpretation.
- Event ordering, sibling concurrency, nested calls, recovery, and queued work
  can invalidate a naive "last tool result = done" implementation.
- Stronger terminal/UI/provider-level suppression could require a different
  lifecycle design or fork work. No need for such a change is established here.

Sources for the relevant event/message contracts:
`HOST/docs/extensions.md:95-125`, `HOST/docs/extensions.md:132-148`.

Persistence can follow the installed todo example and documented active-branch
reconstruction, but evidence also needs workspace freshness. A restored passing
entry from another branch must not override current changed files.
Sources: `HOST/docs/extensions.md:222-235`, `HOST/examples/extensions/todo.ts:117-145`.

### 5. Illustrative use cases

These examples describe requests and acceptance reports, not available new
slash commands.

#### A code bug fix

Request: fix a named symptom within approved files and verify it.

1. Read the actual failure path and existing test commands.
2. Identify or add the smallest regression; observe the intended failure rather
   than a missing-service/import error.
3. Apply the authorized fix; run regression, relevant broader checks, and the
   original scenario where needed.
4. Tie results to requirements and the final input snapshot. State other failures
   by name rather than hiding them as unrelated.
5. Ask a read-only reviewer only if review is requested/authorized; investigate
   each allegation in the parent. Do not treat `OK` as executing the tests.

Illustrative report: "Original symptom and regression passed on snapshot X;
project suite passed; live third-party flow blocked by missing test credentials.
Implementation is complete, but that flow remains unverified."

#### A pi resource or extension change

Request: verify a shortcut, dialog, prompt reminder, and restore behavior.

1. Run the appropriate logic/host integration tests, if available.
2. Use `tui-check` faux mode with explicitly loaded resources and safe tools.
3. Drive each user entry point, inspect resulting screen/files/session entries,
   and assert what the model received on every relevant call.
4. Verify abort, restore, and branch behavior when they are part of the change.
5. Call the finish helper and inspect `finish.json`, retained evidence, and any
   leftovers. Use real mode only for an approved model-behavior question.

Current source supports these observations and cleanup:
`skills/tui-check/scripts/start.mjs:83-98`,
`skills/tui-check/scripts/observer.ts:16-31`,
`skills/tui-check/scripts/finish.mjs:63-93`,
`tests/tui-check.integration.test.mjs:35-97`.
These tests were inspected, not executed in this research session.

#### A research conclusion

Request: compare a mechanism in local references and propose a pi option.

1. Pin the actual source snapshots and scope the mechanism.
2. Record the few claims on which the recommendation rests. Read the code or
   authoritative text and verify each cited range supports the specific claim.
3. Inspect contradictory implementation/tests/documentation where available.
4. Corroborate empirical effectiveness claims independently or leave them
   unverified; do not elevate adoption/README claims into measured efficacy.
5. Write facts, inferences, recommendation, limitations, and unresolved choices
   separately. No implementation happens just because an option is recommended.

Illustrative conclusion: "The host implements command-based acceptance at the
pinned commit. Checked evidence is partly child-declared; tracked-only caching
excludes new-file inputs. It is a useful design reference, not proof of superior
verification quality."

### 6. Follow-up verification before implementing the options

| Proposed spike/test | What it must establish | Approval / limits |
|---|---|---|
| Skill discovery and profile routing | Skill loads; all profiles convey criteria/evidence/gaps; no phantom commands | Offline isolated setup; implement only after design approval |
| Checker runner fixtures | Nonzero, expected rejection, timeout, abort, malformed output, truncated output, secret-safe artifacts | Owned synthetic commands, no external services |
| Freshness controls | New/untracked/ignored input changes, non-Git directory, edits during check, resumed and branched sessions | Isolated fixtures; no Git-only assumptions |
| Evidence restoration | Active branch restored; abandoned history excluded; stale passes not accepted | Faux SDK/host session with deterministic receipts |
| Bounded continuation | One continuation when appropriate, budget exhausted, no loop after blocked/aborted run, queued work, reload | Separate spike; no assertion of hard semantic completion blocking |
| Pi TUI behavior | Commands/dialogs/status/restore and every relevant model input, cleanup and evidence retention | Existing tui-check faux mode; model tools still run for real |
| Reviewer quality | Planted real defects, clean controls, irrelevant allegations, missing citations, conflicting verdicts | Real-model cost/delegation requires separate approval; do not benchmark using one cherry-picked diff |
| Research quality | Missing/stale citation, copied-source false corroboration, contradiction, unsupported efficacy and intent | Local synthetic records first; web access only in approved scope |

No production change is necessary to conduct the present source research.
Implementation tests should be selected after the user chooses the option and
policy; a passing unchanged-code suite would not validate a new proposed feature.

## Open questions

Substantive choices not selected or approved:

1. **First deliverable:** skill-only (A), or skill plus explicit runner/ledger (A+C)?
2. **Invocation:** manual default, task-triggered guidance, or an opted-in required
   verification profile for implementation tasks?
3. **Completion gaps:** advisory report, required human acceptance, or enforced
   deterministic gates on named criteria?
4. **Repair:** report-only outside implementation; is two attempts a suitable
   limit, and which corrections may happen automatically within scope?
5. **Review:** on request only, or a durable approved risk-based policy? Which
   models/budgets and when, if ever, cross-model checks?
6. **Evidence:** session-local metadata plus scratch artifacts, project-local
   durable artifacts, or both? Retention/redaction policy and input fingerprint
   scope remain open.
7. **Research depth:** primary-source proof by default; which load-bearing
   empirical claims require independent corroboration or an adversarial pass?
8. **Host support:** target this inspected fork build only, or broader upstream/
   version compatibility? A source-reading result is not a compatibility test.

**Recommended next decision:** start with A, using existing checks and tui-check,
then evaluate whether structured execution receipts justify C. This remains a
proposal. Automatic fixing, hard completion blocking, paid reviewers, adopting
pi-subagents, and core/fork changes are not approved by this research.

## References

- [Reference verification survey](2026-10-11-verification-processes-and-loops.md)
  contains pinned external mechanisms and the comparative rationale.
- Installed host sources are pinned by release path and hashes above; HOST
  citations refer only to that artifact.
- Local code and related historical records are cited where used. Their tests
  and experiments were not rerun for this document.

Research verification completed: the two frontmatters parsed; 170 citation
paths/ranges, document links, approval-time 27-source/matrix coverage, and pinned
reference commits/worktree states passed structural checks after corrections.
The inspected host artifact hashes remained unchanged. Important claims were
re-read against their sources; this is not runtime verification of the proposed
integration. No npm suite, TUI scenario, or real-model benchmark was run.

This task authored only the two research reports. Directory fingerprints show
skills, prompts, themes, scripts, and native files unchanged from the initial
inventory. Subagent source/tests and the manifest changed during concurrent local
work, so the whole workspace cannot be reported as unchanged; those changes were
not authored or verified by this task.
