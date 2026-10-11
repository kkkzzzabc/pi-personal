---
title: Curated personal instructions and smaller project rules
date: 2026-10-11
session: 01a12b40-319d-77e2-9d03-8e9041f86028
based_on:
  - docs/adr/0002-lean-approval-rules-and-backlog-files.md
  - docs/spikes/2026-10-11-lean-approval-rules-evaluation.md
supersedes: 0002
---

# 0003. Curated personal instructions and smaller project rules

## Context

The user likes the current project's workflow and wants useful personal rules
available across Pi projects without importing the identical 133-line
Claude/Codex instruction files wholesale. Those older files include approval
before program verification, repeated phase reports, blanket abstraction/guard
restrictions, a no-scope commit format, and detailed CLI/web procedures. Importing
them would add instruction burden and risk undoing the recent lean workflow.

The [bounded Pi evaluation](../spikes/2026-10-11-lean-approval-rules-evaluation.md)
found smaller explicit rule reads but did not establish less approval friction
or universal safety. Content must be curated first, not merely relocated.
This decision supersedes ADR 0002's instruction placement and guide wording;
its backlog layout, authorization boundaries and historical evidence are retained.

## Decision

- Deploy seven compact personal instructions in `~/.pi/agent/AGENTS.md`, with
  [`instructions/pi-global.md`](../../instructions/pi-global.md) as the
  project-owned canonical copy. Use a plain file, not a symlink or runtime import.
- Personal rules cover Korean/conclusion-first communication, honest concise
  reporting, inspecting facts before asking, uninterrupted approved work,
  meaningful authority boundaries, minimal changes, and relevant verification.
  Investigation/review/proposals remain read-only unless changes are requested;
  necessary docs/code/offline checks and permitted delegation accompany an
  explicit action request. Mandatory tool approval flows still apply.
- Keep six repository-specific instructions in [`AGENTS.md`](../../AGENTS.md):
  English project content with intentional language exceptions, docs/templates,
  backlog lifecycle, project-owned local adaptations and attribution, independent
  features/public APIs, and explicit approval for exceptional cross-feature
  coupling. A checkout without the personal file retains its repository contracts.
- Shorten [`docs/README.md`](../README.md) in place. Preserve provenance,
  historical evidence, privacy, record selection, backlog state/closure,
  replacement links and meaningful amendments. Do not create another rule guide
  that agents must read to recover removed verbosity.
- Do not import verification approval at every run, mandatory step-by-step
  reports, unconditional abstraction/defensive-code bans, the no-scope commit
  restriction, or detailed CLI/web instructions. Existing relevant skills and
  tools continue owning their procedures. No new global commit-format rule.
- Preserve the subagent context contract: reviewers receive project rules, not
  personal global rules; explorers receive neither. No subagent code change or
  runtime feature dependency was needed. The project file does not tell children
  to read the excluded global file.
- Existing Claude/Codex instruction files and symlinks, Pi settings, other
  projects and SYSTEM/APPEND_SYSTEM files were not changed. Global-file creation
  and project changes were explicitly approved together in the creating session.

### Selection, not import

| Existing material | Treatment |
|---|---|
| Language, conclusion-first, fact/inference distinctions | Condensed into two personal rules |
| Ask important choices, inspect available facts, avoid repeated decisions | One personal rule |
| Goal completion and approval/scope procedures | Current lean semantics retained, older blanket execution gate excluded |
| Minimal code, local style, unrelated cleanup | One judgment-based rule, not absolute bans |
| Existing checks, bug reproduction, truthful results | One outcome-focused rule, not a ceremony for each phase |
| CLI/web procedures and commit-format restriction | Not imported |
| Language/docs/backlog/reference handling in project AGENTS | Consolidated locally |
| Local adaptation, independence, public contracts and coupling exceptions | Consolidated locally without dropping safeguards |

### Measured size

| Resource | Before | After |
|---|---:|---:|
| Project AGENTS | 69 lines / 3,914 bytes / 18 top-level bullets | 20 lines / 1,341 bytes / 6 bullets |
| Global AGENTS | Absent | 21 lines / 1,371 bytes / 7 bullets |
| **Combined AGENTS** | **3,914 bytes / 18 bullets** | **2,712 bytes / 13 bullets** |
| Docs guide | 96 lines / 4,256 bytes | 67 lines / 3,097 bytes |
| Combined AGENTS + docs guide | 8,170 bytes | 5,809 bytes |

Combined AGENTS bytes are about 31% smaller, the guide about 27%, and the total
about 29%. Global relocation alone does not save Pi input: both files are loaded
for a parent in this project. Bullet counts are structural counts, not a claim
that every distinct behavioral obligation is represented by exactly one bullet.
The selection table documents semantic consolidation. The 11,132-byte personal
source file is not the size baseline of the previously working Pi project.

## Alternatives considered

- Import/translate the entire personal file: duplicates tool procedures and
  reintroduces excessive execution/reporting gates.
- Move all project rules globally: loses portable repository/reviewer criteria
  and applies repository architecture preferences to unrelated projects.
- Keep duplicated personal rules in both places: fails the combined-size goal.
- SYSTEM.md: replaces the default prompt, unnecessarily broad for personal rules.
- APPEND_SYSTEM.md: a project file replaces the global one rather than combining;
  global/project AGENTS are the appropriate discoverable context resources.
- Extend subagent inheritance to global rules: unnecessary runtime coupling and
  a change to the intentionally selected role contract.
- Build a general Claude/Codex evaluator now: not needed to settle this curation.
  A schema-only inventory found 67 Claude parent files (121 children excluded),
  80 active and three archived Codex files. No cross-host conversation was
  contextually scored: source wording plus Pi evidence resolved the selection.
  Later bounded inspection remains available when it answers a real question.

## Consequences

### Verification

The currently installed Pi package was 1.1.0. Verification was offline only:

- Eleven synthetic approval-extractor tests passed after the review fix (ten
  initially, plus one Markdown partial-output regression). Frozen extraction was
  deterministic, all 17 original baseline rows reproduced, and aggregate
  denominators/character counts reconciled.
- Three targeted instruction-delivery tests passed, including opt-in deployed
  file equality and the public context loader discovering both actual paths once.
- Two fresh isolated faux TUI runs each made one scripted request with only the
  `read` tool: one received the complete final personal and project text exactly
  once; the other received only the complete project text. Neither loaded the
  older personal file or an APPEND_SYSTEM addendum; the default base prompt stayed.
- Fourteen existing subagent SDK integration tests passed, including project-only
  reviewer context and context-free explorers. No live reviewers were launched
  for implementation verification; the later user-requested review is separate.
- Initial TUI checks were repeated after the final wording explicitly preserved
  investigations/reviews as read-only. All four created TUI sessions exited and
  were destroyed; evidence directories were retained, not deleted.
- Document frontmatter/link checks and `git diff --check` passed. No raw private
  transcript or credential material is in the added evidence.

Reproduce the final delivery tests:

```bash
VERIFY_PI_GLOBAL_DEPLOYMENT=1 node --test tests/instruction-split.integration.test.mjs
node --test tests/subagent.integration.test.mjs
python3 -m unittest discover -s tests -p 'test_approval_metrics.py'
```

Set `PI_PACKAGE_DIR` to the installed Pi package if automatic resolution is not
available. The deployment test explicitly opts into reading only the user's
AGENTS instruction, never auth/settings. Without that opt-in, only its deployment
check is skipped; the isolated TUI checks still run. This targeted suite is run
explicitly rather than added to the unrelated package test command.

Sanitized counts, hashes, assertions and cleanup receipts are recorded in
[`verification.json`](../spikes/evidence/instruction-split/verification.json).
Final temporary evidence directories are named `instruction-split-tui-LUWANC`
and `instruction-split-tui-g6QUX9` under the system temporary directory; the
creating session contains their full paths. Each has `run.json`, one model-input
record, `assertions.json`, and `finish.json`. Raw private sessions were not copied.

### Review follow-up

The user-requested Opus/Sol review completed 2/2 with one verified P2 finding:
Markdown output omitted partial shell results. The approved fix now includes
partial direct reads and shell results in separate columns; all six primary rows
match the published summary. A synthetic regression failed before the fix and
all eleven extractor tests pass afterward. JSON extraction, the 17-row historical
baseline and evaluation conclusions are unchanged. The `Same-session` word split
in the docs guide was also repaired. No new instruction/TUI behavior changed, so
prior delivery tests were retained rather than rerun.

### Remaining uncertainty and maintenance

Faux tests prove instruction delivery, **not** live-model compliance, fewer
questions, or lower billed token use. The current user session was not driven,
reloaded or restarted by this task. A user-initiated `/reload` or new session is
needed to refresh its cached instructions; no claim is made that this occurred.
Future natural-use comparison is [BL-pt54](../backlog/BL-pt54-repeat-the-lean-rule-evaluation-after.md).
The scratch-policy boundary remains [BL-nzsc](../backlog/BL-nzsc-clarify-read-only-session-analysis-scratch.md),
not a new general rule inferred from one incident. Automatic wrap-up is not built.

The canonical global copy is not automatically synchronized. Future edits must
keep deployment and canonical text aligned and verify their equality. Other
projects still supply their own repository-specific conventions. Unexpected
preexisting global instructions must be inspected, not overwritten. Rollback can
restore the prior repository rules and explicitly remove the newly created global
file; this task did not reset concurrent work, delete evidence, commit or push.
