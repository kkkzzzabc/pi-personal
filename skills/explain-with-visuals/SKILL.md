---
name: explain-with-visuals
description: >
  Explain technical or general concepts with editorial visuals tied to prose,
  conditions, and evidence. Use for explicit visual explanation requests, or
  selectively when relationships, mechanisms, comparisons, or simple data are
  materially clearer visually. Produce offline HTML and verify it locally;
  keep short answers and ordinary tables in chat. Not for slide decks or
  complex simulations.
compatibility: Pi with read and file tools; a browser for HTML; installed ego-browser and its current vendor instructions for automated visual QA.
---

# Explain with visuals

Explain the question, not just the topic. The figure carries a claim; prose
explains why it matters and where it applies. This is an independent instruction
skill, not a new tool, permission guard, or rendering engine.

Explicit invocation: `/skill:explain-with-visuals <request>`.
Resolve bundled paths against this skill directory, not the working directory.

## Choose whether to draw

- Honor explicit visual requests and audience/format/depth constraints.
- Otherwise use visuals selectively for relationships, mechanisms, differences,
  or data that are materially harder to understand in prose. Do not auto-render
  every table, decorate a short answer, or create a presentation unless asked
  (decks are outside this skill's initial scope).
- A concise text explanation or Mermaid source can be the smallest sufficient
  format. Do not claim a Mermaid block was rendered without checking it.
- Loading this skill grants no write/browser authorization. A read-only inquiry
  stays read-only unless creating an artifact is authorized. In plan mode,
  respect the allowed-file restriction; do not generate an HTML artifact as a
  workaround. Propose the visual within the plan instead.

## Prepare the explanation

Before authoring HTML, read:
1. [Design system](references/design-system.md) for visual language and tokens.
2. [Visual patterns](references/visual-patterns.md) for narrative and figure form.
3. [Verification and delivery](references/verification-and-delivery.md) for
   source checks, browser lifecycle, visual QA, and handoff.

Identify the actual question, audience signals, one-sentence answer, sources,
and important limitation. Default to layered explanation: **takeaway → necessary
mechanism → conditions, limitations, and evidence**. Briefly introduce unfamiliar
terms; do not routinely ask the user to choose a level. Clarify only ambiguity
that would materially change the explanation.

Choose the smallest useful figure and plan its claim, labels/relations, reading
order, and caption. Briefly announce the form and why it helps. Interactions are
optional explanatory aids, not decoration: step navigation or comparison toggles
only when they clarify a change. Complex simulations are outside initial scope.

## Author an offline artifact

Read [the starter](assets/starter.html), then adapt its design system and
progressive enhancement to this question; do not preserve irrelevant examples
or force every explanation into its section layout.

- Create a new, unique `artifacts/visuals/<slug>-<unique-suffix>.html` inside the
  task workspace. Check for collisions or use exclusive creation; never silently
  overwrite an existing file. Create missing directories only within scope.
- Write a single UTF-8 document with a meaningful title, correct `lang`, viewport
  meta, inline CSS/SVG, and only necessary inline JavaScript.
- Use the user's language in the artifact; Korean is supported. Project-owned
  instructions/comments remain English. Use system fonts, not downloaded fonts.
- No remote scripts, CSS, fonts, images, fetches, analytics, uploads, or automatic
  network activity. Plain, clearly labeled source hyperlinks are allowed.
- Keep the answer and main figure early. Provide a text equivalent, essential
  static content, native keyboard controls, focus, both themes, and reduced
  motion. Recompose crowded mobile figures rather than shrinking their labels.
- Treat source strings as data: escape HTML/SVG interpolation, use `textContent`
  for dynamic labels, and never evaluate input-derived code. Do not copy source
  markup/scripts directly into executable HTML. These instructions are not a
  sanitizer or security sandbox.
- Label teaching models and invented example data visibly. Do not invent
  quantities for decorative charts or imply a hypothetical result was measured.

## Verify, show, and follow up

Follow the verification reference: check names, edges, values, units, conditions,
and evidence first; then render, inspect screenshots, fix, and re-render changes.
Use the installed ego-browser directly for local generic browser QA after
reading current vendor instructions. No other local skill is a runtime
prerequisite. Missing automation does not prevent file delivery, but must be
reported as a verification gap. Do not install tools, switch backends, access
unrelated accounts, or make additional model calls without authorization.

On success show the final page and retain only that necessary result tab. Return
in chat: **takeaway, absolute file path, source/verification summary, limitations,
and retained-page or remaining-task-space state**. Do not call uninspected output
verified. An unavailable browser check is not a successful visual check.

For follow-ups revise only the requested explanation. Use a new version unless
changing that specific artifact is authorized; preserve unrelated files and
report what changed. Never embed credentials or full session transcripts in
artifacts or QA evidence.
