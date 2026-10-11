import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// agent-tty 0.5's screenshot CLI does not pass its global timeout to sendRpc.
// Use the same installed tool's capture RPC with a bounded 60s deadline.
// No installed files, recorded output, or renderers are modified.
const [bin, home, sessionId] = process.argv.slice(2);
const dist = dirname(dirname(realpathSync(bin)));
const { sendRpc } = await import(pathToFileURL(join(dist, "host/rpcClient.js")).href);
const { sessionDir, socketPath } = await import(pathToFileURL(join(dist, "storage/sessionPaths.js")).href);
const result = await sendRpc(socketPath(sessionDir(home, sessionId)), "screenshot", { profile: "reference-dark", rendererName: "ghostty-web", showCursor: false }, 60_000);
process.stdout.write(JSON.stringify(result));
