import assert from "node:assert/strict";
import { existsSync, watch } from "node:fs";
import { dirname } from "node:path";

export const nestedModels = ["suggestion-primary", "suggestion-backup", "summary-primary", "summary-backup", "audit-primary", "audit-backup"];
export const suggestion = "검증 결과를 요약해주세요.";
export function nestedResponse(id, mode, n) {
 assert.ok(nestedModels.includes(id), "Known capture model");
 if (mode === "fallback" && id.endsWith("primary")) return { text: "", stopReason: "error", errorMessage: "503 offline fixture unavailable (synthetic)" };
 if (mode === "invalid-output") return { text: "not-json" };
 if (id.startsWith("suggestion")) return { text: JSON.stringify({ suggestion }) };
 if (id.startsWith("summary")) return { text: JSON.stringify({ summary: { done: mode === "narrow" ? `SUMMARY-${n} explained the requested verification step while keeping the remaining checks explicitly unverified.` : `SUMMARY-${n} explained the requested verification step.`, open: mode === "partial" ? null : "Tests have not been run; the result remains unverified.", next: mode === "partial" ? null : "Decide which offline checks to run next." } }) };
 return { text: JSON.stringify({ findings: mode === "clean" ? [] : [{ id: "glossary", note: "JUDGE-NOTE: the new term may need a glossary entry." }] }) };
}
/** Bounded local gate; cancellation never waits for a release file. */
export function waitForRelease(file, signal, timeoutMs = 25_000) {
 return new Promise((resolve, reject) => {
  if (signal?.aborted || existsSync(file)) return resolve();
  let watcher; let timer;
  const finish = (error) => { watcher?.close(); clearTimeout(timer); signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(); };
  const abort = () => finish();
  watcher = watch(dirname(file), () => { if (existsSync(file)) finish(); });
  signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => finish(new Error("Offline fixture gate timed out")), timeoutMs);
  if (signal?.aborted || existsSync(file)) finish();
 });
}
export const auditRules = [{ id: "readme-extension", type: "mention", match: "^extensions/([^/]+)/index\\.ts$", file: "README.md", mustContain: "`$1/`", message: "Add the demo extension to the README Resources table." }];
export const auditJudgments = [{ id: "glossary", text: "New terms have a glossary entry." }];
