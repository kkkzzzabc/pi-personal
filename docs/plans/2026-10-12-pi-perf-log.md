---
title: pi-perf-log extension
date: 2026-10-12
session: 01a12ba1-74b5-76b8-bc4a-1d2e52383857
based_on:
  - docs/backlog/BL-uqw4-build-pi-perf-log-extension.md
  - docs/plans/2026-10-12-pi-session-skills.md
---

# pi-perf-log extension

## Goal

Session files record provider round-trip time and token usage but not what
the user feels: time to first token, time spent in tools, client overhead
between provider and tool work, and process memory over a long session.
`pi-perf-log` records these per turn from public extension events into a
separate JSONL file per session, so `pi-session-stats` can later join them
with session files and `perf-audit` gets real distributions instead of
synthetic sizes.

## Non-goals

- TUI render time per frame. The extension API cannot see rendering; a hook
  in the pi fork is a separate item. The `frames` field is reserved for it.
- Writing into session files. Timing is not conversation state.
- Any conversation content. Records contain ids, model names, tool names and
  numbers only.

## Design

- `recorder.ts` is a pure state machine with an injected clock and memory
  sampler; `writer.ts` appends one JSON line per record; `extension.ts`
  wires `pi.on` handlers to both and swallows all errors; `config.ts`
  follows the repository's per-extension config pattern.
- Lifecycle rules derived from the fork sources:
  - `turn_end` is not guaranteed (the host skips it when the persisted
    assistant entry id cannot be resolved). A pending turn is flushed at the
    next `turn_start`, `agent_end`, `session_start` or `session_shutdown`
    with `turnEndMissing: true`.
  - `turnIndex` restarts at 0 for every prompt (`agent_start`); records add
    `promptSeq`, the count of `agent_start` since `session_start`.
  - The stream `start` event arrives as `message_start`, not
    `message_update`; `connectMs` is measured there.
  - `message_update` handlers are awaited per delta, so the handler does one
    O(1) check and returns.
  - Session ids change on `/new`, resume and fork; the id is read at write
    time, never cached.
  - Subagent sessions load with `noExtensions`, so their events are not
    seen; memory is process-wide and includes them.
- Schema v1 is documented in `extensions/pi-perf-log/SCHEMA.md` and is the
  only coupling point with `pi-session-stats`.

## Phases

### Phase 1: records
- Changes: this plan; backlog item BL-uqw4 active.

### Phase 2: extension
- Changes: `extensions/pi-perf-log/{index,extension,recorder,writer,config}.ts`, `SCHEMA.md`.
- Verify (automated): `node --test tests/pi-perf-log.test.mjs`.
- Verify (manual): `tui-check` faux run with the extension; a tool-calling
  scenario produces `session`, `turn`, `prompt` lines.

### Phase 3: registration
- Changes: `package.json` test script. README row deferred.

## Risks and open questions

- `connectMs`/`ttftMs` are measured from `turn_start`, which precedes the
  user message emission by a few milliseconds.
- `overheadMs = turnMs - providerMs - toolMs` attributes everything else
  (extension handlers, persistence, rendering on the same thread) to the
  client; it is a ceiling, not a render measurement.
- Follow-ups: `pi-session-stats` client-timing section; `perf-audit`
  workloads from real distributions; fork render-frame hook.

## Amendments

### 2026-10-12 — Data-quality fixes from review
- Change: synthetic `message_start` for error/aborted messages no longer sets `connectMs`; `toolSpanMs` (wall-clock first tool start to last tool end, top-level calls only) added and `overheadMs` now subtracts it instead of the summed `toolMs`; `messageEntryId` from `turn_end` added as the join key with session files; `prompt` records renamed to `run` and `promptSeq` to `runSeq`, documented as agent-run counters that restart after every `session_start`.
- Reason: Two-model review of `ad39307` found connect times recorded for failures without a stream (host emits a synthetic `message_start`), overhead clamped to 0 under the default parallel tool execution, and a false join claim for `promptSeq` across resume/reload and auto-retry runs.
- Impact: Schema stays v1 (no reader existed yet); field set changed as above. Test count 19 → 23. A faux-model `tui-check` run confirmed `messageEntryId` equals the session file's assistant entry ids.
- Evidence: Session `01a12ba1-74b5-76b8-bc4a-1d2e52383857`; fork `agent-loop.ts` (synthetic `message_start`, parallel tool execution), `agent-session.ts` (`agent.continue()` after retryable failures).
