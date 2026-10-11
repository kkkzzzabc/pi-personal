import { appendFileSync, existsSync, watch } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { registerFauxProvider, getApiProvider } from "@earendil-works/pi-ai/compat";
import { childAnswer } from "./data.mjs";

/** Development-only local provider. No transport, credentials, or remote models. */
export default function (pi: any) {
 if (process.env.PI_OFFLINE !== "1" || !process.env.UI_CAPTURE_PROVIDER_LOG) throw new Error("The fixture provider requires an isolated offline capture run.");
 const faux = registerFauxProvider({ provider: "ui-fixture", models: ["primary", "backup", "failure"].map((id) => ({ id, reasoning: true })) });
 const delegate = getApiProvider(faux.api).streamSimple;
 pi.on("session_shutdown", async () => faux.unregister());
 pi.registerProvider("ui-fixture", {
  baseUrl: faux.getModel().baseUrl, apiKey: "offline-fixture", api: faux.api,
  models: faux.models.map((m: any) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
  streamSimple(model: any, context: any, options: any) {
   appendFileSync(process.env.UI_CAPTURE_PROVIDER_LOG!, JSON.stringify({ model: `${model.provider}/${model.id}`, mode: process.env.UI_CAPTURE_MODE, messages: context.messages }) + "\n");
   faux.appendResponses([async () => {
    const mode = process.env.UI_CAPTURE_MODE;
    if (mode === "running" || mode === "cancel") await new Promise<void>((resolve) => {
     const gate = join(process.cwd(), "release-children");
     if (existsSync(gate) || options?.signal?.aborted) return resolve();
     const watcher = watch(process.cwd(), () => { if (existsSync(gate)) done(); });
     const done = () => { watcher.close(); options?.signal?.removeEventListener("abort", done); resolve(); };
     options?.signal?.addEventListener("abort", done, { once: true });
     // Check again after installing the watcher to close the admission race.
     if (existsSync(gate) || options?.signal?.aborted) done();
    });
    if (model.id === "failure" || (mode === "fallback" && model.id === "primary")) return fauxAssistantMessage("", { stopReason: "error", errorMessage: "503 fixture provider unavailable (synthetic)" });
    return fauxAssistantMessage(childAnswer);
   }]);
   return delegate(model, context, options);
  },
 });
}
