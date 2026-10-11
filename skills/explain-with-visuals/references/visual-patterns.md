# Visual patterns and explanation contract

Use the [design system](design-system.md); check [verification](verification-and-delivery.md)
before delivery. Choose the question and claim before choosing a shape.

## Three reading layers

1. **Quick understanding:** one-sentence answer and the principal figure with a
   concise text equivalent. A reader should not need to operate controls first.
2. **Mechanism understanding:** explain important parts in a useful order,
   matching the figure's labels or numbers. Briefly introduce unfamiliar terms.
3. **Accurate understanding:** conditions, exceptions, simplifications, and
   evidence. Place consequential limitations close to the affected claim.

These are reading layers, not three compulsory giant sections. For a small
question, a figure, caption, and short limitation may be enough. Honor explicit
audience/depth requests; otherwise use this layered default without repeatedly
asking reader level.

The figure shows structure, change, or difference. Prose explains why it matters
and where it applies. Avoid label-by-label repetition and unrelated background.

## Relationship or structure

**Narrative:** whole map → important connections → boundaries/responsibilities.

- Group by actual responsibility or scope, not decorative symmetry.
- Use labeled edges when the relationship is not obvious. State whether an
  arrow means “calls”, “contains”, “depends on”, or data transfer.
- Show only relevant components; explicitly label an incomplete teaching model.
- Keep the text reading order usable independently of spatial placement.

## Mechanism or sequence

**Narrative:** input → transformations → result → important exception path.

- Use a small ordered flow or scenes; preserve names across explanation steps.
- Distinguish explanatory step numbers from real concurrency or runtime order.
- Show meaningful branches rather than implying one happy path is universal.
- A step control may highlight the active part without hiding the full process.

Example: show saved-result hit and miss paths, highlighting work skipped on a
hit. Label this a teaching model, mention validity/invalidation, and do not
invent speed measurements or promise that lookup is always faster.

## Comparison or choice

**Narrative:** shared criteria → consequential differences → conditions for use.

- Align corresponding components, labels, dimensions, and scales. Small multiples
  usually explain better than unrelated illustrations.
- Explain which difference matters for the question; avoid generic feature lists.
- A toggle may emphasize changed parts but must preserve context and a static
  comparison. Never frame a conditional tradeoff as a universal winner.
- On mobile, stack named alternatives and retain the common comparison criteria.

## Simple data

**Narrative:** observed pattern → values/units → interpretation limits.

- Use bars for magnitude, a line for a real ordered/time sequence, and a table
  when exact values matter more than visual pattern. Small data may need no chart.
- Preserve values, units, sample size/window, source, and missing-value semantics.
- Ordinary magnitude bars start at zero and use a shared proportional scale.
  Do not imply amounts using arbitrary icon size or uncalibrated area.
- Separate observation from interpretation and causality. Label synthetic or
  illustrative values; never substitute them for actual measurements.

## Optional interaction

Only add controls that answer an explanatory question:
- Step navigation: “Which part is active now?”
- Before/after or comparison toggle: “What changes, with context held fixed?”
- Selection/highlight: “What is this component's role and connected scope?”

Use native keyboard-operable controls, visible focus, stable labels, and a
readable state description. Prefer pure, simple state changes; no complex
parameter simulation in this initial scope. No autoplay or click-to-reveal
essential facts. With JavaScript disabled, retain all essential information.

## Claim preparation

Before drawing, record the takeaway, relevant source, figure's central claim,
labels/relations/units, reading order, caption, and main limitation. Check that
prose, arrows, and data tell the same story. Distinguish observed facts,
inference, and illustrative simplification. Avoid presenting visual polish as
proof of accuracy.
