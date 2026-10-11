import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { registerFauxProvider, getApiProvider } from "@earendil-works/pi-ai/compat";
import { nestedModels, nestedResponse, waitForRelease } from "./nested-data.mjs";

/** Local nested inference only; production extension entry points remain unchanged. */
export default function (pi: any) {
 if (process.env.PI_OFFLINE !== "1" || !process.env.UI_CAPTURE_PROVIDER_LOG) throw new Error("Nested fixtures require an isolated offline capture run.");
 const faux = registerFauxProvider({ provider: "ui-nested", models: nestedModels.map((id) => ({ id })) });
 const delegate = getApiProvider(faux.api).streamSimple;
 const counts = new Map<string, number>();
 pi.on("session_shutdown", () => faux.unregister());
 pi.registerProvider("ui-nested", {
  baseUrl: faux.getModel().baseUrl, apiKey: "offline-fixture", api: faux.api,
  models: faux.models.map((m: any) => ({ id: m.id, name: m.name, api: m.api, reasoning: m.reasoning, input: m.input, cost: m.cost, contextWindow: m.contextWindow, maxTokens: m.maxTokens })),
  streamSimple(model: any, context: any, options: any) {
   const n = (counts.get(model.id) ?? 0) + 1; counts.set(model.id, n);
   const mode = process.env.UI_CAPTURE_MODE ?? "state";
   appendFileSync(process.env.UI_CAPTURE_PROVIDER_LOG!, JSON.stringify({ model: `${model.provider}/${model.id}`, mode, n, messages: context.messages }) + "\n");
   faux.appendResponses([async () => {
    if (mode === "pending") await waitForRelease(join(process.cwd(), "release-children"), options?.signal);
    if (options?.signal?.aborted) return fauxAssistantMessage("", { stopReason: "aborted" });
    const result = nestedResponse(model.id, mode, n);
    return fauxAssistantMessage(result.text, { stopReason: result.stopReason ?? "stop", ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}) });
   }]);
   return delegate(model, context, options);
  },
 });
}
