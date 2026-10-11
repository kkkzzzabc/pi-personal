---
description: Review the current work with distinct configured models in parallel
argument-hint: "[target or focus]"
---
Run a review of the current work with reviewer subagents. The user requested this review, so launching reviewers is authorized.

Target and focus from the user: ${@:-the uncommitted changes in this repository}

1. Identify the target before launching anything.
   - For uncommitted changes, reviewers read them with `review_diff`. If there are no changes and no other target was named, say so and stop.
   - For a commit range, write the diff to a file (for example with `git diff <range> > /tmp/review-<name>.patch`) and pass its path.
   - For files, plans, or documents, pass their paths.
   - Note the intent of the change in one or two sentences, from the conversation or the target itself.
2. Launch the configured review roster in one `subagent` call with `review: { task: "..." }`. The extension assigns one reviewer per distinct model from `review.models` in `subagent.json`.
   - Do not replace this form with 2-3 unspecified-model `tasks`, inherit the parent's model for slots, guess model IDs, or retry failed slots on another participating model.
   - If the roster is missing or invalid, report the configuration error and stop. Do not silently choose a different review workflow.
3. Make the shared reviewer task self-contained: the target (path, or "the uncommitted changes, read with review_diff"), the intent, user focus, and complete review criteria: correctness, regressions, edge cases, tests/validation, complexity, and repository rules. Include "report only evidence-backed findings within the target; zero findings is valid". Every model reviews the same complete brief; optional secondary angles must not replace essential checks.
4. Inspect coverage and per-model statuses. Retain successful reviews if some models failed, naming the missing models and reasons. Report cancellation explicitly. Do not claim complete roster coverage or agreement across all configured models from partial results. If no reviewer succeeded, report that no review verdict is available and stop. Otherwise verify every finding you intend to keep by reading the cited code yourself. Drop findings that the code does not support.
5. Report the verified result to the user:
   - fixes worth doing now, with file:line and the smallest fix;
   - optional improvements;
   - feedback to ignore or defer, with a short reason;
   - a combined merge verdict based only on the successful reviews and your verified evidence, with an explicit coverage limitation when partial.
6. Do not edit any files. End by asking the user which fixes to apply.
