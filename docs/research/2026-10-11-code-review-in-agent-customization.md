---
title: How coding-agent customizations handle code review
date: 2026-10-11
session: 01a126e5-63ba-72b8-af15-e9d632953a12
based_on:
  - docs/research/2026-10-11-coding-agent-customization-landscape.md
# All clones are shallow (--depth 1), so tags are unavailable; version is
# "HEAD" unless the commit carries a tag.
sources:
  - repo: obra/superpowers
    path: .references/customizations/obra/superpowers
    version: v7.0.0
    commit: bb92a77
  - repo: mattpocock/skills
    path: .references/customizations/mattpocock/skills
    version: HEAD
    commit: 49dd158
  - repo: addyosmani/agent-skills
    path: .references/customizations/addyosmani/agent-skills
    version: HEAD
    commit: 1be8e34
  - repo: garrytan/gstack
    path: .references/customizations/garrytan/gstack
    version: HEAD
    commit: 20eb620
  - repo: cursor/plugins (pstack, sparse checkout)
    path: .references/customizations/cursor/plugins
    version: HEAD
    commit: d73344b
  - repo: EveryInc/compound-engineering-plugin
    path: .references/customizations/EveryInc/compound-engineering-plugin
    version: HEAD
    commit: 51aa537
  - repo: affaan-m/ECC
    path: .references/customizations/affaan-m/ECC
    version: HEAD
    commit: 4eb71d9
  - repo: anthropics/claude-plugins-official
    path: .references/customizations/anthropics/claude-plugins-official
    version: HEAD
    commit: b8e53f1
  - repo: github/spec-kit
    path: .references/customizations/github/spec-kit
    version: HEAD
    commit: "0443760"
  - repo: Fission-AI/OpenSpec
    path: .references/customizations/Fission-AI/OpenSpec
    version: HEAD
    commit: 9111a76
  - repo: gsd-build/get-shit-done
    path: .references/customizations/gsd-build/get-shit-done
    version: HEAD
    commit: bdcaab2
  - repo: bmad-code-org/BMAD-METHOD
    path: .references/customizations/bmad-code-org/BMAD-METHOD
    version: HEAD
    commit: bda3c59
  - repo: eyaltoledano/claude-task-master
    path: .references/customizations/eyaltoledano/claude-task-master
    version: HEAD
    commit: c0c98d3
  - repo: SuperClaude-Org/SuperClaude_Framework
    path: .references/customizations/SuperClaude-Org/SuperClaude_Framework
    version: HEAD
    commit: fe68862
  - repo: wshobson/agents
    path: .references/customizations/wshobson/agents
    version: HEAD
    commit: 46891e7
  - repo: anthropics/skills
    path: .references/customizations/anthropics/skills
    version: HEAD
    commit: dbd4588
---

# How coding-agent customizations handle code review

## Scope

Input for designing a personal code-review skill for pi. Compares how 16
customization projects from the landscape survey review code: when review
runs, who reviews, against what, how false positives are filtered, and what
happens to findings. Covers the Stack, SDD framework, Skill library, and
Marketplace entries likely to contain review; behavior packs and curated
lists are excluded. Depth: the review skill, command, and agent files and
their direct references, not the surrounding tooling.

Paths below are relative to `.references/customizations/`.

This work also introduces **harness**: the coding agent itself (Claude Code,
Codex, OpenCode, pi), as opposed to a customization installed on top of it.
Reference repositories are split along this line (`harnesses/` and
`customizations/`) because the distinction is stable, unlike the bundle
types, which may be reclassified.

## Summary

- 11 of 16 projects ship a real code-review procedure. anthropics/skills has
  none; Task Master only has a `review` status; SuperClaude has a four-question
  self-check; spec-kit and OpenSpec review artifacts and spec conformance
  rather than code quality.
- **Fresh context is the consensus.** Every serious design reviews in a
  subagent that does not see the authoring session. Several also forbid the
  reviewer from spawning further reviewers, after real runaway fan-out.
- **Diversity comes from three sources**: different lenses (specialist
  personas), different axes (spec vs standards), or different models
  (pstack, gstack + Codex, compound-engineering, GSD).
- **False-positive control is the main engineering effort.** Approaches:
  confidence scores with a cutoff (Anthropic: drop < 80), proof requirements
  for high severity (ECC), a separate verification/triage pass that re-reads
  the code (BMAD, compound-engineering, pstack lead judgment), and explicit
  false-positive catalogs.
- **Two stances on finding counts.** ECC and compound-engineering say zero
  findings is a valid result; BMAD's Blind Hunter must produce a minimum
  number and relies on triage to discard noise.
- **What happens after review splits three ways**: report-only (pstack,
  compound-engineering default, mattpocock), fix-first with an
  AUTO-FIX/ASK split (gstack), or a bounded fix-and-re-review loop
  (superpowers 5 rounds, gstack 3 cycles, GSD 3 iterations).
- **Re-running never converges by itself** (mattpocock's own docs). Loops
  need a cap and a stop condition.

## Questions

1. When does review run, and who triggers it?
2. Who reviews, and how is the reviewer kept independent?
3. What is the change reviewed against?
4. How are findings filtered and false positives controlled?
5. What is the output, and what happens to findings?
6. What should a personal review skill for pi take from this?

## Findings

### Per-project overview

| Project | Entry point | Reviewer setup | Reviewed against | After review |
|---|---|---|---|---|
| superpowers | `requesting-code-review`, automatic in subagent-driven development | One fresh subagent; task review per task + final branch review | Plan/requirements + quality checklist | Fix loop, max 5 rounds; `receiving-code-review` governs response |
| mattpocock | `/code-review` | Two parallel subagents: Standards, Spec | Repo standards + Fowler smell baseline; originating spec/issue | Report only, two separate blocks |
| addyosmani | `/review`; `/ship` fan-out | One `code-reviewer` persona; `/ship` adds security + test personas in parallel | Five axes; spec | Verdict APPROVE / REQUEST CHANGES |
| gstack | `/review` (pre-landing) | Core pass + specialist "Review Army" + always-on adversarial subagent + optional Codex | Checklist, specialists, Greptile comments | Fix-first: AUTO-FIX vs ASK; max 3 cycles; logged |
| pstack | `/interrogate` (manual only) | One reviewer per configured model, same prompt | Stated intent + rubric | Lead judgment into 4 buckets; never auto-applies |
| compound-engineering | `ce-code-review` | Depth gate (lite/focused/full); persona roster; cross-model peer; validator | Intent, plan, standards files, past learnings | Report-only unless `apply:local`; P0–P3 |
| ECC | `/code-review`, `/review-pr`, `/orch-review`; `code-reviewer` agent | Single agent; or per-dimension fan-out with adversarial verify | Severity checklist + project guidelines | APPROVE / REQUEST CHANGES / BLOCK; can post to PR |
| Anthropic code-review | `/code-review` on a PR | 5 parallel Sonnet reviewers + Haiku scorer per issue | CLAUDE.md, bugs, git history, prior PRs, code comments | Comment on PR; issues scored < 80 dropped |
| Anthropic pr-review-toolkit | `/review-pr [aspects]` | Specialist agents chosen by what changed | Per-aspect | Critical / Important / Suggestions |
| BMAD | `bmad-code-review` (quick / thorough) | Independent lenses: Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment | Plan acceptance criteria, agent instruction files | Triage: verify, then patch / decision_needed / defer |
| GSD | `/gsd:code-review <phase>`; `/gsd:review` | `gsd-code-reviewer` at quick/standard/deep; external CLIs for plan review | Phase files | REVIEW.md; `--fix --auto` loop, max 3 |
| wshobson | `/full-review` | Phased parallel pairs (quality+architecture, security+performance, …) | Per phase | User checkpoints between phases |
| OpenSpec | `/opsx:verify` | The agent itself | Spec deltas, tasks, design | CRITICAL / WARNING / SUGGESTION; archive readiness |
| spec-kit | `/analyze`, `/converge` | The agent itself | spec.md, plan.md, tasks.md | Consistency report; new tasks |
| SuperClaude | `self-review` agent | The agent | Four self-check questions | Checklist report |
| Task Master | `to-review` | — | — | Sets status `review` |

### 1. When review runs

- **Manual command** is the common default: mattpocock, addyosmani `/review`,
  gstack `/review`, ECC, BMAD, Anthropic plugins, wshobson.
- **Built into an execution loop.** superpowers makes review mandatory after
  each task, after a major feature, and before merge
  (`obra/superpowers/skills/requesting-code-review/SKILL.md:14`), and
  subagent-driven development never skips the task review
  (`obra/superpowers/skills/subagent-driven-development/SKILL.md:308`).
  mattpocock's `implement` calls `code-review` as its closing step
  (`mattpocock/skills/docs/engineering/code-review.md:95`).
- **Explicitly manual only.** pstack's `interrogate` sets
  `disable-model-invocation: true`
  (`cursor/plugins/pstack/skills/interrogate/SKILL.md:4`) and its router uses
  it for contested design before shipping
  (`cursor/plugins/pstack/skills/poteto-mode/SKILL.md:24`).
- **Proactive by description.** ECC's agent says "MUST BE USED for all code
  changes" (`affaan-m/ECC/agents/code-reviewer.md:3`); gstack suggests review
  when the user is about to merge (`garrytan/gstack/review/SKILL.md.tmpl:5-9`).
- **Per task vs end of branch.** mattpocock leaves the choice open and
  recommends per ticket plus one final pass
  (`mattpocock/skills/docs/engineering/code-review.md:67`); superpowers does
  both by design.
- **No hook-triggered review** was found; ECC's `hooks/hooks.json` has no
  review entry.

### 2. Who reviews

**Isolation.** Reviewing in a fresh context is near-universal:

- superpowers: the reviewer gets "precisely crafted context … never your
  session's history" (`obra/superpowers/skills/requesting-code-review/SKILL.md:8`).
- mattpocock: "Same context reviewing itself isn't review, it's confirmation
  bias" (`mattpocock/skills/docs/engineering/code-review.md:63`).
- gstack specialists each get fresh context
  (`garrytan/gstack/review/sections/review-army.md:75`), but gstack notes
  that a fresh subagent is "the same harness, not an independent model"
  (`garrytan/gstack/review/sections/adversarial.md:94`).
- BMAD lenses are "context-free subagents"
  (`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/customize.toml:68-75`).

**No recursive reviewers.** superpowers forbids the reviewer from spawning
subagents (`obra/superpowers/skills/requesting-code-review/code-reviewer.md:54`);
BMAD lens prompts say the same. mattpocock documents the failure this
prevents: sub-agents re-invoking `/code-review`, one report reaching more than
50 agents (`mattpocock/skills/docs/engineering/code-review.md:59`).
addyosmani keeps orchestration in commands, not personas
(`addyosmani/agent-skills/agents/code-reviewer.md:102`).

**Read-only reviewers.** superpowers requires a read-only review and a
separate worktree for other revisions
(`obra/superpowers/skills/requesting-code-review/code-reviewer.md:50`);
pstack spawns reviewers with `readonly: true`
(`cursor/plugins/pstack/skills/interrogate/SKILL.md:46`).

**Sources of diversity:**

| Source | Examples |
|---|---|
| Separate axes | mattpocock Standards vs Spec, never merged or reranked (`mattpocock/skills/skills/engineering/code-review/SKILL.md:76`, `:82`) |
| Specialist lenses | gstack Review Army (always-on testing and maintainability for 50+ lines, conditional security, performance, migration, API, design, simplification; `garrytan/gstack/review/sections/review-army.md:42`); compound-engineering persona catalog; Anthropic pr-review-toolkit; BMAD lenses; wshobson phases |
| Different models | pstack: "The adversarial signal comes from model diversity, not assigned personas" (`cursor/plugins/pstack/skills/interrogate/SKILL.md:9`); gstack Codex pass (`garrytan/gstack/review/sections/adversarial.md:109`); compound-engineering cross-model peer (`EveryInc/compound-engineering-plugin/skills/ce-code-review/SKILL.md:31`); GSD external CLIs for plans (`gsd-build/get-shit-done/commands/gsd/review.md:15`); addyosmani multi-model pattern (`addyosmani/agent-skills/skills/code-review-and-quality/SKILL.md:207`) |
| Adversarial stance | gstack always-on adversarial subagent (`garrytan/gstack/review/sections/adversarial.md:3`); BMAD Blind Hunter; compound-engineering adversarial persona for 50+ lines or risky surfaces (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/persona-catalog.md:38`) |

**Cost control.** Fan-out is gated by size or risk: addyosmani skips `/ship`
fan-out only for ≤2 files, <50 lines, and no auth/payments/data/config
(`addyosmani/agent-skills/.claude/commands/ship.md:72`); gstack skips
specialists under 50 lines (`garrytan/gstack/review/sections/review-army.md:46`)
and auto-gates specialists with zero findings in 10+ runs, except security and
data migration (`:56`); compound-engineering has a lite/focused/full depth
gate (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/depth-paths.md:5`,
`:20`); GSD offers quick/standard/deep (`gsd-build/get-shit-done/commands/gsd/code-review.md:4`).
Anthropic uses cheap Haiku agents for eligibility, file discovery, and scoring
and Sonnet for review
(`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:11-20`).

### 3. What the change is reviewed against

- **Intent first.** pstack states the intent in one paragraph before
  spawning reviewers and asks the user if unsure
  (`cursor/plugins/pstack/skills/interrogate/SKILL.md:23`). BMAD's Intent
  Alignment lens enumerates defensible readings of the intent and checks
  which one the diff implements
  (`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/customize.toml:117`).
- **Spec as vision, not exhaustive list.** superpowers: where the spec is
  silent, a reasonable user's expectation is a requirement
  (`obra/superpowers/skills/requesting-code-review/code-reviewer.md:33`), and
  the reviewer must list what it declined to judge (`:43`).
- **Repo standards override generic rules.** mattpocock reads documented
  standards and falls back to 12 Fowler smells, always labelled as judgement
  calls; "The repo overrides" (`mattpocock/skills/skills/engineering/code-review/SKILL.md:38-40`).
  Anthropic's first reviewer audits CLAUDE.md compliance, and the scorer
  double-checks that CLAUDE.md actually says it
  (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:14-20`).
- **History and prior feedback.** Anthropic reviewers read git blame and
  comments on earlier PRs touching the same files (`:14`). gstack triages
  Greptile bot comments (`garrytan/gstack/review/SKILL.md.tmpl:61`).
  compound-engineering has a `previous-comments` persona and a `learnings`
  persona that searches the team's solutions corpus
  (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/persona-catalog.md:25`).
  gstack searches and logs learnings around each review
  (`garrytan/gstack/review/SKILL.md.tmpl:146`, `:414`).
- **Tests as evidence.** addyosmani reviews tests first and checks them by
  mutation: invert a condition, run the suite, and report a mutation that
  stays green (`addyosmani/agent-skills/skills/code-review-and-quality/SKILL.md:152-164`).
  ECC runs typecheck, lint, test, and build in PR mode
  (`affaan-m/ECC/commands/code-review.md:138`); Anthropic explicitly does not,
  leaving that to CI
  (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:46`).
- **SDD frameworks review artifacts.** OpenSpec reviews the plan before code
  and the code against the plan with `/opsx:verify`
  (`Fission-AI/OpenSpec/docs/reviewing-changes.md:7`), along completeness,
  correctness, and coherence
  (`Fission-AI/OpenSpec/src/core/templates/workflows/verify-change.ts:60`).
  spec-kit's `/analyze` checks consistency across spec, plan, and tasks
  (`github/spec-kit/templates/commands/analyze.md:2`) and `/converge` turns
  unbuilt work into tasks (`github/spec-kit/templates/commands/converge.md:2`).
  Neither has a product-level code-quality review (spec-kit's
  `.github/skills/code-review` is for its own repository).

### 4. Filtering findings and controlling false positives

| Mechanism | Where |
|---|---|
| Confidence score with cutoff | Anthropic: separate Haiku agent scores each issue 0–100 with a verbatim rubric; drop < 80 (`anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:20`, `:26`). ECC: report only when >80% confident (`affaan-m/ECC/agents/code-reviewer.md:29`). gstack: 1–10 calibration, 5–6 shown with a caveat (`garrytan/gstack/review/SKILL.md:739`) |
| Proof requirements | ECC pre-report gate (exact line, concrete failure mode, context read, defensible severity) and HIGH/CRITICAL require snippet, scenario, and why guards miss it (`affaan-m/ECC/agents/code-reviewer.md:39`, `:55`). gstack "Verification of claims" (`garrytan/gstack/review/SKILL.md.tmpl:301`) |
| Separate verification pass | BMAD triage ignores reviewer severity, re-reads the code, and assigns high / medium / low / false / maybe-false (`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/step-03-triage.md:15-21`). compound-engineering runs a validator batch (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/finish-input.md:86`) |
| Lead judgment | pstack: the parent is a pragmatic lead, not a neutral aggregator; buckets Act on / Consider / Noted / Dismissed (`cursor/plugins/pstack/skills/interrogate/SKILL.md:68`); filters nitpick gravity, hypothetical vs actual, "I would have done it differently" (`cursor/plugins/pstack/skills/interrogate/references/lead-judgment.md:18-22`); more than 5 Act-on items means not filtering hard enough (`:56`) |
| Consensus signal | pstack: findings from 2+ models are highest signal (`cursor/plugins/pstack/skills/interrogate/SKILL.md:63`). compound-engineering promotes confidence only when the peer is verified independent (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/depth-paths.md:28`) |
| False-positive catalogs | Anthropic list (pre-existing issues, linter-catchable, unmodified lines; `anthropics/claude-plugins-official/plugins/code-review/commands/code-review.md:33`). ECC "Common False Positives" (`affaan-m/ECC/agents/code-reviewer.md:76`) |
| Root-cause grouping | BMAD groups survivors only when the same defect produced them (`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/step-03-triage.md:35`) |
| Transparency of rejections | pstack's Dismissed section is "a trust mechanism" (`cursor/plugins/pstack/skills/interrogate/references/lead-judgment.md:58`). BMAD keeps every verdict and its evidence |

**Two stances on finding counts.** ECC: "It is acceptable and expected to
return zero findings" (`affaan-m/ECC/agents/code-reviewer.md:66`);
compound-engineering: "An adequate change needs no findings"
(`EveryInc/compound-engineering-plugin/skills/ce-code-review/SKILL.md:9`). BMAD's Blind
Hunter must find at least `min(floor(sqrt(kB)+1), 10)` issues
(`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/customize.toml:75`) and
relies on triage to reject them. GSD warns reviewers against downgrading
BLOCKERs to seem less harsh (`gsd-build/get-shit-done/agents/gsd-code-reviewer.md:29`).

**Reviewer output is a hypothesis.** mattpocock: findings must carry a
citation so they are checkable; do not act without checking
(`mattpocock/skills/docs/engineering/code-review.md:71`).

### 5. Output and what happens to findings

**Severity scales vary:**

| Scale | Projects |
|---|---|
| Critical / Important / Minor (+ strengths) | superpowers, Anthropic pr-review-toolkit |
| Critical / Required / Optional / Nit / FYI | addyosmani (its `/review` command still says Critical / Important / Suggestion, `addyosmani/agent-skills/.claude/commands/review.md:15`, vs `addyosmani/agent-skills/agents/code-reviewer.md:51`) |
| CRITICAL / HIGH / MEDIUM / LOW | ECC, wshobson |
| CRITICAL / INFORMATIONAL + confidence | gstack |
| P0–P3, after Google's "improve code health" bar | compound-engineering (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/action-class-rubric.md:28`) |
| Verdict buckets instead of severity | pstack (act on / consider / noted / dismissed); BMAD (patch / decision_needed / defer) |

**Verdicts.** superpowers: Ready to merge? Yes / No / With fixes
(`obra/superpowers/skills/requesting-code-review/code-reviewer.md:133`);
ECC: APPROVE / REQUEST CHANGES / BLOCK (`affaan-m/ECC/commands/code-review.md:173`).
mattpocock refuses a single verdict across axes.

**What happens next:**

- **Report only.** pstack: "Do NOT auto-apply changes"
  (`cursor/plugins/pstack/skills/interrogate/SKILL.md:11`). compound-engineering:
  report-only by default, never pushes, never asks blocking questions
  (`EveryInc/compound-engineering-plugin/skills/ce-code-review/SKILL.md:37-38`).
- **Fix-first with a split.** gstack auto-fixes mechanical findings and batches
  the rest into one question (`garrytan/gstack/review/SKILL.md.tmpl:225-254`);
  the heuristic: if a senior engineer would apply it without discussion, it is
  AUTO-FIX; security, races, design, >20-line fixes, and user-visible changes
  are ASK (`garrytan/gstack/review/checklist.md:147`). compound-engineering
  classifies findings as `gated_auto` / `manual` / `advisory` but leaves the
  decision to the caller (`EveryInc/compound-engineering-plugin/skills/ce-code-review/references/action-class-rubric.md:7`).
  BMAD routes to `patch` only when the fix is unambiguous and adds no public
  surface (`bmad-code-org/BMAD-METHOD/skills/bmad-code-review/step-03-triage.md:38`).
- **Bounded loops.** superpowers: up to 5 fix rounds, switching to a fresh,
  more capable implementer from round 4
  (`obra/superpowers/skills/subagent-driven-development/SKILL.md:75`). gstack:
  at most 3 fix cycles, then persists `converged:false`
  (`garrytan/gstack/review/SKILL.md.tmpl:336`). GSD: `--fix --auto`, capped at
  3 iterations (`gsd-build/get-shit-done/commands/gsd/code-review.md:4`).
- **Human checkpoints.** wshobson stops for approval between phases
  (`wshobson/agents/plugins/comprehensive-review/commands/full-review.md:14`).
- **Receiving review.** superpowers is the only project with a skill for the
  author's side: verify before implementing, no performative agreement, push
  back with evidence, YAGNI-check "implement properly" suggestions
  (`obra/superpowers/skills/receiving-code-review/SKILL.md:14`, `:88`).
- **Persistence.** gstack logs each review with a binding to the reviewed
  snapshot; GSD writes REVIEW.md; compound-engineering writes run artifacts;
  Anthropic and ECC can post to the PR.

**Convergence.** mattpocock: "Do not run it in a loop until it comes back
clean, because it never will" (`mattpocock/skills/docs/engineering/code-review.md:75`).
It also reviews only committed work (`<fixed-point>...HEAD`, `:79`), and its
skill name collides with Claude Code's built-in `/code-review` (`:50`).

### 6. Implications for a personal review skill on pi

Design choices the survey supports, with the projects that motivate them:

1. **Review in a fresh subagent, read-only, with no further delegation**
   (superpowers, mattpocock, BMAD). Put the no-recursion rule in the
   reviewer prompt itself.
2. **State the intent and the base before reviewing**; fail early on a bad
   ref or empty diff (pstack, mattpocock). Decide whether uncommitted work is
   in scope; mattpocock's three-dot diff silently excludes it.
3. **Keep spec conformance and code quality as separate outputs**
   (mattpocock), so one cannot mask the other.
4. **Let repo instructions override the generic rubric** (`AGENTS.md`;
   mattpocock, Anthropic).
5. **Require evidence per finding** (file:line, concrete failure path) and
   allow zero findings (ECC, gstack, compound-engineering).
6. **Verify findings in a second step** before showing them: the parent, with
   full context, re-reads the code and dismisses with a reason (pstack lead
   judgment, BMAD triage). Show dismissed items.
7. **Use model diversity when cheap.** pi can switch providers, which makes a
   pstack-style second model natural; use agreement as signal.
8. **Gate cost by size and risk** rather than always fanning out (gstack,
   addyosmani, compound-engineering).
9. **Default to report-only**; if fixing is added, split mechanical from
   judgement fixes (gstack) and cap loops (3–5 rounds).
10. **Avoid name collisions** with built-in commands (mattpocock).

Choosing among these, and how much of gstack/compound-engineering's
machinery is worth it for one person, belongs in a plan document.

## Open questions

- Pi reviewer execution feasibility is now covered by
  [the child-process spike](../spikes/2026-10-11-pi-subagent-for-review.md) and
  [the corrected-fork Claude follow-up](../spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md).
  Those experiments establish tested execution conditions, not review quality
  or a final skill design; provider, model, reviewer count, and output choices
  remain undecided.
- Whether a cross-model pass is worth its cost for routine reviews; could be
  measured on a few real diffs.
- Claude Code's built-in `/code-review` (mentioned by mattpocock) was not
  compared; it lives in the harness, not in these repositories.
- ECC's `orch-review` workflow and gstack's specialist prompts were read only
  at the entry-point level.

## References

- Entry files read per project (paths relative to `.references/customizations/`):
  - `obra/superpowers/skills/{requesting-code-review,receiving-code-review,subagent-driven-development}/`
  - `mattpocock/skills/skills/engineering/code-review/SKILL.md`, `mattpocock/skills/docs/engineering/code-review.md`
  - `addyosmani/agent-skills/skills/code-review-and-quality/SKILL.md`, `agents/code-reviewer.md`, `.claude/commands/{review,ship}.md`
  - `garrytan/gstack/review/` (`SKILL.md.tmpl`, `checklist.md`, `sections/`)
  - `cursor/plugins/pstack/skills/interrogate/`, `skills/poteto-mode/SKILL.md`
  - `EveryInc/compound-engineering-plugin/skills/ce-code-review/`
  - `affaan-m/ECC/agents/code-reviewer.md`, `commands/{code-review,orch-review}.md`
  - `anthropics/claude-plugins-official/plugins/{code-review,pr-review-toolkit}/`
  - `bmad-code-org/BMAD-METHOD/skills/bmad-code-review/`
  - `gsd-build/get-shit-done/commands/gsd/{code-review,review}.md`, `agents/gsd-code-reviewer.md`
  - `wshobson/agents/plugins/comprehensive-review/commands/full-review.md`
  - `Fission-AI/OpenSpec/docs/reviewing-changes.md`, `src/core/templates/workflows/verify-change.ts`
  - `github/spec-kit/templates/commands/{analyze,converge,checklist}.md`
  - `eyaltoledano/claude-task-master/packages/claude-code-plugin/commands/to-review.md`
  - `SuperClaude-Org/SuperClaude_Framework/src/superclaude/agents/self-review.md`

## Amendments

### 2026-10-11 — Connect reviewer feasibility to completed experiments
- Change: Replaced the unresolved feasibility prompt with links to the
  child-process experiment and corrected-fork Claude follow-up.
- Reason: The requested feasibility work was subsequently performed.
- Impact: Readers need not repeat it merely because this survey listed it as
  open; review-quality evaluation and personal skill design remain unresolved.
- Evidence: [Reviewer feasibility](../spikes/2026-10-11-pi-subagent-for-review.md)
  and [Claude follow-up](../spikes/2026-10-11-claude-reviewer-after-docs-fallback-removal.md).
