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
node scripts/ui-captures/verify.mjs artifacts/ui-captures/my-baseline
node --test tests/ui-captures.test.mjs
```

Use group-sized invocations with generous command deadlines; the full matrix can take several minutes. `--case <run-label>` reruns one scenario within a group (for example `--group subagent --case review`). New runs get new directories; rerunning replaces that state's gallery image without deleting earlier run evidence.

Open the generated `index.html` locally. `index.md`, `manifest.json`, PNGs, text snapshots, and `runs/*/{run,finish}.json` retain evidence. The verifier checks recorded content, local gallery links, PNG dimensions, fixture boundaries, and cleanup. It does not replace reading each PNG visually.

## Boundaries and limitations

- Parent responses use the existing tui-check faux provider.
- Subagents use only the local `ui-fixture` provider and actual extension orchestration. Error messages and answer text are synthetic; durations include capture gates and retries, not live inference performance.
- Computer-use loads the production entry point with `PI_CUA_HELPER` set only in its subprocess to an executable JSON-lines fixture. Only fixture app resolution and state reads are supported; other methods are rejected.
- Plan files are explicitly redirected into each isolated run. Never omit this override when manually reproducing plan mode.
- The baseline pins built-in dark theme, fullscreen mode, default keybindings, reference-dark render profile, and 120×40 or 80×30 geometry. Narrow captures start at their final size; they are not dynamic-resize tests.
- Hardware cursor is hidden; Pi's fake editor cursor can remain visible.
- The backend may show `[Image: ...]` rather than inline pixels. Preserve and label the actual behavior; do not composite fake app images over TUI output.
- `screenshot.mjs` uses the installed agent-tty capture RPC because its 0.5 screenshot CLI has a fixed 5-second timeout. The adapter uses a bounded 60-second deadline and the same renderer/profile. It relies on installed tool internals, not a production extension dependency.
- Startup-failure recovery is limited to the run's own newly created agent-tty home. Abrupt termination of the entire orchestrator can still require explicit cleanup: inspect only that home, reconstruct missing run metadata from its session listing if needed, and call the existing tui-check `finish.mjs`. Never interact with unrelated user sessions.

The first baseline and observed limitations are recorded in `docs/spikes/2026-10-11-extension-ui-capture-baseline.md`.
