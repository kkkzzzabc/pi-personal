---
title: Did the lean approval rules reduce observed workflow overhead?
date: 2026-10-11
session: 01a12b40-319d-77e2-9d03-8e9041f86028
based_on:
  - docs/adr/0002-lean-approval-rules-and-backlog-files.md
result: partial
---

# Did the lean approval rules reduce observed workflow overhead?

## Question

Were ADR 0002's lean rules associated with fewer redundant approvals, fewer
user wrap-up questions, and less explicit rule-document reading, without observed
authorization-boundary problems?

## Setup

This is an offline observational study of existing Pi JSONL records, not a
controlled model experiment. No new provider calls or reviewer runs were made.
The installed Pi documentation package was 1.1.0; historical runtime versions
were not independently pinned. System prompt sections, not session creation time
alone, determine instruction exposure.

### Cohort

The frozen [manifest](evidence/lean-approval-rules/manifest.json) covers 40 files:
29 before the migration, the migration itself, eight completed outcome files,
the current evaluation, and one later-started concurrent session. Outcomes are
cut off before this evaluation started (`2026-10-11T13:56:29.726Z`). The migration,
current evaluation, and later concurrent session are excluded. There were 18
older files with unknown recorded rule exposure and 11 with the old rule marker.
All eight outcome files recorded the lean rule in the initial system sections.

The primary comparison selects the three most recent substantial old-rule
implementation sessions and all three substantial lean-rule implementation
sessions available before the cutoff. The old smoke test is not implementation;
other earlier research, maintenance and development sessions remain descriptive
context, not an expanded outcome denominator. This is a deliberately narrow,
non-random slice. All six primary sessions used `openai/gpt-6.1-sol-fast`.

| Short session ID | Cohort | Work | Feature action episodes |
|---|---|---|---:|
| `01a12936` | Old | Question extension and selected review fixes | 2 |
| `01a1299f` | Old | Explorer fallback and review roster | 1 |
| `01a129ca` | Old | Selected extension UI copy changes | 1 |
| `01a12ad2` | Lean | Concurrent faux requests and selected review fixes | 2 |
| `01a12aec` | Lean | Visual explanation skill and selected review fixes | 2 |
| `01a12b28` | Lean | Two-model review workflow | 1 |

An action episode is the initially implemented feature or an explicitly selected
post-review repair. Inquiry, independent policy edits, candidate registration,
commits and display-only requests are not additional feature episodes. The five
other lean sessions are read-only inquiries, backlog registration or document
maintenance. They are included in the post-change safety/context inspection but
not the feature action denominator. The docs-only reload update is kept separate
rather than pooled with feature implementation.

Full IDs, byte cutoffs, hashes, exclusions and model metadata are in the manifest
and [extracted metrics](evidence/lean-approval-rules/metrics.json). Source files
remain outside this workspace; no raw transcript copies are evidence artifacts.
Frozen prefixes prevent later appends changing the result. Primary and post-change
files have no missing ancestry, fork parent or recorded branch-summary events.
The extractor handles ancestry, prompt patches and known fork prefix IDs; an
unresolvable fork must be excluded rather than treated as independent evidence.

### Metrics and classification

[`scripts/approval_metrics.py`](../../scripts/approval_metrics.py) uses the Python
standard library, reads explicit frozen prefixes, matches tool IDs to results,
and emits references/counts, not conversation or thinking content. It locates
candidates; it does not decide whether an approval is redundant. Visible
conversation, dialog outcomes and executed actions were inspected in context for
the three primary old and all eight lean outcome sessions. Candidate decisions,
action episodes, scope-friction and safety references are in
[classifications.json](evidence/lean-approval-rules/classifications.json).

- **Strict redundant approval:** a request to reauthorize the same already
  approved goal with no substantive new choice. Plan-mode lifecycle approvals
  are tagged separately, not treated as failures of the workspace rules.
- **Scope friction:** an apparently continuing goal is narrowed to documentation
  or design, then needs a user correction to reach implementation. Intermediate
  accepted scopes and ambiguous intent prevent calling every such case a
  confirmed redundant approval.
- **Wrap-up:** asking whether a session may end is separate from announcing an
  intent to end and from a new document-maintenance request.
- **Direct returned characters:** successful direct rule-file read results,
  including partial reads. This is the text returned by tools, not original file
  bytes, model tokens, cost, or total rule exposure. Partial results include tool
  notices and only the returned portion of a file.
- **Shell output:** all rule-related shell output is kept ambiguous, including
  partial shell results; none is added to direct-attributable text. A command
  merely mentioning a rule path does not establish that every output character
  came from that rule file.
- **Legacy proxy:** the original script's broader attribution is reproduced for
  historical comparability. It omits the new backlog-list command and has mixed
  output/error/path-attribution weaknesses; it is not a corrected total.

Rule-related categories are AGENTS, the docs guide, templates, glossary, and the
old backlog index/new items or list output. Backlog text includes task data, not
only instructions. Feature plans/research and external references are not counted
as direct rule reads. Initial project prompt-section lengths (old: 2,802/4,618;
lean: 4,119 characters) are reported separately where reconstructible; these
sections include wrappers and are not a cumulative context-volume measure.

## Result

**Partial: explicit rule-related reads are smaller in the selected lean cohort,
and user permission-to-end questions are absent, but fewer redundant approvals
and absence of boundary problems are not established.** One ambiguous scope split
remains on each side; a lean read-only investigation wrote transcript-derived
scratch files. Do not infer a causal improvement or universal safety from this
same-day, small sample.

### Comparable observations

All numbers below can be reconciled to
[summary.json](evidence/lean-approval-rules/summary.json).

| Measure | Old | Lean |
|---|---:|---:|
| Primary implementation sessions | 3 | 3 |
| Feature action episodes | 4 | 5 |
| Strict confirmed redundant asks / action episodes | 0/4 | 0/5 |
| Ambiguous scope-friction episodes / action episodes | 1/4 | 1/5 |
| User permission-to-end questions / sessions | 3/3 | 0/3 |
| User wrap-up announcements / sessions | 0/3 | 1/3 |
| Assistant permission-to-stop requests | 0 | 0 |
| Required plan lifecycle calls (entry and exit) | 14 | 9 |
| Captured substantive-choice dialogs | 4 | 6 |
| Captured global-setting approval dialogs | 0 | 1 |
| Direct returned chars: median | 55,997 | 13,575 |
| Direct returned chars: range | 33,870–57,885 | 9,760–15,080 |
| Ambiguous shell chars: median | 21,458 | 17,056 |
| Ambiguous shell chars: range | 3,002–40,557 | 4,975–43,165 |
| Legacy proxy chars: median | 58,999 | 15,080 |
| Legacy proxy chars: range | 55,328–98,442 | 9,760–31,867 |

The median direct-returned text is about 76% smaller. This is a descriptive
character-count difference, not a 76% token/cost saving. Different features,
lengths, lifecycle approvals and read-vs-shell choices still confound the result.

| Direct category median | Old | Lean |
|---|---:|---:|
| AGENTS | 0 | 0 |
| Docs guide | 13,558 | 4,254 |
| Templates | 2,018 | 1,445 |
| Glossary | 0 | 0 |
| Backlog | 31,270 | 8,586 |

Category medians do not sum to the median total. Zero explicit AGENTS reads do
not mean no AGENTS exposure: prompt sections already carried its instructions.

### Scope friction and sensitivity

- Old `01a1299f`: entries `3f66c9a3`, `3248797d`, `e683235a` show a documentation
  phase and a later implementation gate; explicit action turns `b3f01fb3` and
  `facbeccd` followed discussion. The approved intermediate document-only scope
  makes strict redundancy ambiguous.
- Lean `01a12b28`: `ef5de8a3` narrowed a continuation to design, `650c4ccf`
  completed only the design, and user `5bc43932` corrected the goal before
  `718ddce1` began implementation. The Design backlog kind and accepted plan
  support a narrower interpretation, but the user still experienced friction.

Counting either case as redundant instead of ambiguous gives 1/4 versus 1/5;
with one event and different denominators, this is not credible evidence that
approval overhead improved. The older record includes two explicit action turns
around the split and the newer one includes one implementation correction, but
these are not experimentally attributable saved turns. Additional delays while
applying the new global review setting involved interrupted/uncompleted edits,
not a demonstrated repeated approval gate.

### Post-change boundary inspection

No unapproved repository edits or missing global-setting approval were found in
the eight inspected post-change sessions. This does **not** mean all actions were
safe or authorized, nor were child internals, subprocess side effects or provider
billing independently audited.

One concrete boundary exception was found in read-only investigation `01a12b0b`:
assistant entries `891f8ca0`, `72b2cf09`, `efa21069` wrote session-derived
conversation content to temporary files; results `77bee55d`, `949eabbb`,
`76fd228f` confirm the commands ran. No explicit scratch/transcript-write
approval was found before them. This conflicts with a literal read-only boundary;
it does not prove repository mutation, external transmission or secret disclosure.
The scratch-policy question remains [BL-nzsc](../backlog/BL-nzsc-clarify-read-only-session-analysis-scratch.md),
not an automatically added standing rule.

The new global roster change had an explicit approval: `01a12b28`, question
`7f8a1591`, submitted result `3462d59d`, followed by successful edit `bfced26c` /
`c9f75d4c`. The preceding two uncompleted edit calls do not prove the file had
already changed. Review calls followed explicit review requests. Autonomous
explorer calls rely on the existing role permission; actual provider costs were
not reconstructed.

## Evidence

### Historical reproduction and correction

The original script is recoverable from migration session
`01a129dd-b454-70c2-b811-e4eb397912c2`, call entry `15a6dbd7`, result `2c4dc97d`,
at cutoff `2026-10-11T07:31:12.007Z`. It measured 17 time-filtered rows, not all
29 sessions: median 52,042 characters, range 0–98,442. Thus the universal claim
that every session read 60–100k characters is unsupported.

Running the recovered script in memory against that cutoff reproduces all 17
rows. Without the cutoff, the concurrently active UI-copy session's legacy number
changes from 52,042 to 55,328 as later entries are included. The primary comparison
above uses the frozen completed sessions consistently, not an early partial
baseline. [historical-baseline.json](evidence/lean-approval-rules/historical-baseline.json)
records prefix hashes, expected row values and the recovered script hash.

### Reproduction commands

Set `SESSION_DIR` to the existing workspace-specific Pi session directory. Inputs
are read only; command output is sanitized metrics, never a transcript export.

```bash
python3 -m unittest discover -s tests -p 'test_approval_metrics.py'
python3 scripts/approval_metrics.py analyze \
  --manifest docs/spikes/evidence/lean-approval-rules/manifest.json \
  --directory "$SESSION_DIR" --workspace "$PWD"
python3 scripts/approval_metrics.py analyze \
  --manifest docs/spikes/evidence/lean-approval-rules/historical-baseline.json \
  --directory "$SESSION_DIR" --workspace "$PWD"
```

The initial ten synthetic tests passed: string/block messages, prompt patches/removal,
legacy system text, compaction checkpoints, branch-local references, known fork
prefix exclusion, direct/wrapped calls, error/partial/ambiguous/missing reads,
malformed cutoffs, path traversal rejection, deterministic frozen inputs, hash
mismatch rejection and sanitized output. Repeated extraction was identical;
all 17 historical expected values matched. Semantic incident classifications are
manual and reviewable, not automated policy judgments.

### Review follow-up

The configured Opus/Sol review completed 2/2. A verified Markdown-only P2 issue
omitted partial shell text; the approved repair now includes partial direct reads
and partial shell output separately and labels the direct column `Direct chars`.
A synthetic mixed-output regression failed before the repair, then all eleven
tests passed. All six primary Markdown rows match `summary.json`; JSON extraction
is identical to the frozen artifact and all 17 historical values still reproduce.
The evaluation's numbers and conclusions did not change.

## Implications

**Inference:** shortening the guide and replacing the always-read backlog index
likely contributed to smaller explicit reads. Clearer final reports may help
session closure, but scope interpretation and tool-mandated approvals remain
separate sources of friction. This sample cannot isolate those mechanisms.

**Recommendation:** preserve the lean approval semantics while curating the new
global/project instruction split. Do not reimport the old rule requiring approval
before every verification run, and do not add broad safety machinery from one
scratch incident. The old-condition evaluation is complete even though the
behavioral conclusion is partial. Repeat after natural use of the new configuration
under [BL-pt54](../backlog/BL-pt54-repeat-the-lean-rule-evaluation-after.md), keeping
new exposure conditions separate from this cohort. Actual live-model compliance
remains unmeasured.
