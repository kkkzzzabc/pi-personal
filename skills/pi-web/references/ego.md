# Ego workflow

## Ego direct execution

Use ego for generic web search, page reading, UI operations, and web testing
that pi performs directly. For the common boundaries, read
[pi-web](../SKILL.md). Do not use ego as an automatic fallback from Aside.

## Current vendor instructions

Before the first browser action, locate and read the installed `SKILL.md`.
Check these known candidates in order, expanding `~` against the user's home:

1. `~/.agents/skills/ego-browser/SKILL.md`
2. `~/.claude/skills/ego-browser/SKILL.md`

If neither is readable, ask for the installation path or approval to install.
Do not broadly scan the user's filesystem, install, upgrade, or launch another
browser. Check CLI availability only as needed for the approved task; do not
run a browser smoke test outside that scope.

Follow the installed skill and its referenced API/troubleshooting documents for
current signatures and procedures. Ego has a custom API; similar method names
do not make it Playwright. Do not import Playwright, invent methods, or launch
a replacement browser. API details below describe the workflow, not a substitute
for reading the current vendor skill.

## Task space and observation

- Use exactly one task space for the user goal's ego work. Record its `spaceId`
  and page labels in tool output when created. Preserve them in the ongoing
  task context and reuse that space in later calls or after interruption.
- Use the initial page and reuse pages instead of opening one per URL. Do not
  manipulate another task's space or choose a profile without a user request.
- Node processes do not preserve JavaScript variables between calls. Resume
  using the recorded space ID and stable page labels, not stale target IDs.
- Observe only what is needed to choose the next action. For ordinary pages,
  prefer snapshots and current element refs. Use screenshots for visual tasks
  and page JavaScript/CDP only when needed and documented.
- Do not guess refs or blindly repeat failed actions. Inspect changed state;
  perform actions and their result observation together when possible.
- An action receipt is not success. Confirm the requested resulting state,
  then stop rather than checking it redundantly through multiple surfaces.
- Limit output to requested facts, source URLs, and necessary state. Preserve
  downloads only within scope and report their actual paths.

## User control and recovery

Protect user-created/unmanaged tabs and other goals' spaces. Follow vendor
ownership rules before adopting, releasing, or closing a page.

When the user takes control, stop. Browser-owned prompts such as permissions
and device selection require user handling. Follow the vendor handoff procedure,
explain the needed user action, and resume the same space only after the user
confirms. Do not repeatedly claim control or route around a stop.

For errors, inspect the same space and consult the installed troubleshooting
instructions. Do not create another space to avoid a timeout, blocked page, or
unexpected state. If recovery cannot continue, report the state and ask how to
proceed. Do not silently switch to Aside or another browser.

## Completion and cleanup

On success, await `finish({ keep: [] })` exactly once by default, then inspect
its returned result to confirm which space/pages were cleaned up. Keep only
necessary result pages for the user to view or continue, and report them.
Protected user tabs may keep a space open even with an empty keep list; report
the actual result rather than claiming everything closed.

Do not call success cleanup while stopped for an error, interruption, or user
handoff. Report the remaining space, pages, incomplete work, and next action
instead. If finish has an uncertain result, inspect it under current vendor
instructions rather than blindly issuing another finish.

Closing a task space is not deletion of history, cookies, caches, or download
files. Do not clear these without a separate request and approved impact scope.
Report confirmed findings, sources, preserved files/tabs, cleanup outcome, and
unverified matters according to [pi-web](../SKILL.md).
