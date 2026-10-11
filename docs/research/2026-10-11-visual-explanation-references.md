---
title: Visual explanation references for a pi explain-with-visuals skill
date: 2026-10-11
session: 01a12921-60b2-73b2-b557-30f65188b003
based_on: []
# Web sources pin URL + access date; the three skill repos pin observed HEAD.
# Local desktop-app findings are machine state, cited by path+version in the body.
sources:
  - repo: nicobailon/visual-explainer
    url: https://github.com/nicobailon/visual-explainer
    commit: 1829e4f
    accessed: 2026-10-11
  - repo: coleam00/excalidraw-diagram-skill
    url: https://github.com/coleam00/excalidraw-diagram-skill
    commit: 8646fcc
    accessed: 2026-10-11
  - repo: zarazhangrui/frontend-slides
    url: https://github.com/zarazhangrui/frontend-slides
    commit: 9906a34
    accessed: 2026-10-11
  - repo: anthropics/skills
    url: https://github.com/anthropics/skills
    accessed: 2026-10-11
  - repo: mermaid-js/mermaid
    url: https://github.com/mermaid-js/mermaid
    accessed: 2026-10-11
  - repo: marp-team/marp
    url: https://github.com/marp-team/marp
    accessed: 2026-10-11
  - repo: ncase/loopy
    url: https://github.com/ncase/loopy
    accessed: 2026-10-11
  - url: https://claude.com/blog/claude-builds-visuals
    accessed: 2026-10-11
  - url: https://academy.claude.com/tutorials/imagine-with-claude-student-guide
    accessed: 2026-10-11
  - url: https://developers.openai.com/codex/visualizations
    accessed: 2026-10-11
  - url: https://developers.openai.com/codex/artifacts-viewer
    accessed: 2026-10-11
---

# Visual explanation references for a pi explain-with-visuals skill

## Scope

A reusable pi skill should, while explaining something to the user, produce
visual material that aids understanding and tie it back to the conversation.
This record selects references and drafts candidate requirements for that
skill. It compares (a) native product experiences (Claude, ChatGPT, Codex
surfaces), (b) locally installed desktop apps of the same vendors, and
(c) publicly available agent skills and tools.

In scope: public documentation and examples, read-only inspection of the two
locally installed desktop apps, and source-level comparison of public skills.
Out of scope: implementing the skill, choosing the default output format or
automatic activation policy, account-specific generation experiments, and any
modification of the installed apps. Vendor terms may restrict reverse
engineering; inspection therefore stayed read-only on files already on this
machine, for personal understanding, without redistribution of vendor code.

## Summary

- Native products already ship "explain with visuals inline": Claude builds
  interactive charts/diagrams inside the conversation (beta, all plans,
  web + desktop; explicitly distinct from Artifacts). ChatGPT Visualizations
  turn requests into interactive explanations; web is generally available to
  supported accounts, desktop is preview, and Codex CLI/IDE explicitly do not
  render visualizations.
- The locally installed `ChatGPT.app` is the Codex app shell
  (`com.openai.codex`): it bundles `Codex Framework.framework`, `codex-cli`,
  and a `Visualize` plugin whose skill content is verified and materialized
  locally. Actual skill content and trigger logic are server-side and remain
  unverifiable locally.
- The locally installed Claude desktop app ships a local `VisualizeWidget`
  with streaming SVG and HTML renderers (HTML scripts stripped) plus an
  embedded data-visualization design guide (form-chooser table, palette,
  accessibility summary requirement).
- Best public implementation reference: `nicobailon/visual-explainer`
  (MIT) — explanation-first principles, a fact-check command, and a delivery
  checklist. `coleam00/excalidraw-diagram-skill` has no license file; use it
  as a methodology reference only. `zarazhangrui/frontend-slides` (MIT) is
  the deck-mode reference.
- Candidate requirements and an evaluation checklist are drafted below; the
  default format and trigger policy remain open decisions.

## Questions

1. Which distinct capabilities exist across Claude web/desktop, Claude
   Code/Cowork, ChatGPT web/desktop, and Codex app/CLI/IDE, and which claims
   are documented versus unverified?
2. When do native products choose visualization, and how do prose, visuals,
   interaction, and follow-ups work together?
3. What do the locally installed Claude and ChatGPT desktop apps reveal about
   triggering, formats, and rendering — and what is server-side?
4. Which public skills/templates/validation loops can support a similar
   experience in pi, and under which licenses?
5. Which references should be selected, by role, and what should not be
   copied?
6. Which requirements and evaluation criteria should guide a later design
   without prematurely fixing format or activation policy?

## Findings

## 1. Product capability matrix

Observed from official pages (all accessed 2026-10-11):

| Capability | Surface | Documented behavior |
|---|---|---|
| Inline conversational visuals | Claude chat (web + desktop) | Beta, on by default, all plan types; Claude decides when a visual helps or the user asks; visuals appear in-line in the response, are temporary, and evolve with follow-ups; announced 2026-03-12; an update notes availability in Claude Cowork on all paid plans (2026-04-22) |
| Artifacts | Claude chat | Separate, older feature: permanent, shareable tools/documents in a side panel; the announcement explicitly contrasts inline visuals with artifacts; the Academy guide lists "save as artifact" plus copy-as-image and SVG/HTML source download |
| Claude Code / Cowork skills | Claude Code, Cowork | Not examined in this record; equivalence to the chat visuals is unverified (inferred: separate product surfaces) |
| Visualizations | ChatGPT web/desktop | "Visualizations preview is rolling out"; composer `@Visualize` plugin tag where available; formats: diagram, chart/plot, map, interactive visualization, Site; availability table lists web as available to supported accounts, desktop rolling out, mobile rolling out, and Codex CLI/IDE as not supporting rendering |
| File artifacts | ChatGPT / Codex | `artifacts-viewer` doc: ChatGPT previews documents/presentations/spreadsheets; Codex CLI can create/edit files but has no visual file preview or annotation interface |

Key distinction confirmed by documentation: the `/codex/` URL namespace does
not mean a Codex product supports the feature; the Visualizations page itself
labels its surfaces as ChatGPT and says Codex CLI/IDE do not render
visualizations.

## 2. Local desktop app inspection (read-only)

Method: `ls`, `plutil -p`, `du`, `head`, and `rg -a` over app bundles only.
No writes to app files or settings, no launch automation, no reading of user
conversation data or credentials. Versions are machine state on 2026-10-11
and will drift.

### Claude.app — Electron shell with a local visualize widget

- Identity: `com.anthropic.claudefordesktop`, version `2.31226.1`
  (`Contents/Info.plist`). Electron Framework plus helper apps;
  `Contents/Resources/app.asar` (42 MB).
- The asar contains a streaming visualization widget. Two renderers are
  registered with names `VisualizeWidget-SVG` and `VisualizeWidget-HTML`
  (short identifiers; excerpted from `app.asar`). The SVG renderer renders
  when the streamed code contains SVG visuals; the HTML renderer is
  configured with `stripScripts: true`, i.e. HTML widgets render without
  their scripts.
- The bundle embeds data-visualization guidance text, including section
  headings such as `Choosing a form` over a table that maps data shapes to
  visual forms (example row: a single current value maps to a stat tile with
  sparkline rather than a bar chart), chart-chrome rules tied to a design
  token set (`@ant/cds`), a 9-ramp color palette, and an accessibility
  instruction that a one-sentence summary of the visualization be provided
  for screen-reader users.
- Library references in the asar: `d3` (many), `mermaid` (few), `chartjs`
  (one); no `katex` or `excalidraw` markers.
- Inference: the inline visuals feature renders client-side in the app from
  streamed code, with scripts stripped for HTML widgets. Trigger heuristics
  and any model-side instructions beyond the embedded guide are server-side
  and unverified locally.
- Unrelated finding kept for disambiguation: sandbox strings in the asar
  belong to a "Simulator" sidecar (sandbox-exec profile), not the visualize
  widget.

### ChatGPT.app — the Codex app shell

- Identity: display name `ChatGPT`, bundle identifier `com.openai.codex`,
  version `26.1007.21159` (`Contents/Info.plist`). Custom
  `Codex Framework.framework` (not Electron), Sparkle updater, and a 541 MB
  `Contents/Resources/app.asar`. This confirms on this machine that the app
  named ChatGPT is built on the Codex app shell; the two products share one
  installed bundle here.
- `Visualize` ships as a bundled plugin/skill: the asar references a
  `bundledPlugin` plus `expectedVisualizeSkillContent`, a
  `materializationKey`, and a `targetMarketplaceRoot`, i.e. the skill content
  is checked against an expected value and materialized locally. A composer
  action labeled `Visualize` is present with a description steering it to
  "comparing alternatives, exploring metrics, or explaining a workflow" for
  an "interactive, inspectable representation" (short identifiers/excerpts).
- Prebuilt visualization components exist in the bundle:
  `cone`, `constant-acceleration`, `learning-block-number-line`,
  `responsive-image`, `responsive-lottie`, `shared-snapshot`, `sort-bar`,
  `triangle-family` (component chunk names ending in `-visualization-<hash>`).
- Library references in the asar: `mermaid` (many), `katex` (many),
  `sankey` (some); no `excalidraw`, no `plotly`.
- `Contents/Resources/artifact-template-picker/server.mjs` is a small local
  server for picking artifact templates. Its kind table covers
  document/presentation/spreadsheet plus Google Docs/Slides/Sheets; it reads
  skills from `CODEX_HOME/skills/remote-skills` and a plugin cache under
  `CODEX_HOME`, with size/pixel limits — i.e. "artifacts" in this app means
  office-style files, distinct from Visualize.
- `Contents/Resources/codex-cli/` exists (the Codex CLI ships inside the
  app); sandboxed paths like `/root/.codex/skills/remote-skills/` appear in
  the asar.
- Limits: the actual Visualize skill text, trigger conditions, models, and
  rollout flags are fetched or computed server-side; local files prove the
  packaging and verification mechanism, not the behavior.

## 3. Explanation patterns in official examples

Sources: the OpenAI Visualizations page (three reproduced demos, directly
observed as page content), the Claude Academy guide (described use cases with
embedded walkthrough videos; descriptions observed, not the account-specific
generations), and LOOPY (public explorable, directly observed).

- Tokenizer explainer (ChatGPT page demo): step-through of
  text → UTF-8 bytes → merges → token IDs with prev/next controls; the demo
  itself carries a simplification label (tiny teaching vocabulary;
  model-specific IDs differ). Lesson: state machinery honestly inside the
  artifact.
- Wave-interference lab (ChatGPT page demo): sliders (wavelength, source
  spacing, phase), a draggable probe, and a worksheet that records
  observations; a formula display accompanies the picture. Lesson: controls
  answer "what if", the prose keeps the model explicit.
- Spirograph (ChatGPT page demo): parameter sliders, pause/restart, traced
  path, and the parametric equations shown. Lesson: equations + live drawing
  together beat either alone.
- Claude Academy use cases (described): mechanism made visible step by step;
  practicing a formula interactively; charting the user's own data in
  conversation; mapping a literature review to reveal structure. Guidance
  includes making a static result interactive on request, follow-up buttons
  that keep earlier visuals, formatting-fix requests, and an explicit
  skepticism instruction — the visual is built for the question, not from a
  verified source, so check it.
- LOOPY (ncase.me, observed): users draw circles/arrows to simulate feedback
  loops; the bundled ecology example labels itself a simple oscillator,
  "not the Lotka-Volterra model ... close enough". Lesson: manipulation builds
  intuition; label simplifications visibly. CC0/public domain per its site
  and repository.

Coverage: mechanisms/steps, parameter manipulation, relationships, and
data interpretation are represented; geographic/map explanations were not
exercised (gap noted).

## 4. Public skill comparison

Source level: pinned HEAD files fetched 2026-10-11 (SKILL.md, references,
README, LICENSE). Earlier session downloads under `/tmp` were re-checked
against these HEADs.

| Criterion | visual-explainer (MIT) | excalidraw-diagram-skill (no license file) | frontend-slides (MIT) |
|---|---|---|---|
| Output | one self-contained HTML page (or deck); CDN only for fonts/libs | `.excalidraw` JSON + PNG render | one self-contained HTML deck, fixed 1920×1080 stage |
| Activation | skill description + commands; auto-renders terminal tables ≥4 rows/≥3 cols | user asks for a diagram | user asks for a presentation |
| Content→visual mapping | figure-first rules: one claim per figure, first viewport is the answer, draw the mechanism, encode state in form, every number gets a picture, small multiples | concept→pattern table (fan-out, convergence, tree, timeline, spiral, cloud, assembly line, side-by-side); shape-meaning table; container test | purpose/length/density questions; three live style previews |
| Evidence accuracy | `/fact-check` command verifies claims against code/git, including figure edges/labels; verification strip | research mandate: use real event/API names; evidence artifacts (real payloads, UI mockups) | n/a (decks) |
| Validation | ~20-item delivery checklist (a11y, contrast, overflow at 1280/390, themes, reduced motion) | mandatory render→view→fix loop (Python + uv + Playwright + Chromium) | screenshot check for overflow/overlap after generation |
| Interaction | steppers, before/after toggle, live figures with pure model functions, flow dots; reduced-motion/no-JS fallback | static after render | slide navigation, inline text editing |
| Dependencies | browser to view; optional Node tools for quick/MCP/PPTX/video | renderer setup required | browser; optional Node/Playwright for PDF export |
| Korean notes | font guidance is Latin-centric; Hangul coverage must be checked (inferred) | fixed coordinates risk overflow with longer Korean labels (inferred) | mandates webfonts; Hangul coverage must be verified (inferred) |
| License | MIT (LICENSE, "Copyright (c) 2025 Nico Bailon") | none found in repo tree or GitHub metadata at HEAD | MIT (LICENSE, "Copyright (c) 2025 Zara Zhang") |

Supporting references, consulted only for specific patterns:

- Anthropic `pptx` skill (proprietary license per its frontmatter; not open
  source): its required visual-QA loop (render every slide to an image,
  inspect fresh, fix, re-render changed slides) is a pattern worth copying;
  the skill text is not.
- Mermaid (MIT): text-defined diagrams, GitHub-native; a lightweight escape
  hatch. visual-explainer deliberately treats it as a special case with known
  traps rather than the default.
- Marp (MIT): Markdown slide pipeline; deferred — no Markdown-source
  requirement in this project.
- LOOPY: interaction philosophy reference (see above).

## 5. Role-based reference selection

- Primary experience reference: Claude inline visuals (announcement +
  Academy guide + locally observed widget behavior) and ChatGPT
  Visualizations documentation. Learn: decide-and-draw by default, in-flow
  visuals, follow-up evolution, explicit trigger phrases, honest
  simplification labels, skepticism/verification guidance.
- Primary public implementation reference: `nicobailon/visual-explainer`
  (MIT). Take: explanation-first principles, figure rules, fact-check
  command, delivery checklist, slide-only-when-asked gating. Do not copy:
  hand-drawn-SVG-only dogma, aggressive auto-render of terminal tables,
  author-specific typography bans, its Pi extension specifics (any pi
  integration here would be designed separately).
- Supplementary — diagram methodology: `excalidraw-diagram-skill` pattern
  library, evidence-artifact mandate, and render-view-fix loop. Methodology
  only; no license file was found at HEAD, so nothing is copied verbatim
  pending clarification.
- Supplementary — deck mode: `frontend-slides` (MIT) flow: two questions
  (density), three live style previews, fixed-stage invariants, screenshot
  verification, delivery summary.
- Supplementary — QA pattern: Anthropic pptx render-and-inspect loop.
- Supplementary — lightweight fallback: Mermaid (MIT) for quick diagrams.
- Deferred: Marp (no Markdown pipeline need); Anthropic document skills'
  code (proprietary); LOOPY-style full simulations (later-phase idea, needs
  a separate feasibility spike in pi).

## 6. Candidate requirements and evaluation checklist

Recommendations for a later design; none of these fixes the default format
or trigger policy.

1. Choose the explanation goal first (relationship, mechanism, difference,
   change over time, data), then the smallest sufficient format.
2. Prose and visuals interlock: the figure carries the claim; numbers get a
   visual place; arrows/labels are factual claims subject to verification.
3. Label simplifications explicitly ("illustrative", teaching model) —
   precedents: LOOPY's oscillator note, the tokenizer demo's teaching
   vocabulary.
4. Interaction only where it advances understanding (step-through,
   before/after, one parameter), with reduced-motion and no-JS fallbacks and
   a one-sentence text summary for screen readers.
5. Visual QA is separate from content QA: render, inspect as an image, fix,
   re-render only what changed.
6. Korean legibility: verify Hangul coverage of chosen fonts and overflow
   with longer labels before delivery.
7. Delivery in pi: the TUI cannot render HTML inline; write a file and open
   it in the browser (consistent with all three public skills); offer the
   path back in chat.
8. Escape hatches: Mermaid or plain text for lightweight cases; decks only
   when asked.
9. Verification strip: after generating, re-check claims (names, numbers,
   edges) against the source under discussion.
10. Evaluation checklist (draft): one claim per figure; first screen answers;
    both themes readable; no overflow at common widths; interaction has a
    static fallback; Korean text legible; claims verified; simplifications
    labeled.

## Open questions

- Delivery UX in pi: file + browser only, or a future inline preview
  (needs a spike; pi extension vs pure skill undecided).
- Whether to install `visual-explainer` via pi packaging versus authoring a
  skill that borrows its MIT-licensed principles; its README warns about
  conflicts with legacy manual installs.
- Korean font stack and offline behavior (CDN fonts may not load offline).
- How to do the visual-QA screenshot loop inside pi (candidate: ego-browser
  screenshot; needs a spike).
- Whether auto-triggering on complex content is desirable at all, or
  explicit invocation only.
- Unverified externally: whether Claude Code/Cowork bundle an equivalent
  visualize widget; the actual ChatGPT Visualize skill content (server-side).

## References

- Claude announcement and Academy guide (URLs in frontmatter)
- OpenAI Visualizations and artifacts-viewer docs (URLs in frontmatter)
- Local: `/Applications/Claude.app` (2.31226.1),
  `/Applications/ChatGPT.app` (26.1007.21159) — versions and paths as
  observed 2026-10-11; machine state, will drift
- Pinned skill sources: the three repos in frontmatter (HEAD commits
  observed 2026-10-11); supporting repos and LOOPY as listed
- Session working copies of fetched sources: `/tmp/visual-skill-reference-research/`
  (research aid, not part of docs)
