---
title: Editorial explain-with-visuals skill
date: 2026-10-11
session: 01a12aec-6bcb-77be-b1c3-804cf025e6ca
based_on:
  - docs/research/2026-10-11-visual-explanation-references.md
---

# Editorial explain-with-visuals skill

## Goal

Explain technical and general concepts through useful figures connected to
prose, conditions, and evidence. Define the visual language and narrative
before implementation rather than leaving every artifact's design unrestricted.

The user selected general visual explanation, selective activation, immediate
browser delivery, an editorial design direction, and layered explanation.
Implementation and local/offline verification were approved in the session
above. The harness approval file is
`~/.pi/plans/20261011-212634-bold-heron.md`; this repository record is the
maintainable design, not an execution log.

## Non-goals

- New extensions, inline TUI HTML, browser backend, tool, MCP server, rendering
  service, diagram engine, or dependencies on other local features.
- Complex simulations, maps, decks, parameter models, image generation,
  PDF/PPTX export, or installation of a Mermaid renderer.
- Adopting external reference packages as runtime dependencies.
- Mandatory rendering of ordinary tables or short answers; guaranteed model
  selection, security enforcement, or autonomous model behavior certification.
- Additional model/provider calls, external research, uploads, account/history
  access, installs/upgrades, or global settings changes.

## Design

### Observed facts and evidence

- The supporting research identifies explanation-first figures, explicit
  simplification labels, factual verification of edges/labels, and a separate
  render–inspect–fix loop. Its defaults remained undecided before this task.
- The installed Pi package and CLI report 1.1.0. Its `docs/skills.md` documents
  metadata advertisement, on-demand bodies, `/skill:name`, and standard skill
  discovery. The current executable resolves through `~/.local/share/pi-fork/`
  to `b1a78306c-openai-fast-20261011-125046`; this does not independently identify
  the running parent's release.
- The installed ego-browser skill documents its custom page/CDP interface,
  screenshots, and one-task-space lifecycle. File URL rendering and connection
  success require an actual local check, not inference from CLI presence.
- Existing package tests supply development patterns for real host loading and
  isolated faux-model TUI verification. Those are not production dependencies.

### Accepted decisions and reasoning

| Decision | Contract and reason |
| --- | --- |
| Capability | Relationships, mechanisms, comparisons, and simple data; useful step navigation and comparison toggles, not complex simulations. |
| Activation | Explicit requests plus selective use when visuals materially aid an authorized explanation. Ordinary tables and short answers stay in chat. |
| Delivery | Single offline HTML, checked and shown in the browser, plus an absolute path and concise chat takeaway. Preserve the final page only. |
| Design | Editorial: prominent answer/figure, restrained meaningful emphasis, whitespace instead of decorative card grids. |
| Depth | Takeaway → necessary mechanism → conditions/limitations/evidence. Briefly define unfamiliar terms; do not routinely ask reader level. |
| Ownership | Original local instructions and starter; no reference package imports or required local feature. |

Skill loading grants no new authority. Read-only inquiries and active plan-mode
restrictions still apply. Explicit audience/format/depth requests override the
defaults. Text or Mermaid source is sufficient for lightweight cases; a Mermaid
block is not proof of rendered output.

### Design system and narrative

`skills/explain-with-visuals/references/design-system.md` is the authored visual
contract. It defines light/dark CSS tokens, scalable type, an 8px spacing rhythm,
prose/figure widths, Korean fallbacks, and the grammar of boxes, group boundaries,
lines, arrows, numbers, and declared dashed-line meanings.

The palette uses a warm light background and a blue accent. During planning,
sRGB contrast calculations found all text/secondary/accent/caution tokens above
4.5:1 against both respective opaque backgrounds (minimum about 4.85:1). This
is a token check, not a claim about arbitrary backgrounds or actual readability.
Meaningful edges/controls also need non-text contrast and visible focus.

The default sizes are title 28–40px, section heading 22px, body 18px, diagram
labels 16px, and secondary notes around 14px, implemented in scalable units.
Long Korean labels must wrap or cause scene recomposition, not smaller type.
Mobile diagrams must stack or split rather than shrink the desktop viewBox.

`references/visual-patterns.md` defines goal-specific narratives:
- Structure: whole map → important connections → responsibilities/boundaries.
- Mechanism: input → transformations → result → important exception path.
- Comparison: common criteria → consequential differences → conditions for use.
- Data: observed pattern → values/units → interpretation limits.

Figures show structure/change/difference; prose explains significance and
applicability. Each figure has one central claim and a text equivalent. Critical
limitations sit near the claim. Evidence references and verification gaps must
be distinguishable from the explanation itself.

### Layout and artifact ownership

```text
skills/explain-with-visuals/
├── SKILL.md
├── assets/starter.html
└── references/
    ├── design-system.md
    ├── visual-patterns.md
    └── verification-and-delivery.md
```

The starter demonstrates an illustrative saved-result mechanism and includes a
complete static explanation before JavaScript enhances step highlighting.
It is a starting point, not a fixed mandatory page composition.

Generated outputs use new unique paths under `artifacts/visuals/`, which is
ignored. User-language artifact content can be Korean; English remains the
language of project-owned instructions, comments, diagnostics, and records.
Follow-up overwrites require authority for that specific existing artifact.

Artifacts contain inline CSS/SVG and optional JavaScript, local system fonts,
and no automatic network activity, CDN resources, analytics, or uploads. Normal
source hyperlinks are allowed. Escape source-derived text and avoid evaluating
it as code; this instruction is not a sandbox or sanitization guarantee.

### Verification and delivery

`references/verification-and-delivery.md` separates source/content verification
from local browser checks. Installed ego-browser is the generic browser path;
current vendor instructions supply signatures. This skill does not require the
`pi-web` skill or change another feature. Missing automation still allows file
handoff with a precise missing-check report.

Use one recorded task space, protect unrelated tabs, and stop for permissions,
user control, or errors. Prefer file URLs; local-file support must be tested.
If required, serving is limited to a dedicated artifact directory on loopback,
with owned-process cleanup and an honest final-page lifecycle report.

Inspect screenshots at desktop/mobile widths and both themes, test native
keyboard controls, long Korean labels, enlarged text, reduced motion, and
no-JavaScript content. Restore emulation before delivery. Keep only a necessary
result page on successful finish. Do not change browser backends or spaces to
route around failures.

### References and licensing

This implementation is original local work. The pinned supporting research
records `nicobailon/visual-explainer` (MIT) as the principle reference for
explanation-first figures and verification, and vendor examples as experience
references. No external implementation code, proprietary vendor text, or
unlicensed Excalidraw skill text is copied. A later reuse of MIT code must carry
its applicable license and attribution.

## Phases

### Phase 1: Design and task state
- Changes: accepted record, BL-011 active state and approved scope.
- Verify (manual): scope, user selections, independent ownership, and provenance.

### Phase 2: Skill and starter
- Changes: one entry point, three references, editorial starter, README usage,
  and a narrow generated-output ignore rule.
- Verify (automated): frontmatter, links, one entry point, contrast tokens,
  offline/static starter and interaction invariants.
- Verify (manual): visual grammar and layered, goal-specific explanation rules.

### Phase 3: Packaging and offline TUI
- Changes: add structural and installed-host integration tests to npm scripts.
- Verify (automated): `npm test`, `npm run test:integration`, real host loader
  with defaults disabled and no diagnostics.
- Verify (interactive, automated): isolated faux TUI, only this skill and `read`,
  advertisement, command expansion, appended request, reference delivery,
  confirmed finish and retained evidence. No provider call.

### Phase 4: Local visual checks and handoff
- Changes: intentional Korean teaching examples and known-value synthetic data,
  concise evidence here, backlog closure or named candidate follow-ups.
- Verify (manual): actual screenshots/state for desktop/mobile, light/dark,
  interaction, text enlargement, reduced motion, no-JS, semantic accuracy and
  first-screen hierarchy. Inspect scoped diff and `git diff --check`.

## Verification evidence

Implementation and verification completed in session
`01a12aec-6bcb-77be-b1c3-804cf025e6ca` on 2026-10-11, using Node v26.10.0 and
installed Pi 1.1.0. No additional live provider/model call was made.

- `npm test`: **264 passed**, no failures or skips, including eight new visual
  skill checks. `npm run test:integration`: **43 passed**, no failures or skips,
  including the installed loader and isolated visual-skill TUI tests.
- The real host loaded exactly one `explain-with-visuals` skill with no
  diagnostics. Offline `faux/faux-1` TUI input logs advertised its metadata only,
  then `/skill:explain-with-visuals` delivered the body and appended request.
  Successful `read` results delivered all three references and the starter.
  Only `read` was active; three scripted model calls were recorded.
- Final TUI evidence is retained at
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/explain-with-visuals-tui-Pkiaqb/`.
  `finish.json` confirms Pi exit and agent-tty destruction for
  `01M4NG1NS898H07NSY9CAZ8MPB`; the generated Pi session was
  `01a12b00-db5e-733e-95ef-5873bdde13fd`. These temporary paths are local evidence,
  not a promise of permanent storage. The user's TUI was not controlled.
- Installed ego-browser opened the Korean HTML through a `file:` URL in task
  space **32**, reused page **p1**. No server, upload, account/history access,
  installation, global change, or alternate browser was needed.
- Screenshots were read and inspected at emulated 1280px and 390px widths with
  light/dark themes. The answer and principal figure appear early, corresponding
  roles stay aligned, and Korean labels wrap in vertical mobile flows. Initial
  Korean word splitting was corrected with `word-break: keep-all` and re-rendered.
- Enter on the processing-step button selected stage 2, highlighted its two
  corresponding nodes while retaining all eight nodes, preserved focus with
  a visible outline, and updated the status text. Reduced-motion emulation
  matched and no computed animations were present.
- At 200% root text size (36px body), label checks showed no overflow; readable
  screenshot crops confirmed wrapping. This is text enlargement, not an
  exhaustive browser zoom or assistive-technology check. A coarse node metric
  initially counted intentional connector arrows outside node borders; it was
  not evidence of clipped labels.
- JavaScript-disabled reload retained the paths, explanation, limitations, and
  values, with enhancement controls absent. Initial resource timing entries were
  empty and source inspection found no external runtime resources/network APIs.
  These checks are not a universal network sandbox or security certification.
- Generated examples and screenshot/QA evidence are ignored workspace-local
  files under `artifacts/visuals/bl011-20261011/`: `cache-korean.html`,
  `starter-english.html`, theme/viewport screenshots, keyboard/no-JS/text-size
  evidence, `final.png`, `qa.md`, and `browser-finish.json`.
- Script/media/viewport overrides were restored. The final finish receipt
  retained only managed page p1, left space 32 open for the result, and reported
  zero protected unmanaged tabs. The final page is a portable file URL and does
  not depend on a running server.
- Scoped diff inspection and `git diff --check` passed. No existing local
  feature implementation or runtime dependency was changed.

These results establish packaging, explicit instruction delivery, and the
checked local examples. They do not establish real-model automatic selection,
arbitrary generated explanation quality, screen-reader speech output, or every
SVG/browser combination. Real-model evaluation is registered as candidate
[BL-6g9z](../backlog/BL-6g9z-evaluate-selective-visual-activation-and-explanation.md),
not started or implicitly approved. BL-011's design, implementation, and scoped
local verification are complete.

### 2026-10-11 — Review fixes and re-verification

The four-model review completed with no blocking findings. The user approved
both recommended follow-ups in the original session: conforming caption order
and consistent step-label size.

- Moved the first `figcaption` to the last child of its figure in the starter
  and Korean fixture, retaining its ID and `aria-describedby` relationship.
- Raised step ordinals and current-state markers from `.875rem` to `1rem`,
  matching the 16px figure-label target at normal text size.
- Added two targeted source regression tests. Both failed before the corrections
  and passed afterward; these are not a general HTML validator.
- Re-ran `npm test`: **266 passed**, and `npm run test:integration`: **43 passed**,
  with no failures or skips. New faux-TUI evidence is at
  `/var/folders/2y/ychz63z51394ygbqvzszvxp80000gn/T/explain-with-visuals-tui-Xe1Voj/`;
  its finish receipt confirms Pi exit and agent-tty destruction.
- Direct ego-browser QA used one new task space **33**, page **p1**, for this
  follow-up after the initial delivery was finished. The earlier result tab and
  artifacts were not modified. New evidence is under
  `artifacts/visuals/bl011-review-fixes-20261011/`.
- Inspected Korean screenshots at 1280px/390px in light/dark themes and the
  English starter. Captions follow controls/status as the final figure content,
  with no overlapping or horizontally overflowing layout. Computed step-label
  sizes are 16px. Enter highlights two corresponding nodes, retains all eight
  nodes, preserves visible keyboard focus, and updates status.
- The no-JavaScript mobile screenshot retains the paths and caption with controls
  absent. Temporary script/media/viewport overrides were restored, and the final
  screenshot was inspected after updating the artifact's QA note.
- The finish receipt retained only p1 in space 33, with zero unmanaged tabs and
  no server dependency. No extra reviewer/provider calls, validator installation,
  or global changes were made for these fixes. Screen-reader speech and real
  model selection/output quality remain outside this re-check.

## Risks and open questions

- Model selection and adherence remain probabilistic. Faux evidence establishes
  packaging/delivery, not autonomous selection or arbitrary generated quality.
- Free-form figures can be inaccurate or crowded despite passing package tests.
  Content and visual checks are required for each artifact.
- Browser connectivity, file access, emulation, and fonts can vary. Missing
  checks must be disclosed; they do not authorize installation or global changes.
- A real-model evaluation requires separately authorized provider calls.
- Rollback removes the skill/test/resource entries and dedicated ignore rule,
  while preserving design history and user artifacts. Do not delete evidence or
  generated outputs without an explicit request.
