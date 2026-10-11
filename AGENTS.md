# Project conventions

- Write source comments, docstrings, documentation, skills, prompts, CLI help
  and diagnostics in English. Preserve intentional task data, quotes,
  localization and explicitly requested non-English content; do not rewrite
  external `.references/` files to enforce this convention.
- For documentation changes, follow `docs/README.md` and the matching template.
- On resume, run `python3 scripts/backlog.py list`; check active/next items, but
  do not start queued work unless requested. Update the current item's state.
- Before closing work, sort what remains. Finish defects in your own work and
  in-goal doc, test, or diagnosis work that needs no new approval. Ask once,
  batched, for items needing approval or a design choice, then continue.
  Register a candidate only for a concrete unresolved problem within the
  requested scope or work the user explicitly wants to revisit, and only when
  it cannot be completed now. Record the impact and why it remains open. Do not
  register speculative improvements or optional polish by default. Name newly
  registered candidates in the final report.
- Build project-owned local customizations from reference ideas, not unchanged
  reference packages or runtime dependencies on them. Adapt only the approved
  scope and preserve applicable attribution/licenses for reused code.
- Keep features independently usable. Prefer Pi public APIs and generic
  contracts; avoid feature-specific imports, special cases, runtime dependencies
  between features, and reverse dependencies. Test infrastructure reuse is not
  a production dependency.
- Before exceptional cross-feature coupling, explain the features and dependency
  directions, need, independent alternatives, scope and maintenance implications;
  obtain explicit approval. Do not introduce coupling silently.
