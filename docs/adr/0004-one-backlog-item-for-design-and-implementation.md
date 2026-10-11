---
title: One backlog item for design and implementation by default
date: 2026-10-12
session: 01a12b62-009e-7178-96d0-29d3408ab23e
based_on:
  - docs/adr/0003-curated-global-and-project-instructions.md
  - docs/spikes/2026-10-12-plan-mode-entry-guidance-real-model.md
supersedes: null
---

# 0004. One backlog item for design and implementation by default

## Context

A session review found features split into a `Design` item and a later
`Implementation` item, each with its own approval and plan-mode round
(for example BL-7g5t and BL-5fng). The user had asked to build the feature, and
the split added user turns. The backlog had 16 `Design` and 6
`Implementation` items. The question of when to write `docs/plans/` records was
reviewed in the same item; the user chose to keep writing them as before.

## Decision

- A request to build something gets one backlog item that covers design and
  implementation under a single approval. Use the kind that matches the main
  outcome (usually `Implementation`).
- Split into a separate design item only when the user asks for design only or
  defers implementation.
- `docs/plans/` records are unchanged: write them as before, including after an
  approved plan-mode plan.

## Alternatives considered

- Keep the design/implementation split: preserves the extra approval rounds.
- Write `docs/plans/` records only for durable design reasoning: declined by the
  user; records stay as before.

## Consequences

- Fewer approval rounds and backlog items per feature.
- Design-only work still gets its own item when the user asks for it.
- Existing split items stay as they are; this applies to new items.
