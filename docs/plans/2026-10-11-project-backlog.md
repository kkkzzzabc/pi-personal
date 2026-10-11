---
title: Lightweight project backlog and documentation boundaries
date: 2026-10-11
session: 01a12919-ee97-74ae-8f9a-5af58b90b8a7
based_on:
  - docs/research/2026-10-11-todo-task-tracking.md
sources:
  - url: https://scrumguides.org/scrum-guide.html#product-backlog
    accessed: 2026-10-11
  - url: https://www.atlassian.com/agile/scrum/backlogs
    accessed: 2026-10-11
  - url: https://basecamp.com/shapeup/2.1-chapter-07
    accessed: 2026-10-11
  - repo: MrLesk/Backlog.md
    url: https://github.com/MrLesk/Backlog.md
    accessed: 2026-10-11
---

# Lightweight project backlog and documentation boundaries

## Goal

Provide one maintained [project backlog](../backlog/) for selecting and resuming
future work, without turning design records into progress logs. Capture this
session's todo-research follow-ups while leaving other ongoing work untouched.

The user approved documentation changes and candidate registration, not execution
of the registered work. The approval artifact is
`~/.pi/plans/20261011-131203-calm-beacon.md`. This document records the maintainable
design; the artifact and session retain the implementation approval trail.

## Non-goals

- A complete inventory of historical or currently ongoing project work.
- Importing every open question, old plan phase, or completed task.
- Implementing a pi todo tool, running lifecycle experiments, or adopting a tracker.
- A CLI, MCP integration, task database, automatic reminders, or auto-continuation.
- A second progress log, archive file, or step-by-step session transcript in docs.
- Changes to existing research, spike, plan, or ADR records in this pass.

## Design

### Responsibilities

| Artifact | Authority |
|---|---|
| Backlog | Work selection, coarse state, next action, blockers, and result links |
| Research / spike | Evidence, experimental conditions, conclusions, and limitations |
| Plan / ADR | Design and decision reasoning |
| Session | Detailed execution, intermediate results, and approval history |

The backlog is a maintained work index, not a fifth dated record category. Its
metadata preserves creation date and session plus supporting-record links.
The glossary retains its existing metadata exception. Operating rules live in
[the docs guide](../README.md#backlog); agent entry-point guidance lives
in `AGENTS.md`.

### Structure and fields

Use `Next`, `Candidates`, `Active`, `Blocked / Waiting`, and `Closed` sections.
Section placement supplies status; there is no duplicate status column or summary
board. `Next` is ordered and kept small (normally at most three to five items).
It means topic selection, not permission to implement. Empty sections are limited
to the index's declared coverage and do not assert the whole project is idle.

Stable `BL-001`-style IDs remain attached when cards move and are never reused.
Required fields are `Kind`, `Outcome`, `Next action`, `References`, and `Approval`.
Add `Done when` before selection/execution; add `Trigger` or `Blocked by` when
applicable. Active work may link its current session or approved scope when known.
Uncertain inherited state is explicitly `Needs verification`, not an invented
completion, rejection, or approval.

Approval is scope-specific prose, separate from section placement. Registration
is not selection; selection is not execution approval. Capturing an unaccepted
recommendation as a clearly labeled candidate requires authorized backlog
maintenance, and never turns the recommendation into a decision.

### Updates and closure

Update relevant cards at selection, start, block/unblock, completion, drop, or
material scope change, not after every tool call. Current user scope takes
precedence over the queue. Reading the index does not authorize automatic work or
maintenance of unrelated cards. Routine project-work resume checks relevant
`Active` and `Next` entries plus their authoritative records.

Completion of authorized work may update its own backlog card within that scope.
A `Done` closure links an outcome-specific result or verification summary;
completed research is not completed implementation. A `Dropped` closure retains
a short reason and known decision source. Keep closed cards concise and do not
silently delete tracked work. Detailed evidence stays in its source record.

Normal item updates do not require a separate amendment log. Changes to backlog
operating policy or reasoning records follow the common amendment convention.
This avoids recording every transition twice.

### Selective handling of older records

When historical migration is separately requested, begin with follow-up sections,
check subsequent and superseding records, merge duplicate work, and carry forward
only relevant actionable items. Keep conditional ideas conditional. Old completed
work remains in its source records instead of becoming a fabricated complete
backlog history. Known dropped decisions may be retained to prevent re-proposal;
silence is not rejection. Inspect old sessions only when needed to resolve a
specific uncertainty, not as an automatic exhaustive audit.

Initialization is limited to three candidates from
[the todo/task research](../research/2026-10-11-todo-task-tracking.md):

- BL-001: decide the scope and behavior of a personal pi todo tracker.
- BL-002: verify standalone pi todo state in an isolated real session lifecycle.
- BL-003: conditionally verify reference restoration needed by the chosen design.

All three remain candidate-only with execution unapproved. BL-001 and BL-002 can
inform each other; neither is declared a hard prerequisite for the other.
BL-003 is not an obligation to verify every reference. The completed research is
not reclassified as unfinished, and no other session's tasks are imported.

### External ideas and alternatives

The four web sources in frontmatter were read through Ego directly in the same
session before this design was approved; no remote repository commit was captured.
Their documented practices inform this local design, not claims of tested tool
behavior:

- The Scrum Guide distinguishes an evolving ordered product backlog from selected
  sprint work. Adopt the separation, not the Scrum roles or ceremonies.
- Atlassian recommends refining near-term items, keeping distant work less detailed,
  and retiring work outside capacity. Adopt proportional detail and cleanup.
- Shape Up rejects centralized backlogs because accumulating ideas can become
  review overhead. Respect that warning while retaining the user's requested
  single index; not every question becomes an obligation.
- Backlog.md documents Markdown task records, acceptance criteria, and review of
  plans before implementation. Borrow explicit outcomes and completion criteria,
  not its CLI, per-task file hierarchy, or Git-based workflow.

Keeping follow-ups only in source documents leaves work selection fragmented.
A full task-management tool or exhaustive historical ledger would add overhead
before a concrete need is demonstrated. One lightweight index is the selected
starting point, not a claim that it will scale to every future workflow.

### Layout

- `docs/backlog.md`: live work index.
- `docs/templates/backlog.md`: whole-index template.
- `docs/templates/backlog-item.md`: item card template.
- `docs/README.md`: authoritative operating and historical-handling rules.
- `AGENTS.md`: concise scope, resume, and update guidance.
- `README.md`: navigation link only.

## Phases

### Phase 1: Guidance and templates

- Changes: add this design record and both templates; update the docs guide and
  agent guidance; add the root README navigation link.
- Verify (automated): validate relative links and compare existing-file edits with
  captured pre-change content; check protected non-target fingerprints.
- Verify (manual): read all changed documents for role separation, approval
  boundaries, and consistency with existing amendment rules.

### Phase 2: Initialize the bounded backlog

- Changes: create the index from its template and seed the three candidate cards.
- Verify (automated): unique IDs, required fields, all five sections, creation
  provenance, valid result/source links, and no unresolved template placeholders.
- Verify (manual): distinguish completed investigation from future design/tests;
  confirm no `Next`/`Active` claims or unrelated work were invented.

### Phase 3: Handoff

- Changes: report paths, registered IDs, coverage, verification, and unapproved work
  in chat; no second implementation log.
- Verify (manual): do not execute any registered candidate or claim a Git diff,
  runtime/TUI test, or whole-project task audit.

## Risks and open questions

- Shared guidance can change in other sessions. Re-read before editing and preserve
  unrelated changes; do not overwrite files from an old snapshot.
- The backlog is intentionally incomplete at initialization. Other ongoing work
  requires scoped input and confirmation before registration or classification.
- Too much metadata or repeated logging defeats the purpose of a lightweight index.
  Revisit complexity only when actual use exposes a problem.
- Documentation expresses policy, not technical enforcement of agent behavior.
- This workspace currently has no Git repository. Retain concise closed cards
  instead of depending on Git history for deletion/recovery; no Git adoption is
  part of this design.

## Amendments

### 2026-10-11 — Replaced by a one-file-per-item backlog
- Change: `docs/backlog.md` and `docs/templates/backlog.md` were replaced by
  `docs/backlog/<ID>-<slug>.md` items and `scripts/backlog.py`; links were repaired.
- Reason: The single index accumulated per-session provenance, was read in full
  every session, and was edited concurrently by several sessions.
- Impact: The index and card rules above describe the original design only. See
  [ADR 0002](../adr/0002-lean-approval-rules-and-backlog-files.md).
