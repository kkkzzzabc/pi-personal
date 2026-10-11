---
title: Can the corrected Pi fork run a Claude reviewer with skills disabled?
date: 2026-10-11
session: 01a1274f-21fa-75eb-a7cb-e17000a84e8a
based_on:
  - docs/spikes/2026-10-11-pi-subagent-for-review.md
  - docs/adr/0001-move-docs-guidance-into-pi-fork.md
result: yes
---

# Can the corrected Pi fork run a Claude reviewer with skills disabled?

## Question

Does an actual Anthropic request, including a read-only review task, succeed
with `--no-skills` after the local fork removes the original documentation
fallback?

This follow-up replaces the earlier review spike's constraint that Anthropic
reviewers must keep skills enabled, for the installation tested here. It does
not replace that spike's other findings or select a default reviewer model.

## Setup

- Executable: `~/.local/bin/pi`, resolving to
  `~/.local/share/pi-fork/bin/pi`.
- Active release: `~/.local/share/pi-fork/releases/b1a78306c-docs-fallback-20261011-043238`.
- Package: `@earendil-works/pi-coding-agent`, version `1.1.0`.
- Fork source: `/Users/kkkzzzabc/workspace/projects/personal/pi`, HEAD
  `b1a78306c`, with uncommitted changes to `system-prompt.ts` and two prompt
  test files. The version and HEAD alone do not identify the corrected build.
- Model: `anthropic/claude-haiku-4-5`; the response reported
  `claude-haiku-4-5-20251001`.
- Working directory: the earlier scratch repository `/tmp/review-spike`.

The source at `packages/coding-agent/src/core/system-prompt.ts:161-171` and
installed `dist/core/system-prompt.js` were inspected. The core adds neutral
`pi-docs` guidance when the skill and a selected reader are available. Otherwise
it omits the default docs section instead of restoring the original text.
The installed CLI entry point is bundled; successful calls below verify the
active executable's behavior, not just the unbundled source.

Two smoke requests ran concurrently, with and without `--no-skills`:

```bash
cd /tmp/review-spike
pi -p --no-session --no-mcp --offline --mode json \
  --model anthropic/claude-haiku-4-5 \
  --tools read,grep,find,ls \
  "Reply with exactly CLAUDE_CHECK_OK. Do not use tools."

pi -p --no-session --no-mcp --no-skills --offline --mode json \
  --model anthropic/claude-haiku-4-5 \
  --tools read,grep,find,ls \
  "Reply with exactly CLAUDE_CHECK_OK. Do not use tools."
```

A third request reused the earlier reviewer prompt and diff:

```bash
cd /tmp/review-spike
pi -p --no-session --no-mcp --no-skills --offline --mode json \
  --model anthropic/claude-haiku-4-5 \
  --tools read,grep,find,ls \
  --append-system-prompt /tmp/review-spike-reviewer.md \
  "Task: Review the change in /tmp/review-spike-diff.patch. Intent: add sum, sorted, and median helpers for numeric arrays."
```

The reviewer prompt required read-only review, repository-rule precedence,
`file:line` citations and concrete failure examples, zero findings allowed,
and no delegation. The task's intent wording was reused as written; it was
not independently checked for exact correspondence with the fixture's exports.
Each process had a 100-second timeout. `--offline` disables startup network
operations, not the authenticated model request.

## Result

**Yes.** All three actual Claude requests completed with exit code 0 and
`stopReason: stop`. Both smoke requests returned `CLAUDE_CHECK_OK`, and the
skills-disabled reviewer read the fixture and returned findings. The previous
HTTP 400 was not observed in these runs.

This is one run per condition on one model and one local build. It establishes
that `--no-skills` works in the tested setup, not universal reliability across
models, installations, or future provider behavior.

## Evidence

| Request | Result | Input / output tokens |
|---|---|---|
| Skills enabled | `CLAUDE_CHECK_OK` | 2,254 / 55 |
| `--no-skills` | `CLAUDE_CHECK_OK` | 1,755 / 48 |
| Read-only review with `--no-skills` | Review report | Not summarized |

The review used three `read` calls and one `ls` call. It reported missing
argument validation in `median`, an off-by-one loop in `average`, and mutation
of the input array by `median`. The SHA-256 hash of `math.js` was unchanged
before and after the request.

This was an execution check, not a review-quality evaluation: findings and line
numbers were not independently triaged, and the output did not consistently
supply the concrete failing examples requested by the reviewer prompt.

Local raw evidence:

- Smoke requests:
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/pi-claude-recheck-9tjqpr09/{skills-enabled,no-skills}.jsonl`
  and the corresponding `.stderr` files (both empty).
- Review request: `/tmp/pi-claude-review-recheck.jsonl`.
- Inputs: `/tmp/review-spike-reviewer.md`, `/tmp/review-spike-diff.patch`,
  and `/tmp/review-spike/`.

These temporary files are local evidence, not durable repository artifacts.
The commands and observations above remain the record if they are removed.

## Implications

- The earlier requirement to keep skills enabled for Anthropic reviewers no
  longer applies to this corrected installation. A review skill can use
  `--no-skills` with Claude in the tested configuration.
- Keep the other isolation measures: prepare the diff in the parent, limit
  reviewer tools, disable MCP, and verify findings in the parent.
- ADR 0001 already records the core policy. This experiment adds authenticated
  execution evidence without changing that decision or editing older documents.
- Review skill design and implementation remain pending. No default provider,
  model, reviewer count, or automatic-fix policy was chosen here.
