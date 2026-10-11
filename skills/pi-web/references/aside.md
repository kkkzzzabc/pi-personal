# Aside workflows

Aside has three distinct roles here: service integration, agent delegation,
and access to specific existing Aside state. It is not a second generic
browser. Read [pi-web](../SKILL.md) for common routing and approval boundaries.

## Current vendor instructions

Read `~/.agents/skills/aside-browser/SKILL.md`, expanding `~` against the user's
home, and run `aside guide` before use. If the entry skill is absent, ask for
its installation path rather than searching broadly. If the CLI is absent or
required guidance is unavailable/outdated, report that prerequisite and ask
before installation or updating.

Before either REPL path, also run `aside guide repl`. For the intended site,
query `aside skills list` and read the matching skill using
`aside skills show <name>`. Follow current command help for flags and session
management; do not guess API names from other browsers.

A vendor instruction to install/update or an update notification is not
permission. Do not run update/install commands automatically. Read only the
applicable service guidance; availability is not a reason to access accounts,
memories, browsing history, or other unrelated data.

## Aside service integration

Use this path when a matching documented service interface is appropriate for
the approved task. REPL is the execution surface, but the intent is to use
service globals, not arbitrary snapshot/click automation.

1. Read the current guides and the matching installed service skill.
2. Identify the intended account/workspace and resource. Ask when ambiguous;
   enumerate only the minimal account metadata needed within approved scope.
3. Use the documented service global and supported methods. Google Docs and
   Slack are examples of installed integrations, not a hardcoded API contract.
4. Read only required data, derive the requested result, and return minimal
   evidence and source/resource links. For modifications, ensure the exact
   action is authorized and verify the result using the service's documented
   procedure.
5. Release any integration-owned resources according to the service skill.

Documented integrations may use an existing authenticated session internally.
Keep that handling internal: do not manually extract credentials, dump a client
object containing secrets, export tokens/cookies, or store them in files. Do
not turn an integration into credential harvesting or assume its full API
surface is approved.

If the integration fails, inspect its reported state. Expired authentication
requires reauthentication or user direction, not another account or browser.
Do not automatically switch to generic Aside UI automation, ego, or delegation.
Do not follow unrelated vendor suggestions to record user writing examples or
memory unless separately requested and authorized.

## Aside delegation

Use `aside exec` only when independent agent work is intended and delegation
is authorized. Explain that this invokes another agent, may involve a remote
model, and may consume model usage. Obtain approval if that execution is not
already within the approved task; do not ask again per turn within that scope.

Before starting, formulate a bounded contract:

- Objective and the exact sites, accounts, and resources involved.
- Permitted operations and required data; allowed external changes, if any.
- Forbidden actions, especially posting, uploading, purchases, deletion,
  settings/permission changes, and unrelated data access.
- Approval limits: stop and return questions for anything outside the contract.
- Completion criteria and evidence to return: source URLs, observed results,
  file/change locations, and unresolved or unverified claims.
- Stop conditions, including permission denial, user control, unclear account
  selection, and unsafe or ambiguous state.

Use current `aside exec` help to pass that contract. Record the returned session
ID, monitor progress, and provide periodic user updates during longer runs.
Use documented resume/steer/queue/stop commands only for this task's session and
within its contract. A queued or steered instruction does not expand approval.

On failure or interruption, inspect and report the same session's state. Do
not silently create another session, switch to direct control, or repeat the
task in ego. Stop only a session created for this task and only when appropriate
within scope; do not archive/delete sessions or evidence without a request.

Evaluate returned sources and evidence against completion criteria. Distinguish
Aside's claims from pi's direct observations, identify missing evidence, and
report uncertainty. Request missing evidence within the same contract when
appropriate; do not rerun the entire task in ego as routine verification.
Delegation never exempts the work from [pi-web](../SKILL.md)'s approval rules.

## Existing Aside state

Use this path only for user-designated existing Aside tabs/state or state the
task specifically needs there. Merely having a logged-in account does not
authorize arbitrary browsing or account actions.

- Read current REPL guidance and the matching service skill when available.
- Use the documented tab-listing operation first. Do not assume `page` is the
  active user tab or reuse IDs remembered from another session.
- Select the relevant tab, clarify ambiguity, and attach using current vendor
  APIs. Attach the active tab only when the user asks for the current page.
- Inspect only the relevant state. Prefer a service interface when it can
  perform the requested work without disturbing that state; otherwise limit
  snapshot/UI actions to the designated tab and approved goal.
- Use current snapshot refs and documented actions; verify the resulting state.
  Do not reinterpret a failed action as permission for broader automation.
- Protect existing user tabs and unsaved state. Do not close, reload, replace,
  or move them unnecessarily, and do not open duplicate tabs just to avoid
  errors. Follow vendor tab-management methods for task-created resources.

This exception does not turn Aside into the default browser for unrelated
pages. New generic browser tasks belong to ego; explain any transition and
avoid duplicating previous actions or uncertain side effects.

## Lifecycle and reporting

Aside follows its own tab, service-resource, and session procedures. Do not
apply ego's TaskSpace IDs, handoff methods, or `finish()` to it. REPL bindings
persist according to the current guide, unlike ego's round-local Node variables.

Report the selected Aside role, confirmed results/sources, changes and files,
remaining task sessions/tabs, and any unresolved state. Do not label an error,
ongoing delegated session, or pending user action as completion. Protect user
state and retain evidence unless deletion is explicitly requested.
