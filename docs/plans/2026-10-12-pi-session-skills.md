---
title: pi-session-find and pi-session-stats skills
date: 2026-10-12
session: 01a12ba1-74b5-76b8-bc4a-1d2e52383857
based_on:
  - docs/backlog/BL-znnb-build-pi-session-find-and-pi.md
  - docs/backlog/BL-nzsc-clarify-read-only-session-analysis-scratch.md
  - docs/adr/0004-one-backlog-item-for-design-and-implementation.md
---

# pi-session-find and pi-session-stats skills

## Goal

Local pi sessions (`~/.pi/agent/sessions/**/*.jsonl`) hold the only record of
what was asked, which models and tools ran, how long they took and what they
cost. Today that record is read with ad-hoc one-off scripts. Two skills make
it a repeatable, read-only query:

- `pi-session-find`: list sessions, search across them, inspect one.
- `pi-session-stats`: usage, per-model and per-tool timing, cost, and real
  workload sizes (largest tool arguments and results, longest sessions).

The workload sizes give `perf-audit` evidence about what sizes actually occur,
which a reference fork used to supply.

## Non-goals

- Client-side performance metrics that the session format does not record:
  time to first token, TUI render time, process memory. These need changes in
  the pi fork or an extension and are a separate item.
- Branch-aware projection of the entry tree. Stats count every entry in the
  file and say so.
- Writing anything. Scripts print to stdout only; no scratch files, caches or
  exports of session content (see BL-nzsc).

## Design

- Shared parsing lives in root-level `lib/pi-sessions.mjs` (README "Adding
  resources"), imported by both skill scripts. Neither skill depends on the
  other.
- Sessions directory resolution mirrors the fork's `config.ts`:
  `PI_CODING_AGENT_SESSION_DIR`, then `PI_CODING_AGENT_DIR/sessions`, then
  `~/.pi/agent/sessions`; `--sessions-dir` overrides.
- Parsing is tolerant: malformed lines are counted, unknown entry types are
  kept and reported, so format drift degrades output instead of failing.
- Search default scope is user messages and assistant text. Tool-call
  arguments and tool results are included only with `--include tools`,
  because they carry file contents and command output that drown ordinary
  queries.
- Every output has a `--json` form so other skills and scripts can consume
  it without parsing tables.
- Private content: output contains conversation text. SKILL.md tells the
  model not to send it to external services and to prefer bounded excerpts.

Commands and output columns are specified in the approved plan file for the
implementing session and in each SKILL.md.

## Phases

### Phase 1: records
- Changes: this plan; backlog item BL-znnb set to `active`.

### Phase 2: shared library
- Changes: `lib/pi-sessions.mjs`; `tests/pi-sessions-lib.test.mjs`;
  synthetic fixtures under `tests/fixtures/pi-sessions/`.
- Verify (automated): `node --test tests/pi-sessions-lib.test.mjs`.

### Phase 3: pi-session-find
- Changes: `skills/pi-session-find/SKILL.md`, `scripts/find.mjs`
  (`list`, `search`, `show`); `tests/pi-session-find.test.mjs`.
- Verify (automated): `node --test tests/pi-session-find.test.mjs`.
- Verify (manual): `list`, `search`, `show` against the real sessions
  directory; counts match an independent scan.

### Phase 4: pi-session-stats
- Changes: `skills/pi-session-stats/SKILL.md`, `scripts/stats.mjs`;
  `tests/pi-session-stats.test.mjs`.
- Verify (automated): `node --test tests/pi-session-stats.test.mjs`.
- Verify (manual): run against the real sessions directory; provider set
  and session count match an independent scan.

### Phase 5: registration
- Changes: `package.json` test script; README resource rows. These files are
  being edited by another session at the time of writing; the one-line edits
  are handed over if that session has not committed yet.

## Risks and open questions

- Session format version is 3; the parser does not validate the version and
  relies on field presence. A future format change shows up as missing
  columns rather than errors.
- `durationMs` on assistant messages is the provider round trip including
  streamed tool-call arguments; it is not a pure model latency.
- Large `search --include tools` runs print many excerpts; excerpts and
  per-session counts are bounded by options.
