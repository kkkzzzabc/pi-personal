# Fix shapes and their invariants

Each shape lists the invariant that must hold afterwards. Previous
regressions came from skipping these, not from the core idea.

## 1. Throttled re-parse of streaming input

Parse every delta up to a small size (1 KB), then only when the buffer has
grown by a fixed fraction (1/8). Parse the full buffer once when the item
completes.

Invariants:
- Every termination path must do the final full parse: normal end, provider
  error, abort, and streams that end without a close event. Otherwise the
  stored arguments are up to 1/8 short. Check each provider's end/abort
  branch, not only the happy path.
- Do not overwrite arguments that were set before any delta arrived (an
  empty scratch buffer must be skipped).
- Consumers that depend on object identity (see shape 3) need the parser to
  return the previous object when it skips a parse.
- UI that displays the arguments must receive the final values after the
  final parse. The interactive `message_end` handler had to push them
  explicitly because no further `message_update` arrives.

Test: count parses over thousands of deltas (expect roughly
`log(size)/log(1 + 1/8)` plus the initial ones); assert the last arguments
equal the full input; include a broken-stream case.

## 2. Incremental re-lex / re-render of growing text

Reuse tokens or rendered lines for the stable prefix; redo only the tail.

Invariants:
- Define the stable prefix conservatively. For markdown, reuse only up to a
  blank line before the last two blocks, and fall back to a full lex when
  constructs that span blocks are present (setext headings next to
  rules/math, unrecognised `$$` or `\[` line starts, HTML tags that carry
  lexer state such as `<a>`, `<pre>`, `<code>`, `<kbd>`, `<script>`).
- Only use the incremental path while streaming; do one full pass on
  completion.
- Caches keyed by content must also be keyed by anything that changes the
  output: theme instance, style object identity, and whether a syntax
  language is loaded yet (languages load lazily after first render).

Test: differential. Grow the input by 1, 7, 97, and random-sized chunks and
compare the incremental render to a full render at every step. Include the
fallback cases and assert they fail when the guard is removed.

## 3. Skip identical updates

`if (args === this.args) return;` style short-circuits.

Invariants:
- Confirm the upstream path really preserves identity (shallow copies of
  the message keep block objects; a proxy that rebuilds blocks per delta
  does not, and needs its own per-index tracking).
- Final values after completion must still be applied (see shape 1).

## 4. Partial work for collapsed views

Highlight or render only what is visible (first N lines) while collapsed;
do the rest on expand; cache the completed result.

Invariants:
- Collapsed and expanded views must agree on what they share (first N lines,
  total count, modulo known approximations such as unterminated comments).
- Cache keys include theme instance and language availability.
- Appends past line N must not re-highlight the first N lines.

Test: compare collapsed output to the head of the expanded output across
several file types and sizes; count lines passed to the highlighter
(collapsed: bounded; expanded: all).

## 5. Cursor-based buffer scanning

Scan from a cursor, extract items, and slice the remainder once per read
instead of once per item. Keep CR handling: a trailing `\r` may be the first
half of a `\r\n` split across reads; hold it for the next read.

Test: thousands of events in a single read with `\n`, `\r\n`, and `\r`
separators; `\r\n` split across reads; byte-by-byte input. Compare to the
reference parse.

## 6. Index-based rolling buffers

Replace `shift()` with a read index and compact occasionally. Replace
`unshift` accumulation with `push` + `reverse`. Count lines with `indexOf`
instead of `split`.

Test: keep the old implementation as a pure fixture and compare outputs on
random and boundary inputs.

## 7. Bounded output capture

Write output synchronously (`writeSync`) so pipe backpressure throttles the
producer, cap the file (1 GiB) with a trailing notice, hold a tail in
memory, and never let a file error fail the tool: report it at close and
fall back to the in-memory tail.

Invariants: exit code and tail output survive every failure mode; cap
boundary writes are kept exactly; the TUI component for `!` commands keeps
only a bounded tail, not the full output.

## 8. Shallow snapshots for undo

Strings are immutable; copy arrays and maps, share strings. Keep paste
registries restorable.

## 9. Startup lazy loading

Only pursue when measured. Eager/lazy language split already exists in
`syntax-highlight.ts`. Inline `await import()` is disallowed by the fork's
AGENTS.md outside the lazy provider registration; a policy exception needs
the user's decision.
