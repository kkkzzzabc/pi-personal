---
title: Coding-agent customization landscape
date: 2026-10-11
session: 01a126e5-63ba-72b8-af15-e9d632953a12
based_on: []
# Web research, not code under .references/. Each source pins the repo URL
# and the HEAD commit observed on the access date instead of a local path.
sources:
  - repo: garrytan/gstack
    url: https://github.com/garrytan/gstack
    commit: 20eb620
    accessed: 2026-10-11
  - repo: cursor/plugins (pstack)
    url: https://github.com/cursor/plugins/tree/main/pstack
    commit: d73344b
    accessed: 2026-10-11
  - repo: mattpocock/skills
    url: https://github.com/mattpocock/skills
    commit: 49dd158
    accessed: 2026-10-11
  - repo: addyosmani/agent-skills
    url: https://github.com/addyosmani/agent-skills
    commit: 1be8e34
    accessed: 2026-10-11
  - repo: obra/superpowers
    url: https://github.com/obra/superpowers
    commit: bb92a77
    accessed: 2026-10-11
  - repo: affaan-m/ECC
    url: https://github.com/affaan-m/ECC
    commit: 4eb71d9
    accessed: 2026-10-11
  - repo: EveryInc/compound-engineering-plugin
    url: https://github.com/EveryInc/compound-engineering-plugin
    commit: 51aa537
    accessed: 2026-10-11
---

# Coding-agent customization landscape

## Scope

A survey of the 30 best-known public projects that customize coding agents
(Claude Code, Codex, Cursor, OpenCode, pi, and others), started from the
examples gstack, pstack, Matt Pocock's skills, and Addy Osmani's agent-skills.

The informal label "stack" turned out to cover very different things, so this
document also defines a vocabulary to separate them. The terms are indexed in
`docs/glossary.md`; this document holds the reasoning.

In scope: installable or reusable customization for general software
engineering, plus the curated lists people use to find it. Out of scope:
domain-only skills (SEO, design, security, science, marketing), desktop apps
and GUIs around agents, standalone MCP servers, and general agent frameworks
(LangChain, Dify). Depth: README-level review, not source code review.

## Summary

- "Stack" should name only one kind of project: an opinionated set of
  **interdependent** skills/commands forming an end-to-end workflow (gstack,
  pstack, superpowers, addyosmani/agent-skills, ECC, compound-engineering).
- Matt Pocock's skills are explicitly **not** a stack: the README argues
  against process-owning frameworks and presents small, composable skills.
- Spec-driven development (SDD) frameworks (spec-kit, OpenSpec, GSD, BMAD)
  form a separate category: they are organized around artifacts (spec, plan,
  tasks) and usually ship a CLI.
- Several of the most-starred projects are single-file or single-skill
  **behavior packs** (karpathy-skills, ponytail, caveman).
- Agent Skills (`SKILL.md`) has become the common unit: most projects install
  into many harnesses, and pi is now a common target (superpowers, pstack ports).
- pstack's origin is Lauren Tan's Cursor plugin at `cursor/plugins/pstack`;
  every standalone `pstack` repo is a port or mirror.
- Star counts are very large and were not checked for authenticity.

## Questions

1. Which customization projects are best known?
2. What should "stack" mean, and what are the other categories?
3. What patterns are common across them?
4. What is worth bringing into this project (pi-personal)?

## Findings

### 1. Vocabulary

Two levels: **units** are the file formats an agent loads; **bundle types**
classify a project by how its units relate.

Units:

| Term | Definition |
|---|---|
| Rules / instructions | Always-loaded guidance file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`). |
| Skill | Procedure document loaded on demand (`SKILL.md`, Agent Skills format). |
| Command | User-invoked prompt (`/review`). |
| Subagent | Role definition run with its own context. |
| Hook | Code run on a harness event. |
| Plugin / package | Distribution unit that installs a set of the above. |

Bundle types and the questions that decide them:

| Type | Decision rule |
|---|---|
| Stack | Installable; units call or route to each other to form an end-to-end workflow; reflects one author's or team's method. |
| Skill library | Installable; units are independent and picked à la carte. |
| SDD framework | Process organized around written artifacts (spec → plan → tasks), usually with a CLI; harness-agnostic. |
| Behavior pack | One rules file or one skill that changes how the agent works across all tasks. |
| Harness extension | Ships runtime code beyond prompts (orchestration, proxies, tools) that changes how the agent runs. |
| Marketplace / catalog | Installable units from many authors, gathered for discovery and installation. |
| Curated list | Links only; nothing to install. |

When a project fits two types, it is classified by its primary purpose and
the overlap is noted.

### 2. The 30 projects

Stars were read from each repository page on 2026-10-11.

| # | Project | Type | Stars | Notes |
|---|---|---|---|---|
| 1 | obra/superpowers | Stack | 297k | Brainstorm → spec → plan → subagent-driven TDD; skills trigger automatically. |
| 2 | mattpocock/skills | Skill library | 284k | "Small, easy to adapt, and composable"; positions itself against GSD/BMAD/Spec-Kit. |
| 3 | affaan-m/ECC | Stack | 276k | Formerly everything-claude-code. plan → test → implement → review → verify → remember → improve. Overlaps harness extension (hooks, memory, security scanning). |
| 4 | multica-ai/andrej-karpathy-skills | Behavior pack | 218k | A single `CLAUDE.md`. |
| 5 | anthropics/skills | Skill library | 180k | Anthropic's public Agent Skills. |
| 6 | DietrichGebert/ponytail | Behavior pack | 160k | Minimal-code persona skill. |
| 7 | github/spec-kit | SDD framework | 141k | GitHub's SDD toolkit. |
| 8 | garrytan/gstack | Stack | 136k | Role-based tools (CEO, eng manager, designer, reviewer, QA, security). |
| 9 | JuliusBrussee/caveman | Behavior pack | 111k | Terse-output skill; also ships a proxy (harness extension overlap). |
| 10 | addyosmani/agent-skills | Stack | 104k | Define → plan → build → verify → review → ship; 9 lifecycle commands activate skills. |
| 11 | ComposioHQ/awesome-claude-skills | Curated list | 77k | |
| 12 | ruvnet/ruflo | Harness extension | 74k | Formerly claude-flow; multi-agent swarms. |
| 13 | Fission-AI/OpenSpec | SDD framework | 72k | |
| 14 | code-yeongyu/oh-my-openagent | Harness extension | 70k | Formerly oh-my-opencode. |
| 15 | gsd-build/get-shit-done | SDD framework | 64k | Meta-prompting and context engineering. |
| 16 | hesreallyhim/awesome-claude-code | Curated list | 55k | |
| 17 | bmad-code-org/BMAD-METHOD | SDD framework | 54k | Agile, role-based agents. |
| 18 | PatrickJS/awesome-cursorrules | Curated list | 41k | Cursor rules files. |
| 19 | wshobson/agents | Marketplace | 40k | Multi-harness plugin marketplace. |
| 20 | anthropics/claude-plugins-official | Marketplace | 38k | Official Claude Code plugin directory. |
| 21 | VoltAgent/awesome-agent-skills | Curated list | 35k | 1000+ skills listed. |
| 22 | davila7/claude-code-templates | Marketplace | 33k | Template CLI plus monitoring. |
| 23 | vercel-labs/agent-skills | Skill library | 32k | |
| 24 | eyaltoledano/claude-task-master | SDD framework | 28k | Task decomposition and tracking. |
| 25 | openai/skills | Skill library | 28k | Codex skills catalog. |
| 26 | OthmanAdi/planning-with-files | Behavior pack | 27k | File-based persistent planning. |
| 27 | VoltAgent/awesome-claude-code-subagents | Marketplace | 26k | 100+ subagents. |
| 28 | EveryInc/compound-engineering-plugin | Stack | 25k | 36 skills; brainstorm → plan → build → review → capture learnings. |
| 29 | SuperClaude-Org/SuperClaude_Framework | Stack (inferred) | 24k | Commands, personas, and methodology; README not reviewed. |
| 30 | pstack (cursor/plugins/pstack) | Stack | 10.7k* | Lauren Tan (@poteto). Ports: michael-denyer/pstack-claude (1.8k, includes pi), backnotprop/pstack (1.5k mirror), ericlitman/open-pstack. |

\* Stars of the whole `cursor/plugins` repository, not pstack alone.

Count by type: Stack 7, SDD framework 5, Skill library 4, Behavior pack 4,
Marketplace 4, Curated list 4, Harness extension 2.

Near misses: automazeio/ccpm (8.4k), tw93/Waza (7.2k), steipete/agent-rules
(5.7k), intellectronica/ruler (2.9k), badlogic/pi-skills (2.6k).
no-session/pstack (137 stars) is an unrelated gstack fork that shares the name.

### 3. Common patterns

- **Lifecycle loop.** Stacks converge on the same loop: clarify/spec → plan →
  implement with tests → review → ship, with compound-engineering and ECC
  adding a "capture learnings" step.
- **Multi-harness by default.** superpowers lists 16 harnesses including pi;
  compound-engineering runs on 14. Agent Skills is the portable unit.
- **Composable vs process-owning.** Matt Pocock's README states the main
  design tension directly: frameworks that own the process versus small
  skills the user composes.
- **Measured claims.** Behavior packs lead with benchmarks (ponytail,
  caveman); stacks lead with the author's track record (gstack).

### 4. Relevance to pi-personal

- pi is already a target for superpowers and pstack-claude (`pi install git:...`),
  so these can be tried without porting (inferred from their READMEs).
- The vocabulary above should guide how this repo's own skills and
  extensions are named and grouped.

## Open questions

- Verify SuperClaude's classification from its README.
- Which stack to trial in pi first; a spike could compare superpowers and
  pstack-claude on one task.
- Whether star counts this large reflect real usage; no authenticity check
  was done.

## References

- Repository pages and READMEs of all 30 projects above, accessed 2026-10-11.
- https://github.com/cursor/plugins/tree/main/pstack
- https://github.com/michael-denyer/pstack-claude
- https://github.com/backnotprop/pstack
- https://github.com/ericlitman/open-pstack
- GitHub repository search for `claude skills`, `agent-skills`, `gstack`,
  `pstack`, `claude code subagents`, `cursor rules`, `AGENTS.md codex skills`.
