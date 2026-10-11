---
title: User-question tools for a Pi implementation
date: 2026-10-11
session: 01a1291c-b600-7631-8446-84d61e317011
based_on:
  - docs/research/2026-10-11-pi-plan-mode-example.md
  - docs/plans/2026-10-11-plan-mode-extension.md
sources:
  - repo: earendil-works/pi
    path: /Users/kkkzzzabc/.local/share/pi-fork/releases/b1a78306c-openai-fast-20261011-125046/node_modules/@earendil-works/pi-coding-agent
    version: 1.1.0
    commit: b1a78306c9ed33165721c47e183d89e7002bd130
  - repo: edlsh/pi-ask-user
    path: .references/pi-packages/edlsh/pi-ask-user
    version: 0.16.0-checkout
    commit: e8b59a5114bb1cf4fca239b75976483703c9783f
  - repo: FadhelHaidar/pi-ask-user
    path: .references/pi-packages/FadhelHaidar/pi-ask-user
    version: 1.0.3
    commit: 99410ecb057183dd5d53608896a4bea80ff9eb42
  - repo: jayshah5696/pi-agent-extensions
    path: .references/pi-packages/jayshah5696/pi-agent-extensions
    version: 0.5.4
    commit: 7f6a8488cbc505604ed993db5a0bb814e6f2be58
  - repo: mrclrchtr/supi
    path: .references/pi-packages/mrclrchtr/supi
    version: supi-ask-user-8.0.1-checkout
    commit: 77f9caf12ba7b603306b8e175fcbbae8d8155046
  - repo: openai/codex
    path: .references/harnesses/openai/codex
    version: checkout
    commit: 806d9732c974bc8a51b8317c1bd8985544fe627c
  - repo: google-gemini/gemini-cli
    path: .references/harnesses/google-gemini/gemini-cli
    version: 0.65.0-nightly.20261006.gfb972b2f8
    commit: 9b6e0265d16bbd29ca51e33c9e0c01dc4cec5e83
  - repo: anomalyco/opencode
    path: .references/harnesses/anomalyco/opencode
    version: 2.0.26
    commit: 5caf1f9f6f5f30e13fc50a788ad953d97ae3748f
  - repo: mistralai/mistral-vibe
    path: .references/harnesses/mistralai/mistral-vibe
    version: 2.26.1
    commit: 4ae5c5955da8e761318916bdb1a7f46f0b50c7d0
  - repo: MoonshotAI/kimi-code
    path: .references/harnesses/MoonshotAI/kimi-code
    version: monorepo-0.1.1
    commit: c9f01f07388abc2cdca40c9c5267f58c65086710
  - repo: QwenLM/qwen-code
    path: .references/harnesses/QwenLM/qwen-code
    version: 0.25.0
    commit: a238b91e7c6fc2b0e36e23436b0e4ced5296617b
  - repo: charmbracelet/crush
    path: .references/harnesses/charmbracelet/crush
    version: checkout
    commit: df5b024a929d2eb88b308d0288d97130a90e0c15
  - repo: EveryInc/compound-engineering-plugin
    path: .references/customizations/EveryInc/compound-engineering-plugin
    version: checkout
    commit: 51aa537383744736eb8ad30468d34420e9fb8ea8
  - repo: anthropics/claude-plugins-official
    path: .references/customizations/anthropics/claude-plugins-official
    version: checkout
    commit: b8e53f1c05dff3b6d751297f6527990ffc81c2f4
  - repo: gsd-build/get-shit-done
    path: .references/customizations/gsd-build/get-shit-done
    version: checkout
    commit: bdcaab2c752d9a33a1a1ca9acf3a3c81fb991815
  - repo: garrytan/gstack
    path: .references/customizations/garrytan/gstack
    version: checkout
    commit: 20eb6202fa8ea83a882e7c0463b722cd8a31af1e
  - repo: mattpocock/skills
    path: .references/customizations/mattpocock/skills
    version: checkout
    commit: 49dd158d1076134a641b33efb035946536778336
  - repo: Michaelliv/pi-ask-user-question
    url: https://github.com/Michaelliv/pi-ask-user-question
    commit: eaa38c32a3641be80667e79d9c91d3d25668343f
    accessed: 2026-10-11
  - repo: skidvis/pi-ask-user-question
    url: https://github.com/skidvis/pi-ask-user-question
    commit: bec0e359cb3bca78636229990b98b363d6dc4ff6
    accessed: 2026-10-11
  - repo: kunkun9527/rpiv-ask-user-question-lean
    url: https://github.com/kunkun9527/rpiv-ask-user-question-lean
    commit: 65dcbfb4327c26ee8d1877be35de5fd54c18f01b
    accessed: 2026-10-11
  - repo: jd-erreape/pi-questionnaire
    url: https://github.com/jd-erreape/pi-questionnaire
    commit: cdd4d0f5c19bee6b7e54a6b3b5614e39ff86f723
    accessed: 2026-10-11
  - repo: SakikoTogawa233/pi-question-tool
    url: https://github.com/SakikoTogawa233/pi-question-tool
    commit: df92340b1e468e0028642e9e437696af033b848f
    accessed: 2026-10-11
  - repo: pi-vault/pi-questionnaire
    url: https://github.com/pi-vault/pi-questionnaire
    commit: 2f6e20792351de293fbd324580ccfa3bed266e7d
    accessed: 2026-10-11
  - repo: juicesharp/rpiv-mono
    url: https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question
    commit: 68d9a0014b70006d7b04b57933752338a2716db7
    accessed: 2026-10-11
  - repo: Jabbslad/pi-ask-user
    url: https://github.com/Jabbslad/pi-ask-user
    commit: d0733e78cb7fe0f3a5d6e91a1bf81eaf47345a9d
    accessed: 2026-10-11
  - url: https://api.github.com/search/repositories?q=pi-ask-user&per_page=10
    accessed: 2026-10-11
  - url: https://api.github.com/search/repositories?q=pi+questionnaire+in:name,description&per_page=12
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/pi-ask-user
    commit: adcc7b2ee22bb290f9d6693efe6c0d0cd1273280
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/@fadhelhaidar/pi-ask-user
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/@mrclrchtr/supi-ask-user
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/pi-ask-user-question
    commit: b77dc4885b59aae621ffe11a2ac3a5f5e5e0c753
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/@jd-erreape/pi-questionnaire
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/pi-question-tool
    accessed: 2026-10-11
  - url: https://registry.npmjs.org/@pi-vault/pi-questionnaire
    accessed: 2026-10-11
---

# User-question tools for a Pi implementation

## Scope

Research for a future pi-personal implementation, not authorization to install or build one. The target is an agent-callable structured question tool, with choices, custom answers or comments, and explicit lifecycle semantics. TUI is primary; RPC/headless behavior is assessed rather than promised.

The deepest source reviews cover the two Pi examples as one baseline family, four Pi packages, and OpenCode's form lifecycle. Codex and Gemini receive focused protocol reviews; other harnesses and community packages are screened for distinct mechanisms. This is not an exhaustive package census or a comparative benchmark of real models.

External references were read without modifying their source. Four new repositories were added to `references.json`; two use sparse checkouts. No existing reference was updated, package installed, production code changed, or paid model called.

## Summary

- The useful category is a **structured user-question tool**; it is not merely an approval dialog or a skill that prints questions. Separate question authoring, UI interaction, and answer semantics.
- Pi 1.1.0 public extension/TUI APIs are sufficient for the observed designs. No core change is justified by this research.
- **edlsh/pi-ask-user is the strongest first reuse/evaluation candidate**: choice, free text, comments, batches, responsive UI, abort/timeout cleanup, and dialog fallback. Its source checkout loaded and completed a batch on the installed fork.
- **SuPi is the strongest contract/architecture reference**: stable IDs/values, choice/text distinction, comments at several levels, `needs_discussion`, explicit cancellation control flow, a lock, and separated schema/controller/UI/result layers.
- **FadhelHaidar's package is the strongest combined-answer UX reference**: predefined selections and custom text can be submitted together without losing drafts. It is not the strongest lifecycle baseline.
- Pi's examples demonstrate the mechanism but need hardening: the questionnaire synthesizes `(no response)` from blank input; dismissing `question` returns a non-error result and permits automatic model continuation. Both were observed in the real TUI with a faux model.
- **GitHub HEAD and npm are not interchangeable**: published edlsh 0.16.0 lacks the checkout's `model-only` exposure, and published SuPi 8.0.1 lacks the checkout's reusable form API. A package decision must pin the intended artifact.
- Recommended next step: decide between a narrowly scoped edlsh reuse evaluation and a local extension combining its lifecycle/UI lessons with SuPi-style answer IDs. Do not copy an entire package or adopt its bundled skill by default.
- The first implementation should distinguish answer, comment, discussion/skip, dismissal, abort, and unavailable UI; a cancelled or incomplete question must never become implicit approval.

## Questions

1. Which schema and result contract preserve stable identity and explicit answer intent?
2. Which capabilities are useful initially, and what does “other feedback” mean?
3. How should an agent prepare questions and options for the UI?
4. How should waiting, cancellation, abort, concurrency, and cleanup behave?
5. What belongs in transcript/model output versus persistent state, and what privacy risks follow?
6. How should TUI, RPC, and headless behavior differ?
7. What is feasible with public Pi APIs, including compatibility and plan-mode integration?
8. Which references should be reused, adapted, or excluded, and why?
9. What remains to be decided or verified before implementation?

## Findings

### 1. Host baseline and evidence levels

`$PI_ROOT` below denotes the exact installed coding-agent path in frontmatter. The package reports 1.1.0. The launcher target was re-resolved before research and TUI checks. Installation receipt `~/.local/share/pi-fork/receipts/openai-fast-20261011-125046.json` records source commit `b1a78306c…` and a dirty build; this is not a pristine upstream tag. The five inspected docs/examples below were independently byte-compared with that base commit and matched. The current sibling source checkout had other changes and was not used as a substitute for installed-host documentation.

| Installed file | SHA-256 |
|---|---|
| `examples/extensions/question.ts` | `a1625d2c72a65d859154a7e66bef222d48ca9e3654a8bb910829ad350378a4c4` |
| `examples/extensions/questionnaire.ts` | `3f1f719d81152ff013f5d36a97cc3976388d43f2d89bff0f19827d3443d903e6` |
| `docs/extensions.md` | `bd2ed1f728173c1defc035e90c3894c308ae153fa08575c12b4a9988e11f8108` |
| `docs/tui.md` | `0263c7a102a6d972038645448d568abf01108ad839b12a374dad7150811ae8a3` |
| `docs/rpc-extension-ui.md` | `3c6f2c6edfc8b1ace6642343727aef97a7e9234c85509850921b52d6ff09a48e` |

The installed docs above were read completely. Findings below identify **source observations**, **runtime observations**, and **recommendations**. Declared tests were inspected, not run as complete upstream suites. Runtime checks use a scripted model and establish only the exercised host/UI behavior, not real-model judgment or general release compatibility.

### 2. Candidate discovery, addition, and selection

Discovery used the public GitHub API through `gh`, then npm registry metadata and selected tarballs downloaded and inspected in memory, without extraction or installation. Starting leads were installed Pi examples and Compound Engineering's explicit edlsh recommendation (`.references/customizations/EveryInc/compound-engineering-plugin/src/targets/pi.ts:29-36`). Repository searches were `pi-ask-user` and `pi questionnaire in:name,description`; README origin links led to rpiv. Unrelated questionnaire repositories were discarded. No stars were used to rank candidates.

#### Pi candidate inventory

All web metadata in this table was accessed on 2026-10-11; “selected” means selected for research, not adopted. GitHub pins are in frontmatter. MIT means a license file/package declaration was identified unless qualified explicitly.

| Candidate / canonical source | Status and evidence | Contribution / selection reason |
|---|---|---|
| [Pi `question` + `questionnaire`](https://github.com/earendil-works/pi/tree/b1a78306c9ed33165721c47e183d89e7002bd130/packages/coding-agent/examples/extensions) | Selected baseline; installed source and TUI observations; Pi MIT | Smallest native mechanisms; compare against production hardening needs |
| [edlsh/pi-ask-user](https://github.com/edlsh/pi-ask-user) / `pi-ask-user` | Selected, cloned; MIT; current Pi imports; tests; source TUI check | Most balanced choice/text/comment/batch/lifecycle candidate |
| [FadhelHaidar/pi-ask-user](https://github.com/FadhelHaidar/pi-ask-user) / `@fadhelhaidar/pi-ask-user` | Selected, cloned; MIT + origin NOTICE; current Pi imports; dedicated regression tests | Combined predefined/custom multi-answer and draft preservation |
| [mrclrchtr/supi](https://github.com/mrclrchtr/supi/tree/77f9caf12ba7b603306b8e175fcbbae8d8155046/packages/supi-ask-user) / `@mrclrchtr/supi-ask-user` | Selected, sparse checkout; MIT; current Pi imports; controller/UI tests; README calls SuPi pre-release | Stable identities, rich comments, deliberate unanswered state, lifecycle architecture |
| [jayshah5696/pi-agent-extensions](https://github.com/jayshah5696/pi-agent-extensions/tree/7f6a8488cbc505604ed993db5a0bb814e6f2be58/extensions/ask-user) | Selected, sparse checkout; MIT; current Pi imports; RPC/print tests | Minimal built-in dialogs and a contrasting file-based headless path |
| [jd-erreape/pi-questionnaire](https://github.com/jd-erreape/pi-questionnaire) | Screened via README, package, registration source; MIT; npm 0.1.0 maps to inspected commit | Required/optional questions, lock and RPC claims; legacy `@mariozechner` APIs and ignored execute signal warrant a compatibility/lifecycle spike; not an additional clone |
| [SakikoTogawa233/pi-question-tool](https://github.com/SakikoTogawa233/pi-question-tool) | Screened; MIT; npm 0.1.1 maps to inspected commit | Explicit packaging of official examples; deduplicated against the direct host baseline |
| [pi-vault/pi-questionnaire](https://github.com/pi-vault/pi-questionnaire) | Screened README/package metadata; MIT; npm 0.2.1 maps to inspected commit | Distinct `Chat about this` and note rows; custom multi-answer replaces selections; retain as discussion-UX reference, not deeply verified implementation |
| [juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono/tree/68d9a0014b70006d7b04b57933752338a2716db7/packages/rpiv-ask-user-question) | Screened origin/package; MIT; 2.12.0 | Parent of Fadhel's implementation; deduplicated and avoided extra monorepo/config dependencies |
| [kunkun9527/rpiv-ask-user-question-lean](https://github.com/kunkun9527/rpiv-ask-user-question-lean) | Screened package; MIT; 2.12.1 wrapper depends on rpiv 2.12.0 and i18n | Prompt-footprint optimization, not an independent UI/lifecycle architecture; advertised token savings not benchmarked |
| [Michaelliv/pi-ask-user-question](https://github.com/Michaelliv/pi-ask-user-question) | Screened README/tree; README claims MIT, no root license detected by GitHub; npm identity unresolved | Similar tabs/Other/multi-select; README says cancel aborts the turn, but runtime/source not deeply verified |
| [skidvis/pi-ask-user-question](https://github.com/skidvis/pi-ask-user-question) | Screened README/tree; legacy imports; license/package identity not established | Excluded as a decision-gate baseline: README explicitly lets the agent proceed with its best judgment after dismissal or absent UI |
| [Jabbslad/pi-ask-user](https://github.com/Jabbslad/pi-ask-user) | Screened tree/package; no root license detected; legacy imports; npm identity unresolved | Not shortlisted: weaker verified compatibility/license evidence than selected candidates; shared package name is not identity proof |

Search results also included AshesToAgents and weirongxu variants. They remained discovery-only leads, not evaluated implementations, because the selected sources already covered the principal mechanisms. This is a bounded search, not a claim that all alternatives are inferior.

The clone selection is deliberately complementary: full-featured native tool, combined-answer UX, structured form architecture, and primitive-dialog/headless contrast. `references.json` now lists those four. The fetch script's sparse checkout uses directory paths, so the two sparse entries contain only relevant directories; root metadata/license files remain available. Existing checkouts were not pulled.

#### Harness and authoring references

| Reference | Depth / role | Distinct evidence and reuse boundary |
|---|---|---|
| OpenCode 2.0.26 | Deep lifecycle comparison | Generic form service, validated replies, interrupt cancellation and typed settlement; MIT, but porting the Effect service stack is unnecessary |
| Codex | Focused protocol review | Stable question IDs, root-thread restriction, mode-dependent blocking; Apache-2.0; do not conflate this tool with its separate async-question features |
| Gemini CLI | Focused protocol review | Explicit choice/text/yesno types, answer-by-index protocol and distinct dismissed/empty-submitted states; Apache-2.0 |
| Mistral Vibe | Screened tool/model | Dedicated interaction request boundary and cancelled result; Apache-2.0; useful separation, not a Pi implementation to transplant |
| Kimi Code | Screened schema/prompt | Multi-select, answer-by-question-text and empty-answer/dismissal guidance; MIT; text identity is weaker than stable IDs |
| Qwen Code | Screened tool/UI | Claude-like 1–4 questions, 2–4 options, previews and answer mapping; Apache-2.0; largely duplicates selected questionnaire mechanisms |
| Crush | Screened tool instructions | Explicit yes/no versus A/B versus free-text distinctions and batch confirmation; **FSL-1.1-MIT**, not presently interchangeable with MIT. Use as behavior reference; copying needs license review |
| Claude plugin-dev | Public interface/authoring docs only | `AskUserQuestion`, automatic Other, multiple choice and multi-select; not evidence of closed Claude Code implementation internals |
| Compound Engineering, GSD, gstack, Matt Pocock | Question-authoring/workflow | Capability discovery, context preparation, numbered fallback, UTF-8, conversational escape, and reasons not to force pickers |

Sources: `.references/harnesses/anomalyco/opencode/packages/core/src/form.ts:81-236`; `.references/harnesses/openai/codex/codex-rs/core/src/tools/handlers/request_user_input.rs:65-102`; `.references/harnesses/google-gemini/gemini-cli/packages/core/src/tools/ask-user.ts:193-259`; `.references/harnesses/mistralai/mistral-vibe/vibe/questions.py:25-71`; `.references/harnesses/MoonshotAI/kimi-code/packages/agent-core-v2/src/agent/tools/ask-user-question/ask-user.md:1-21`; `.references/harnesses/QwenLM/qwen-code/packages/core/src/tools/askUserQuestion.ts:49-120`; `.references/harnesses/charmbracelet/crush/internal/agent/tools/question.md:1-98` and `LICENSE.md:1-9`.

### 3. Capability and answer-contract comparison

This matrix summarizes inspected source for selected implementations, except Gemini's types also use its tool documentation. It is not a runtime equivalence matrix. A slash means a genuinely different mechanism, not identical support.

| Implementation | Choice / multi | Free text | Choice + additional opinion | Batch/review | Answer identity | Dismissal / no UI |
|---|---|---|---|---|---|---|
| Pi `question` | Single only | Automatic Other, no text-only call | Alternative custom answer only | No | Label | Null answer / textual Error with null details |
| Pi `questionnaire` | Single per question | Other; zero-option text path via default Other | Alternative custom answer only | Tabs + Submit | Question ID, option value | Cancelled + partial details / textual Error |
| edlsh | Single + multi | Other or text-only | Optional selection comment; custom answer is a separate variant | 2–4 independent questions + review/skip confirmation | Titles and positional batch mapping | Cancelled / throws if no UI |
| Fadhel | Single + multi | Automatic custom row; choices still required | Multi selections **and** custom text; question/global notes | 1–4 + Submit | Question index, option labels | Decline envelope + partial details / error text with error details |
| SuPi | Single + multi | Explicit text question | Form/question/option comments; not an automatic Other choice | 1–10 + review/unanswered | Question ID + unique option value | Abort turn and throw / TUI-only registration and guard |
| jayshah | Single; interactive multi flag not implemented | Text-only or Other | Custom answer instead of choice | Sequential dialogs, no joint review | Question text, option label | Empty cancelled result / pending file |
| Codex | Mutually exclusive explicit choices | Automatic Other, non-empty options required | Inspecting full notes UX not in scope | Tool guidance prefers 1, at most 3; TUI batches | Stable question ID, answer strings | Cancelled request error / mode/root restrictions |
| Gemini | Choice/multi, text, yesno | Explicit text | Separate answer strings, not a rich comment contract | Multiple questions in dialog | Question-position keys | Distinct dismissed and empty-submitted messages / non-interactive policy denies tool |

Key source locations:
- Pi: `$PI_ROOT/examples/extensions/question.ts:17-70,218-281`; `questionnaire.ts:21-107,135-193,201-258,383-446`.
- edlsh: `.references/pi-packages/edlsh/pi-ask-user/index.ts:151-197,2574-2636,2698-2777,2820-3065`.
- Fadhel: `.references/pi-packages/FadhelHaidar/pi-ask-user/tool/types.ts:4-9,77-156`; `tool/response-envelope.ts:8-66`; `tests/ask-user-question-multi-custom.test.ts:45-178`.
- SuPi: `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/schema.ts:7-80`; `src/types.ts:39-119`; `src/tool/ask_user/execute.ts:26-82`.
- jayshah: `.references/pi-packages/jayshah5696/pi-agent-extensions/extensions/ask-user/tool.ts:9-107`; its README explicitly labels interactive multi-select deferred.
- Codex: `.references/harnesses/openai/codex/codex-rs/core/src/tools/handlers/request_user_input_spec.rs:16-75,96-113`.
- Gemini: `.references/harnesses/google-gemini/gemini-cli/docs/tools/ask-user.md:15-44`; `packages/core/src/tools/ask-user.ts:193-259`; `packages/core/src/policy/policies/non-interactive.toml:1-6`.

**Inference:** “Other feedback” is not one feature. It can be an alternative answer, an addition to checked choices, a comment qualifying a choice, feedback on an unselected choice, or a request to discuss before deciding. A tool with only an Other row cannot represent all of these without losing intent. The best reusable contract lesson is SuPi's separation of IDs from labels and of submitted decisions from discussion; the best supplemental-answer UX lesson is Fadhel's combined multi/custom behavior.

### 4. Waiting, cancellation, execution order, and cleanup

**Pi examples — source observations.** `question` is sequential, but both examples ignore their execute signal. Their custom components have no explicit abort listener. The questionnaire registration has no sequential declaration. Blank questionnaire text is converted to `(no response)`, and answers are keyed by ID in a Map without a duplicate-ID guard. An empty option list with Other disabled leaves selection code dereferencing a missing option. These last malformed-input paths were source findings, not executed failure tests. Neither example provides a bounded-height scrolling form or editor-focus forwarding.

Sources: `$PI_ROOT/examples/extensions/question.ts:42-86,210-247`; `questionnaire.ts:86-120,143-193,240-260,274-383`. Installed custom UI owns completion/disposal but does not automatically attach an execute signal: `$PI_ROOT/dist/modes/interactive/interactive-mode.js:2327-2393`.

**edlsh — source observations.** `runCustomPrompt` owns abort listener, timeout and terminal-input subscription; completion is idempotent and `finally` releases resources. Batches forward abort into one controller and share one deadline. `herdr:blocked` is cleared in `finally`. User cancellation and timeout both yield `cancelled: true`; their reason is not distinguished. The source has cancellation/fallback/late-answer tests, but this research did not execute that full suite.

Sources: `.references/pi-packages/edlsh/pi-ask-user/index.ts:2462-2568,2698-2777`; `index.test.ts:3198-3433,3711-3836`.

**SuPi — source observations.** A controller separates outcomes from internal cancel/abort. `openAskUserForm` uses a shared UI-runtime lock and releases it in `finally`. The component listens for abort, disposes listeners, and forwards editor focus. The tool boundary calls `ctx.abort()` and throws on cancellation, rather than emitting an answered form. Library-level form calls leave abort/persistence ownership to the caller. This reusable library surface is a checkout feature, not in published 8.0.1.

Sources: `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/form-api.ts:7-29,58-106`; `src/tool/ask_user/execute.ts:53-81`; `src/ui/form-component.ts:59-89,269-271,649`.

**Fadhel and jayshah — source observations.** Both implement useful UX/fallbacks but do not declare sequential execution or wire execute's signal through their dialogs. Fadhel removes its raw terminal listener in `finally`, but the custom session receives no abort signal. Its error/validation builders return objects without throwing or `isError: true`; on this host, an Error string alone is not a failed tool result. Jayshah similarly accepts a signal but discards it and returns a normal cancellation message.

Sources: `.references/pi-packages/FadhelHaidar/pi-ask-user/ask-user-question.ts:305-402`; `rpc-fallback.ts:40-46,106-123`; `tool/response-envelope.ts:60-66`; `.references/pi-packages/jayshah5696/pi-agent-extensions/extensions/ask-user/index.ts:49-95`; `$PI_ROOT/docs/extensions.md:138-146`.

**OpenCode — source observations.** Forms move from pending to answered/cancelled. Invalid replies and second settlements have typed errors. An interrupted waiter cancels the form; shutdown settles pending forms; answered/cancelled entries have a ten-minute cache retention while pending entries do not expire. The question tool treats dismissal without a message as control flow, and cancellation with a message as model-facing feedback. This is a useful lifecycle distinction, not a recommendation to port the service framework or its cache to Pi.

Sources: `.references/harnesses/anomalyco/opencode/packages/core/src/form.ts:8,90-112,153-163,180-236`; `packages/core/src/tool/plugin/question.ts:75-108`.

**Important limit:** sequential is not authorization. The installed agent loop makes the entire tool batch sequential if any call requests it, then executes calls in listed order. An edit listed before the question can still run first; a question's `terminate` is not a universal sibling-call permission barrier. The tool description should prohibit answer-dependent sibling calls, and actual dangerous-action authorization belongs to the appropriate workflow/permission layer. Evidence: installed sibling `@earendil-works/pi-agent-core/dist/agent-loop.js:366-410`; `$PI_ROOT/docs/extensions.md:140`; SuPi guidance `src/tool/ask_user/guidance.ts:7-13`.

**Recommendation:** make question execution sequential and model-only, own one active form, propagate abort to every wait, and define cancellation policy explicitly. Prefer stopping the current turn on whole-form cancellation, rather than leaving the model to infer authority. Treat skip/discussion as a separate submitted outcome; never auto-select the recommendation after dismissal.

### 5. Actual Pi TUI observations

Two offline faux-model runs loaded existing source only. No package was installed and no implementation was modified. Both used installed Pi 1.1.0, agent-tty 0.5.0, 120×40 terminal size, isolated agent/session/work directories, and disabled resource discovery. Korean strings below were intentional test data.

| Check | Observed result | Evidence |
|---|---|---|
| Pi questionnaire: focus Other, submit empty editor | Successful tool result stores `value: "(no response)"`, `wasCustom: true`, `cancelled: false` | `examples-run` session JSONL line 7; snapshot seq 52 |
| Pi question: choose Korean label | Question/description/label display; answer `기존 예제 수정` returned as selected label | JSONL line 11; open-dialog snapshot seq 72 |
| Pi question: Esc dismiss | Null answer and `isError: false`; automatic faux-model follow-up `CANCEL-FOLLOWUP-WAS-RUN` executes | JSONL line 15; snapshot seq 117 |
| edlsh source: two-question batch | Separate pages, review before submit; two selections returned in positional batch details | `edlsh-run` JSONL line 7; review snapshot seq 57 |
| edlsh source: 1,500 ms timeout | Tool settles in 1,502 ms, returns null response/cancelled; automatic follow-up runs | JSONL line 11; snapshot seq 193 |

Evidence root: `/tmp/pi-user-question-research-20261011/`.
- `examples-run/run.json`, `finish.json`, `logs/model-input.jsonl`; Pi session `01a12923-c1c8-7676-b271-d84c9e01037d`, JSONL `sessions/2026-10-11T04-06-11-656Z_01a12923-c1c8-7676-b271-d84c9e01037d.jsonl`, six model calls.
- `edlsh-run/run.json`, `finish.json`, `logs/model-input.jsonl`; Pi session `01a12924-7632-7760-bcf5-7b99bba3e3e6`, JSONL `sessions/2026-10-11T04-06-57-842Z_01a12924-7632-7760-bcf5-7b99bba3e3e6.jsonl`, four model calls.
- Both `finish.json` files report `piExited: true` and `ttySessionDestroyed: true`. Run directories are retained, temporary evidence, not permanent documentation assets.

The exact input scenarios are `scenario.json` and `edlsh-scenario.json` under that root. The tests establish basic compatibility of the inspected edlsh **source checkout**, not installation of npm 0.16.0, overlay behavior, or complete package validation. Korean display at 120 columns is not an IME, narrow-terminal, or resize test.

### 6. UI modes, persistence, and privacy

Pi distinguishes `ctx.mode === "tui"` from `ctx.hasUI`: RPC has UI for dialogs but `custom()` resolves undefined. RPC supports select, confirm, input **and editor**; a package's decision to use only input is its fallback design, not proof that the host cannot offer multiline text. Print/JSON have no UI. Evidence: `$PI_ROOT/docs/extensions.md:242-253`; `docs/rpc-extension-ui.md:3-29,89-102`.

- **edlsh:** choice-rich custom UI falls back to sequential native dialogs. Multi-select fallback accepts text selections; it is not checkbox-equivalent and does not validate them against stable option IDs. Single-select fallback sends option titles, omitting rich descriptions. No UI throws with a question/options message; README “graceful fallback” is not autonomous headless questioning. `.references/pi-packages/edlsh/pi-ask-user/index.ts:2305-2416,2716-2718,2978-2986`.
- **Fadhel:** RPC selects numbered labels or uses numbers/custom text. It has no batch review or notes on RPC, and previews are truncated in titles. No-UI tool reconciliation hides the tool, with an execute guard as a backstop. `.references/pi-packages/FadhelHaidar/pi-ask-user/docs/hosts.md:8-69`; `rpc-fallback.ts:106-200`; `reconcile.ts`.
- **SuPi:** the tool is registered only in TUI sessions, with an execution backstop. Its “headless TypeScript API” is a controller/library interface, not a non-interactive agent that can receive human answers. `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/ask-user.ts:37-57`; `src/tool/ask_user/execute.ts:44-48`; package README Public API section.
- **jayshah:** print/JSON writes `.pi/pending-questions.json`, with one fixed filename and session metadata, and tells the caller to rerun. This mutates the project directory, can overwrite another pending request, and is not a resumed suspended call. Its result renderer conflates cancelled and pending when answers are empty. `.references/pi-packages/jayshah5696/pi-agent-extensions/extensions/ask-user/modes/print.ts:23-62`; `index.ts:72-94,111-119`.

**Recommendation:** initial non-interactive behavior should be explicit unavailability, not an auto-answer or an implicit file write. RPC support can be a later mode adapter with declared capability differences; full TUI parity is not possible through existing primitive dialogs alone. Detached/subagent user-input routing needs its own protocol and approval; do not add it incidentally.

Pi tool-result `details` are for rendering/state reconstruction, whereas `content` is model-facing. The extension docs support `outputSchema`/`structuredContent` for data consumers; `details` alone is not the codemode result contract. Model-only exposure is appropriate for a user-question tool, not arbitrary nested script calls. Evidence: `$PI_ROOT/docs/extensions.md:146-164,188-193,222-235`.

**Privacy observations:** edlsh redacts answer bodies from events by default, but stores full answers in tool details. SuPi stores questions and answer/comment structures, limits its model-facing summary, and does not make a separate network request. Fadhel's cancellation preserves partial answers and global notes in details even while model content says declined. None of this is a secret-input facility; session data can outlive visible UI and tool expansion does not prevent model transmission. Sources: `.references/pi-packages/edlsh/pi-ask-user/index.ts:2645-2676`; `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/src/tool/ask_user/result.ts:21-67`; `.references/pi-packages/FadhelHaidar/pi-ask-user/tool/response-envelope.ts:17-25`.

**Recommendation:** persist the submitted prompt/answer context for faithful review, but do not treat unsent drafts or cancelled partial selections as decisions. Define whether cancelled drafts are retained at all. Do not solicit credentials through this tool, and do not broadcast answer bodies to all extensions by default. Compaction/replay is not a durable permission system.

### 7. Agent question preparation is a separate design layer

Primary authoring references give both positive patterns and reasons to avoid a picker:
- Anthropic plugin-dev describes complex choices, multi-select and preferences, with 2–4 choices, 1–4 questions and automatic Other. `.references/customizations/anthropics/claude-plugins-official/plugins/plugin-dev/skills/command-development/references/interactive-commands.md:1-66`.
- Compound Engineering's current skills discover the host capability from the tool list, do not probe a user-facing tool just to find it, and fall back to numbered chat only when necessary. Its portable standard uses at most three explicit options and no redundant Other because of Codex constraints. These are portability rules, not Pi UI hard limits. `.references/customizations/EveryInc/compound-engineering-plugin/skills/ce-plan/SKILL.md:25`; `skills/CODING_STANDARDS.md:22-26`.
- GSD favors concrete interpretations/examples, follows the user's thread, and switches back to plain chat when the user wants to explain freely. `.references/customizations/gsd-build/get-shit-done/get-shit-done/references/questioning.md:36-140`.
- Matt Pocock explicitly excludes native pickers for grilling because predetermined alternatives undermine open-ended questioning. `.references/customizations/mattpocock/skills/.out-of-scope/native-question-tool.md:1-17`.
- gstack stresses context/stakes and cautious retry only when the question could not have reached the user; its CJK guidance asks the model to emit literal UTF-8 rather than manually reconstructing codepoints. The document's examples are author claims, not our rendering experiment. `.references/customizations/garrytan/gstack/scripts/resolvers/preamble/generate-ask-user-format.ts:20-34`; `docs/askuserquestion-cjk.md:1-28`.

**Recommended tool guidance:** inspect facts first; ask only a material unresolved user choice; include concise context/trade-offs; separate independent axes; batch only independent questions; preserve a conversational escape; state the chosen result before acting. UI limits and reserved rows are enforced by code; do not rely solely on prose. A suggested option should be visibly recommended, not silently treated as accepted.

The edlsh package also installs an `ask-user` skill with mandatory decision-gate instructions. That is an additional policy surface, not just the tool implementation. Reusing its tool does not mean approving its broad gate triggers or repeated-question policy. Evidence: `.references/pi-packages/edlsh/pi-ask-user/package.json` (`pi.skills`); `skills/ask-user/SKILL.md:15-25,70-95,178-187`.

### 8. Artifact identity, maintenance, licenses, and compatibility

All four cloned candidates expose current `@earendil-works` imports, but the claim “compatible” is bounded: only the edlsh checkout received a real-host TUI check. Other candidates need runtime validation. Legacy `@mariozechner` and `@sinclair/typebox` references require actual loader checks; import names alone are neither proof of failure nor compatibility. edlsh's legacy TypeBox import loaded on this fork in the observed run.

GitHub repository metadata on 2026-10-11 showed recent pushes for selected candidates: edlsh Oct 10, Fadhel Oct 9, SuPi Oct 10, jayshah Sep 27; none was archived. These are activity signals, not quality guarantees. Relevant open edlsh issue/PR leads include #80 (both question forms), #81 (detail scrolling/previews/resizing), #60 (remote answers) and #79 (config). Open proposals are not implemented capability evidence. Fadhel #55/#56 concerned the TypeBox dependency boundary. No upstream fixes or PRs were sent.

The selected sources declare MIT. Preserve applicable copyright/license notices when copying, including Fadhel's rpiv attribution. Do not label Crush MIT merely because its license has a future MIT conversion. Missing license evidence on screened repositories blocks copy/reuse recommendations until clarified; README claims do not settle artifact identity.

Published tarball inspection revealed material version boundaries:

| Artifact | Evidence | Consequence |
|---|---|---|
| `pi-ask-user@0.16.0` | npm gitHead `adcc7b2…`; `index.ts` SHA-256 `16c8ae805470dd94537c3411be9450318eee60801f2b512ffe8abd3287260c6a`; direct diff with checkout | Same inspected file except checkout adds the four-line model-only declaration near line 2833. Do not claim npm already has that exposure restriction |
| `@fadhelhaidar/pi-ask-user@1.0.3` | Tarball `dist/index.js` SHA-256 `6aaac4703619b5220f3aa946f4443f901df2a56d7dc3de4f0315df1f020a2d49`; byte-equal to checkout's same file | Confirms this entry file, not every chunk or complete runtime equivalence |
| `@mrclrchtr/supi-ask-user@8.0.1` | Published schema/types/spec match checked source; published execute differs; no `src/form-api.ts` | Core contract/model-only/sequential metadata are shipped; the checkout's shared reusable form API is not yet in this artifact |
| `pi-ask-user-question@1.0.0` | npm has no repository/license metadata; gitHead `b77dc48…` differs from inspected repository HEADs; both Michaelliv and skidvis README use this package name | Published-to-repository identity remains unresolved. Do not recommend an install by the ambiguous name |

Tarball URLs: `https://registry.npmjs.org/pi-ask-user/-/pi-ask-user-0.16.0.tgz`, `https://registry.npmjs.org/@fadhelhaidar/pi-ask-user/-/pi-ask-user-1.0.3.tgz`, `https://registry.npmjs.org/@mrclrchtr/supi-ask-user/-/supi-ask-user-8.0.1.tgz`; accessed 2026-10-11. Registry source entries above identify the metadata used. Downloads were inspected in memory, not installed or extracted into the project.

Dependency/footprint observations:
- edlsh: no runtime dependency list, host peer libraries, one large source file plus layout module and bundled skill. Larger schema includes per-call UI preferences; convenience comes with model prompt surface.
- Fadhel: no runtime dependency list, optional i18n peer, shipped prebuilt chunks; numerous state/view/config modules and an external-editor path. More moving parts than the core need here.
- SuPi: `supi-core` workspace dependency and a larger structured form stack; public API reuse also requires selecting a checkout/release that actually exports it.
- jayshah: package registers many unrelated extensions/themes and has `acorn`/TypeBox dependencies. Its ask-user subdirectory is a useful mechanism reference; installing the whole collection is not a focused solution.

Sources: each selected `package.json`; `.references/pi-packages/FadhelHaidar/pi-ask-user/NOTICE.md:3-40`; `.references/pi-packages/mrclrchtr/supi/packages/supi-ask-user/README.md`; registry and GitHub metadata above. Full dependency audits and release reproducibility were not performed.

### 9. Pi implementation mapping and integration boundary

| Requirement | Public API / local integration | Finding |
|---|---|---|
| Agent-callable schema | `pi.registerTool`, TypeBox, runtime validation | Available; IDs/value uniqueness and incompatible modes need own validation |
| Focused interaction | `ctx.ui.custom` plus Pi Editor/selection/ScrollView components | Available; use native focus and width helpers |
| Basic RPC dialogs | `select`, `input`, `editor`, `confirm` | Available, but not full forms/checkboxes |
| Abort/cleanup | Execute signal, custom completion callback, component disposal, `finally` | Available; explicitly connect them |
| Concurrent-call control | Sequential tool, model-only exposure, active-form guard | Available, but not a permission barrier |
| Transcript fidelity | `content`, `details`, `renderCall`, `renderResult` | Available; result intent must match what the user submitted |
| Structured consumers | `outputSchema` + `structuredContent` | Available if needed; does not justify allowing codemode to open questions |
| Session replay | Branch tool details / custom entries | Available; restarting a pending questionnaire is a separate unsolved feature |
| Availability during planning | `extensions/plan-mode/tools.ts:37-48` | Explicit local policy needed; none of the four reviewed registrations declares `readOnlyHint` |

The plan-mode extension retains read-only-annotated tools or configured extras. Simply registering a question tool does not ensure it stays available while planning. The future implementation must choose either an explicit local question-capability allowance/config entry or an honestly justified annotation; do not mark the jayshah pending-file writer read-only. SuPi/Fadhel availability hooks also merit testing with other extensions that change active tools so they do not undo an intentional loadout.

Recommendations, not adopted design:
- Start with one model-facing tool, not several aliases registering equivalent questions.
- Keep labels/context from the model and user UI preferences in separate surfaces. Avoid exposing every keyboard/layout option to the model unless there is an actual per-question use case.
- Use stable question IDs and option values, concise label/description/context, and explicit choice/text question modes. Prefer a provider-compatible external schema and validate internally; do not assume nested unions behave identically across providers. edlsh documents and tests proxy schema problems: `.references/pi-packages/edlsh/pi-ask-user/index.ts:2821-2825`; `index.test.ts:2760-2935`.
- Support single choice, multi-select, free text/Other, and a separate comment. A small independent-question batch with review is useful; exact limits and whether custom text supplements multi-select remain product choices.
- Represent outcomes such as submitted, needs discussion, cancelled, aborted, and unavailable distinctly. For submitted responses, preserve selected values, custom text, and comments separately. This is a contract sketch, not the final schema.
- Validate duplicate IDs/values, blank required text, malformed options, size bounds, and reserved UI rows before opening a dialog. Do not synthesize an answer string for a blank input.
- Use scrollable bounded content, literal UTF-8, `visibleWidth`/wrapping helpers, focus propagation for IME, and configurable keybindings. Test regular/fullscreen, terminal resize and short screens, not just wide static snapshots. Host requirements: `$PI_ROOT/docs/tui.md:20-30,40-50,113-121`.
- Treat terminal control sequences and large model strings as untrusted display data. The reviewed implementations are not evidence of a complete escape-sequence security audit.
- Keep plan approval in `enter_plan_mode`/`exit_plan_mode`; a preference form is not a replacement for approval of executable scope.

A local extension would likely live under `extensions/ask-user/` with schema/normalization, UI/controller, execution/result, and entrypoint modules, plus focused unit/integration/TUI checks and a narrowly scoped plan-mode integration change. This is an estimated implementation shape only. No such files were created.

### 10. Alternatives and recommended next decision

| Alternative | Benefits | Costs / constraints | Research recommendation |
|---|---|---|---|
| Adopt edlsh package unchanged | Broad functionality, inspected lifecycle tests, no UI rewrite | Published release lacks model-only; title-based answer identity; cancellation permits follow-up; bundled skill changes policy; plan-mode availability still separate | Best candidate for a bounded reuse spike, not unconditional adoption |
| Adapt an example/permitted package | Native extension, control contract/UX and packaging | Own validation, lifecycle and future maintenance; preserve license notices | Preferred route if stable IDs and explicit cancellation semantics are requirements |
| Write local tool with basic dialogs | Small code surface and native RPC pathway | Weak multi-select/review/context UX unless extended; custom text and comments require multiple stages | Viable intentionally minimal design, not equivalent to a rich form |
| Adapt SuPi/rpiv wholesale | Rich forms, comments/combined answers | More dependencies/modules, pre-release/checkout surfaces, lifecycle gaps in rpiv-derived candidate | Use selected mechanisms rather than automatic full-stack copying |
| Change Pi core | Could add native structured RPC form capability | Larger scope and maintenance; not necessary for TUI tool | Not justified now; revisit only for a concrete cross-client requirement |

**Recommendation:** choose a local extension if the purpose is a controlled pi-personal capability with stable answer semantics, separate feedback, reliable cancellation, and predictable planning availability. Use **edlsh for waiting/UI/fallback patterns, SuPi for schema/result/lifecycle architecture, and Fadhel for combined custom-answer UX**. If those semantics can be accepted as shipped instead, evaluate a pinned edlsh artifact first to avoid unnecessary custom maintenance. Neither path has been selected or approved for implementation.

## Open questions and proposed verification

### User-owned choices still open

1. Adopt a package, adapt its code, or build a local extension? Name/API compatibility (`ask_user`, `questionnaire`, etc.) should follow this choice.
2. Does “other opinion” need alternative custom answers, selection-plus-custom, comments, or all three?
3. Should whole-form dismissal stop the turn, or return cancelled and allow an explanatory follow-up? Recommendation: stop; discussion is a distinct intentional outcome.
4. Is batching required initially, what limit is appropriate, and should unanswered questions be allowed to submit for discussion?
5. Should recommendations only be marked or also be preselected? Avoid equating an untouched default with approval.
6. Is TUI-only enough initially? RPC/native-form parity, detached routing, and resumable pending questionnaires remain unapproved scope.
7. What transcript/draft retention and output-size limits should apply? Secret input is not a supported purpose.
8. Should availability during planning use a local capability allowance, explicit extra-tool configuration, or an annotation? Existing approval tools remain unchanged.

### Follow-up checks before shipping

- Pin the actual reuse artifact and verify package manifest, entrypoints, release/source equality, notices, and installed-host imports; do not rely on a HEAD README for npm behavior.
- Unit tests: schema bounds, uniqueness, blank text, combined answer/comment intent, cancellation/discussion distinctions, no-UI errors, and faithful summary/details.
- Lifecycle tests: pre-aborted signals; abort during each UI stage; late results; timeout; one-active-form guard; finally cleanup; no blocked-state/listener leaks; no answer-dependent sibling mutation.
- Mode tests: tool exposure in TUI/RPC/print/JSON; RPC descriptions and multiline input; unavailable UI is not decline; no implicit pending-file writes.
- TUI checks: select/custom/comment/multi-select; batch review/edit; Back versus Cancel; Korean IME focus, Unicode width, narrow/short terminal, resize, multiline paste, scrolling, regular/fullscreen, overlay visibility after inline images.
- Integration: plan/build transition tool visibility, intentional tool disabling, transcript expansion, branch restore, compaction, and subagent calls refusing or routing without hanging.
- A real-model usability check requires separate approval and must test the actual external schema/instructions; faux UI success is insufficient evidence of model behavior.

Not verified in this research: full upstream suites, runtime behavior of Fadhel/SuPi/jayshah, npm installation, RPC end-to-end, malformed-input crashes, custom-answer supplementation in the live UI, IME, narrow/short/resize scenarios, restore/compaction, overlay/image interaction, and live model/provider schema acceptance. These limits do not prevent reference selection, but they prevent a production-readiness claim.

## References

- Primary installed documentation: `$PI_ROOT/docs/{extensions,tui,rpc-extension-ui}.md`; examples and source hashes in Finding 1.
- Selected external repositories and commits: frontmatter; exact source paths are cited in Findings 2–9.
- Public GitHub/npm discovery and artifact sources: frontmatter and Findings 2/8. Volatile release/activity facts were accessed on 2026-10-11.
- Runtime evidence: `/tmp/pi-user-question-research-20261011/{examples-run,edlsh-run}/` with scenarios, session JSONL, model-input logs, and cleanup records.
- Implementation-context source: `extensions/plan-mode/tools.ts`; approved research plan `~/.pi/plans/20261011-130058-zesty-sparrow.md`.
