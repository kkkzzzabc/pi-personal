---
title: Post-turn summaries, next prompts, and completion reminders
date: 2026-10-12
session: 01a12b89-d473-7178-96d0-29dd15f8ee44
based_on:
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
  - docs/research/2026-10-11-verification-options-for-pi.md
sources:
  - repo: guwidoe/pi-prompt-suggester
    url: https://github.com/guwidoe/pi-prompt-suggester
    commit: 3de69887a23edf973ec6c303a8696802d62a67fe
    accessed: 2026-10-12
  - repo: pasky/pi-session-summary
    url: https://github.com/pasky/pi-session-summary
    accessed: 2026-10-12
  - url: https://pi.dev/packages/pi-prompt-suggestions
    accessed: 2026-10-12
  - url: https://docs.claude-mem.ai/usage/getting-started
    accessed: 2026-10-12
  - url: https://docs.claude-mem.ai/configuration
    accessed: 2026-10-12
  - repo: maplezzk/pi-extensions
    url: https://github.com/maplezzk/pi-extensions/tree/main/packages/pi-auto-goal
    accessed: 2026-10-12
  - url: https://code.claude.com/docs/en/hooks
    accessed: 2026-10-12
  - url: https://code.claude.com/docs/en/interactive-mode
    accessed: 2026-10-12
  - url: https://cursor.com/docs/hooks
    accessed: 2026-10-12
  - url: https://geminicli.com/docs/hooks/reference/
    accessed: 2026-10-12
  - repo: donggyushin/stocker
    url: https://github.com/donggyushin/stocker/blob/main/.claude/hooks/doc-sync-check.sh
    accessed: 2026-10-12
  - repo: MemPalace/mempalace
    url: https://github.com/MemPalace/mempalace/blob/develop/website/guide/cursor-hooks.md
    accessed: 2026-10-12
  - url: https://docs.typesafe.ai/introduction
    accessed: 2026-10-12
  - url: https://www.langchain.com/blog/building-a-harness-with-jev
    accessed: 2026-10-12
---

# Post-turn summaries, next prompts, and completion reminders

## Scope

The user wants three outcomes: understand what the agent did and what remains;
accept a useful next request without typing it from scratch; and detect required
wrap-up work that the agent overlooked. Luna and Haiku may be used continuously
without a cost concern. This is public-document/source research, not an install
or comparative runtime evaluation of the reference packages.

## Summary

- Each outcome has existing precedents, including Pi packages.
- Prompt suggestions and summaries are separate new local work items.
- Instruction/document-update auditing substantially overlaps BL-yun3;
  evidence/completion semantics also intersect BL-005, not as a prerequisite.
- A next-prompt recommendation is not permission for autonomous continuation.
- No inspected single implementation established all three desired outcomes.
- Jev has an adjacent classifier/guardrail pattern, not a confirmed turn-end
  document-obligation audit in this investigation.

## Questions

1. What already implements each outcome?
2. Which ideas fit a small independent local implementation?
3. Does this duplicate or conflict with existing work?

## Findings

### 1. Existing precedents

| Outcome | Inspected source | Observed contract and distinction |
|---|---|---|
| Compact session summary | [pi-session-summary README and index.ts](https://github.com/pasky/pi-session-summary) | A separate small-model call maintains a one-line session name; optional editor-area widget. README lists Luna and Haiku candidates. Source includes non-blocking calls, incremental summarization and debounce. Not a detailed work/next-action report. |
| Work/results/next actions | [Claude-Mem operation](https://docs.claude-mem.ai/usage/getting-started), [configuration](https://docs.claude-mem.ai/configuration) | Stop hook generates Request, Investigated, Learned, Completed, Next Steps, Notes. Tool observations and summaries are stored for later context. Configuration lists Haiku as default Claude compression model. Broader persistence than the desired initial summary scope. |
| Next prompt with ghost text | [pi-prompt-suggestions](https://pi.dev/packages/pi-prompt-suggestions) | After agent_end, configurable model and optional Tab acceptance. Documented Enter-direct-submit behavior differs from the desired accept/edit/submit boundary. |
| Repo-aware next prompt | [pi-prompt-suggester pinned architecture](https://github.com/guwidoe/pi-prompt-suggester/blob/3de69887a23edf973ec6c303a8696802d62a67fe/docs/architecture.md) | Separate suggestion and agentic seeding paths; project intent, persistent logs and steering state. Ghost acceptance uses Space/Right, not Tab in the inspected version. |
| Official next prompt | [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode#prompt-suggestions) | Conversation-based next prompt after response; Tab/Right accepts and Enter submits. Documented same-session-model background request, rather than a separate small-model role. |
| Second-model stop judgment | [pi-auto-goal](https://github.com/maplezzk/pi-extensions/tree/main/packages/pi-auto-goal) | README describes agent_settled judgment and bounded continuation when work is missing. Optional tool trace is off by default. This is request-completion checking, not demonstrated comprehensive instruction-obligation auditing. |
| Model-driven completion check | [Claude Code hooks](https://code.claude.com/docs/en/hooks#prompt-based-hooks) | Prompt hooks return a judgment; Stop failures feed reasons to the parent. Experimental agent hooks can investigate with tools. The docs show task-completion checks. |
| Turn-end continuation | [Cursor stop](https://cursor.com/docs/hooks), [Gemini AfterAgent](https://geminicli.com/docs/hooks/reference/) | Cursor followup_message auto-submits a next user message with a loop limit; Gemini deny/reason triggers correction. Mechanism, not a guarantee of correct completion judgments. |
| Document sync reminder | [doc-sync-check.sh](https://github.com/donggyushin/stocker/blob/main/.claude/hooks/doc-sync-check.sh) | Inspected script compares Git changes with named document changes, emits a policy reminder and exits 2 once per session. Heuristic trigger; asks the agent to decide whether sync is actually needed. |
| Missing memory save | [MemPalace Cursor hooks](https://github.com/MemPalace/mempalace/blob/develop/website/guide/cursor-hooks.md) | Periodic stop follow-up asks the agent to file topics/write a diary. Prevents repeated self-triggering through loop_count. Scheduled recording, not semantic instruction auditing. |

The table records source-described behavior. Unpinned pages were inspected on
2026-10-12 and may change; reference packages were not executed here.

[TypeSafe's introduction](https://docs.typesafe.ai/introduction) describes Jev as
state plus typed questions yielding Choice/Score/Noul decisions, not narrative
text. [LangChain's harness example](https://www.langchain.com/blog/building-a-harness-with-jev)
uses Jev middleware to judge risky tool calls before execution. A turn-end
instruction/document-update audit using Jev was not found. Suitability for that
specific task remains unverified; typed output does not prove semantic accuracy.

### 2. Reusable ideas and exclusions

At the pinned `guwidoe/pi-prompt-suggester` commit, inspected files were
`docs/architecture.md`, `src/infra/pi/ghost-suggestion-editor.ts`,
`src/infra/pi/ghost-editor-installation.ts`, the model adapter portion of
`src/infra/model/pi-model-client.ts`, and `LICENSE`.

Useful ideas: suppress during user editing; invalidate background results;
permit abstention; show ghost text without changing input; preserve normal app
controls. The reference ghost editor also accesses private history fields and
matches rendered ANSI cursor text. Neither is an approved local dependency or
API contract. Local code instead uses a narrow empty-editor design and public
host APIs. No source code was copied; MIT attribution remains relevant if future
work adapts substantial portions (copyright 2026 Guido Witt-Dörring).

Project seeding, persistent conversation logs, preference/steering tracking, and
provider-specific bridge support are excluded from the initial feature.

### 3. Existing backlog mapping

- [BL-5qvq](../backlog/BL-5qvq-build-contextual-next-prompt-suggestions.md):
  one design-plus-implementation item for next-prompt suggestions.
- [BL-9vg3](../backlog/BL-9vg3-build-post-turn-summaries-and-next.md): deferred
  independent summary/next-action display. Not dependent on a prompt suggester.
- [BL-yun3](../backlog/BL-yun3-decide-an-automatic-session-wrap-up.md): the
  document/instruction wrap-up audit belongs here rather than in a duplicate.
- [BL-005](../backlog/BL-005-define-a-personal-pi-verification-workflow.md):
  related evidence/verification policy; do not expand it into this UI task.
- BL-001's todo tracking and BL-007's background writer roles are adjacent ideas,
  not required runtime dependencies. BL-nzsc matters if future session-derived
  scratch storage is introduced; production transcript persistence is excluded.

No direct conflict was found in the outcomes. Automatic mutation during a
read-only investigation, unapproved model/data transmission, out-of-scope
continuation, or silent cross-feature dependencies would conflict with existing
boundaries. The user approved the first-feature implementation and bounded
Luna/Haiku use through the plan flow, not the later audit/summary implementation.

## Open questions

- Summary context/placement and factuality checks are deferred to BL-9vg3.
- Audit obligation sources, report-only versus automatic correction, and Jev
  usefulness are deferred to BL-yun3.
- Prompt latency, abstention, public-editor compatibility and provider behavior
  require the local feature's offline/live checks rather than reference claims.

## References

Source URLs and the pinned suggestion commit are in frontmatter/table above.
Local implementation scope: [next-prompt plan](../plans/2026-10-12-next-prompt-suggestions.md).
