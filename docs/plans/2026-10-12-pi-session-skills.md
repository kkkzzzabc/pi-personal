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
  the pi fork or an extension and are a separate item. (Now read from
  pi-perf-log records; see the 2026-10-12 "Client timing" amendment.)
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

## Amendments

### 2026-10-12 — Review fixes after the first commit
- Change: `stats --json` top sessions are projected to display fields (no prompt text or paths); `parentSession` is parsed as a file path and shown as an id; `/skill:name args` messages count as user turns with the typed arguments as the first user text; message entries without a role are counted as malformed instead of aborting; perf-audit `workloads.md` import guidance corrected and `SKILL.md` references fixed.
- Reason: Two-model review of `65e66db..382f82a` found the stats privacy statement, the parent display, the user-turn rule, and the tolerant-parsing contract did not match the implementation.
- Impact: Design unchanged; `summarizeSession` gains `parentSessionId`, `typedUserText` replaces the injected-prefix check. Test count 43 → 45.
- Evidence: Review session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`; fork `session-manager.ts` (`parentSession: previousSessionFile`) and `agent-session.ts` (`${skillBlock}\n\n${args}`).

### 2026-10-12 — Optional review improvements
- Change: cache ratio denominator includes cache-write tokens; `lastModel` tracked for the `list` MODEL column; session end time is the later of entry and message timestamps; CLI count options validated and a following flag is no longer consumed as a value; `show` rejects session filters (documented); entry guard compares real paths so symlinked or space-containing paths run; `Math.max` spread replaced by `maxOf`; perf-audit past-findings grammar row corrected.
- Reason: Optional findings from the same two-model review, confirmed against fork sources (`anthropic-messages.ts` usage fields and message timestamps).
- Impact: CACHE values drop for providers that report cache writes (Anthropic), DUR grows by the last reply's duration; no design change. Test count 45 → 52.
- Evidence: Session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`.

### 2026-10-12 — Client timing section from pi-perf-log records (BL-wdgq)
- Change: `pi-session-stats` adds a `## Client timing (pi-perf-log)` section and a `clientTiming` JSON key, read by the new `lib/pi-perf-records.mjs` from `<perfDir>/<sessionId>.jsonl` (`--perf-dir`, else `PI_CODING_AGENT_DIR/perf`, else `~/.pi/agent/perf`). It shows coverage (joins by `messageEntryId`, missing `turn_end`, skipped lines), per-model connect/TTFT/overhead percentiles, summed tool time versus span, render frames (frame-weighted mean and over-16 ms share, per-turn `p95Ms` distribution, longest frame), memory per session, and the turns with the largest overhead and longest frames.
- Reason: pi-perf-log records the client metrics this plan listed as a non-goal, and render frames became available with BL-u9b6. Reading only the documented schema keeps the skill independent of the extension's code.
- Impact: Only files of in-scope sessions are opened, so the existing filters apply; the section is omitted without records. Older records (`prompt` type, no `messageEntryId`/`toolSpanMs`/`frames`) are tolerated. Test count in `tests/pi-session-stats.test.mjs` 11 → 22; existing tests now pass `--perf-dir` so they never read the real home. Two-model review fixes before commit: tool sum and span compared over the same turns, connect/TTFT shown with one decimal in seconds, duplicate session ids read once with joined entry sets, `--top` bounds JSON memory rows, incomplete frame objects count as unmeasured, coverage-only output when only skipped lines exist.
- Evidence: Session `01a12bfb-c9ab-735a-8d64-9cb2385d9b31`. A read-only run on real data (`--since 2d`) reported 217 turns in 4 of 64 sessions, 202 joined, 31 with frames; mean frame 2.5 ms, 0.5% over 16 ms, longest frame 250.5 ms.
