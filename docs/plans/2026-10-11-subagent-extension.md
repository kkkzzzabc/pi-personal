---
title: Subagent extension (reviewer and explorer)
date: 2026-10-11
session: 01a128d8-5cfb-767b-ad59-fc905ec35d3a
based_on:
  - docs/research/2026-10-11-pi-subagents.md
  - docs/research/2026-10-11-pi-durable-subagent.md
  - docs/research/2026-10-11-code-review-in-agent-customization.md
  - docs/spikes/2026-10-11-sdk-child-session-from-extension.md
  - docs/spikes/2026-10-11-pi-subagent-for-review.md
---

# Subagent extension (reviewer and explorer)

## Goal

Add a `subagent` tool to pi as a pi-personal extension. The tool lets the
parent delegate bounded, read-only work to two roles:

- `reviewer`: independently reviews a diff, plan, or document;
- `explorer`: quickly maps the relevant code and reports where things are.

Each child runs as an in-process pi `AgentSession` created through public
SDK exports. It starts with fresh context, has a read-only tool allowlist,
cannot delegate further, and returns its final text as the tool result.
The parent can run several children in parallel within one tool call and
stays the only decision maker.

This is the first, foreground-only version. It also serves as the shared
base for later background execution and writer roles. It requires no
changes to the pi fork.

## Non-goals

- Background or detached execution, completion wake-ups, and a run list UI.
  See "Next steps" for when this is revisited.
- Writer roles (`worker`), web research (`researcher`), and forked-context
  roles (`oracle`).
- Forked context, workflow scripts, sequential chains inside one call,
  worktrees, missions, and schedules.
- Nested delegation, a child-to-parent question channel, steering of a
  running child, and acceptance gates.
- User or project agent discovery. The two roles ship with the extension;
  only their model can be configured.
- A loader tool that delays exposing `subagent`.
- Model scope enforcement and automatic model fallback.
- Review autofix and review-fix loops.
- Persisting child transcripts. Only each child's final output is saved
  (S14).

## Design

### 1. Decisions

The pi-subagents column records the reference package's choice
(`docs/research/2026-10-11-pi-subagents.md`, v0.77.0).

| # | Topic | Decision | pi-subagents | Basis |
|---|---|---|---|---|
| S1 | Roles | `reviewer` and `explorer` | Seven builtin roles, including `reviewer` and `scout` | Recipes and issues center on read-only review and recon (research findings 12-13); this repository's review research |
| S2 | Mechanism | Child is an in-process `AgentSession` from `createAgentSession`; foreground only | Same mechanism; also background in a detached runner | SDK spike; pi-subagents moved from `pi` processes to sessions (launch overhead 3.5 s and 240 MB down to 5-31 ms, issue #1844) |
| S3 | Location | `extensions/subagent/` in pi-personal; no fork change | Separate pi package | SDK spike: public exports suffice |
| S4 | Child tools | `explorer`: `read, grep, find, ls`. `reviewer`: the same plus `review_diff` (S9). No `bash`, `edit`, `write`, or `subagent` | `scout` has `bash` and `write`; `reviewer` has read tools plus `watchdog_diff` | Reviewer spike (bash breaks read-only); structural recursion denial; Claude Code's Explore once wrote unwanted files |
| S5 | Child resources | No extensions, skills, prompt templates, or themes (the extension's own inline child tool excepted) | Foreground children load no ambient extensions | SDK spike; avoids shared extension module state |
| S6 | Context files | `reviewer`: the context files the parent actually received (from `before_agent_start` `systemPromptOptions.contextFiles`) without the global one from the agent dir; when none were recorded yet, discover project files. `explorer`: none; the parent puts needed context in the task | Per-role `inheritProjectContext` (builtins `true`), `inheritGlobalContext: false`; children ignore the parent's `--no-context-files` (inferred) | Repository rules are review criteria; following the parent respects `-nc` and other extensions' filters; exploration needs no rules, and parent workflow rules are noise for a frequently launched role |
| S7 | System prompt | Role prompt from the role's Markdown body replaces pi's base prompt; the child boundary text is part of each role prompt | Same (`systemPromptMode: replace`), with the boundary appended by a hook | No prompt hook needed |
| S8 | Context | Fresh only; the task must be self-contained | Fresh or fork; `reviewer` defaults to fresh | Fresh context is the review consensus |
| S9 | Review target | `review_diff` shows the working tree against HEAD at child launch. Committed ranges, plans, and documents are passed as file paths in the task | Same split (`watchdog_diff` plus supplied artifacts) | Common case needs no parent preparation; read-only is preserved |
| S10 | Model | Per-call `model`, then `~/.pi/agent/subagent.json` role model, then the parent's current model; a `:level` suffix sets thinking | Settings-based `agentOverrides`, provider-scoped overrides, `modelScope` | Same pattern as `plan-mode.json`; no key conflict with pi-subagents |
| S11 | Providers | Copy the parent's registered providers into the child runtime through `ctx.modelRegistry` | Same | SDK spike |
| S12 | Runtime sharing | One child `ModelRuntime` per parent session, created on first launch and reused; providers registered later are copied at each launch; dropped on `session_shutdown` | Same sharing for foreground children | Fewer credential stores; no refresh races among parallel children |
| S13 | Parallel | `tasks: [{ agent, task, model? }]`, up to 4, run concurrently | Up to 8 tasks, concurrency 4 | Narrowed |
| S14 | Result | Save each child's full final text to a file. Return the first 2,000 characters (cut at a line end when possible) plus the path, size, and line count. Role prompts ask for concise, evidence-backed output | Same 2,000-character preview plus file path | No information loss; small parent context with 3-4 parallel reviewers |
| S15 | Abort | The tool's `signal` aborts every running child; children are always disposed | Same | SDK spike (abort settled in about 10 ms) |
| S16 | Invocation | `explorer`: the parent may use it on its own judgment for broad exploration of unfamiliar code or to save context, not for one or two file lookups, and must verify cited `file:line` before acting on them. `reviewer`: only when the user or applicable instructions ask. The tool is always active | Every role only on request; `subagent` exposed through the `subagents_enable` loader by default | Explore agents are model-initiated in Claude Code, Kimi Code, and Mistral Vibe; reviews cost more and lead to decisions |
| S17 | Plan mode | Mark the tool `annotations.readOnlyHint: true` so plan mode keeps it | No integration with this plan mode; capability ceilings exist for parent-imposed limits | Both roles are read-only |
| S18 | Progress | `onUpdate` shows per-child state (running, current tool, done, failed); simple `renderCall`/`renderResult` | Live cards, FleetView | pi subagent example; foreground UX |

### 2. Tool interface

```ts
subagent({ agent: "reviewer" | "explorer", task: string, model?: string })
subagent({ tasks: [{ agent, task, model? }, ...] })   // 1-4 items, parallel
```

- Exactly one of `agent`+`task` or `tasks` is required.
- An unknown role or model fails before any child starts and lists the
  valid choices.
- The result text lists each child as a section: role, model, and status,
  then the output preview and output file reference (S14).
- `details` holds per child: role, model, status, duration, tool-call
  count, usage, output file path, and an error if any.
- The description and prompt guidelines state the invocation rules of S16
  and the review-target rules of S9.

### 3. Role definitions

Roles are Markdown files under `extensions/subagent/agents/`, with
frontmatter (`name`, `description`) and a body used as the system prompt.
They are parsed with pi's exported `parseFrontmatter`. Tools are fixed by
the extension (S4), not by the files.

- **reviewer:**
  - Reviews the target named in the task: `review_diff` for uncommitted
    work, or the supplied files for committed ranges, plans, and documents.
  - Cites `file:line` with evidence for each finding.
  - Labels findings P0/P1/P2 and ends with a merge verdict.
  - Zero findings is a valid result.
  - Never edits.
- **explorer:**
  - Answers "where and how" questions about the code.
  - Reports relevant files, entry points, data flow, and risks with
    `file:line`.
  - Stays within the paths and question given.

Both prompts state that the child is not the orchestrator, must not try to
delegate, must keep the final answer concise and evidence-backed, and must
finish with a final answer.

### 4. `review_diff` child tool

The extension registers this tool only in reviewer children, through an
inline extension factory. It is modeled on pi-subagents' `watchdog_diff`.

- **Baseline.** The repository root and HEAD are captured when the child
  launches. Outside a Git repository, or without HEAD, the tool reports
  that no diff is available.
- **Output.** Shows `git diff` of staged and unstaged changes against the
  baseline, plus up to 50 untracked file paths (inspected with `read`).
  Edits by other sessions in the same checkout also appear.
- **Parameters.** Only two:
  - `path`: a relative path inside the repository. Values starting with
    `-`, absolute paths, and paths containing `..` are rejected.
  - `stat`: return per-file counts only.
- **Bounds.** Output is capped at 24,000 characters, with a hint to
  narrow `path`.
- **Committed changes are unsupported.** If HEAD moves during the
  review, the tool says to relaunch the reviewer or supply a diff file.
- Git runs with fixed arguments through `execFile`, never through a
  shell.

### 5. Child launch

Per child:

1. Resolve the model (S10) against the shared child runtime (S11, S12).
2. Build a `DefaultResourceLoader` with the following options, then call
   `reload()`:
   - `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`;
   - `systemPrompt: <role body>`;
   - `agentsFilesOverride` per S6: for reviewer, the parent's recorded
     context files minus the agent dir's global file; for explorer, none;
   - for reviewer, `extensionFactories` with the `review_diff` tool.
3. Call `createAgentSession` with the role's tools (S4),
   `SessionManager.inMemory(cwd)`, and the resolved model and thinking
   level. Then call `bindExtensions({ mode: "print" })`.
4. Subscribe to session events for progress (S18), then call
   `prompt("Task: " + task)`.
5. Extract the last non-error assistant text, save it, and build the
   preview (S14). Call `dispose()` in `finally`.

**Output files.** They are written under
`<parent session file without .jsonl>/subagents/<timestamp>-<role>-<n>.md`.
Without a persisted parent session, they go under a per-process directory
in the OS temp directory.

### 6. Configuration

The configuration file is optional: `~/.pi/agent/subagent.json`. Without
it, children use the parent's model.

```json
{ "agents": { "reviewer": { "model": "provider/id:high" }, "explorer": { "model": "provider/id:low" } } }
```

An invalid file is a load error shown once. It does not fall back
silently. A cheap model is recommended for `explorer`, because the parent
may invoke it on its own (S16).

### 7. `/review` prompt template

`prompts/review.md` (Phase 3). An optional argument names the target path
or focus.

1. Identify the target:
   - uncommitted work by default;
   - otherwise the files, diff file, or plan named in the argument.
2. Launch 2-3 reviewers with distinct angles in one `tasks` call.
   Typical angles are correctness and regressions, tests and validation,
   and simplicity, adapted to the change.
3. Verify each finding against the cited code and synthesize the results
   into fixes worth doing now, optional improvements, and feedback to
   ignore with a reason.
4. Ask the user before applying anything.

There is no autofix mode and no review loop.

### 8. Layout

```text
extensions/subagent/
├── index.ts        # Tool registration, schema, rendering
├── runner.ts       # Child runtime, launch, result extraction and saving, abort
├── review-diff.ts  # review_diff child tool
├── agents.ts       # Role file loading
├── config.ts       # Optional config
└── agents/
    ├── reviewer.md
    └── explorer.md
prompts/
└── review.md       # Phase 3
tests/
├── subagent.test.mjs              # Unit: config, role parsing, params, preview/output files, review_diff
└── subagent.integration.test.mjs  # Host: faux-provider child runs against the installed pi
```

## Phases

### Phase 1: Single child

- Changes:
  - `runner.ts`, `review-diff.ts`, `agents.ts`, `config.ts`, and both
    role files.
  - A `subagent` tool supporting `agent`+`task`, with abort, provider
    copying, the shared runtime, output files, and previews.
- Verify (automated): `npm test` and `npm run test:integration` with the
  new tests.
  - **Unit:** `review_diff` against a temporary Git repository, covering
    staged, unstaged, and untracked changes, path rejection, the cap, a
    moved HEAD, and a non-Git directory.
  - **Faux-provider integration:**
    - each role has exactly its tools, and `edit` and `bash` fail;
    - the preview and output file are correct for long output;
    - abort stops the child;
    - an unknown role or model fails before launch.
- Verify (manual, tui-check faux mode):
  - the parent's tools and transcript are unchanged;
  - the child system prompt contains the role prompt and the project
    `AGENTS.md` but not the global one;
  - the tool stays available in plan mode.

### Phase 2: Parallel tasks and progress

- Changes:
  - the `tasks` parameter (1-4 concurrent), per-child progress through
    `onUpdate`, and `renderCall`/`renderResult`;
  - per-role context files (S6): record the parent's context files in
    `before_agent_start`; reviewer uses them minus the global file;
    explorer gets none.
- Verify (automated):
  - integration test with two children, where one fails and the other
    succeeds. Both sections and both output files are present, and an
    abort stops both;
  - reviewer receives the parent's project context file and not the
    global one; with a parent that has no context files, reviewer gets
    none; explorer never gets context files.
- Verify (manual, tui-check): progress lines update per child; Esc aborts
  all children.

### Phase 3: `/review`, documentation, and real-model check

- Changes:
  - the `prompts/review.md` template (section 7);
  - a README section.
- Verify (manual, tui-check faux mode): `/review` launches parallel
  reviewers and ends with a question to the user, not with edits.
- Verify (manual, real model, needs approval):
  - one `/review` run and one explorer run on this repository;
  - record the model, cost, whether the parent used explorer
    appropriately, and other observations.

## Verification evidence

Session `01a128d8-5cfb-767b-ad59-fc905ec35d3a`. pi 1.1.0, local fork
release `b1a78306c-docs-20261011-190847`.

### Automated tests

- `npm test`: 150 tests. `npm run test:integration`: 20 tests against
  the installed pi with a faux provider.
- Covered:
  - role tool sets, with `edit` and `bash` failing in children;
  - context files per role, including a `--no-context-files` parent;
  - `review_diff` against temporary Git repositories;
  - previews and output files;
  - parallel success and failure, progress updates, abort of every child,
    and rejection of unknown models before launch;
  - loading and expanding `/review`.

### tui-check faux runs

- `/tmp/subagent-p1/run`:
  - the parent's tools and transcript were unchanged;
  - the tool stayed active in plan mode;
  - the output file was saved next to the session.
- `/tmp/subagent-p2/run`: parallel call and result rows rendered,
  collapsed to three lines, and expanded with Ctrl+O.
- Faux limitation: the tui-check faux model queues one response at a
  time, so concurrent children can get "No more faux responses queued".
  This affects only harness scenarios with parallel children.

### Real-model run

Run `/tmp/subagent-p3/run`, model `anthropic/claude-sonnet-5-5`,
thinking low, `--context-files`, one session.

- **Fixture.** A small Git repository. `AGENTS.md` requires argument
  validation and forbids mutating inputs. An uncommitted change adds
  `median` and `range` with four planted defects: input mutation,
  lexicographic sort, wrong even-length median, and missing validation.
- **`/review`.**
  - The parent checked the diff with `bash`, then launched two reviewers
    in one `tasks` call: correctness, and `AGENTS.md` compliance plus
    tests.
  - Both reviewers found all four defects with `file:line` and evidence
    (7.1 s and 9.6 s).
  - The parent verified the findings against the diff and reported fixes
    worth doing now, optional items, and the verdict BLOCK.
  - It ended with "Which fixes should I apply?" and made no edits.
- **Unprompted question** ("Which functions validate their input?"). The
  parent read the two small files itself and did not delegate, which
  matches S16 for a tiny repository.
- **Explicit explorer request.** One explorer child, 2 tool calls, 5.9 s.
  The parent summarized with `file:line`, relying on files it had read
  earlier in the session.
- **Esc during `/review`.** Live progress rows showed both reviewers
  running. Esc stopped both after 1.7 s (`aborted`).
- **Cost.** About $0.050 for the parent (footer) and about $0.048 for
  the children (from tool details); about $0.10 in total. The footer
  does not include child usage.
- **After the run.** The work tree was unchanged, and `configChanges`
  was empty.

**Not established:** the parent's explorer judgment on a large
repository, behavior with other models, and token refresh under
concurrent children.

## Risks and open questions

- **Credentials.** The shared child runtime has its own credential store
  over the same `auth.json` as the parent. Concurrent token refresh was not
  tested (SDK spike). Revisit if refresh errors appear; a fork API to share
  the parent runtime is the fallback.
- **Provider gaps.** Virtual models registered by extensions cannot be
  copied (no getter). A role configured with one fails with a clear error.
- **Context-file snapshot.** Reviewers get the context files as the parent
  loaded them at session start. Edits to `AGENTS.md` during the session
  reach neither the parent nor reviewers until reload.
- **Unprompted explorer use.** The parent may call `explorer` too often or
  for trivial lookups. Watch this in Phase 3. If it happens, tighten the
  guidelines or add a per-role policy setting.
- **Shared checkout.** `review_diff` includes edits by other sessions in
  the same checkout, which reviewers may mistake for the target change.
- **Output files.** Files under the parent session directory accumulate.
  No cleanup is planned for the first version.
- **Writer roles.** Adding a writer role later makes `readOnlyHint: true`
  (S17) incorrect. At that point, split the tool or block writers in plan
  mode.

## Next steps (not part of this plan)

Tracked in the [project backlog](../backlog/).

- **Selected follow-up:** [Explorer fallback and four-model review](2026-10-11-subagent-model-fallback.md)
  (BL-012). Explorer fallback is separate from the Opus 5.5 / Sol 6.1 / Grok 4.7 /
  GLM 5.3 parallel review roster. Failed review slots are disclosed, not replaced;
  successful partial results are retained. Implementation and offline verification
  are complete; see the follow-up's [evidence](2026-10-11-subagent-model-fallback.md#verification-evidence).
  Live user settings were not changed. Original scope/verification remain historical.

- **Accepted design follow-up:** [Two-model review](2026-10-11-two-model-review.md)
  (BL-7g5t) recommends Opus + Sol without optional expansion. It proposes explicit
  2–4 model roster support while preserving existing four-entry configurations.
  BL-5fng implementation and offline verification are complete; the user separately
  authorized the global two-model roster application. See the follow-up's
  [evidence](2026-10-11-two-model-review.md#subsequent-implementation-and-configuration-evidence).
  Running-parent reload remains unverified; historical evidence above is preserved.

- **Candidate next plan:** background execution together with a `worker`
  role (BL-007). The issue survey shows async use mainly for workers.
- **Trigger:** observed need during real use, such as waiting blocking the
  conversation or long-running tasks.
- **Approach:** decide then between in-process background and a detached
  runner.
- **Other candidates:**
  - a read-only Git history tool for `explorer` (BL-009);
  - output-file retention (BL-010);
  - concurrent requests in the tui-check faux model (BL-008);
  - per-role invocation settings. This one is not registered; it is
    covered by the risk "Unprompted explorer use".

## Amendments

### 2026-10-11 — Per-role context files
- Change: S6 changed from "project context files for both roles" to
  "reviewer: the parent's recorded context files without the global one;
  explorer: none". Phase 2 includes the change and its tests. The
  context-file filter risk was replaced by the snapshot risk.
- Reason: The Phase 1 TUI check showed that children loaded the project
  `AGENTS.md` even when the parent ran with `--no-context-files`.
  Context files mix code rules, which help reviews, with parent workflow
  rules, which are noise for exploration.
- Impact: Reviewers follow the parent's context files, including `-nc` and
  other extensions' filters. Explorers get only the task text. The Phase 1
  implementation (both roles discover project files) changes in Phase 2.
- Evidence: tui-check run `/tmp/subagent-p1/run` (parent system prompt
  without the project marker); a loader check showed the global file is
  loaded by default and removed by the filter.

### 2026-10-11 — Record verification evidence
- Change: Added the "Verification evidence" section covering the
  automated tests, the faux TUI runs, and the real-model run with
  `anthropic/claude-sonnet-5-5`.
- Reason: Phase 3 asks to record the model, cost, explorer use, and
  observations.
- Impact: Establishes the reviewer, explorer, parallel, and abort behavior
  on one real model. The limits are listed in the section.
- Evidence: tui-check runs `/tmp/subagent-p1/run`, `/tmp/subagent-p2/run`,
  and `/tmp/subagent-p3/run`.

### 2026-10-11 — Link the model-fallback follow-up
- Change: Added the BL-012 follow-up plan link and its documentation-only approval
  boundary to the next steps.
- Reason: The user selected a separate feature for model-unavailability fallback,
  which the original implementation excluded.
- Impact: Readers can find the proposed fallback design without mistaking it for
  behavior implemented or verified by this original plan. Historical scope and
  verification remain unchanged.
- Evidence: [Model-fallback plan](2026-10-11-subagent-model-fallback.md), pi session
  `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Clarify separate exploration and review model policies
- Change: Updated the BL-012 follow-up description to distinguish explorer fallback
  from four-model review, including partial results without slot replacement.
- Reason: The user selected all four review models to avoid same-parent-model
  reviewers; the review roster is not a fallback priority list.
- Impact: The linked follow-up now includes `/review` model assignment. Original
  S10, prompt behavior, and verification remain historical records of the baseline;
  no new behavior is claimed to be implemented.
- Evidence: [Revised follow-up plan](2026-10-11-subagent-model-fallback.md), pi session
  `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Correct the follow-up GLM version
- Change: Corrected the follow-up roster description to GLM 5.3.
- Reason: The user clarified the intended model version.
- Impact: The description matches BL-012 and its revised plan; original
  implementation and verification evidence remain unchanged.
- Evidence: [Follow-up plan](2026-10-11-subagent-model-fallback.md), pi session
  `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Link completed follow-up evidence
- Change: Updated the BL-012 follow-up to link implemented fallback/roster evidence.
- Reason: The user approved implementation and offline verification, now complete.
- Impact: Readers can distinguish the original no-fallback build from the verified
  follow-up without rewriting earlier scope, prompt, or experimental results.
  Live settings and real-model access remain outside that completed scope.
- Evidence: [Follow-up verification](2026-10-11-subagent-model-fallback.md#verification-evidence),
  pi session `01a1299f-d4ab-70ab-a076-0e49632aada5`.

### 2026-10-11 — Link the accepted two-model review design
- Change: Added the Opus + Sol design follow-up and separate implementation
  candidate without rewriting original or four-model verification history.
- Reason: The user chose two reviewers only, excluding optional expansion.
- Impact: The follow-up relaxes the fixed-four constraint with backward
  compatibility. Subsequent authorized implementation and global configuration
  application are complete; running-parent reload remains unverified.
- Evidence: [Two-model design](2026-10-11-two-model-review.md), pi session
  `01a12b28-32f7-7547-a484-43de317df55b`.
