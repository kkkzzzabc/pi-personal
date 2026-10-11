---
id: BL-007
title: Add background execution and a worker role to subagents
status: candidate
kind: Design
---

# BL-007 — Add background execution and a worker role to subagents

- Outcome: Let the parent keep working while children run, and add a writer role (`worker`). Decide between in-process background and a detached runner, define completion wake-ups, authorization on wake-up, and visibility of running work, and revisit plan mode's `readOnlyHint` for writers.
- Next action: When the trigger is met, prepare a plan that builds on the foreground subagent base and compares the two background approaches.
- Done when: An accepted plan records the background approach, the worker role contract, exclusions, and verification criteria.
- Trigger: Real use shows a need, such as waiting on children blocking the conversation or long-running writer tasks.
- References: [Subagent plan, next steps](../plans/2026-10-11-subagent-extension.md#next-steps-not-part-of-this-plan) and [pi-subagents research](../research/2026-10-11-pi-subagents.md) (findings 2, 7, and 13).
- Approval: Candidate only.
