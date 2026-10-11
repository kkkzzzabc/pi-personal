# Docs

Conclusions and designs live here; detailed execution and approval history live
in pi sessions. Future work is tracked as one file per item in
[`backlog/`](backlog/).

## Principles

- **Record the why.** Each document states its key reasoning in a few lines and
  links the session for the full trail.
- **Keep records current.** Correct and improve documents when useful; they are
  not progress logs. Preserve historical experimental conditions and results
  rather than replacing them with newer ones.
- **Connect related records.** Use `based_on` for supporting documents, and add
  follow-up or replacement links to older records when that helps readers.
- **No secrets.** Never copy session transcripts, credentials, or private data.

## Types

| Type | Folder | Filename | Use when |
|---|---|---|---|
| Research | `research/` | `YYYY-MM-DD-<topic>.md` | Analyzing external code or a topic: what others do |
| Plan | `plans/` | `YYYY-MM-DD-<feature>.md` | Deciding what to build here and how |
| ADR | `adr/` | `NNNN-<decision>.md` | A durable decision that outlives a single plan |
| Spike | `spikes/` | `YYYY-MM-DD-<question>.md` | A small experiment answering one feasibility question |

Use an ADR, not only a plan, when a decision changes a standing rule
(`AGENTS.md`, this guide) or constrains work beyond one feature; plans link to it.

Start each record from its file in `templates/`; the research template also
holds the source-citation rules. Use lowercase kebab-case slugs. ADR numbers
start at `0001`; take the next number from `adr/`.

Every record has this frontmatter; templates add type-specific fields:

```yaml
title:     Human-readable title
date:      YYYY-MM-DD (creation date; never changed)
session:   Original pi session id ($PI_SESSION_ID)
based_on:  Repo-relative paths of supporting docs
```

Keep `date` and `session` as creation provenance when amending. If
implementation and verification happened in different sessions, say so in the
body; do not invent missing identifiers.

## Backlog

`backlog/<ID>-<slug>.md`, one item per file, created with
`python3 scripts/backlog.py new "<title>" --kind <kind>` and listed with
`python3 scripts/backlog.py list`. Status is the frontmatter `status`:
`active`, `next`, `blocked`, `candidate`, `done`, or `dropped`. Files never move;
change the status instead.

- Items state outcomes and the next action. Evidence and design stay in their
  source records; execution detail stays in sessions.
- `Approval` is one line: `Candidate only.` or the approved scope and session.
- On closure, add a one-line `Closure` with a result link or drop reason.
- IDs are never reused. Item files need no amendments.

## Glossary

`glossary.md` is an index of shared terms, without frontmatter. Add entries from
`templates/glossary-entry.md`, grouped by category and sorted alphabetically,
each with a `Defined in:` link to the reasoning. Keep removed or renamed terms
with `Deprecated: use <New term>`.

## Updating or adding a record

| Type | Update the existing record when | Add a new record when |
|---|---|---|
| Research | Correcting or supplementing the same investigation | Recording an independent investigation or distinct new result |
| Plan | Adjusting the plan or design | Planning a separate goal or independent follow-up |
| Spike | Correcting errors or reproduction details | Running a new experiment, including under changed conditions |
| ADR | Correcting facts or wording without changing the decision | Changing the decision itself (`supersedes: NNNN`) |

A record that replaces an earlier conclusion lists its predecessor in
`based_on` and explains what it replaces; add a replacement link to the older
record.

## Amendments

After a record's creating session, record changes that alter a reader's
understanding or next action (facts, evidence, scope, conclusions, design,
replacement notices). Edits in the creating session, typo/format fixes, and
link repairs need none. Add one entry per maintenance task at the end:

```markdown
## Amendments

### YYYY-MM-DD — <Short description>
- Change: <What changed.>
- Reason: <Why.>
- Impact: <Effect on the conclusion, scope, or implementation.>
- Evidence: <Optional supporting document, source, or session.>
```
