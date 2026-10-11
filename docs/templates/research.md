---
title: <Title>
date: YYYY-MM-DD
session: <pi session id>
based_on: []
# Pin every source; sources change after a document is written.
# Keep the shape that applies and delete the other.
# Local code: repositories live at .references/<kind>/<owner>/<repo>, where
#   <kind> is harnesses, customizations, or pi-packages; references.json lists
#   them (fetch with python3 scripts/fetch-references.py). Cite code in the body
#   as .references/<kind>/<owner>/<repo>/<file>:<line> or :<start>-<end>.
#   Older documents cite .references/<name>/...; resolve these through their
#   sources entry and references.json.
# Web: record url and accessed date, plus commit when the HEAD can be read;
#   state the access date next to volatile values such as star counts.
# Mark anything not directly confirmed as (inferred).
sources:
  - repo: <owner/name>           # local code
    path: .references/<kind>/<owner>/<name>
    version: <version>
    commit: <short hash>
  - repo: <owner/name>           # web source; omit repo if there is none
    url: <url>
    commit: <short hash>         # only when the HEAD can be read
    accessed: YYYY-MM-DD
---

# <Title>

## Scope
<!-- Why this research exists, what is in and out of scope, and the depth. -->

## Summary
<!-- Key conclusions in 5–10 lines. A reader should be able to stop here. -->

## Questions
<!-- Numbered research questions. Each is answered under Findings. -->
1. …

## Findings
<!-- One subsection per question or topic. Cite every claim:
     `.references/<kind>/<owner>/<repo>/<file>:<line>`. Mark guesses as (inferred).
     Follow docs/README.md for amendments or independent follow-up research. -->

### <Topic>

## Open questions
<!-- What remains unresolved or needs a spike. -->

## References
<!-- Key files and URLs consulted. -->
