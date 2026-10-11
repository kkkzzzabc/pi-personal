---
title: Verification processes and loops across coding-agent references
date: 2026-10-11
session: 01a1291c-0c2f-7706-9e56-bd64ae7009a1
based_on:
  - docs/research/2026-10-11-code-review-in-agent-customization.md
  - docs/research/2026-10-11-pi-subagents.md
sources:
  - repo: Aider-AI/aider
    path: .references/harnesses/Aider-AI/aider
    version: HEAD
    commit: 5dc9490bb35f9729ef2c95d00a19ccd30c26339c
  - repo: anthropics/claude-code
    path: .references/harnesses/anthropics/claude-code
    version: v2.1.296
    commit: 2301018b1f61073c501a8e7a4813ef48c239163b
  - repo: openai/codex
    path: .references/harnesses/openai/codex
    version: HEAD
    commit: 806d9732c974bc8a51b8317c1bd8985544fe627c
  - repo: charmbracelet/crush
    path: .references/harnesses/charmbracelet/crush
    version: HEAD
    commit: df5b024a929d2eb88b308d0288d97130a90e0c15
  - repo: google-gemini/gemini-cli
    path: .references/harnesses/google-gemini/gemini-cli
    version: HEAD
    commit: 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83
  - repo: aaif-goose/goose
    path: .references/harnesses/aaif-goose/goose
    version: HEAD
    commit: 3bd852002903e016ff30947e973f76e2fcfcf90f
  - repo: MoonshotAI/kimi-code
    path: .references/harnesses/MoonshotAI/kimi-code
    version: HEAD
    commit: c9f01f07388abc2cdca40c9c5267f58c65086710
  - repo: mistralai/mistral-vibe
    path: .references/harnesses/mistralai/mistral-vibe
    version: v2.26.1
    commit: 4ae5c5955da8e761318916bdb1a7f46f0b50c7d0
  - repo: anomalyco/opencode
    path: .references/harnesses/anomalyco/opencode
    version: github-v1.2.26
    commit: 5caf1f9f6f5f30e13fc50a788ad953d97ae3748f
  - repo: QwenLM/qwen-code
    path: .references/harnesses/QwenLM/qwen-code
    version: HEAD
    commit: a238b91e7c6fc2b0e36e23436b0e4ced5296617b
  - repo: garrytan/gstack
    path: .references/customizations/garrytan/gstack
    version: HEAD
    commit: 20eb6202fa8ea83a882e7c0463b722cd8a31af1e
  - repo: cursor/plugins
    path: .references/customizations/cursor/plugins
    version: HEAD
    commit: d73344bee8cf22e53b9d5f4cf5749d38ba38c174
  - repo: obra/superpowers
    path: .references/customizations/obra/superpowers
    version: v7.0.0
    commit: bb92a77741419a4ab5f06e711a283343f1ada0c3
  - repo: addyosmani/agent-skills
    path: .references/customizations/addyosmani/agent-skills
    version: HEAD
    commit: 1be8e34187e34647bb83adc3a1323b26ae6f6abe
  - repo: affaan-m/ECC
    path: .references/customizations/affaan-m/ECC
    version: HEAD
    commit: 4eb71d92a39cab44ad40ac9d8a6a5ccb4029d6c2
  - repo: EveryInc/compound-engineering-plugin
    path: .references/customizations/EveryInc/compound-engineering-plugin
    version: HEAD
    commit: 51aa537383744736eb8ad30468d34420e9fb8ea8
  - repo: SuperClaude-Org/SuperClaude_Framework
    path: .references/customizations/SuperClaude-Org/SuperClaude_Framework
    version: HEAD
    commit: fe68862c8ed9e2afb8120c2d9e27d0c3a7ce73a2
  - repo: github/spec-kit
    path: .references/customizations/github/spec-kit
    version: HEAD
    commit: 0443760542e7e5269724744a2ac55c4bd386d095
  - repo: Fission-AI/OpenSpec
    path: .references/customizations/Fission-AI/OpenSpec
    version: HEAD
    commit: 9111a7654d7800391459431fff4eaf66e33a3d2e
  - repo: gsd-build/get-shit-done
    path: .references/customizations/gsd-build/get-shit-done
    version: HEAD
    commit: bdcaab2c752d9a33a1a1ca9acf3a3c81fb991815
  - repo: bmad-code-org/BMAD-METHOD
    path: .references/customizations/bmad-code-org/BMAD-METHOD
    version: HEAD
    commit: bda3c5929f672019b90f39a3ea27259d35d00974
  - repo: eyaltoledano/claude-task-master
    path: .references/customizations/eyaltoledano/claude-task-master
    version: HEAD
    commit: c0c98d367c55296bfe69e65680625b6db437af02
  - repo: mattpocock/skills
    path: .references/customizations/mattpocock/skills
    version: HEAD
    commit: 49dd158d1076134a641b33efb035946536778336
  - repo: anthropics/skills
    path: .references/customizations/anthropics/skills
    version: HEAD
    commit: dbd4588f9e1033efb41dad4bef2f7947c8993d44
  - repo: wshobson/agents
    path: .references/customizations/wshobson/agents
    version: HEAD
    commit: 46891e7e60da0e52baf1050b7b6391b64e84c6d9
  - repo: anthropics/claude-plugins-official
    path: .references/customizations/anthropics/claude-plugins-official
    version: HEAD
    commit: b8e53f1c05dff3b6d751297f6527990ffc81c2f4
  - repo: nicobailon/pi-subagents
    path: .references/pi-packages/nicobailon/pi-subagents
    version: HEAD
    commit: 69673c7fbf3351e54a5b0786a7e9d9fff625a749
---

# Verification processes and loops across coding-agent references

## Scope

Input for implementing and using verification in personal pi workflows. Covers
the 27 locally available entries in `references.json` at approval across code
checks, agent repair loops, requirements/completion checks, and research evidence
checks. During concurrent work the manifest grew to 31 entries. The four added
entries (`edlsh/pi-ask-user`, `FadhelHaidar/pi-ask-user`,
`jayshah5696/pi-agent-extensions`, `mrclrchtr/supi`) are not surveyed here;
including them would be follow-up scope, not a missing original row.
This is a source-reading survey with representative deep dives, not a runtime
benchmark, exhaustive audit, or ranking of agents by reliability.

All reference worktrees were clean at inventory. `cursor/plugins` is a sparse
checkout of `pstack`; other Cursor plugins are outside coverage. `HEAD` in the
version field means no exact local tag was available; it is not a released
version assertion. Commits identify the inspected snapshots. No repositories
were fetched, installed, changed, or executed, and no reviewers or real models
were launched. Existing review research supplied navigation; important claims
below were re-read in the pinned sources.

Harness prompt behavior is model/configuration-dependent. Inspecting one prompt
or bundled plugin does not establish a universal default for that harness.
A project's own release-risk recipe or CI is not evidence that its agent runs
verification on every user's deliverable. Limited rows are deliberately retained
rather than upgraded into unsupported feature claims.

## Summary

- Verification has distinct targets: command results, real user behavior,
  requirement satisfaction, reviewer allegations, and research claims.
- A strong instruction is not an enforced gate. Aider has an executable
  lint/test reflection path; superpowers' completion rule is prompt guidance;
  pi-subagents runs host verification commands and records acceptance status.
- Green checks do not prove test sensitivity or complete requirements. Red-green
  regressions, selective mutation tests, and requirement-to-evidence mapping
  answer different questions.
- The most reusable user-facing pattern is pstack's launch/doctor/drive/evidence/
  cleanup recipe and feature map, paired with gstack's original-probe replay,
  durable-state checks, evidence preservation, and bounded repair.
- Completion needs explicit gaps: OpenSpec separates not applicable from not
  verified; GSD separates passed, gaps found, and human verification needed.
- Reviewer output should be investigated, not accepted by vote or confidence
  score alone. Some reference procedures deliberately trust selected layers.
- Research verification benefits from primary sources, independent provenance,
  per-claim status, contrary evidence, and budgets, not a source-count quota.
- Recommended pi integration options and remaining design choices are in
  [Verification options for pi](2026-10-11-verification-options-for-pi.md).

## Questions

1. What do all local references expose in the four verification dimensions?
2. Which procedures and loops are actually implemented, versus instructed?
3. How are requirements, completion, and research claims verified?
4. What conflicts, failure modes, and transferable principles matter for pi?

## Findings

### 1. Coverage and evidence vocabulary

The following vocabulary is this survey's analytical convention, not a shared
schema adopted by the references:

- **C:** code checks and test adequacy.
- **L:** failure diagnosis, repair, re-check, and stopping.
- **A:** acceptance, requirements, and completion evidence.
- **R:** research/source/claim verification.
- **P:** a relevant prompt, skill, command, or agent procedure was read.
- **E:** relevant executable code was also traced; only the described mechanism
  is confirmed by source, not its efficacy or universal activation.
- **Limited:** selected material has only partial/generic coverage.
- **—:** no dedicated procedure established in the inspected entry material;
  not a repository-wide or product-wide absence claim.

Each row's evidence ID resolves to specific entry files in the catalogue below.
No dimension score represents measured quality.

| Reference | C | L | A | R | Observed mechanism / inspection boundary | Evidence |
|---|---|---|---|---|---|---|
| Aider-AI/aider | E | E | Limited | — | Optional auto lint/test; failure output becomes reflection; capped retries. No full requirement ledger examined | H1 |
| anthropics/claude-code | E, plugin | Limited | E, plugin | — | Bundled hookify stop-rule example and evaluator; this is plugin evidence, not private core behavior | H2 |
| openai/codex | P | Limited | P | — | GPT-5.2 prompt validation policy; selected Codex-specific prompt differs. No general completion gate traced | H3 |
| charmbracelet/crush | P | P | P | Limited | Coder prompt: test after edits, verify original query, root-cause diagnosis; references are code-location guidance, not research validation | H4 |
| google-gemini/gemini-cli | P | P | P | Limited | Research/strategy/execution with plan-act-validate; re-evaluate after repeated fixes | H5 |
| aaif-goose/goose | Limited | — | Limited | — | Base system prompt delegates instructions to extensions; separate Goose release-risk recipe suggests tests, does not run them | H6 |
| MoonshotAI/kimi-code | P | P | P | — | Build/tests and original scenario on actual deliverable; report blockers and re-check explicit request | H7 |
| mistralai/mistral-vibe | P | P | P | — | Tests plus runtime and acceptance criterion; repeated-failure diagnosis and honest unverified reporting | H8 |
| anomalyco/opencode | Limited | Limited | Limited | — | Selected GPT and Anthropic prompt files; do not establish a dedicated verifier. Other model prompts/runtime were not deep-audited | H9 |
| QwenLM/qwen-code | P | P | P | Limited | Discover project checks, diagnose before retry, report failed/unrun checks faithfully | H10 |
| garrytan/gstack | E/P | E/P | E/P | Limited | QA contracts, original-probe replay, regression before repair, evidence capture and freshness, bounded fixes | C1 |
| cursor/plugins (pstack only) | P | P | P | P | Project-local real-app verification skill + feature-map maintenance; epistemic calibration for historical research | C2 |
| obra/superpowers | P | P | P | — | Fresh proof before completion; red-green-refactor; bounded implement/review/fix process | C3 |
| addyosmani/agent-skills | P | P | P | — | Prove-It regressions, browser verification, tests-first review and selective mutation experiment | C4 |
| affaan-m/ECC | P | P | P | P | Six-phase verification report; multi-source research, explicit unverified single-source claims | C5 |
| EveryInc/compound-engineering-plugin | P | P | P | P | Evidence strategy before edits; controller verification; reviewer validator; route coverage and research gap-filling | C6 |
| SuperClaude-Org/SuperClaude_Framework | P | P | P | P | Four self-check questions; adaptive research quality monitoring; confidence thresholds are instructed, not calibrated measurements | C7 |
| github/spec-kit | Limited | P | P | Limited | Read-only spec/plan/tasks analysis and coverage; not executable proof that the feature works | C8 |
| Fission-AI/OpenSpec | P | P | P | — | Advisory completeness/correctness/coherence verification; missing evidence and inapplicable checks differ | C9 |
| gsd-build/get-shit-done | E/P | P | E/P | P | Goal-backward verifier, structural helpers, data-flow inspection, probes, human UAT, gap planning, provenance tags | C10 |
| bmad-code-org/BMAD-METHOD | P | P | P | E/P | Reviewer claim triage; per-claim research verification and contrary evidence; helper tallies declared statuses | C11 |
| eyaltoledano/claude-task-master | Limited | — | P | — | `to-review` sets status and requests preparation artifacts; does not itself verify the work | C12 |
| mattpocock/skills | P | Limited | P | P | Findings are hypotheses; no convergence guarantee; primary-source research with per-claim citations | C13 |
| anthropics/skills | P | P | Limited | — | Local webapp Playwright reconnaissance/action workflow; scoped testing toolkit, not general acceptance policy | C14 |
| wshobson/agents | P | P | P | — | TDD orchestrator specifies persisted steps, requirement/test matrix, approval checkpoints and failure halt | C15 |
| anthropics/claude-plugins-official | P | P | Limited | — | Five review passes, separate scoring, cutoff; deliberately leaves build/typecheck to CI | C16 |
| nicobailon/pi-subagents | E/P | E/P | E | Limited | Attested/checked/verified acceptance, host commands, review-required status, snapshot-sensitive memoization | P1 |

#### Entry evidence catalogue

- **H1:** `.references/harnesses/Aider-AI/aider/aider/coders/base_coder.py:924-945`,
  `.references/harnesses/Aider-AI/aider/aider/coders/base_coder.py:1585-1624`,
  `.references/harnesses/Aider-AI/aider/aider/commands.py:993-1051`.
- **H2:** `.references/harnesses/anthropics/claude-code/plugins/hookify/examples/require-tests-stop.local.md:1-22`,
  `.references/harnesses/anthropics/claude-code/plugins/hookify/core/rule_engine.py:35-85`,
  `.references/harnesses/anthropics/claude-code/plugins/hookify/core/rule_engine.py:159-215`.
- **H3:** `.references/harnesses/openai/codex/codex-rs/core/gpt_5_2_prompt.md:136-150`,
  `.references/harnesses/openai/codex/codex-rs/core/gpt-5.2-codex_prompt.md:27-55`.
- **H4:** `.references/harnesses/charmbracelet/crush/internal/agent/templates/coder.md.tpl:3-26`,
  `.references/harnesses/charmbracelet/crush/internal/agent/templates/coder.md.tpl:68-121`.
- **H5:** `.references/harnesses/google-gemini/gemini-cli/packages/core/src/prompts/snippets.ts:250-260`,
  `.references/harnesses/google-gemini/gemini-cli/packages/core/src/prompts/snippets.ts:348-376`.
- **H6:** `.references/harnesses/aaif-goose/goose/crates/goose/src/prompts/system.md:1-39`,
  `.references/harnesses/aaif-goose/goose/workflow_recipes/release_risk_check/recipe.yaml:4-20`,
  `.references/harnesses/aaif-goose/goose/workflow_recipes/release_risk_check/recipe.yaml:70-103`.
- **H7:** `.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/app/agentProfileCatalog/system.md:43-53`.
- **H8:** `.references/harnesses/mistralai/mistral-vibe/vibe/core/prompts/cli.md:81-105`,
  `.references/harnesses/mistralai/mistral-vibe/vibe/core/prompts/cli.md:133-136`.
- **H9:** `.references/harnesses/anomalyco/opencode/packages/core/src/plugin/system-prompt/gpt.txt:1-39`,
  `.references/harnesses/anomalyco/opencode/packages/core/src/plugin/system-prompt/anthropic.txt:1-2`.
- **H10:** `.references/harnesses/QwenLM/qwen-code/packages/core/src/core/prompts.ts:430-437`.
- **C1:** `.references/customizations/garrytan/gstack/qa/sections/exploratory.md:21-92`,
  `.references/customizations/garrytan/gstack/qa/sections/system-functional.md:9-61`,
  `.references/customizations/garrytan/gstack/qa/SKILL.md.tmpl:169-258`,
  `.references/customizations/garrytan/gstack/lib/qa-evidence.ts:170-243`.
- **C2:** `.references/customizations/cursor/plugins/pstack/skills/create-verification-skill/SKILL.md:8-44`,
  `.references/customizations/cursor/plugins/pstack/skills/maintain-verification-skill/SKILL.md:8-36`,
  `.references/customizations/cursor/plugins/pstack/skills/why/references/epistemics.md:1-62`,
  `.references/customizations/cursor/plugins/pstack/skills/why/references/epistemics.md:137-144`.
- **C3:** `.references/customizations/obra/superpowers/skills/verification-before-completion/SKILL.md:14-50`,
  `.references/customizations/obra/superpowers/skills/test-driven-development/SKILL.md:113-201`,
  `.references/customizations/obra/superpowers/skills/subagent-driven-development/SKILL.md:65-120`.
- **C4:** `.references/customizations/addyosmani/agent-skills/.claude/commands/test.md:5-19`,
  `.references/customizations/addyosmani/agent-skills/skills/code-review-and-quality/SKILL.md:152-164`.
- **C5:** `.references/customizations/affaan-m/ECC/skills/verification-loop/SKILL.md:24-129`,
  `.references/customizations/affaan-m/ECC/skills/deep-research/SKILL.md:33-42`,
  `.references/customizations/affaan-m/ECC/skills/deep-research/SKILL.md:152-160`.
- **C6:** `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-work/references/implementation-loop.md:3-15`,
  `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-code-review/references/finish-input.md:85-97`,
  `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-test-browser/SKILL.md:10-50`,
  `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-plan/references/agents/web-researcher.md:15-24`,
  `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-plan/references/agents/web-researcher.md:56-67`.
- **C7:** `.references/customizations/SuperClaude-Org/SuperClaude_Framework/src/superclaude/agents/self-review.md:10-31`,
  `.references/customizations/SuperClaude-Org/SuperClaude_Framework/src/superclaude/agents/deep-research-agent.md:57-92`.
- **C8:** `.references/customizations/github/spec-kit/templates/commands/analyze.md:62-75`,
  `.references/customizations/github/spec-kit/templates/commands/analyze.md:109-163`,
  `.references/customizations/github/spec-kit/templates/commands/analyze.md:217-229`.
- **C9:** `.references/customizations/Fission-AI/OpenSpec/src/core/templates/workflows/verify-change.ts:54-75`,
  `.references/customizations/Fission-AI/OpenSpec/src/core/templates/workflows/verify-change.ts:123-211`.
- **C10:** `.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:16-72`,
  `.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:220-331`,
  `.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:510-609`,
  `.references/customizations/gsd-build/get-shit-done/sdk/src/query/verify.ts:65-119`,
  `.references/customizations/gsd-build/get-shit-done/get-shit-done/workflows/verify-work.md:1-21`,
  `.references/customizations/gsd-build/get-shit-done/agents/gsd-phase-researcher.md:29-35`.
- **C11:** `.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-code-review/step-03-triage.md:15-50`,
  `.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-deep-recon/references/verification.md:1-29`,
  `.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-deep-recon/scripts/recon_kit.py:141-173`.
- **C12:** `.references/customizations/eyaltoledano/claude-task-master/packages/claude-code-plugin/commands/to-review.md:5-39`.
- **C13:** `.references/customizations/mattpocock/skills/docs/engineering/code-review.md:61-79`,
  `.references/customizations/mattpocock/skills/skills/engineering/research/SKILL.md:6-12`.
- **C14:** `.references/customizations/anthropics/skills/skills/webapp-testing/SKILL.md:8-35`,
  `.references/customizations/anthropics/skills/skills/webapp-testing/SKILL.md:65-96`.
- **C15:** `.references/customizations/wshobson/agents/plugins/tdd-workflows/commands/tdd-cycle.md:8-17`,
  `.references/customizations/wshobson/agents/plugins/tdd-workflows/commands/tdd-cycle.md:87-117`.
- **C16:** `.references/customizations/anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:11-32`,
  `.references/customizations/anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:34-57`.
- **P1:** `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1071-1149`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1222-1285`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1293-1348`,
  `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1540-1635`.

### 2. Executable and instructed loops

#### Aider: explicit lint/test reflection, not unconditional acceptance

```text
edited files
  → enabled auto-lint → errors? → ask whether to fix → feed errors back
  → configured auto-test → nonzero command? → ask whether to fix → feed errors back
  → model makes another edit → repeat, at most 3 reflections
```

The host chooses when to run checks, sets outcome fields, and turns failures into
`reflected_message`. `cmd_test` uses `cmd_run(..., True)` so nonzero exit output
becomes chat evidence. The outer loop enforces the reflection cap. Defaults
include `auto_test = False`; this is not an always-on requirement verifier.
The error-fix decision uses `confirm_ask`, whose effective behavior depends on
configuration. Do not copy Aider's auto-commit behavior into a verification
feature merely because it shares this path.
Sources: `.references/harnesses/Aider-AI/aider/aider/coders/base_coder.py:100-109`,
`.references/harnesses/Aider-AI/aider/aider/coders/base_coder.py:924-945`,
`.references/harnesses/Aider-AI/aider/aider/coders/base_coder.py:1585-1624`,
`.references/harnesses/Aider-AI/aider/aider/commands.py:993-1051`.

**Limitation (inferred):** a zero exit establishes the configured command's
success convention, not coverage of every requirement. If no test command is
configured, this path does not provide test evidence.

#### Superpowers: a claim gate and a test-sensitivity loop

```text
claim proposed → identify proof → run full check → read output + exit
  → supports claim? → report claim with evidence : report actual gap

bug/behavior → failing test → confirm expected failure → minimal implementation
  → test passes + suite → refactor → re-check
```

The completion skill explicitly distinguishes build, lint, symptom reproduction,
regression sensitivity, delegated output, and requirement checklists. Its strict
freshness rule says the command must have run in the current message. The TDD
skill requires expected failure rather than import/setup error, and the project
suite rather than only the newly added test. These are instructions, not a host
that mechanically prohibits a success sentence.
Sources: `.references/customizations/obra/superpowers/skills/verification-before-completion/SKILL.md:14-50`,
`.references/customizations/obra/superpowers/skills/verification-before-completion/SKILL.md:89-115`,
`.references/customizations/obra/superpowers/skills/test-driven-development/SKILL.md:113-201`.

The separate subagent-driven workflow caps task fix rounds at five, changes
implementer context/model from round four, then adjudicates residuals; the final
branch review gets one fix dispatch and scoped re-review. Reaching a cap means
judgment or escalation, not automatically passing the work.
Source: `.references/customizations/obra/superpowers/skills/subagent-driven-development/SKILL.md:65-120`.

**Trade-off (recommendation):** preserve freshness relative to changed inputs,
not a literal conversational-message boundary. A genuinely unchanged immutable
artifact need not be re-tested just because the user asks a follow-up; an edited
fixture invalidates proof even within the same message.

#### Pstack: make the actual application verifiable, then maintain the map

```text
inspect repo surface/run/drive/observe/isolate
  → author launch + doctor + drive + evidence + cleanup
  → map top user features → execute one complete proof → retain evidence

maintenance → index map → independent source recipe per feature
  → coordinator reconciles → serial live coverage of every feature
  → classify doc drift / harness gap / product gap → clean / changed / blocked
```

Generation must prove one mapped feature end to end and confirm artifacts survive
cleanup. Maintenance requires live coverage even when source looks correct.
Source readers do not drive or edit; one coordinator drives owned instances.
Maintenance edits only the verification directory, distinguishing product
regression from obsolete documentation rather than "fixing" the map to hide a
bug. A doctor drift fix gets one retry. Unreachable features need a concrete
prerequisite and attempted route.
Sources: `.references/customizations/cursor/plugins/pstack/skills/create-verification-skill/SKILL.md:12-44`,
`.references/customizations/cursor/plugins/pstack/skills/maintain-verification-skill/SKILL.md:8-36`.

**Transferable inference:** user-path recipes and a small feature map solve a
problem ordinary test-command discovery cannot: knowing which externally visible
paths need exercising. This survey did not execute a generated skill.

#### Gstack: distinguish observation, completed capture, and passed contract

```text
contract charter + permissions/isolation
  → baseline probe + durable effect
  → causal checkpoint → next probe → exact failing replay → minimize
  → native regression fails for right reason → minimal repair
  → regression + original probe + adjacent happy path
  → classify repair → revalidate affected final-input contracts → report
```

The QA instructions require exact command/request, expected contract/source,
initial and final state, revision/runtime, output, limits, and retained evidence.
HTTP acceptance/enqueue is not final business completion. Refusal, timeout,
missing services, and inconclusive results cannot pass; quick mode names contracts
not run. Repairs do not follow merely from infrastructure failures or unclear
contracts. One revised minimal fix is allowed after an unsuccessful recheck.
Sources: `.references/customizations/garrytan/gstack/qa/sections/system-functional.md:9-61`,
`.references/customizations/garrytan/gstack/qa/sections/exploratory.md:49-92`,
`.references/customizations/garrytan/gstack/qa/SKILL.md.tmpl:169-258`.

There is real recorder code behind part of this procedure: it rejects missing
finite deadlines/timeouts, enforces causal links to the preceding complete
capture, writes separate stdout/stderr with hashes, and marks capture integrity
`complete`, `incomplete`, or `sensitive`. **Complete capture is not passed
behavior**: contract classification remains a separate caller judgment.
Source: `.references/customizations/garrytan/gstack/lib/qa-evidence.ts:170-243`.

The QA repair process stops after two reverts or an unrelated-file edit, evaluates
every five fixes and after a revert, and has a 50-fix cap. This cap is not a
recommendation for a small personal pi loop. Discovery smoke has its own
5-minute/12-probe budget; explicit plan checks and revalidation remain required.
Sources: `.references/customizations/garrytan/gstack/qa/SKILL.md.tmpl:242-258`,
`.references/customizations/garrytan/gstack/qa/sections/exploratory.md:25-35`.

#### Pi-subagents: acceptance strength is not a synonym for correctness

```text
resolved acceptance policy
  → child report → attested
  → criteria declarations + evidence structure (+ selected git checks) → checked
  → host verify commands (+ optional JSON schema) → verified or rejected
  → independently supplied review → reviewed / review-required / rejected
```

`checkCriteriaSatisfied` checks the child's declared criterion status, while
structural checks generally check that required report fields exist. For example,
nonempty `commandsRun` is evidence presence; it does not itself prove commands
executed. `verified` runs commands in the host and rejects failed/timed-out
checks. Typed output must parse and, when configured, satisfy its schema.
A required review remains `review-required` without independent review input.
Sources: `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1071-1149`,
`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1257-1285`,
`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1540-1635`.

Memoization keys include command, environment hash, cwd, timeout, policy, HEAD,
and the tracked diff; non-Git or typed JSON gates execute without this reuse.
Untracked content is excluded. The unit test explicitly expects reuse after an
untracked file is added, and also caches failed results. Those tests were read,
not run in this investigation.
Sources: `.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1222-1244`,
`.references/pi-packages/nicobailon/pi-subagents/src/runs/shared/acceptance.ts:1293-1348`,
`.references/pi-packages/nicobailon/pi-subagents/test/unit/acceptance.test.ts:1360-1408`.

**Limitation (inferred):** a verifier whose inputs include new files, ignored
fixtures, database state, time, or remote services cannot safely equate an
unchanged tracked diff with unchanged verification inputs. An exit-zero trivial
command can still yield a weak `verified` gate; command relevance is a policy
problem, not solved by the status label.

### 3. Requirements and completion

#### Goal-backward checks versus artifact consistency

GSD starts from observable truths, required artifacts, and key links rather than
SUMMARY claims. Its procedure checks existence, substance, wiring, and, for
dynamic views, upstream data flow. It also specifies executing declared probes
and records nonzero output; human-verification items prevent `passed`.
Sources: `.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:16-72`,
`.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:220-331`,
`.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:510-573`.

Its structural tooling has narrower semantics: `verifyPlanStructure` checks
frontmatter and task tags; the legacy summary helper spot-checks files, commits,
and prose pass markers. These do not independently establish the phase goal.
Sources: `.references/customizations/gsd-build/get-shit-done/sdk/src/query/verify.ts:65-119`,
`.references/customizations/gsd-build/get-shit-done/get-shit-done/bin/lib/verify.cjs:15-95`.
The procedure also supports accepted overrides and later-phase deferrals; report
those separately from observed behavioral passes.
Sources: `.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:181-216`,
`.references/customizations/gsd-build/get-shit-done/agents/gsd-verifier.md:578-609`.

Spec-kit analysis maps requirements to tasks and detects contradiction,
ambiguity, missing coverage, and constitution conflicts before implementation.
It is read-only and offers remediation rather than applying it.
Source: `.references/customizations/github/spec-kit/templates/commands/analyze.md:62-75`,
`.references/customizations/github/spec-kit/templates/commands/analyze.md:109-163`.
**Inference:** this prevents specification drift, but a coherent set of documents
can describe a feature that still does not work.

OpenSpec's generated verification procedure separates completeness, correctness,
and coherence. It is explicitly advisory and not a new archive prerequisite.
Not-applicable checks differ from applicable checks lacking evidence; task-only
inputs cannot establish spec correctness or code-pattern consistency. Some checks
use keyword/path analysis and reasonable inference; test existence is not test
execution. Skipped checks prohibit claiming full readiness in the report.
Source: `.references/customizations/Fission-AI/OpenSpec/src/core/templates/workflows/verify-change.ts:54-75`,
`.references/customizations/Fission-AI/OpenSpec/src/core/templates/workflows/verify-change.ts:123-211`.

#### Human observation and ownership

GSD's UAT workflow presents expected behavior one test at a time, records user
confirmation/discrepancy, and feeds gaps into planning; conditional browser
verification handles some UI checkpoints. Its human confirmation remains a
separate evidence type, not a test command.
Source: `.references/customizations/gsd-build/get-shit-done/get-shit-done/workflows/verify-work.md:1-21`,
`.references/customizations/gsd-build/get-shit-done/get-shit-done/workflows/verify-work.md:102-140`.

Compound Engineering requires choosing the task's evidence strategy before
behavior changes, recording deliberate no-test exceptions with replacement
verification, and diagnosing a shared assumption after two failed fixes. It
separately warns that out-of-repo completion is observed state, not a clean tree
or tracker update. Browser tests retain every affected route as Pass/Fail/Skip
with reasons; unattended external interactions are skipped, not approved.
Sources: `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-work/references/implementation-loop.md:3-15`,
`.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-test-browser/SKILL.md:10-50`.

Task Master's `review` status and SuperClaude's concise self-check show two lighter
choices: one labels work awaiting verification; the other asks for command/outcome,
edge cases, acceptance alignment, and follow-up. Neither procedure alone is an
independent executable acceptance gate.
Sources: `.references/customizations/eyaltoledano/claude-task-master/packages/claude-code-plugin/commands/to-review.md:5-39`,
`.references/customizations/SuperClaude-Org/SuperClaude_Framework/src/superclaude/agents/self-review.md:10-31`.

### 4. Verifying verifier findings and test adequacy

- **Test sensitivity:** addyosmani instructs inverting one newly added condition,
  running the suite, and restoring from a copy; surviving mutation is a missing
  test finding. This is an instructed experiment, not evidence that mutation
  testing automatically runs. It changes files and needs an owned isolated copy
  or approved write scope.
  Source: `.references/customizations/addyosmani/agent-skills/skills/code-review-and-quality/SKILL.md:152-164`.
- **Finding validation:** BMAD triage re-reads claims through callers and guards,
  assigns true severity, false, or maybe-false, and retains evidence before
  grouping. Important exception: verification-gap findings are treated as
  pre-verified and skip this second check. Do not describe it as universally
  independent double verification.
  Source: `.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-code-review/step-03-triage.md:15-50`.
- **Validation failure is not a clean report:** Compound Engineering's validator
  records infrastructure failure separately; selected findings become
  validation-degraded unresolved gates rather than silently rejected findings.
  Source: `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-code-review/references/finish-input.md:85-97`.
- **Score filtering:** Anthropic's review command uses five reviewers and a
  per-issue scorer, drops scores below 80, and deliberately excludes
  compiler/linter/build issues assumed handled by CI. That is review-scope
  delegation, not proof that CI passed. The source supplies a confidence rubric,
  not measured probability calibration.
  Source: `.references/customizations/anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:11-57`.
- **No convergence guarantee:** mattpocock explicitly treats subagent output as
  hypotheses and warns against looping until clean. Fresh context is useful,
  but does not transform an allegation into a fact.
  Source: `.references/customizations/mattpocock/skills/docs/engineering/code-review.md:61-79`.

### 5. Research verification is a claim loop, not a test-suite analogue

BMAD deep-recon provides the most explicit inspected claim protocol:

```text
claim arrives unverified, with publisher/date/source/class
  → independent verifier checks load-bearing claims (normal)
    or defined classes (high) / all claims (max)
  → verified / disputed / unverified / overturned
  → append status with same claim ref → revise only what evidence warrants
  → optional/level-required fresh skeptic searches contrary evidence
  → synthesize survived or revised conclusions + remaining uncertainty
```

Independence means different underlying data/reporting, not syndicated copies or
two vendor pages. Confidence is per claim. Quantitative agreement can mean order
of magnitude/direction, not exact equality; report that tolerance. Disagreement
is surfaced rather than averaged. The Python ledger helper uses last status per
reference; it counts declared outcomes, not source credibility itself.
Sources: `.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-deep-recon/references/verification.md:1-29`,
`.references/customizations/bmad-code-org/BMAD-METHOD/skills/bmad-deep-recon/scripts/recon_kit.py:141-173`.

**Caution (inferred):** the same reference says imports from different tools
agreeing count as genuine confirmation. Tool diversity alone does not prove its
stricter independence definition: both imports could depend on the same original
publisher or data. For a pi implementation, record underlying provenance rather
than counting tools as independent sources.

Other useful procedures:

| Approach | What it contributes | Limit |
|---|---|---|
| mattpocock primary-source research | Trace each claim to official docs/code/spec/API and cite it | Minimal skill does not specify independent corroboration or a claim ledger |
| GSD provenance tags | VERIFIED/CITED/ASSUMED; package existence alone does not establish trustworthy provenance | Tags still require actual source inspection; a report's label is not proof |
| pstack epistemics | Direct/supported/inferred/speculative/unknown; code behavior is not evidence of author motivation; final calibration pass | Designed for historical why-questions; not every behavior claim needs a separate publisher |
| ECC deep research | Cross-reference; single-source claim marked unverified; source content treated as untrusted data | Broad recent-source and source-count guidance is not a universal quality metric |
| Compound Engineering web research | Independent convergence, recency separate from authority, gap-filling on load-bearing claims, diminishing-return stop | No substitute for recording the consulted sources and what they actually support |
| SuperClaude deep research | Self-reflection on gaps/bias/consistency and adaptive replanning | Numerical confidence/replanning thresholds are procedural heuristics, not measured calibration |

Sources: `.references/customizations/mattpocock/skills/skills/engineering/research/SKILL.md:6-12`,
`.references/customizations/gsd-build/get-shit-done/agents/gsd-phase-researcher.md:29-35`,
`.references/customizations/cursor/plugins/pstack/skills/why/references/epistemics.md:1-62`,
`.references/customizations/cursor/plugins/pstack/skills/why/references/epistemics.md:137-144`,
`.references/customizations/affaan-m/ECC/skills/deep-research/SKILL.md:33-42`,
`.references/customizations/affaan-m/ECC/skills/deep-research/SKILL.md:152-160`,
`.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-plan/references/agents/web-researcher.md:15-24`,
`.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-plan/references/agents/web-researcher.md:56-67`,
`.references/customizations/SuperClaude-Org/SuperClaude_Framework/src/superclaude/agents/deep-research-agent.md:57-92`.

**Recommendation:** distinguish an authoritative primary-source implementation
fact from independent corroboration of an external empirical claim. Reading the
source and its tests establishes what is implemented/intended, not independently
measured effectiveness. A second blog repeating that README does not add an
independent efficacy measurement.

### 6. Conflicts and mechanisms not to copy uncritically

| Tension | Source-backed observation | Implication (inferred / recommendation) |
|---|---|---|
| Always test immediately vs respect iteration/permission policy | Crush says test after each modification (H4); Codex's GPT-5.2 prompt distinguishes approval modes and test-related work (H3) | Choose an explicit local cadence; do not claim the references agree on one default |
| Strict test-first vs deliberate exceptions | superpowers TDD (C3) versus Compound's characterization/replacement verification (C6) | Specify exceptions and evidence, not an unbounded ritual or silent skip |
| Green suite vs sensitive tests | Mutation experiment (C4) and expected-red checks (C3) | Test presence/coverage percentage cannot alone show the change would be caught |
| Human acceptance vs behavioral pass | GSD accepted overrides and future-phase deferral (C10) | Keep waived/deferred statuses visible, never relabel as empirically passed |
| Fresh evidence vs tracked-tree reuse | superpowers freshness (C3) versus pi-subagents memoization (P1) | Declare input scope; do not reuse proof across new files or mutable services |
| Strong naming vs weak enforcement | hookify test-stop sample (H2), described below | Inspect actual operator and observed result, not the feature's name |
| Endless review vs bounded judgment | mattpocock warning (C13), superpowers five rounds (C3), GSD three auto-review iterations | A cap ends automation, not unresolved facts; retain issues and escalate |
| Universal suite vs scoped native checks | superpowers suite (C3), gstack per-contract smoke/quick limits (C1) | Report check scope and missing coverage explicitly; small checks and full suites answer different questions |

GSD's three-iteration flag is an instructed workflow limit:
`.references/customizations/gsd-build/get-shit-done/commands/gsd/code-review.md:25-28`.

**Concrete source mismatch: hookify's bundled test-stop example.** The disabled
example uses `operator: not_contains` with `pattern: npm test|pytest|cargo test`
and describes checking for any test command. The evaluator implements
`not_contains` as literal substring absence, not regex alternatives. As written,
the condition does not implement "none of these three commands appears".
Moreover, even a corrected transcript-pattern rule would not establish execution,
exit status, relevance, or freshness. This is a static-source finding; the plugin
was not run and the external reference was not changed.
Sources: `.references/harnesses/anthropics/claude-code/plugins/hookify/examples/require-tests-stop.local.md:1-22`,
`.references/harnesses/anthropics/claude-code/plugins/hookify/core/rule_engine.py:159-177`,
`.references/harnesses/anthropics/claude-code/plugins/hookify/core/rule_engine.py:200-215`.

**Report truncation is not execution proof.** ECC's sample build/lint/test commands
pipe through head/tail; only the type-check block explicitly sets pipefail.
A copied shell pipeline must preserve the checker status and retained full output
rather than trusting the last pipeline process. `head` can also affect the
producer through a closed pipe. This is a portability/implementation risk
inferred from the examples, not a reproduced failure here.
Source: `.references/customizations/affaan-m/ECC/skills/verification-loop/SKILL.md:24-65`.

### 7. Transferable principles for pi

Recommendations, not approved implementation decisions:

1. State the claim and observable acceptance condition before choosing a check
   (GSD goal-backward, pstack feature map, gstack contract charter).
2. Discover repository-native commands; do not introduce a second framework or
   weaken existing tests merely to create a green result (gstack, Qwen, Compound).
3. Record host-owned execution evidence separately from model interpretation and
   child self-attestation (Aider, gstack recorder, pi-subagents acceptance).
4. Reproduce the original scenario, verify expected failure where appropriate,
   and re-run affected checks after fixes (superpowers, addyosmani, gstack).
5. Keep requirement coverage, executed checks, and optional review verdicts as
   separate axes (OpenSpec, GSD, Anthropic review's CI boundary).
6. Bind evidence to relevant inputs, including untracked/new files and runtime
   state; expire or supersede it after input changes (gstack, P1 limitation).
7. Use bounded, authorized repair with root-cause reconsideration; no infinite
   clean-review loop (Aider, Gemini, Compound, mattpocock).
8. For research, track important claims and actual consulted primary sources;
   calibrate wording, retain contradiction, and corroborate claims whose nature
   requires independent evidence (BMAD, pstack epistemics, GSD, Compound).

See the [pi options report](2026-10-11-verification-options-for-pi.md) for a small
starting workflow rather than importing an entire orchestration framework.

## Open questions

- Which verification profile and degree of enforcement does the user want for
  routine work, risky changes, UI work, and research?
- How much does fresh-context or cross-model review improve actual outcomes for
  this user's tasks relative to latency, cost, and noise? No benchmark here.
- Which exact inputs define evidence freshness for each project and live system?
- Can proposed pi completion-continuation behavior remain bounded across abort,
  queued work, reload, branch navigation, and non-interactive modes? Needs a spike.
- Limited harness rows need deeper runtime/extension inspection before claiming
  default completion enforcement; the survey does not establish feature absence.
- Reference claims about "verified" artifacts sometimes rely on structural
  heuristics or trusted reports. The report does not measure their false-positive
  or false-negative rates.

## References

The entry evidence catalogue and inline citations identify the inspected source
for each mechanism. Prior records are supporting navigation, not replacements for
current source inspection:

- [Code review survey](2026-10-11-code-review-in-agent-customization.md).
- [Pi-subagents architecture](2026-10-11-pi-subagents.md), especially acceptance
  and orchestration; current acceptance code was re-read here.
- [Verification options for pi](2026-10-11-verification-options-for-pi.md).

Research quality check in this session: all 27 approval-time inventory entries
have source metadata and matrix rows; their pinned commits still match and their
worktrees remain clean. The four subsequently added manifest entries are outside
this pass. Across the two reports, 170 citation path/range checks and document
link checks completed without issues after correction; both YAML frontmatters
parsed with the installed host's YAML library. Important mechanism claims were
also compared with the source text: path/range validity alone does not prove
semantic support. No runtime effectiveness or comprehensive test pass is claimed.
