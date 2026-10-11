---
title: Codex Computer Use native service (SkyComputerUseService) — protocol and reuse feasibility
date: 2026-10-11
session: 01a12764-d3ce-7687-a617-bb698837cf9f
based_on: []
# Sources are proprietary local app files, so they are pinned by path + version +
# SHA-256 instead of being copied into .references/. This is a deliberate adaptation
# of the "Citing sources" convention: binaries are not redistributed in this repo.
sources:
  - local: ~/.codex/computer-use/Codex Computer Use.app
    version: 26.1005.1001425 (CFBundleVersion 1001425)
    sha256_prefix: ac8bfe406d01  # Contents/MacOS/SkyComputerUseService
    note: bundle id com.openai.sky.CUAService; OpenAI OpCo, LLC Developer ID (team 2DC432GLL2)
  - local: /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky
    version: "@oai/sky 0.7.6"
    sha256_prefixes:
      native-pipe.js: 2f1bcc0b4cd0
      client.js: ae51951e7087
      computer-use-policy.js: 8cd1272d7aa8
      errors.js: 9dd27e4cf0ea
  - local: /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl
    version: rmcp 1.5.0 MCP stdio server (node runtime v24.21.0)
    sha256_prefix: c8b82f7ef69a
  - local: ~/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/computer-use/skills/computer-use/SKILL.md
    version: computer-use plugin 1.0.1001425
    sha256_prefix: e6a2b212baca
  - local: /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
    version: codex-cli 0.160.1+personal.1
  - local: ~/.codex/packages/app-server-daemon/releases/0.162.1-aarch64-apple-darwin
    version: 0.162.1
---

# Codex Computer Use native service — protocol and reuse feasibility

## Scope

Reverse-engineer the Codex "Computer Use" native service (`SkyComputerUseService`, installed
outside ChatGPT.app under `~/.codex/computer-use/`) to answer:

1. Can it be driven **without the ChatGPT desktop app running**?
2. Can it be driven **from pi** (i.e., from a process outside OpenAI's own chain)?

In scope: static analysis of the JS client and binaries, live non-destructive probes against
the service socket (connect / `ping` / `list_apps` attempts only; no desktop manipulation, no
screenshots retained). Out of scope: disassembly of the auth check, driving real desktop
actions, redistributing OpenAI binaries.

## Summary

- The wire protocol is fully decoded and small: a Unix domain socket with UInt32LE-framed
  JSON-RPC 2.0 (`ping`, `request`), API version `CodexComputerUseIPC-5`, and ~8 request types.
- The **service itself runs independently of ChatGPT.app**: it is installed under `~/.codex`,
  launches standalone via LaunchServices (`open`), creates its socket, and was probed while
  ChatGPT.app was not running.
- However, **every connection is authenticated by sender code signature**. Connections from
  Homebrew node, OpenAI-signed `node`, and the `node_repl` kernel were all closed before a
  response, with the unified-log verdict `Sender process is not authenticated` right after
  Security-framework calls. Direct reuse from pi (or any non-OpenAI process) is **blocked by
  design**, not by configuration.
- Recommended pi path: short term, drive Computer Use **through the codex chain**
  (`codex exec` / codex app-server, which owns `node_repl` and is already resident as a
  daemon); medium term, implement a pi-native equivalent on macOS AX / CGEvent /
  ScreenCaptureKit APIs. The decoded protocol is recorded here so a direct client can be
  finished if the gate ever opens.

## Questions

1. What does the Computer Use stack look like (components and trust relationships)?
2. What is the client↔service wire protocol?
3. Does the service authenticate clients, and can a non-OpenAI process connect?
4. Is the service independent of the ChatGPT desktop app at runtime?
5. What are viable ways to use this capability from pi?

## Findings

### Q1: Architecture

```
 ChatGPT.app ──app-server(host services, ~/.codex/ipc/ipc.sock)──┐
 codex CLI / app-server daemon (0.162.1, ~/.codex/packages)      │  spawns + proxies
          │                                                      │
          ▼                                                      ▼
   node_repl (OpenAI-signed MCP stdio server, rmcp 1.5.0)  ══ FD/pipe bridge ══┐
          │  tools: js, js_add_node_module_dir, js_reset, turn_ended          │
          ▼                                                                   │
   js kernel ── import "@oai/sky" (0.7.6) ── MacComputerUseClient ────────────┘
                                                          │
                                                          ▼
        Unix socket: ~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/
                     IPC/computeruse.sock   (0600)
                                                          │
                                                          ▼
        SkyComputerUseService (com.openai.sky.CUAService, v26.1005.1001425)
          AX tree (UIRecorder/EventTap), input synthesis, screenshots,
          audio recording; overlay UI: SkyComputerUseClient.app;
          lock-screen guard: CUALockScreenGuardian.app; Installer.app
```

- The service lives **outside** ChatGPT.app (`~/.codex/computer-use/Codex Computer Use.app`),
  is `LSUIElement`, Developer-ID signed by OpenAI OpCo, LLC (team `2DC432GLL2`), arm64,
  hardened runtime, min macOS 14.4, Sparkle auto-update enabled (Info.plist).
- `@oai/sky` ships three API surfaces documented in its own `docs/`: the mac *window API*
  (`list_apps`, `get_app_state`, `click`, `drag`, `press_key`, `scroll`, `set_value`,
  `paste`, `select_text`, `perform_secondary_action`, `type_text`, `target:"mac"`), a Windows
  "window2" API, and a Linux full-desktop API. The package also bundles its own copy of the
  service app (`package.json` `publishConfig.executableFiles`).
- `SKILL.md` (computer-use plugin) tells the model to use `node_repl` exclusively and to
  bootstrap with `globalThis.sky = (await import("@oai/sky")).sky`.
- `unified-computer-use` plugin registers `node_repl` as MCP server `cua_repl` (tools `js`,
  `js_reset`, `turn_ended`; disabled by default in `.mcp.json`) plus Stop/SubagentStop/
  Interrupt hooks that call `turn_ended`.
- `~/.codex/config.toml` spawns `node_repl` with env: `NODE_REPL_NODE_MODULE_DIRS`,
  `NODE_REPL_TRUSTED_SERVICES = {"browser":…,"sky":"@oai/sky/service"}`,
  `SKY_CUA_SERVICE_PATH`, `CODEX_CLI_PATH`, etc.

### Q2: Wire protocol (decoded from `@oai/sky` dist, verified against the binary)

- **Transport**: Unix stream socket
  `~/Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock`,
  permissions `srw-------`, created at service launch, removed at exit (a `computeruse.sock.lock`
  file remains). Overridable via `SKY_CUA_SERVICE_NATIVE_PIPE_PATH`
  (`native-pipe.js`, `MacNativePipeTransport.create`).
- **Framing**: `UInt32LE` length prefix + UTF-8 JSON-RPC 2.0 message; max frame 8388608 bytes
  (`encodeMessageFrame` / `decodeMessageFrames`).
- **Methods**:
  - `ping` with params `{clientApiVersion}` → result includes `serverApiVersion`;
    mismatch raises `incompatibleClientVersion`.
  - `request` with params `{clientApiVersion, codexTurnMetadata?, deadlineUnixMilliseconds,
    requestType, request}` (`client.js`, `MacComputerUseClient.request`).
- **API version**: `CodexComputerUseIPC-5` (present both in `client.js` default and in the
  service binary strings — single version string, drifts with updates).
- **Request types** (`client.js`):
  - `ComputerUseIPCListAppsRequest` `{}` → app list
    (`{id, displayName?, isRunning?, lastUsedDate?, useCount?}`).
  - `ComputerUseIPCAppGetSkyshotRequest` `{app, disableDiff?}` → app state
    (accessibility text + screenshot data URL).
  - `ComputerUseIPCAppPerformActionRequest` `{app, action:{click|drag|paste|pressKey|scroll|
    setValue|selectText|type}}` — all input actions funnel through this one type.
  - `ComputerUseIPCAppPolicyRequest` `{app}` → `{decision: allowed|denied|forbidden, target:
    {bundleIdentifier, displayName, risk, …}, allowPersistentApproval?}`.
  - `ComputerUseIPCAppStartRequest` `{app}`, `ComputerUseIPCStartAudioRecordingRequest`,
    `ComputerUseIPCStopAudioRecordingRequest`.
- **Server error codes** (`errors.js`): `senderProcessNotAuthenticated (-10000)`,
  `appNotAllowed (-10006)`, `runningApplicationNotFound (-10007)`, `accessibilityError
  (-10008)`, `permissionsNotGranted (-10009)`, `permissionsPending (-10014)`,
  `incompatibleClientVersion (-10013)`, `screenLocked (-10020)`, and others.
- **Approval flow** (`computer-use-policy.js`): policy check (`getAppPolicy`) runs in the JS
  client; the per-app user approval is a **host UI** feature (`nodeRepl.createElicitation`),
  not a service RPC — the service supplies policy data (via
  `CodexAppServerComputerUsePolicyProvider`, per binary strings), the host collects consent.

### Q3: Sender authentication — the gate

Live probes (2026-10-11, ChatGPT.app **not** running, service PID 92403/92863 launched via
`open`):

| Sender | Result |
|---|---|
| Homebrew node v26.10.0 (ad-hoc) | connected, closed before `ping` response |
| OpenAI-signed `cua_node/bin/node` (team 2DC432GLL2, id `node`) | same rejection |
| `node_repl` `js` kernel, `--disable-sandbox` | same rejection (service log) |
| `node_repl` with `CODEX_CLI_PATH` sandbox mode | `Sky Computer Use native pipe startup failed` |
| `codex sandbox -- node …` | seatbelt blocks connect (`EPERM`) before reaching the service |

- Unified log at rejection time, immediately after `SecKeyVerifySignature` /
  `SecTrustEvaluateIfNecessary` calls: `Sender process is not authenticated`
  (subsystem `inc.software.app:Computer Use`).
- The service inspects the peer chain: binary strings include
  `cua_ipc_sender_{responsible,parent}_{bundle_id,executable,signing_id,team_id}`, Swift
  `_senderResponsible*`, and error codes `senderProcessNotAuthenticated (-10000)`,
  `couldNotGetSenderPID (-10017)`. Allowlist markers: `com.openai.chat*`, `com.openai.codex*`,
  the CodexCLI executable path, and handshake client types
  `CODEX_COMPUTER_USE_IPC_CLIENT_TYPE_{NODE_REPL,LEGACY_MCP,NATIVE_BRIDGE,UNSPECIFIED}`.
- The codex app-server daemon (resident, `~/.codex/packages/app-server-daemon`, listening on
  `/private/tmp/codex-daemon-501/<hash>`) also performs Security-framework peer checks; the
  `~/.codex/ipc/ipc.sock` found in `~/.codex/ipc` was stale (`ECONNREFUSED`) after the
  ChatGPT in-app server exited.

**Conclusion**: the gate is cryptographic (Developer-ID + allowlist + responsible-process
attribution), so *no externally-implemented client can connect directly*, regardless of the
protocol being fully known. Signing a local binary as `com.openai.*` cannot forge the team
certificate. This is an intentional security boundary — appropriate for a service that
synthesizes keyboard/mouse input.

### Q4: ChatGPT-app independence

- The service is **not** part of ChatGPT.app and **starts standalone**: `open "<path to
  Codex Computer Use.app>"` produced a running service (PID 92403) and created the socket
  with no ChatGPT process present (verified via `pgrep`).
- It auto-exits on idle (observed between session start and first probe; binary string
  `cua_service_idle_timeout_reached`) and was observed to reappear without manual restart
  (PID 92863), so some installed component (daemon / extension host / LaunchServices)
  re-launches it on demand.
- Everything *client-side*, however, is signature-gated to OpenAI's chain (Q3): ChatGPT
  app-server, codex CLI/daemon, and `node_repl` (when spawned by codex with its host pipe).
- Net: **"ChatGPT app not running" is sufficient; "without any OpenAI runtime" is not** —
  the minimal sanctioned client chain is codex CLI/daemon + `node_repl` + `@oai/sky`.

### Q5: Using it from pi

Options evaluated:

1. **Register `node_repl` as a pi MCP server** (same env as codex uses). *Verified partially*:
   `initialize`, `tools/list` (`js`, `js_add_node_module_dir`, `js_reset`, `turn_ended`) and
   `js` execution work when pi-side drives the MCP stdio server; `@oai/sky` imports inside the
   kernel. But computer-use calls fail with `native pipe startup failed` because the kernel's
   socket connections are sender-rejected (Q3). **Not viable** unless the host-pipe proxying
   normally provided by codex is reproduced — which itself requires speaking the codex
   app-server protocol to an OpenAI-signed broker.
2. **Drive Computer Use through codex** (`codex exec` or the codex app-server JSON-RPC):
   codex spawns its own plugin chain (daemon → `node_repl` → `sky` → service), all
   OpenAI-signed, ChatGPT app not required (daemon is already resident on this machine).
   Works with today's installed software; cost: LLM-in-the-loop latency and no clean
   tool-level API for pi. *Not exercised live* (would perform real desktop actions / spend
   model quota — out of probe scope), expected to work since this is codex's own path.
3. **pi-native equivalent** on public macOS APIs: Accessibility (AX UIElement tree ↔
   `get_app_state` text), CGEvent synthesis (input), ScreenCaptureKit (screenshots), plus a
   permission model of our own. No OpenAI components, stable under our control; this is the
   engineering-heavy but durable direction for a first-class pi computer-use tool.
4. **Direct protocol client** (the ~100-line client below) — complete and ready, but
   unusable until the signature gate changes. Kept as the protocol record.

**Recommendation**: for pi, take (2) as the pragmatic near-term integration and (3) as the
real build; keep (4)'s client as reference material.

## Appendix: minimal standalone client (protocol reference, rejected at `ping` by design)

```js
// sky-client.mjs — plain Node, no ChatGPT.app / node_repl. Speaks CodexComputerUseIPC-5.
import net from "node:net";
import os from "node:os";
import path from "node:path";

const SOCKET = path.join(os.homedir(), "Library", "Group Containers",
  "2DC432GLL2.com.openai.sky.CUAService", "IPC", "computeruse.sock");
const API_VERSION = "CodexComputerUseIPC-5";
const MAX_FRAME = 8 * 1024 * 1024;

const frame = (obj) => {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
};

class SkyClient {
  static connect() {
    return new Promise((res, rej) => {
      const s = net.createConnection(SOCKET);
      s.once("connect", () => res(new SkyClient(s)));
      s.once("error", rej);
    });
  }
  constructor(sock) {
    this.sock = sock; this.nextId = 1; this.buf = Buffer.alloc(0); this.pending = new Map();
    sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const len = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + len) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + len).toString("utf8"));
        this.buf = this.buf.subarray(4 + len);
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
      }
    });
  }
  call(method, params, timeoutMs = 10000) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`${method} timeout`)), timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); res(v); },
                              reject: (e) => { clearTimeout(t); rej(e); } });
      this.sock.write(frame({ id, jsonrpc: "2.0", method, params }));
    });
  }
  ping() { return this.call("ping", { clientApiVersion: API_VERSION }, 5000); }
  request(requestType, request, timeoutSeconds = 30) {
    return this.call("request", { clientApiVersion: API_VERSION,
      deadlineUnixMilliseconds: Date.now() + timeoutSeconds * 1000, requestType, request });
  }
}
// Example: (await SkyClient.connect()).ping()   → closed by sender-auth gate (Q3)
```

## Open questions

- Exact allowlist semantics of the sender check (signing identifier vs team vs
  responsible-process bundle id) — requires disassembly; not attempted.
- The ChatGPT app-server ↔ `node_repl` host-pipe protocol (FD passing?) — could enable a
  sanctioned local broker via `codex app-server`; needs a dedicated spike.
- Whether the codex app-server API can expose computer-use tools to an external MCP client
  directly (would make option 2 tool-shaped instead of prompt-shaped).
- Which component re-launches the service after idle exit (daemon vs LaunchServices vs
  extension host).
- Service behavior with `getAppPolicy` when no codex session/host is present (policy
  provider availability) — unreachable while the sender gate stands.

## References

- `@oai/sky` package docs: `docs/sky-window-api.md` (mac surface), `docs/sky-window2-api.md`,
  `docs/sky-full-desktop-api.md` (Linux).
- `@oai/sky` dist sources (single-line minified): `…/src/targets/mac/native-pipe.js`
  (`MacNativePipeTransport`, framing, launch fallback), `…/src/targets/mac/client.js`
  (`MacComputerUseClient`, request types), `…/src/targets/mac/computer-use-policy.js`
  (`withComputerUsePolicy`, elicitation approval), `…/src/targets/mac/errors.js`
  (server error codes), `…/src/sky.js` (nodeRepl.rpc trusted-service dispatch),
  `…/src/service.js` (`handleRpc`).
- `node_repl --help`: "Run the node_repl MCP stdio server." (`--disable-sandbox`).
- `codex --help` / `codex mcp --help` / `codex sandbox --help` (0.160.1+personal.1).
- Probe scripts used (scratch, not committed): `/tmp/sky-probe.mjs`, `/tmp/mcp-drive*.mjs`,
  `/tmp/ipc-probe.mjs`.
- Related local records: `docs/research/2026-10-11-codex-cli-plan-mode.md` (codex CLI
  behavior notes from the same day).
