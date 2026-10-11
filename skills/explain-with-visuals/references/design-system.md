# Editorial design system

Use with [visual patterns](visual-patterns.md) and [verification](verification-and-delivery.md).
The [starter](../assets/starter.html) implements these defaults. This system fixes
legibility, hierarchy, and semantic consistency, not identical compositions.

## Color tokens

| CSS token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--page` | Page background | `#F7F6F2` | `#15181E` |
| `--surface` | Figure/content surface | `#FFFFFF` | `#1E232C` |
| `--ink` | Main text | `#20242B` | `#EEF1F5` |
| `--muted` | Secondary text | `#5D6570` | `#ACB5C2` |
| `--accent` | Key subject/path and focus | `#2459C4` | `#8AB4FF` |
| `--caution` | Limitations/warnings | `#946200` | `#E5B65B` |

All foreground tokens exceed 4.5:1 against both respective opaque backgrounds
by sRGB contrast calculation. Do not assume this holds for tinted backgrounds,
transparency, gradients, reversed button colors, or custom chart palettes.
Inspect actual output as well as calculations.

- Follow system theme by default using CSS variables and `prefers-color-scheme`.
- Concentrate blue on the key subject/path or current step; do not color every
  component differently. Use direct labels instead of a rainbow legend.
- Pair caution color with explicit words such as “limitation” or “illustrative”.
  Uncertainty, change, and state must never be conveyed by color alone.
- Meaningful lines, controls, and focus indicators need non-text contrast
  (normally at least 3:1 against adjoining colors). Faint separators are only
  decorative; do not use them as the sole meaningful edge or control boundary.
- No decorative gradients or default shadow stacks. A white/dark surface can
  group a figure without turning all prose into cards.

## Typography and rhythm

Use local system sans-serif fonts with Korean fallbacks, for example
`system-ui, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
"Malgun Gothic", sans-serif`. Inspect Hangul; a name in the stack does not prove
availability. Monospace is for code, identifiers, and equations when helpful,
not ordinary prose. Do not fetch fonts.

| Use | Normal-zoom default |
| --- | --- |
| Main title | Responsive 28–40px |
| Section heading | 22px |
| Body | 18px, line height about 1.65 |
| Figure labels | 16px minimum target |
| Secondary notes | Around 14px; never hide a critical condition here |

Implement scalable `rem`/`em` sizes. Use an 8px spacing rhythm: 8, 16, 24, 32,
48px equivalents. Limit prose to roughly 40em; figures/page can extend to about
1120px with fluid side gutters. Preserve comfortable line lengths instead of
making a wall of full-width prose.

## Editorial composition

- Open with the actual question and a one-sentence answer, then the principal
  figure. Avoid a tall decorative hero that pushes the answer off screen.
- Let the figure explain structure/change/difference and prose explain meaning
  and applicability. A short caption connects them.
- Use headings and whitespace, not nested card grids or unnecessary badges.
- Support quick reading, then deeper mechanism, then accurate conditions and
  evidence. Adapt section names/length; do not force a fixed report template.
- Keep critical conditions near the claim. Put supporting source references and
  performed/missing verification checks in a concise lower section.

## Visual grammar

| Mark | Meaning and constraints |
| --- | --- |
| Box | Named component, state, or processing step; label the role. |
| Group boundary | Shared system, responsibility, or scope; label the boundary. |
| Line | An asserted relationship; name unfamiliar relations. |
| Arrow | Direction with a defined meaning: transfer, order, dependency, etc. |
| Number | Explanatory reading order; distinguish from actual chronological order. |
| Dashed line | An explicitly declared alternative meaning, with a legend. |

Never add arrows for decoration, infer causality from layout, or give one mark
contradictory meanings within a figure. One central claim per figure. Small
multiples should keep position/labels/scale stable so differences are visible.
For magnitude bars use a zero baseline, common units, and truthful proportional
lengths. Do not invent numbers or use arbitrary area to imply quantity.

## Responsive and accessible behavior

- At about 390px, stack comparisons in a named reading order and split dense
  figures into scenes. Do not shrink a large SVG until its text is unreadable.
  Prefer HTML for long labels, or provide a separate mobile layout.
- SVGs need an accessible name/description and a text equivalent. Decorative
  arrows/icons should not create noisy screen-reader content.
- Use native buttons, persistent labels, visible keyboard focus, and an
  appropriate `aria-pressed` or live state description for enhancements.
- The answer and essential explanation exist without JavaScript. Controls can
  be hidden until successfully initialized, but essential content cannot depend
  on a successful initialization or clicking every step.
- No autoplay. Respect `prefers-reduced-motion`; avoid motion unless explanatory.
- Check long Korean labels, narrow widths, and increased text size. A document
  width check does not detect every clipped SVG label or overlapping annotation.
