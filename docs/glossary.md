# Glossary

Shared terms used across `docs/`. This file is a maintained index; see
"Glossary" and "Amendments" in `docs/README.md` for the rules. New entries
start from `docs/templates/glossary-entry.md`.

Each entry gives a short definition and the document that holds its reasoning.
Justify a substantive definition change in an amended or new reasoning document
before updating the entry.

## Agents

- **Harness**: The coding agent itself, which loads and runs customizations.
  Examples: Claude Code, Codex, OpenCode, pi
  Not: Harness extension — a harness extension is a customization that ships
  runtime code; the harness is what it extends.
  Defined in: `docs/research/2026-10-11-code-review-in-agent-customization.md`

## Customization units

File formats an agent loads.

- **Command**: A user-invoked prompt.
  Examples: `/review`, `/plan`
  Not: Skill — a skill is loaded by the agent on demand; a command is
  triggered by the user.
  Aliases: slash command
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Hook**: Code run on a harness event.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Plugin / package**: A distribution unit that installs a set of other units.
  Examples: Claude Code plugin, pi package
  Not: Stack — a plugin is how something is shipped, not how its parts relate.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Rules / instructions**: An always-loaded guidance file.
  Examples: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`
  Not: Skill — rules are always in context; a skill is loaded on demand.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Skill**: A procedure document loaded on demand.
  Examples: `SKILL.md` in the Agent Skills format
  Not: Skill library — a skill is one unit; a library is a collection.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Subagent**: A role definition run with its own context.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`

## Customization bundle types

How a project's units relate. Umbrella term: **coding-agent customization**.
A project that fits two types is classified by its primary purpose.

- **Behavior pack**: One rules file or one skill that changes how the agent
  works across all tasks.
  Rule: The project is essentially a single file or a single skill.
  Examples: multica-ai/andrej-karpathy-skills, DietrichGebert/ponytail,
  JuliusBrussee/caveman
  Not: Skill library — a behavior pack is one unit, not a collection.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Curated list**: Links to customization projects.
  Rule: Nothing to install.
  Examples: hesreallyhim/awesome-claude-code, PatrickJS/awesome-cursorrules
  Not: Marketplace — a marketplace installs what it lists.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Harness extension**: Runtime code beyond prompts that changes how the
  agent runs.
  Rule: Ships orchestration, proxies, or tools as code, not only prompts.
  Examples: ruvnet/ruflo, code-yeongyu/oh-my-openagent
  Not: Stack — a stack may include hooks but is defined by its workflow.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Marketplace / catalog**: Installable units from many authors, gathered for
  discovery and installation.
  Examples: anthropics/claude-plugins-official, wshobson/agents
  Not: Skill library — a library comes from one author or team.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **SDD framework**: A spec-driven development process organized around
  written artifacts.
  Rule: Work flows through artifacts (spec → plan → tasks), usually with a
  CLI, independent of any one harness.
  Examples: github/spec-kit, Fission-AI/OpenSpec, BMAD-METHOD, get-shit-done
  Not: Stack — a stack is organized around skills calling each other, not
  around artifacts.
  Aliases: spec-driven development framework
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Skill library**: Independent skills picked à la carte.
  Rule: Installable; skills do not call or route to each other.
  Examples: mattpocock/skills, anthropics/skills, vercel-labs/agent-skills
  Not: Stack — do not call a skill library a stack just because it is
  popular or comes from one author.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`
- **Stack**: An opinionated set of interdependent skills or commands that
  forms an end-to-end workflow and reflects one author's or team's method.
  Rule: Installable; units call or route to each other to cover a lifecycle
  such as spec → plan → build → review → ship.
  Examples: garrytan/gstack, pstack, obra/superpowers,
  addyosmani/agent-skills
  Not: Skill library (independent skills); SDD framework (artifact-centric);
  the umbrella term for all customization.
  Defined in: `docs/research/2026-10-11-coding-agent-customization-landscape.md`

## Plan mode

Terms of the `plan-mode` extension and the agents it was modeled on.

- **Build mode**: The unrestricted default mode of the `plan-mode` extension;
  all previously active tools and the previous thinking level apply.
  Not: Plan mode — build mode has no write guard and no reminder.
  Aliases: build
  Defined in: `docs/plans/2026-10-11-plan-mode-extension.md`
- **Plan file**: The working Markdown draft the agent may write in plan mode,
  assigned on each entry into plan mode, in `~/.pi/plans/<timestamp>-<words>.md`.
  Not: Plan (a `docs/plans/` document) — a plan file is a disposable working
  draft edited during planning; a docs plan is a maintained design record,
  not an implementation progress tracker.
  Defined in: `docs/plans/2026-10-11-plan-mode-extension.md`
- **Plan mode**: A mode in which the agent explores and writes a plan without
  changing the project, then asks for approval before implementation.
  Rule: Writes are limited to the plan file; read-only tools stay active;
  shell restraint is by instruction, not blocking.
  Examples: OpenCode `plan` agent, Gemini CLI approval mode `plan`, Codex
  collaboration mode `Plan`, pi `plan-mode` extension
  Not: Plan (a `docs/plans/` document); Build mode.
  Defined in: `docs/plans/2026-10-11-plan-mode-extension.md`
- **Reminder**: A `<system-reminder>` text the harness or an extension adds to
  the conversation to tell the model about its current mode or rules.
  Examples: plan-mode enter/leave notes (deferred until a prompt, only when
  the delivered state differs; plan-tool results communicate transitions too),
  the short plan-mode reminder (added to every request, not persisted)
  Not: System prompt — a reminder is a message in the transcript, not part of
  the system prompt.
  Aliases: system reminder
  Defined in: `docs/research/2026-10-11-opencode-plan-build.md`

## Verification

- **Faux model**: A scripted model that returns predefined responses
  (text, thinking, tool calls) instead of calling a provider, used to verify
  pi behavior without network or cost.
  Examples: tui-check scenario files, pi-ai `registerFauxProvider`
  Not: Real mode — tui-check real mode calls an actual provider model.
  Defined in: `docs/plans/2026-10-11-tui-check-skill.md`

## Amendments

### 2026-10-11 — Align glossary maintenance and the plan distinction
- Change: Removed the sole-editable-document exception and the write-once
  description of docs plans; allowed amended reasoning documents. Clarified
  that re-entering plan mode assigns a new working plan file and that
  transition notes reconcile delivered state rather than recording every toggle.
- Reason: Documentation maintenance rules now permit scoped updates; the
  implemented plan-mode delivery coalesces toggles before a prompt.
- Impact: Working plans remain distinct from documented designs, but both may
  be edited; neither requires a separate progress ledger.
- Evidence: [Documentation maintenance rules](README.md) and
  `enterPlan` in `extensions/plan-mode/index.ts`.
