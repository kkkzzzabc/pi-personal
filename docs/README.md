# Docs

Keep conclusions, decisions and reasoning here, not execution logs or raw session
transcripts. Detailed execution/approval history stays in Pi sessions; future work
lives in [`backlog/`](backlog/). Never copy credentials or private data.

## Records

Start from the matching file in `templates/`; the research template includes
source-citation rules. Use lowercase kebab-case slugs and these record types:

| Type | Folder / filename | Purpose |
|---|---|---|
| Research | `research/YYYY-MM-DD-<topic>.md` | Analysis of a topic or external implementation |
| Plan | `plans/YYYY-MM-DD-<feature>.md` | What to build here and why |
| ADR | `adr/NNNN-<decision>.md` | Durable decisions, including changes to standing rules |
| Spike | `spikes/YYYY-MM-DD-<question>.md` | A bounded experiment answering one question |

Take the next available ADR number. Use an ADR, not only a plan, for changes to
standing rules or constraints beyond one feature; plans link to the decision.

Every record has `title`, `date` (creation date), `session` (original Pi session
ID), and `based_on` (supporting repo-relative document paths). Preserve creation
provenance when amending; identify later implementation/verification sessions in
the body without inventing missing IDs. Templates add type-specific fields.

Keep records current and explain the why. Correct/supplement the same
investigation, plan or experiment in place, preserving historical conditions and
results. Add a new record for a distinct investigation/goal, a new experiment
under changed conditions, or a changed durable decision (`supersedes: NNNN`).
Replacement records cite their predecessors through `based_on`, explain what is
replaced, and receive a follow-up/replacement link in the older record.

## Backlog

One item per `backlog/<ID>-<slug>.md`; files never move and IDs are never reused.
Create with `python3 scripts/backlog.py new "<title>" --kind <kind>`; list with
`python3 scripts/backlog.py list`. Frontmatter status is `active`, `next`,
`blocked`, `candidate`, `done`, or `dropped`.

A request to build something gets one item covering design and implementation;
split off a design item only when the user asks for design only or defers
implementation ([ADR 0004](adr/0004-one-backlog-item-for-design-and-implementation.md)).

Items state outcomes and next actions, linking to source records for evidence and
design. Keep `Approval` to one line: `Candidate only.` or approved scope/session.
On closure, add one `Closure` line with the result link or drop reason. Item files
need no amendment log.

A candidate records `Deferred because:` (outside data or time, a blocker, or the
user's deferral). Defects and in-goal work found while working are finished in
the session, not registered
([ADR 0005](adr/0005-finish-in-session-work-before-registering-candidates.md)).

## Glossary

`glossary.md` is a frontmatter-free index. Use `templates/glossary-entry.md`;
group entries by category and alphabetize within each, with a `Defined in:` link.
Keep renamed/removed terms as `Deprecated: use <New term>`.

## Amendments

After a record's creating session, append one entry per maintenance task that
changes facts, evidence, scope, conclusions, design or the next action.
Same-session drafting, typos, formatting and link repairs need none. Preserve
existing creation fields and historical evidence.

```markdown
## Amendments

### YYYY-MM-DD — <Short description>
- Change: <What changed.>
- Reason: <Why.>
- Impact: <Effect on the conclusion, scope, or implementation.>
- Evidence: <Optional supporting document, source, or session.>
```
