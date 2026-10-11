---
title: OpenCode plan mode history (V1 → V2)
date: 2026-10-11
session: 01a126c9-521a-745a-88fa-51d8b8643342
based_on:
  - docs/research/2026-10-11-opencode-plan-build.md
  - docs/research/2026-10-11-pi-plan-mode-example.md
sources:
  - repo: anomalyco/opencode (GitHub, via raw.githubusercontent.com)
    path: packages/opencode/src/agent/agent.ts
    version: v1.0.0, v1.0.223, v1.0.224, v1.18.35
    commit: tags (see Findings)
  - repo: opencode
    path: .references/opencode
    version: 2.0.26
    commit: 5caf1f9f6f
---

# OpenCode plan mode history (V1 → V2)

## Scope

Supplements the V2-only analysis with how OpenCode's plan agent restricted
bash, subagents, and prompts across V1 releases, to explain why plan mode
was remembered as "almost everything read-only" and to widen the option set
for a pi bash policy. Only the plan agent definition and its prompt were
checked, at a sample of tags; V1 runtime behavior was not executed.

## Summary

- **v1.0.0–v1.0.223**: plan denied edits and used a **bash allowlist with
  `ask` fallback**: read-only commands auto-allowed, risky flags of those
  commands (`find -delete`, `find -exec`, `sort -o`, `tree -o`) and every
  other command required user approval.
- **v1.0.224** (2026-01-01): the bash allowlist disappeared. The change sits
  in the range containing "Permission rework (#6319)" (inferred cause).
- **v1.0.224–v1.18.x**: bash fell back to `* allow`; restraint moved to a
  strongly worded READ-ONLY reminder, a `general` subagent deny, and a
  `plan_exit` tool.
- **V2 (2.0.26)**: keeps only the edit deny (plan directory allowed) and a
  softer enter/leave reminder; the subagent deny and `plan_exit` are gone.
- The in-repo web docs still describe the oldest behavior ("file edits and
  bash set to `ask`"), which no longer matches the code.

## Questions

1. How did the V1 plan agent restrict bash, and when did that change?
2. What replaced the restriction in later V1?
3. What did V2 keep or drop?

## Findings

### 1. Early V1: allowlist with ask fallback (v1.0.0–v1.0.223)

`v1.0.0:packages/opencode/src/agent/agent.ts:51-95` defines
`planPermission`:

- `edit: "deny"`, `webfetch: "allow"`.
- `bash` map (abridged):
  - allow: `cut*`, `diff*`, `du*`, `file *`, `find *`, `git diff*`,
    `git log*`, `git show*`, `git status*`, `git branch`, `git branch -v`,
    `grep*`, `head*`, `less*`, `ls*`, `more*`, `pwd*`, `rg*`, `sort*`,
    `stat*`, `tail*`, `tree*`, `uniq*`, `wc*`, `whereis*`, `which*`
  - ask (risky flags of allowed commands): `find * -delete*`,
    `find * -exec*`, `find * -fprint*`, `find * -fls*`, `find * -fprintf*`,
    `find * -ok*`, `sort --output=*`, `sort -o *`, `tree -o *`
  - fallback: `"*": "ask"`
- User config permissions merged on top (`cfg.permission`).

The plan agent itself is registered at `agent.ts:120-129` with all default
tools. Presence of the allowlist (`"git log*": "allow"`) was confirmed at
v1.0.50, v1.0.100, v1.0.150, v1.0.200, and v1.0.223.

Contrast with the pi example (see `based_on`): pi **blocks** unlisted
commands and lets risky flags of listed commands through; early OpenCode
**asked** for unlisted commands and singled out risky flags.

### 2. The change (v1.0.223 → v1.0.224)

Binary search over tags found v1.0.223 as the last tag with the allowlist and
v1.0.224 as the first without it. Plan- or permission-related commits in the
GitHub compare range:

- `351ddeed9` 2026-01-01 Permission rework (#6319)
- `76186d19f` 2026-01-01 fix: ensure new permissions changes work for special
  case bash commands like rm, cd, etc
- `963f40706` 2026-01-02 tui: improve permission error handling and
  evaluation logic

Attributing the removal to #6319 is inferred from the range; the diff was not
reviewed.

### 3. Late V1 (v1.0.224–v1.18.x)

`v1.18.35:packages/opencode/src/agent/agent.ts`:

- Defaults for all agents (`:119-136`): `"*": "allow"`, `doom_loop: "ask"`,
  `external_directory` ask (with whitelisted dirs), `question`/`plan_enter`/
  `plan_exit` deny, `.env` reads ask.
- Plan (`:156-181`), description "Plan mode. Disallows all edit tools.":
  - `question: "allow"`, `plan_exit: "allow"`
  - `task: { general: "deny" }`: the edit-capable `general` subagent is
    blocked from plan
  - `external_directory`: allow `<data>/plans/*`
  - `edit`: deny `*`, allow `.opencode/plans/*.md` and `<data>/plans/*.md`
  - no bash rule, so bash is `allow`
- `plan_exit` present and bash allowlist absent at v1.2.0 and v1.4.0 as well.
- Prompt `v1.18.35:packages/opencode/src/session/prompt/plan.txt`, a
  `<system-reminder>` beginning "CRITICAL: Plan mode ACTIVE - you are in
  READ-ONLY phase. STRICTLY FORBIDDEN: ANY file edits, modifications, or
  system changes. Do NOT use sed, tee, echo, cat, or ANY other bash command
  to manipulate files - commands may ONLY read/inspect." It also forbids
  running "any non-readonly tools (including changing configs or making
  commits)" and encourages clarifying questions and delegating to explore
  agents.

### 4. V2 (2.0.26)

From the V2 analysis (`based_on`): edit deny except `~/.opencode/plan/*`;
bash, subagents, and external directories allowed; enter/leave reminder
without the "CRITICAL / ZERO exceptions" wording; no `plan_exit` tool and
no subagent deny.

Stale docs: `.references/opencode/packages/web/src/content/docs/agents.mdx:57-67`
says plan sets "file edits" and "bash" to `ask` by default.

### Timeline

| Range | Edits | Bash | Subagents | Model guidance |
|---|---|---|---|---|
| v1.0.0–v1.0.223 | deny | allowlist + risky flags ask + `* ask` | unrestricted | (prompt not checked) |
| v1.0.224–v1.18.x | deny, plan files allowed | allow | `general` deny | strong READ-ONLY reminder, `plan_exit` |
| V2 2.0.26 | deny, `~/.opencode/plan/` allowed | allow | allow | softer enter/leave reminder |

## Open questions

- Why was the allowlist dropped in the permission rework (maintenance cost,
  approval fatigue, parser change)? Requires reading PR #6319.
- What was the V1 prompt before `plan.txt` existed?
- When exactly were `plan_exit` and the `general` subagent deny introduced
  and removed?

## References

- `https://github.com/anomalyco/opencode/blob/v1.0.0/packages/opencode/src/agent/agent.ts`
- `https://github.com/anomalyco/opencode/blob/v1.18.35/packages/opencode/src/agent/agent.ts`
- `https://github.com/anomalyco/opencode/blob/v1.18.35/packages/opencode/src/session/prompt/plan.txt`
- `https://github.com/anomalyco/opencode/compare/v1.0.223...v1.0.224`
- `.references/opencode/packages/web/src/content/docs/agents.mdx`
