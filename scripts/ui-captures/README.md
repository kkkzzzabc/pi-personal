# Extension UI captures

Capture the actual Pi TUI with isolated offline fixtures. This development tool does not change extension implementations, global settings, or real macOS apps.

## Run

Existing Pi 1.1.x and agent-tty 0.5.x with working screenshot prerequisites are required. The tool does not install dependencies. Run `agent-tty skills get agent-tty` before driving agent-tty directly.

```bash
node scripts/ui-captures/capture.mjs --help
node scripts/ui-captures/capture.mjs --group baseline --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group ask-user --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group plan-mode --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group subagent --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group computer-use --out artifacts/ui-captures/my-baseline
node scripts/ui-captures/capture.mjs --group prompt-suggestions --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group turn-summary --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group wrapup-audit --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/capture.mjs --group pi-perf-log --out artifacts/ui-captures/my-supplemental
node scripts/ui-captures/verify.mjs artifacts/ui-captures/my-supplemental
node scripts/ui-captures/verify.mjs artifacts/ui-captures/my-baseline
node --test tests/ui-captures.test.mjs
```

Use group-sized invocations with generous command deadlines; the full matrix can take several minutes. `--case <run-label>` reruns one scenario within a group (for example `--group subagent --case review`). New runs get new directories; rerunning replaces that state's gallery image without deleting earlier run evidence.

`--group supplemental` selects all four new groups; prefer individual groups for bounded execution. New manifests declare schema version 2 and a complete group scope, extended when another group is captured into that directory. Verification rejects missing/duplicate/unknown states, failed latest invocations, and escaping evidence paths. Legacy manifests without a scope retain their fixed original 35-state matrix; use a new output directory for supplemental captures rather than modifying historical evidence. `--case` selects a run label, not a state name.

If the existing browser cache is unavailable, stop before PNG capture and obtain approval before downloading browsers. The 2026-10-12 run used the existing agent-tty's Playwright CLI to download Chromium into `artifacts/ui-captures/browser-cache/` with separate user approval. Set `PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/ui-captures/browser-cache"` only for relevant commands when reusing that cache; no global configuration or installed tool changes are required.

Open `artifacts/ui-captures/index.html` for the generated landing page linking separate historical galleries, or open the generated capture-set `index.html` locally. `index.md`, `manifest.json`, PNGs, text snapshots, and `runs/*/{run,finish}.json` retain evidence. The verifier checks recorded content, local gallery links, PNG dimensions, fixture boundaries, and cleanup. It does not replace reading each PNG visually.

## Boundaries and limitations

- Parent responses use the existing tui-check faux provider.
- Subagents use only the local `ui-fixture` provider and actual extension orchestration. Error messages and answer text are synthetic; durations include capture gates and retries, not live inference performance.
- Prompt-suggestions, turn-summary, and wrapup-audit use production entry points with a local `ui-nested` faux provider. Pending responses use bounded release/abort gates; malformed output and provider failures are synthetic. Typing a prompt-suggestion status command dismisses the current state, so failure/footer and last-attempt details have separate frames.
- Wrapup-audit changes only a copied synthetic workspace. `GIT_CEILING_DIRECTORIES` is set for the run so project-root discovery cannot ascend into this repository. The parent receives real one-time steering; judgments remain fixture data.
- Pi-perf-log normally has no UI widget or command. Its normal screen links to real session/turn/run logs inside the isolated run directory. Error frames use invalid run-local configuration or an ordinary file as the output-directory obstacle, not global permission changes. Logs and measurements are not performance benchmarks.
- Computer-use loads the production entry point with `PI_CUA_HELPER` set only in its subprocess to an executable JSON-lines fixture. Only fixture app resolution and state reads are supported; other methods are rejected.
- Plan files are explicitly redirected into each isolated run. Never omit this override when manually reproducing plan mode.
- The baseline pins built-in dark theme, fullscreen mode, default keybindings, reference-dark render profile, and 120×40 or 80×30 geometry. Narrow captures start at their final size; they are not dynamic-resize tests.
- Hardware cursor is hidden; Pi's fake editor cursor can remain visible.
- The backend may show `[Image: ...]` rather than inline pixels. Preserve and label the actual behavior; do not composite fake app images over TUI output.
- `screenshot.mjs` uses the installed agent-tty capture RPC because its 0.5 screenshot CLI has a fixed 5-second timeout. The adapter uses a bounded 60-second deadline and the same renderer/profile. It relies on installed tool internals, not a production extension dependency.
- Startup-failure recovery is limited to the run's own newly created agent-tty home. Abrupt termination of the entire orchestrator can still require explicit cleanup: inspect only that home, reconstruct missing run metadata from its session listing if needed, and call the existing tui-check `finish.mjs`. Never interact with unrelated user sessions.

The first baseline and observed limitations are recorded in `docs/spikes/2026-10-11-extension-ui-capture-baseline.md`. Supplemental coverage and visual checks are recorded in `docs/spikes/2026-10-12-extension-ui-capture-supplemental.md`. Existing live-run text snapshots are preserved separately and are not reconstructed as historical screenshots.
