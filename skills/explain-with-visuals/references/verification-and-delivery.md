# Verification and delivery

Use the [design system](design-system.md) and [patterns](visual-patterns.md).
Content QA and visual QA are separate; neither replaces the other.

## Content QA before opening

- Check names, arrows/relations, direction, order, values, units, scales, and
  conditions against the relevant code, documents, or user data.
- Separate observations, inference, and teaching models. Label synthetic data
  visibly. Do not turn an assumed edge into a verified architectural claim.
- Verify the caption and prose match the figure. A comparison uses the same
  criteria/scale; a critical exception is near the affected claim.
- Include concise evidence references (for example file and line or source URL)
  and performed/missing checks. Avoid full source dumps or session transcripts.
- Inspect the HTML for source-derived executable markup, remote resource loads,
  fetches, analytics, and uploads before opening. Escape interpolated text and
  use `textContent` for dynamic labels. This is not a sanitizer or sandbox.

## Browser path and current instructions

Use installed ego-browser directly for generic local browser QA. This workflow
is independently usable; no other local skill is a prerequisite. It does not
supply a copied API catalog. Before the first action read the current vendor
`SKILL.md`, checking these paths in order:
1. `~/.agents/skills/ego-browser/SKILL.md`
2. `~/.claude/skills/ego-browser/SKILL.md`

Expand home paths and use its current references/help for signatures. Ego has a
custom API; do not invent Playwright methods, import Playwright, launch a second
browser, or switch to Aside as recovery. Missing tools/instructions require a
clear limitation report or an authorization question for installation, not an
automatic install or upgrade.

Announce the browser path and its local verification purpose. Use exactly one
task space per goal; record its space ID and permanent page labels, and resume
that same space after interruption. Reuse pages. Protect unrelated/user tabs;
do not select profiles, collect credentials, or access account/history data.

## Local loading and lifecycle

- Prefer an absolute `file:` URL and confirm successful loading. CLI availability
  is not evidence of local-file support or connectivity.
- If local-file loading is unsupported, explain the limitation. Within an
  approved local artifact task, a loopback-only server may serve the dedicated
  artifact directory, never the workspace root or a public bind address.
  Record process ownership, port, and cleanup; do not leave an unexplained server.
- A final page must remain useful after cleanup. Prefer a verified file URL;
  otherwise disclose any server-dependent page limitation and provide the file.
- Stop when the user takes control, permission prompts require user action, or
  an error prevents progress. Follow vendor handoff/recovery; never create a new
  space or change backend to bypass a denial or timeout.
- On success, await the vendor finish operation once, retaining only a necessary
  final result page. Inspect the returned cleanup state. Failure/handoff is not
  successful completion; report remaining pages/space/processes instead.
- Do not delete browser history, user tabs, or generated artifacts as cleanup.

## Render–inspect–fix checklist

Use screenshots for visual judgment and read them with an image-capable tool.
DOM checks are helpful but do not prove visual legibility. Fix and re-render
changed regions before claiming success.

- [ ] First screen conveys the answer and begins the main figure, not a hero.
- [ ] One claim per figure; consistent marks, labels, and comparison positions.
- [ ] Desktop (~1280px) and mobile (~390px): no unintended overflow/overlap.
- [ ] Long Korean labels wrap/read clearly; no unreadable scaled SVG text.
- [ ] Light and dark: readable text, meaningful edges, controls, and focus.
- [ ] Increased text size: key content is not clipped or dependent on fixed height.
- [ ] Keyboard/native controls: expected state changes, stable focus, and a
      visible/accessible state description.
- [ ] JavaScript disabled: all essential explanation remains visible; no dead
      controls advertised as functional.
- [ ] Reduced motion: no autoplay, unwanted animation, or essential motion.
- [ ] No automatic network requests or external runtime resources from the page.
- [ ] Static text equivalent, nearby important limitations, and honest evidence.

Use documented page/CDP emulation only when needed. Restore temporary viewport,
theme, script, or motion settings before final delivery. Missing capabilities
must be reported as gaps, not simulated successful checks.

## Handoff and follow-ups

Show the final HTML in the browser by default after checks, and retain that
result page. Always return a concise chat takeaway, absolute file path, source
and verification summary, limitations, and retained-page/remaining-state info.
If browser QA is unavailable, deliver the file with explicit unverified items;
never call it visually verified.

Follow-ups modify only the requested explanation. Preserve earlier artifacts
unless editing that specific file is authorized. Keep screenshots and brief QA
evidence under the artifact directory; do not embed credentials or full session
transcripts. Closing a task space is not a promise of permanent evidence storage.
