# Workspace conventions

## Language

- Write and maintain source-code comments, docstrings, documentation, skill
  instructions, prompt templates, CLI help, and diagnostic messages in English.
- Apply this convention to new content and edits to existing project-owned files.
- Preserve non-English text when it is intentional task data, a quotation, a
  localization fixture, or explicitly requested by the user.
- Respond to the user in their preferred language; this convention governs
  workspace content, not the language of the conversation.

## Documentation

- Follow `docs/README.md` when creating or editing anything under `docs/`.
  Start new records from the matching template in `docs/templates/`.

## Workflow and approval

- Questions and requests to investigate, review, or propose are read-only:
  answer and give a concrete recommendation. A recommendation is not a decision.
- An explicit request to act ("do", "fix", "implement", "proceed") approves the
  documentation, code, and offline verification its scope needs, including
  subagents used for the task. Do not re-ask between planning, documentation,
  and implementation.
- Ask first only for: other live model or paid API calls; installs, `~/.pi` or
  other global settings, or sending anything outside the workspace; destructive
  or hard-to-undo operations; cross-feature coupling; a substantive choice the
  user has not made; or work beyond the requested goal.
- Separate observed facts, inferences, and recommendations in reports.
- End each response with what was done and one of: the next action you will
  take, the single decision you need, or that the goal is complete. Do not ask to
  continue approved work or for permission to stop.
- Backlog items live in `docs/backlog/`. On resume, run
  `python3 scripts/backlog.py list` and check `active` and `next` items; do not
  start queued work unless asked. Update the current task's item when its state
  changes. Register unfinished follow-ups of the current goal as `candidate`
  items without asking, and name them in the final message.

## Implementation direction

- When using external implementations or research as references, build a local
  extension or other project-owned customization based on the relevant ideas and
  mechanisms, rather than adopting the referenced package unchanged. This is the
  project's standing implementation direction, not an undecided choice to reopen
  for each task.
- Adapt only what the approved scope needs; do not copy an entire reference by
  default. Preserve applicable licenses and attribution when reusing code.
- Keep local extensions and customizations independently usable. By default,
  avoid runtime dependencies on other project features and avoid adding reverse
  dependencies from existing features to a new one.
- Prefer Pi's public APIs and generic metadata/contracts for coexistence. Avoid
  feature-specific imports, name-based special cases, and changes in unrelated
  extensions solely to support a new feature. Development/test infrastructure
  may be reused without becoming a production runtime dependency.
- Do not adopt referenced packages as runtime dependencies merely because they
  supplied design ideas.
- Cross-feature coupling is an exception to discuss, not an absolute prohibition.
  If it is necessary or materially preferable, tell the user which features and
  dependency directions are involved, why it is needed, the independent
  alternatives, and the affected scope and maintenance implications. Obtain
  explicit approval before introducing the coupling or changing other features;
  then proceed within that approved scope without repeatedly asking. Never
  silently introduce coupling as an implementation detail.

## Reference material

- Treat `.references/` as external reference material. Do not translate or modify
  its contents merely to enforce the workspace language convention.
