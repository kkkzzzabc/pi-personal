# Project conventions

- Write source comments, docstrings, documentation, skills, prompts, CLI help
  and diagnostics in English. Preserve intentional task data, quotes,
  localization and explicitly requested non-English content; do not rewrite
  external `.references/` files to enforce this convention.
- For documentation changes, follow `docs/README.md` and the matching template.
- On resume, run `python3 scripts/backlog.py list`; check active/next items, but
  do not start queued work unless requested. Update the current item's state;
  register unfinished follow-ups as candidates and name them in the final report.
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
