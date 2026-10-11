---
title: Can pi run an isolated, read-only, model-selectable reviewer that cannot delegate?
date: 2026-10-11
session: 01a126e5-63ba-72b8-af15-e9d632953a12
based_on:
  - docs/research/2026-10-11-code-review-in-agent-customization.md
result: yes
---

# Can pi run an isolated, read-only, model-selectable reviewer that cannot delegate?

## Question

The review research recommends a reviewer that (1) does not see the authoring
session, (2) cannot modify files, (3) can run on a chosen model, including
another provider, and (4) cannot spawn further reviewers. Can pi 1.1.0 provide
all four with a skill alone, or does it need an extension?

## Setup

- pi 1.1.0, managed install
  (`~/.pi/agent/install/releases/1.1.0/node_modules/@earendil-works/pi-coding-agent`,
  referred to as `$pi` below). This repository is installed as a global pi
  package, so child processes load `extensions/claude.ts` and the `pi-docs`
  skill.
- Scratch repository `/tmp/review-spike`: an `AGENTS.md` rule ("Every exported
  function must validate its arguments") and one commit adding four planted
  defects to `math.js`: off-by-one loop, lexicographic `sort()`, upper-middle
  median for even lengths, and no argument validation. The diff was written to
  `/tmp/review-spike-diff.patch` before review.
- Reviewer instructions in a file passed with `--append-system-prompt`:
  review only, read the diff file, follow `AGENTS.md`, cite `file:line` with a
  concrete failing input, zero findings allowed, no delegation.
- Each reviewer is a child process:

  ```bash
  pi -p --no-session --no-mcp --model <provider/id> \
     --tools read,grep,find,ls \
     --append-system-prompt reviewer.md \
     "Task: Review the change in <diff file>. Intent: <one line>."
  ```

  `--mode json` was added in experiments 1–4 to inspect the system prompt,
  tools, and usage.

Experiments:

1. Tools and context visible to a child with `--tools read,grep,find,ls`.
2. Load the example subagent extension (`-e $pi/examples/extensions/subagent/index.ts`)
   with and without the allowlist; check whether the `subagent` tool appears.
3. Instruct the child to rewrite `math.js`; compare the file hash.
4. Run the review on `anthropic/claude-haiku-4-5` and `openai/gpt-6-luna` in
   parallel from one shell.
5. Repeat the OpenAI review in text mode to check that stdout is usable
   directly from a skill's bash call.

## Result

**Follow-up:** The requirement below to keep Anthropic reviewer skills enabled
was resolved for the corrected fork tested in
[the later Claude experiment](2026-10-11-claude-reviewer-after-docs-fallback-removal.md).
[ADR 0001](../adr/0001-move-docs-guidance-into-pi-fork.md) records the core change.
The setup and observations here describe the earlier managed installation;
other isolation and finding-verification conclusions still apply.

**Yes.** Running `pi -p` as a child process gives all four properties
without an extension. The skill can invoke it through bash, and two providers
ran in parallel in 18 seconds of wall-clock time. Three conditions apply:
the diff must be prepared by the parent because a reviewer with `bash` cannot
be held read-only; `--no-skills` must not be used with Anthropic models while
this repository's `claude.ts` depends on the `pi-docs` skill; and MCP tools
need `--no-mcp` because the allowlist keeps them. The official subagent
example extension uses the same mechanism and adds streaming UI and a
parallel tool, so it is optional.

## Evidence

**pi has no built-in subagent.** "Pi ships with powerful defaults but skips
features like sub-agents" (`$pi/README.md:19`). The example extension spawns
a separate `pi` process per subagent (`$pi/examples/extensions/subagent/README.md:7`)
with `--mode json -p --no-session`, an optional `--model`, and `--tools` from
the agent definition (`$pi/examples/extensions/subagent/index.ts:300-307`).

**1. Isolation and context.** The child's events contain only its own system
prompt and the task message; there is no trace of the parent conversation.
Its tools were exactly `read, grep, find, ls`. It loaded the cwd's `AGENTS.md`
into `project_context` and quoted the rule correctly. It also loaded this
repository's `pi-docs` skill (global package).

**2. No delegation.** With the subagent extension loaded and no allowlist,
the child's tools were `read, bash, edit, write, subagent`. With
`--tools read,grep,find,ls`, they were `read, grep, find, ls`: the allowlist
removes extension tools too. `pi --help` notes the allowlist "Keeps MCP tools
unless an entry starts with mcp__", so `--no-mcp` is needed for a strict set.

**3. Read-only.** Told to rewrite `math.js`, the child called only `read`,
replied that its tools are read-only, and the file hash and `git status` were
unchanged. The example's reviewer agent instead gets `bash` and relies on the
instruction "Bash is for read-only commands only" with the caveat "Assume tool
permissions are not perfectly enforceable"
(`$pi/examples/extensions/subagent/agents/reviewer.md:10-11`).

**4. Model selection and cross-provider runs.**

| Model | Result | Usage |
|---|---|---|
| `openai/gpt-6-luna` | All 4 planted defects, each with a failing input | 2,000 in / 428 out, $0.0004 |
| `anthropic/claude-haiku-4-5` (with `--no-skills`) | Failed: HTTP 400 "Third-party apps now draw from your extra usage" | 0 |
| `anthropic/claude-haiku-4-5` (without `--no-skills`) | 1 of 4 (validation rule only) | 2,563 in / 534 out, $0.0052 |

The failing run's system prompt contained pi's default `<docs>` section; the
succeeding run's contained the replacement from `extensions/claude.ts`. That
extension replaces docs only when the `pi-docs` skill is available
(`extensions/claude.ts:29-37`), so `--no-skills` disabled it. This is one
paired observation, consistent with the earlier notes in `claude.ts`, not a
proof of the blocking cause.

**5. Text mode.** `pi -p` without `--mode json` printed only the final review
to stdout with empty stderr. The second OpenAI run found the same four
defects but cited different line numbers (`math.js:9`/`:10` vs `:10`/`:10`;
`:8` vs `:9`) and included a visible self-correction in one finding.

## Implications

- **No extension is required for a first version.** A skill can prepare the
  diff, run one or more `pi -p` reviewers through bash (in parallel with `&`),
  and synthesize their stdout. The subagent example extension is an option
  later for streaming progress and usage display.
- **Required flags:** `--no-session`, `--tools read,grep,find,ls`, `--no-mcp`,
  explicit `--model`, `--append-system-prompt <reviewer file>`. Keeping skills
  enabled was an additional condition for the installation tested here, not a
  current universal requirement; see the follow-up above.
- **Prepare the diff in the parent** (as superpowers' review package does) and
  pass a file path; never give the reviewer `bash`.
- **`AGENTS.md` loads automatically** from the reviewer's cwd, which gives the
  "repo rules override" behavior for free. `--no-context-files` would turn it
  off.
- **Cross-model review is cheap here** (fractions of a cent on this diff) and
  the two models differed sharply on the same input, which supports offering
  a second model. One diff is not enough to rank models.
- **Findings need a verification step.** Line numbers and wording varied
  between identical runs, which matches the research's advice to verify
  findings in the parent before showing them.

## Amendments

### 2026-10-11 — Scope the skills requirement to the original installation
- Change: Added the corrected-fork follow-up and core ADR, and qualified the
  skills-enabled condition in the execution guidance.
- Reason: A later experiment succeeded with `--no-skills` after fallback removal.
- Impact: The earlier failure remains evidence for its original setup, but must
  not be treated as a restriction on the corrected tested build. No reviewer
  model or review-quality guarantee is selected here.
- Evidence: [Claude follow-up experiment](2026-10-11-claude-reviewer-after-docs-fallback-removal.md).
