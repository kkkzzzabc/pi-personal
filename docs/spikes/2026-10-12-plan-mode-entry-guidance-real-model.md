---
title: Does the plan-mode entry guidance remove redundant rounds with a real model?
date: 2026-10-12
session: 01a12b62-009e-7178-96d0-29d3408ab23e
based_on:
  - docs/plans/2026-10-11-plan-mode-extension.md
result: partial
---

# Does the plan-mode entry guidance remove redundant rounds with a real model?

## Question
With the entry, re-entry and scope guidance from commit `48caa4d` (BL-ujxs), does
`gpt-6.1-sol-fast` avoid planning a proposal and then re-planning its implementation,
while still planning file changes, keeping research-only work research-only, and
re-planning after a material change?

## Setup
- tui-check real mode, `openai/gpt-6.1-sol-fast`, `--thinking low` (plan mode raises it to
  `high`), `--context-files` (the user's global `AGENTS.md` applied), only
  `extensions/plan-mode/index.ts` loaded. A driver accepted every plan-mode confirmation and
  chose "Approve and implement here".
- Fixture: a small Node notes CLI (`src/index.js`, `src/store.js`, one test, `README.md`).
- One run per scenario; prompts in Korean, as in the user's sessions:
  - A: propose a docs folder structure ("don't create yet") → revise it → "create it".
  - B: add `notes delete <id>` with tests and README.
  - D (same run as B): switch storage to one Markdown file per note with migration.
  - C: "make a plan to research the storage/error handling into `docs/research.md`; research
    only, no code changes" → "proceed with that plan".
- Plan files written to `~/.pi/plans/` by the runs and the run directories were deleted after
  extracting the evidence. Total provider cost reported in the sessions: about $0.43.

## Result
Partial. A, B and D behaved as intended. In A the proposal and its revision were answered in the
chat, and "create it" led to exactly one plan round followed by implementation without
re-entering plan mode. B planned once, with changes and `npm test` verification in the plan,
and implemented right after approval. D re-entered plan mode for the material storage change.
C kept the research-only scope (code unchanged, only `docs/research.md` written), but the
model never used plan mode: it presented the plan in the chat, and after "proceed" it wrote
the document directly. That run also answered the first turn in Japanese.

## Evidence
- Tool sequences per run: [tool-sequences.txt](evidence/plan-mode-entry-real-model/tool-sequences.txt).
- A: no `enter_plan_mode` for the two proposal turns; after "좋습니다. 이 구조로 만들어주세요."
  one `enter_plan_mode` → plan → `exit_plan_mode` → six `write` calls, one `edit`, and `npm test`.
- B: one `enter_plan_mode` before any change; the plan's "검증" section runs `npm test`; after
  approval, `edit`/`write` calls and `npm test` without another `enter_plan_mode`.
- D: `enter_plan_mode` with reason "저장 형식 변경은 기존 CLI·테스트 전반과 데이터 마이그레이션에
  영향을 줍니다…", then a new plan and implementation.
- C: no plan-mode tool calls; `src/` and `test/` were identical to the fixture afterwards; the
  first answer began "コードは変更せず…".
- `finish.json` for all runs: `piExited: true`, `ttySessionDestroyed: true`, `configChanges: []`;
  model calls A 17, B 28, C 8.

## Implications
- The guidance removed the observed redundant pattern in the proposal → create and implement
  cases for this model, and kept re-planning for a material change. One run each is not proof.
- An explicit "make a plan" request for work that later writes a file can now be answered in
  the chat without plan mode. Scope held here, but the user's planning preference may expect
  plan mode for such requests; this needs a decision (registered as a candidate).
- The Japanese reply is likely model variance unrelated to plan mode; no change is proposed.
