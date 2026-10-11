---
title: Lean approval rules and one-file-per-item backlog
date: 2026-10-11
session: 01a129dd-b454-70c2-b811-e4eb397912c2
based_on:
  - docs/plans/2026-10-11-project-backlog.md
supersedes: null
---

# 0002. Lean approval rules and one-file-per-item backlog

## Context

A review of 29 pi sessions in this workspace found:

- Approval over-gating: agents split planning, docs, and implementation into
  separate approval steps and re-asked after "proceed", costing user turns.
- Approval provenance accumulating in docs: a per-session backlog Coverage
  section, multi-line Approval fields, and long provenance sections in plans.
- Every session read roughly 60-100k characters of rule documents.
- Concurrent sessions editing the single `docs/backlog.md` and `docs/README.md`.

Likely cause (inferred): earlier documentation reviews turned single incidents
into general defensive rules, duplicated them across AGENTS.md, the docs guide,
the backlog, and templates, and never removed any. A four-model review of the
proposal confirmed this risk and asked for replacing rules rather than adding them.

## Decision

- **Approval** (AGENTS.md): an explicit request to act approves the docs, code,
  offline verification, and subagents its scope needs. Questions and review
  requests stay read-only. Re-ask only for other live/paid model calls, global or
  external effects, destructive operations, cross-feature coupling, undecided
  substantive choices, or work beyond the goal. Responses end with the next
  action, one needed decision, or completion. Follow-ups are registered as
  candidates without asking.
- **Docs guide**: one shorter `docs/README.md` without duplicated backlog rules,
  historical-migration guidance, or its own amendment log. Citation rules live in
  the research template.
- **Backlog**: `docs/backlog/<ID>-<slug>.md` with frontmatter `id`, `title`,
  `status`, `kind`. Files never move; status is a field. Existing items keep their
  `BL-0xx` IDs; new items get random IDs (`BL-` plus four characters) from
  `scripts/backlog.py new`. `scripts/backlog.py list` replaces reading a whole
  index. Approval and Closure are one line each.

This replaces the single-index layout of
[the earlier backlog design](../plans/2026-10-11-project-backlog.md).

## Alternatives considered

- Random IDs for existing items: would need aliases and rewriting references in
  historical text.
- Status folders (as in moth or tisket): moving files breaks links.
- `check`/`migrate` commands or a stored index: new obligations without an
  observed failure.
- Splitting the docs guide into several on-demand files: agents tend to follow
  every linked rule file, so shortening one file was preferred.
- File-per-item references: MrLesk/Backlog.md, antopolskiy/kanban-md, and
  wedow/ticket (accessed 2026-10-11).

## Consequences

- Fewer approval turns and less rule reading are expected but unmeasured; the
  risk is out-of-scope actions under the relaxed rules (tracked as `BL-qsyq`).
- Concurrent sessions touch separate item files; edits to the same item or to
  shared rule files can still collide.
- Automatic wrap-up (`BL-yun3`) and Git adoption (`BL-df94`) remain open. A
  pre-change copy was kept outside the workspace for this migration only.
