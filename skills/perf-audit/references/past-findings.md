# Past findings

Calibration data: what an audit of this fork found, what was kept, and
what was dropped after measurement. Append new audits at the bottom.

## 2026-10-11/12: Pi-Bolt derived audit

Source: diff of Pi-Bolt (MIT, forked from pi v1.1.0) against this fork.
Fork commits: `628cc6dfb`, `9ed8f5943`, `9815510bb`, `4787ab4ac`,
`432b36091`. Numbers are single runs on one Mac.

| Item | Path | Outcome | Evidence |
|---|---|---|---|
| Tool-call args re-parsed per delta | `json-parse.ts`, all providers, `proxy.ts` | Kept (shape 1) | 200 KB in 20 B deltas: 10,000 parses -> 97; scanned chars ~1e9 -> ~2e6 |
| `updateArgs` redraw on identical object | `tool-execution.ts` | Kept (shape 3) | paired with above |
| Write renderer highlights whole file while collapsed | `renderers/write.ts` | Kept (shape 4) | 44 KB file streamed in 7 B pieces: 19.0 s -> 2.1 s |
| Session path walked per request | `session-manager.ts` | **Dropped** | 10,101 entries: 0.71 ms per call, ~5-7 ms per turn vs multi-second turns; cache invalidation risk judged higher than benefit |
| Bash output: unbounded async writes, `shift()` buffer | `output-files.ts`, `output-accumulator.ts`, `bash-executor.ts` | Kept (shapes 6, 7) | 60k chunks 1,514 ms -> 192 ms; 240k chunks 7,727 ms -> 688 ms |
| `!` command component keeps full output | `bash-execution.ts` | Kept (shape 7) | bounded tail |
| Truncation `split`/`unshift` | `tools/truncate.ts` | Kept (shape 6) | equivalence vs fixture on 4,000 random inputs |
| Anthropic SSE buffer rescans | `anthropic-messages.ts` | Kept (shape 5); also fixed split `\r\n` bug | 2,000 events per read tests |
| pi-messages SSE buffer rescans | `pi-messages.ts:287-302` | **Deferred** | Same pattern as Anthropic; provider only used by the `radius` OAuth gateway, which this fork's user does not use (no credential, no sessions). Fix if that changes. |
| Streaming markdown full re-lex | `tui/components/markdown.ts` | Kept (shape 2) | 60k chars/200 frames: full 1,172 ms vs incremental 83 ms; per-frame at 120k chars 20.2 ms -> 0.8 ms. Review found 5 equivalence gaps (setext/math/HTML state); fixed with fallbacks |
| Undo `structuredClone` per keystroke | `tui/undo-stack.ts` | Kept (shape 8) | not timed |
| Paste terminator search over whole buffer | `tui/stdin-buffer.ts` | Kept (shape 5) | 4 MB paste: 217 ms -> 3 ms |
| RPC JSONL long line rescans | `modes/rpc/jsonl.ts` | Kept (shape 5) | 8 MB line: 244 ms -> 3 ms |
| Skill block regex backtracking | `agent-session.ts` | **Dropped** | 80 KB unterminated input: <0.1 ms on V8 in three variants; the reference's issue was its own regex engine |
| `--version` fast path, hljs lazy load | `bun/cli.ts`, `syntax-highlight.ts` | Not pursued | ~1.4 ms / 1 MB; eager/lazy split already exists |
| openai-responses grammar chunk append | `openai-responses.ts` | Not pursued | the helper (`appendGrammarToolInputJsonDelta`, defined in `constrained-sampling.ts`) is shared by the completions and responses paths; the reference change was not mapped onto this structure and was not measured |
| Engine-level (AOT, heap snapshot, launcher, Bun runtime tuning) | n/a | Not applicable | requires a patched runtime; the fork runs on Node |

Review regressions caught after the fixes (all fixed):
- Broken stream left throttled (short) args in the tool card: `message_end`
  had no `updateArgs`.
- Highlight cache ignored languages loaded after first render (markdown,
  yaml, html, css are lazy).
- Empty scratch buffer overwrote `content_block_start` input with `{}`.
- Proxy test could not detect throttling because `new Response(string)`
  delivers the body in one chunk.
- A time-ratio assertion was replaced by counting highlighted lines.

## 2026-10-12: edit renderer (reference-free trial of this skill)

Scope: tool-call argument streaming through `renderers/edit.ts`, a path the
Pi-Bolt audit did not touch. Numbers are single runs on one Mac.

| Candidate | Path | Outcome | Evidence |
|---|---|---|---|
| `JSON.stringify` of all edits per `renderCall` (argsKey) | `edit.ts:216` | **Dropped** | Streaming 99 KB / 397 KB / 1.6 MB args in 20 B deltas through the throttled parser + `updateArgs` + `render`: 90 / 101 / 113 renderCalls, 14.9 / 32.9 / 129.6 ms total, 0.17 / 0.33 / 1.15 ms per renderCall. Sub-linear growth; far below the 16 ms frame budget. |
| `renderDiff` re-run on each component rebuild after preview | `edit.ts:154` | Dropped without timing | Rebuilds happen only on full-tree `invalidate()` (theme change, grammar load, cell-size reply, PNG transcoder), not per frame. |
| `computeEditsDiff` twice (preview at `argsComplete`, then tool execution) | `edit-diff.ts:514` | Dropped without timing | Constant two calls per edit; no per-delta work. |

No code changed. Lesson for the skill: `/tmp` scripts need absolute import
paths (workloads.md updated).
