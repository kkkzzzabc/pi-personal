---
title: Finish in-session work before registering candidates
date: 2026-10-12
session: 01a12bfa-f0ef-7178-96d0-29ead0487e69
based_on:
  - docs/adr/0002-lean-approval-rules-and-backlog-files.md
  - docs/adr/0003-curated-global-and-project-instructions.md
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
  - docs/spikes/2026-10-12-wrapup-audit-verification.md
supersedes: null
---

# 0005. Finish in-session work before registering candidates

## Context

The rule "register unfinished follow-ups as candidates" (ADR 0002, kept by
ADR 0003) has no criterion separating work the session can finish from work
that must wait. Registration needs no question or approval, while the scope
rules ("smallest appropriate change", "ask before expanded scope") discourage
finishing. Candidates therefore became the default exit. In BL-yun3's session,
BL-u5hs (a re-runnable diagnosis) and BL-4rjt (a config text fix; only its
re-evaluation needed approval) were registered with invented triggers, and
BL-36sg's design choice was deferred instead of asked. BL-s9tp (three
mechanical test fixes) followed the same pattern earlier. The user had to
split work across extra sessions and turns.

## Decision

At the end of work, sort remaining items into three classes:

1. **Finish now:** defects found in the session's own work and in-goal doc,
   test, or diagnosis work that needs no new approval. Done before the item
   closes; never a candidate.
2. **Ask once, then continue:** items needing approval (live/paid calls,
   global effects, scope expansion, cross-feature changes) or a substantive
   design choice. Batch them into one question and continue in the same
   session after the answer.
3. **Candidate:** only when the work needs outside data or elapsed time
   (natural use, an external release), is blocked (another session's
   uncommitted files, an unresolved decision), or the user deferred it. The
   item records the reason in `Deferred because:`.

Self-imposed limits in an approved plan (for example "at most one rerun")
should be stated as a budget the session can use, not a stop condition that
forces a new approval round for routine verification.

The personal global instructions (`instructions/pi-global.md`, deployed to
`~/.pi/agent/AGENTS.md`) add the project-independent part: batch approval
questions into one and finish defects in your own work before reporting
completion.

## Alternatives considered

- Keep the rule and rely on judgment: the observed sessions show the bias.
- Never register candidates: loses real deferrals that need data or time.
- Ask about each remaining item separately: adds the turns this change avoids.

## Consequences

- Sessions close fewer items early and register fewer candidates; final
  reports may contain one batched question instead of several follow-ups.
- Scope rules are unchanged: class 2 still requires approval.
- Existing candidates are not reclassified automatically; reclassify when
  touched.
- Project AGENTS grows from six to seven bullets (about +3 lines net); the
  global file grows by one sentence.
- The wrap-up audit's `backlog-followups` judgment checks this classification
  instead of registration alone.
