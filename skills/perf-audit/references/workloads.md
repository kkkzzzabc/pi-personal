# Synthetic workloads

Write each script to `/tmp/perf-<name>.ts` and import fork sources by
absolute path (`/Users/.../pi/packages/...ts`); relative imports from
`/tmp` do not resolve. Run from the fork root with
`node /tmp/perf-<name>.ts` so bare package imports (`@earendil-works/*`)
resolve through the fork's `node_modules`; delete the script after
recording the numbers. Always run at least two sizes and report the ratio.
Use `node --cpu-prof --cpu-prof-dir=/tmp/prof /tmp/perf-<name>.ts` when
the hot spot is unclear; inspect the `.cpuprofile` top-down by self time.

Numbers in `past-findings.md` were measured this way on one Mac, single run.

## Tool-call argument streaming

Feed a provider stream parser with a `write` tool call whose `content` is
50 KB, 200 KB, and 800 KB, delivered in 20-byte deltas. Count calls to the
JSON parser (wrap or spy on it) and measure wall time. Also run a variant
that stops mid-call without an end event and check the final stored
arguments equal the bytes received.

For the TUI side, drive `ToolExecutionComponent.updateArgs` with the same
sequence and count `highlightCode` invocations and lines passed, collapsed
and expanded.

## Assistant text streaming

Grow a markdown document to 10k, 60k, and 120k characters across 200
frames, calling the `Markdown` component's render each frame at width 100.
Report total time and per-frame time; the budget is a fraction of 16 ms.
Include lists, fenced code, tables, setext headings, LaTeX blocks, and
inline HTML in the fixture.

## Bash output

Emit 60k and 240k small chunks (for example 20 bytes each) through the
output accumulator and the `!` command path; record wall time and verify the
tail and the full file. For the bounded-capture check, write exactly to the
cap and one chunk past it. Memory growth from missing backpressure does not
reproduce reliably on a fast SSD; the fix is structural (sync writes), so
test the structure, not the leak.

## Paste and editor

Simulate a bracketed paste of 1 MB and 4 MB arriving in 4 KB chunks
through `stdin-buffer`; measure total time. Then apply 100 keystrokes after
the paste and measure undo-snapshot cost; confirm undo restores the paste
registry.

## Session projection

Build a session with 2k and 10k entries, then time
`buildSessionProjection()` and `getBranch()` once and over an estimated
10 calls per turn. Compare to turn latency (seconds). In the last audit
10,101 entries cost 0.71 ms per call, which did not justify a cache.

## Transport parsing

Deliver 2,000 SSE events in one read with `\n`, `\r\n`, and `\r`
separators, plus a `\r\n` split across two reads. For RPC JSONL, send one
8 MB line in 64 KB pieces. Compare parsed output to a reference and
measure wall time.

## Startup

`hyperfine` is not assumed. Use `time pi --version` and `time pi --help`
five times each and take the median. Only investigate if the median is far
above the previous release's; `past-findings.md` recorded this path as low
value.
