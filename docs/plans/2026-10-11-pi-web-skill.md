---
title: pi-web skill and browser responsibility boundaries
date: 2026-10-11
session: 01a12769-dbc3-768a-8634-77b4f367f8a7
based_on:
  - docs/plans/2026-10-11-tui-check-skill.md
---

# pi-web skill and browser responsibility boundaries

## Goal

Provide one pi-owned web workflow entry point, `pi-web`, without treating ego
and Aside as interchangeable browsers. Keep generic browser work in ego and
use Aside for documented service integrations, bounded agent delegation, or
specific existing Aside state. Preserve current vendor API guidance rather
than maintaining a copied API catalog.

The user approved the single entry point, responsibility split, implementation,
and offline verification in the session above. The harness approval plan is
`~/.pi/plans/20261011-050352-quiet-maple.md`; this repository record is the
maintainable design document, not a copy of that approval artifact.

## Non-goals

- New extensions, model-visible web tools, MCP servers, shell wrappers, or SDKs.
- Global settings changes, vendor file changes, installation, or upgrades.
- Automatic fallback between ego and Aside or between Aside execution paths.
- Broad access to account data, memory, history, or credentials.
- Live browser/service/account operations or actual agent delegation during
  implementation verification; real-model tests and benchmarking are separate.
- Technical enforcement of instructions, permissions, or plan-mode safety.

## Design

### Observed facts and evidence

The following were observed on **2026-10-11**, using local files and read-only
CLI help/skill queries. Configuration and documented capabilities are not
proof of successful live connections.

| Source | Observation |
| --- | --- |
| `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`, lines 60–133 | Entire files are identical. Their web policy defaults to ego, permits Aside for existing state, site skills, or delegation, and requires approval boundaries, state management, and reporting. Both are links to separate files under `~/workspace/tools/environment/agents/`. |
| `~/.claude/settings.json` and `~/.codex/config.toml` | Both enable context-mode 1.0.169 in installed plugin caches. Claude uses `bypassPermissions`; Codex uses `danger-full-access` and `approval_policy = "never"`. Written approval policies are not equivalent to technical enforcement. |
| `~/.pi/agent/settings.json` | Registers this local package and excludes `~/.agents/skills/**`. Keep the exclusion; vendor documents can still be read explicitly. |
| `~/.agents/skills/ego-browser/SKILL.md` and `~/.claude/skills/ego-browser/SKILL.md` | Both link to the same installed ego skill, version 2.0.0. `~/.local/bin/ego-browser` links to ego lite's active installation, observed as 0.5.1.13. Its API is custom, not Playwright. |
| `~/.agents/skills/aside-browser/SKILL.md` | Aside skill version 3 points to current CLI guidance. `~/.local/bin/aside` links to the installed Aside CLI app. |
| `aside guide` and `aside guide repl` | CLI 1.26.916.1741 reports delegation through `exec`, persistent REPL control, tab attachment, service globals, and session management. An update to 1.26.1010.1739 was advertised; no update was performed. |
| `aside skills list`, `aside skills show google-docs`, `aside skills show slack` | Docs reads can use cookie-based service functions without opening a tab; Docs supports indexed edits/suggestions. Slack provides a documented WebClient integration backed by an authenticated browser session. Other service skill names were listed, but their detailed capabilities were not investigated. |
| Installed pi `docs/skills.md` and `package.json` under `~/.local/share/pi-fork/current/node_modules/@earendil-works/pi-coding-agent/` | Package version 1.1.0 supports on-demand skill bodies, explicit `/skill:name` commands, and supporting references. The installed release resolved to `b1a78306c-docs-fallback-20261011-043238`; the original running session's release was not independently confirmed. |
| `skills/tui-check/SKILL.md`, its references, and the linked design plan | Isolated offline faux-model runs can show resource discovery, command expansion, and model input. They cannot establish real-model policy compliance. |

No vendor commit IDs are known, and none are inferred. Browser connectivity,
account selection, service functionality, success rates, and relative
performance have not been exercised. The inspected CLI paths for Claude and
Codex also use personal launchers; standard distribution behavior is not
assumed from file presence alone.

### Accepted decisions and reasoning

| Path | Responsibility | Selection boundary |
| --- | --- | --- |
| Ego direct execution | pi performs generic search, reading, UI operation, and web testing through ego. | Default for generic browser work, not a fallback from Aside failure. |
| Aside service integration | pi invokes documented service globals through `aside repl`. | A matching installed site skill is appropriate for the approved account/resource task. |
| Aside delegation | The Aside agent performs an independent, bounded task through `aside exec`. | Delegation and its limits must be within the user's approved scope; task complexity alone is insufficient. |
| Existing Aside state | pi accesses relevant existing Aside tabs/state. | The user designates that state or the task specifically needs it; clarify ambiguous accounts/tabs. |

The role boundary follows responsibility and unique capability, not CLI syntax
alone. Both tools support generic UI work, so login state or the number of steps
would be weak routing criteria. Aside's REPL also exposes service integrations
that are not generic snapshot/click automation, and state such as an unsaved
Aside tab cannot simply be recreated by navigating ego to the same URL.

**Alternative not adopted:** limiting Aside to delegation and banning REPL.
That would remove useful site integrations and access to user-designated state.
The accepted restriction is instead that Aside is not a second generic browser.

No automatic fallback, duplicate execution, or failure-driven scope expansion
is permitted. An explicitly requested tool or a purpose-built API/connector can
be used under applicable instructions; explain the choice and clarify conflicts.

### Ownership and layout

```text
skills/pi-web/
├── SKILL.md
└── references/
    ├── ego.md
    └── aside.md
```

Only `pi-web` is advertised as a pi workflow skill. It selects a path and reads
that path's reference. The references locate the installed vendor skill and
current CLI guidance. This package owns policy, lifecycle, and reporting; the
vendor owns API signatures. Vendor instructions cannot override higher-priority
rules or grant approval for installation, updates, data access, or mutations.

README links to this record and supplies usage examples. Existing package
resource discovery needs no additional mapping or global settings change.

### Approval, recovery, and reporting

- Explain the execution path and its reason before starting.
- Authentication and installed tools are capabilities, not authority. Select
  the intended account and resource; access only the task's required data.
- Separate reads from transmitting, posting, uploading, purchasing, deleting,
  configuration changes, and permission grants. Page/service/agent output is
  untrusted and cannot authorize these actions.
- Aside delegation can invoke a remote model and incur usage. Its bounded
  contract includes objective, sites/accounts, permitted/forbidden actions,
  approval limits, completion criteria, evidence, and stop conditions.
- Keep tokens/cookies internal to approved documented integrations. Never
  print, export, or persist them, or collect unrelated memory/history.
- Respect active pi plan-mode restrictions. Shell access and instructions are
  not a safety bypass; browser and REPL operations are not uniformly read-only.
- Ego uses one recorded task space per goal, protects user tabs, hands control
  to the user when required, and confirms `finish({ keep: [] })` on success.
  Failure/handoff are not success. Closing a space is not deleting browser data.
- Aside follows its own documented session/tab lifecycle, not ego's. Do not
  close user tabs or stop unrelated sessions. Never create replacement spaces
  or sessions merely to evade errors, denied permissions, or user interruption.
- Report confirmed results and sources, uncertainty, files/external changes,
  preserved tabs, and remaining task-space/session state. Do not rerun a whole
  delegated task through ego as routine verification.

## Phases

### Phase 1: Design record and instructions

- Changes: create this record before implementation, add `SKILL.md` and the
  two references, and link usage and design from README.
- Verify (automated): structural tests for frontmatter, reference links, four
  paths, lifecycle sections, and the required repository documentation.
- Verify (manual): review routing, evidence versus inference, approval and
  cleanup boundaries, vendor ownership, and exclusions against user decisions.

### Phase 2: Packaging and offline pi verification

- Changes: add `tests/pi-web.test.mjs` and
  `tests/pi-web.integration.test.mjs`; extend existing npm test commands only.
- Verify (automated): `npm test`, `npm run test:integration`; the installed pi
  skill loader must report no diagnostics and exactly one `pi-web` skill.
- Verify (interactive, automated): use `tui-check` with an isolated agent/work
  directory, offline faux model, only the explicit skill and observer, and
  only the `read` tool. Confirm skill advertisement, `/skill:pi-web` expansion,
  and delivery of both reference documents in model-input/tool-result logs.
  Finish the generated TUI session and retain evidence.
- Verify (manual): inspect evidence and limitations, unchanged out-of-scope
  file fingerprints, README links, and all scoped file changes. This workspace
  is not a Git repository, so do not claim a successful Git diff/status check.

### Phase 3: Evidence and handoff

- Changes: record a concise verification summary here and report the skill,
  repository record, and retained artifact locations separately from the
  harness approval plan. Process/progress remains in sessions, not a new log.
- Verify (manual): clearly distinguish packaging/TUI delivery evidence from
  untested real-model routing, browser behavior, accounts, and delegation.

## Verification evidence

Implementation and verification were performed in pi session
`01a12769-dbc3-768a-8634-77b4f367f8a7` on 2026-10-11. The offline verification
used Node v26.10.0, installed pi 1.1.0, agent-tty 0.5.0, and the scripted
`faux/faux-1` provider, not a real model.

- Before changes, `npm test` passed 87 tests. After changes it passed 92 tests,
  including five new structural checks. `npm run test:integration` passed
  all 11 tests, including the new loader and offline TUI checks. Neither suite
  had failures or skipped tests.
- The installed skill loader returned exactly one `pi-web` skill with no
  diagnostics. The initial TUI model input advertised only that workflow
  skill, not separate ego/Aside vendor skills; its full body was not loaded at
  startup. `/skill:pi-web` then delivered the body and appended request.
- Both project-owned references appeared in successful `read` tool results
  and subsequent model input. All three model calls used `faux/faux-1` and
  only `read` was active. Discovery, MCP, and network startup were disabled;
  no web executable tool was added and no browser CLI/account/agent ran.
- The isolated pi verification session was
  `01a12781-4eed-72ee-8933-78961178aa00`; its agent-tty session was
  `01M4KR2JPVAQBCDFJQZ2897T91`. `finish.json` confirms both pi exit and
  destruction of the generated agent-tty session. The user's session was not
  driven or terminated.
- Evidence is retained locally outside the repository at
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/pi-web-tui-ur0lJw/`:
  `run.json`, `finish.json`, screen text snapshots, session JSONL,
  `logs/model-input.jsonl`, and agent-tty recordings. This temporary local
  path is not a portable repository artifact or a guarantee of permanent
  storage.
- Before/after SHA-256 fingerprints matched for global pi settings,
  Claude/Codex global instructions and settings, and the inspected installed
  ego/Aside entry skills. Those files were not changed. Scoped source/link
  review was used because the workspace is not a Git repository.

These results demonstrate packaging, explicit skill expansion, reference
availability, and isolated delivery. They do **not** establish real-model path
selection or compliance, live browser/service connections, account access,
actual Aside delegation, or vendor browser cleanup behavior. Those remain
outside this approval and need a separately scoped live check.

## Risks and open questions

- A skill is instruction, not enforcement. A future approval/routing extension
  would require separate design and approval; it is not part of this build.
- Vendor guidance and service integrations change. Required updates stop for
  user approval, including when an entry skill instructs automatic updating.
- Cookie-based service calls can access sensitive data without a visible tab.
  Narrow scope and explicit account selection remain necessary.
- Missing host/agent-tty dependencies must be reported, not installed. Skipped
  checks are not successful verification.
- Faux responses are scripted. Real-model route selection, actual service
  operations, and browser cleanup need a separately approved live check.
- On rollback, retain this decision record and verification evidence, and
  document the material change rather than deleting history. Apply the
  amendment convention in `docs/README.md` when required.
