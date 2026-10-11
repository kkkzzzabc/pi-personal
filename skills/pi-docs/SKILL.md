---
name: pi-docs
description: >
  Documentation map for pi, the coding agent harness this session runs inside.
  Covers where pi's README, docs, and examples live, and which document covers
  what: extensions, themes, skills, prompt templates, TUI components,
  keybindings, SDK integrations, custom providers, adding models, pi packages,
  environment variables, MCP servers, and codemode. Use when the user asks
  about pi itself, or wants to build/install pi extensions, themes, skills,
  prompt templates, or packages.
---

# pi documentation map

## Where pi's docs live

Resolve the documentation root before reading. Prefer the running host's package
or documentation paths when they are explicitly available; do not assume that a
package resolved from the current project is the running host.

1. Use the running host's explicit paths, if provided.
2. Otherwise inspect `PI_PACKAGE_DIR`. If set, use it as the package root and
   validate it. If it is invalid, report the problem rather than silently reading
   another installation's docs.
3. Otherwise identify the running host's installation from available executable
   or session information. Resolve symlinks and validate the resulting package
   root; npm, pnpm, and binary installations may use different layouts.
4. If the running installation cannot be identified, try the managed-install
   fallback below. This selects the currently installed release, not necessarily
   the version of a session that was started before an update.

Managed-install fallback (bash):

```bash
if [[ -r "$HOME/.pi/agent/install/current-version" ]]; then
  v=$(< "$HOME/.pi/agent/install/current-version")
  root="$HOME/.pi/agent/install/releases/$v/node_modules/@earendil-works/pi-coding-agent"
fi
```

Before using a candidate, check that `README.md`, `docs/`, and `examples/` exist.
Read its `package.json` to verify the package name
(`@earendil-works/pi-coding-agent`) and version. Compare with the running host's
version when available. If only fallback docs are available, disclose any version
mismatch or inability to verify the running version, especially for API advice.
If no valid root is found, ask for the installation path instead of inventing one.

| Content | Path |
|---|---|
| Main documentation | `$root/README.md` |
| Additional docs | `$root/docs/` |
| Examples (extensions, custom tools, SDK) | `$root/examples/` |

## Which document covers what

| Topic | Document |
|---|---|
| Extensions | `docs/extensions.md`, `examples/extensions/` |
| Themes | `docs/themes.md` |
| Skills | `docs/skills.md` |
| Prompt templates | `docs/prompt-templates.md` |
| TUI components | `docs/tui.md` |
| Keybindings | `docs/keybindings.md` |
| SDK integrations | `docs/sdk.md` |
| Custom providers | `docs/custom-provider.md` |
| Adding models | `docs/models.md` |
| pi packages | `docs/packages.md` |
| Environment variables | `docs/environment-variables.md` |
| MCP servers | `docs/mcp.md` |
| Codemode scripts, classifiers, image models | `docs/codemode.md` |

## Reading rules

- Read pi docs and examples from `$root/docs/` and `$root/examples/` — not from
  the current working directory.
- Read `.md` files completely; follow links to related docs (for example
  `tui.md` for TUI API details) before implementing.
