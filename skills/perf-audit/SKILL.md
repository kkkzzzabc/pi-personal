---
name: perf-audit
description: >
  Find and fix performance problems in the local pi fork without a reference
  implementation: superlinear (O(n^2)) work on streaming, large tool output,
  large pastes, long sessions, and TUI redraw paths, plus unbounded memory or
  disk use. Use when asked to audit, profile, or optimize pi, when a
  symptom is reported (freeze during a large write, slow long answer, memory
  growth over a long session), or when porting a performance idea without
  being able to diff against its source. Measure first, change only what the
  measurement justifies, and prove the fix with count-based tests.
compatibility: pi fork at ~/workspace/projects/personal/pi, Node 22.18+ (native TypeScript), vitest via the repo's node_modules.
---

# perf-audit

The fork's AGENTS.md still applies: smallest appropriate change, no `any`,
no inline imports, tests you add must run and pass, no real provider calls,
never commit or install unless asked. This skill adds the order of work and
the evidence bar that a reference fork used to supply.

## What a reference fork gave us, and what replaces it

| Reference provided | Replacement |
|---|---|
| Where the problems are | Pattern audit on the entry points below, then measurement |
| How to fix them | Fix shapes in `references/fix-shapes.md` |
| Which ones matter in practice | Synthetic workloads in `references/workloads.md`; user-reported symptoms; calibration data in `references/past-findings.md` |

The third row is the weak point. A pattern audit produces many candidates and
most are harmless. Do not fix a candidate because it looks quadratic. Fix it
because a workload shows superlinear growth or a bound is missing.

## Procedure

1. **Scope.** Write down the symptom or the path to audit (one of: tool-call
   argument streaming, assistant text streaming, bash output, paste/editor,
   session load/projection, RPC/SSE parsing, startup). If the user reported a
   symptom, reproduce it before anything else.
2. **Audit.** Read the entry points for that path in full (list below). Mark
   each place where work per event is proportional to total size so far, or
   where a buffer, array, or file grows without a bound. Record
   `file:line`, the pattern name, and the growth driver (bytes, deltas,
   lines, entries, keystrokes).
3. **Measure.** For each candidate, run a workload from
   `references/workloads.md` at two or three sizes (for example 1x, 4x, 16x).
   Report wall time per size and the ratio. Linear: ratio tracks size.
   Quadratic: ratio tracks size squared. Also record the absolute cost per
   event against the budget: one TUI frame is 16 ms; a model turn is seconds,
   so a few ms per turn is not worth a cache.
   Write scripts to `/tmp`, run them, delete them when done. Use
   `node --cpu-prof` when the hot spot is not obvious.
4. **Decide.** Keep only candidates that are superlinear in a realistic
   size, or exceed the frame budget, or lack a bound on memory/disk. Drop the
   rest and say why (see `past-findings.md`: 2-4 and 2-12 were dropped by
   measurement). State the ranking and the risk of each fix before editing.
5. **Fix.** Apply the matching shape from `references/fix-shapes.md`. Check
   the invariants listed there; they are where previous fixes regressed.
6. **Verify.**
   - Equivalence: the new path must produce the same output as the old one.
     Keep the old implementation as a test fixture when it is pure (the
     truncate fix did this) or compare against a full recompute at every
     step (the markdown and write-renderer fixes did this).
   - Counting, not timing: assert how many parses, highlights, or lexes
     happened, or how many bytes were scanned. Time-based assertions are
     flaky under load and were rejected in review.
   - Prove the test bites: disable the fix and confirm the test fails.
   - Re-run the before/after workload and report both numbers with sizes.
   - Run the repo checks the fork's AGENTS.md requires.
7. **Review.** Request reviewer subagents for anything touching caches,
   streaming end states, or provider parsers. In the last audit four
   reviewers found two regressions the tests had missed (final args not
   shown after a broken stream; cached highlight ignoring late-loaded
   languages). Verify each reviewer claim by reading the lines before acting.
8. **Record.** Append the outcome (kept, dropped with measurement, or
   deferred) to `references/past-findings.md` so the next audit starts from
   calibration instead of a blank list.

## Pattern checklist

Look for these; the growth driver is in parentheses.

- Full re-parse or re-render of accumulated input on every delta (deltas x
  size): `parseStreamingJson` per delta, full `lex` of streaming text,
  highlighting a whole file on each argument update.
- Re-scanning a buffer from the start after each extracted item (items x
  size): `indexOf` from 0 on a growing string, `buffer = buffer.slice(...)`
  per line, `replace(/\r\n/g)` on the whole buffer per read.
- Array `shift()` / `unshift()` in a loop (items^2); `split("\n")` of
  multi-MB output just to count lines.
- Character-by-character string `+=` building (chars^2 in worst case).
- Deep copies on every event: `structuredClone` of editor state per
  keystroke, `[...array]` of event history per delta, `{...obj}` of large
  args per update.
- Same-object redraws: a component re-renders when handed the identical
  object it already holds.
- Missing bounds: async `WriteStream.write` without backpressure, output
  arrays kept for the component's lifetime, files without a size cap.
- Regex backtracking on unterminated input. Measure before fixing; V8 did
  not reproduce the one found in the reference audit.

## Entry points by path (fork paths)

- Tool-call argument streaming: `packages/ai/src/utils/json-parse.ts`,
  every `packages/ai/src/api/*.ts` provider stream loop (27 files; the
  tool-call delta handling and the end/abort/error paths),
  `packages/agent/src/proxy.ts`,
  `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`,
  `packages/coding-agent/src/core/tools/renderers/{write,edit}.ts`,
  `message_end` handling in
  `packages/coding-agent/src/modes/interactive/interactive-mode.ts`.
- Assistant text streaming: `packages/tui/src/components/markdown.ts`,
  `packages/coding-agent/src/modes/interactive/components/assistant-message.ts`.
- Bash output: `packages/coding-agent/src/core/bash-executor.ts`,
  `packages/coding-agent/src/core/tools/output-accumulator.ts`,
  `packages/coding-agent/src/utils/output-files.ts`,
  `packages/coding-agent/src/core/tools/truncate.ts`,
  `packages/coding-agent/src/modes/interactive/components/bash-execution.ts`.
- Paste and editor: `packages/tui/src/stdin-buffer.ts`,
  `packages/tui/src/undo-stack.ts`, `packages/tui/src/components/editor.ts`.
- Session: `packages/coding-agent/src/core/session-manager.ts`
  (`buildSessionProjection`, `getBranch`), `agent-session.ts` call sites.
- Transport parsing: SSE loops in `packages/ai/src/api/*.ts`,
  `packages/coding-agent/src/modes/rpc/jsonl.ts`.
- Startup: `packages/coding-agent/src/bun/cli.ts`, `src/main.ts`,
  `packages/coding-agent/src/utils/syntax-highlight.ts` (eager vs lazy
  languages).

Confirm paths with `ls` before relying on them; files move.

## Reporting

Conclusion first: which candidates were kept, dropped, or deferred, with the
measurement that decided each. Include before/after numbers with input
sizes and the machine caveat (single run, this Mac). Separate what was
measured from what is inferred. List what was not verified: real TUI feel,
real provider calls, long-running memory behaviour.
