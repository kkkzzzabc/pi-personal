import assert from "node:assert/strict";

export const legacyMatrix = {
 baseline: ["idle"],
 "ask-user": ["single-choice", "multi-choice", "text-editor", "alternative-editor", "comment-editor", "review", "partial-review", "submitted-collapsed", "submitted-expanded", "submitted-expanded-top", "discussion", "cancelled", "narrow"],
 "plan-mode": ["enter-confirmation", "active-status", "approval", "feedback-editor", "approved", "narrow"],
 subagent: ["single-running", "parallel-running", "completed-collapsed", "completed-expanded", "mixed-results", "fallback", "aborted", "review-partial", "narrow"],
 "computer-use": ["approval", "state-collapsed", "state-expanded", "rejected", "permissions-error", "narrow"],
};
export const supplementalMatrix = {
 "prompt-suggestions": ["pending", "ghost", "accepted", "edited", "dismissed", "status", "off", "invalid-output", "invalid-output-details", "fallback", "narrow"],
 "turn-summary": ["pending", "full", "partial", "status", "off", "invalid-output", "fallback", "composing", "replacement", "coexistence", "narrow"],
 "wrapup-audit": ["checking", "steering", "findings", "status", "clean", "rules-only", "off", "invalid-output", "narrow", "narrow-top"],
 "pi-perf-log": ["normal", "config-error", "write-error"],
};
export const matrix = { ...legacyMatrix, ...supplementalMatrix };
export const scopeKeys = (groups, source = matrix) => groups.flatMap((extension) => source[extension].map((state) => `${extension}/${state}`));
export function manifestGroups(manifest) {
 if (!Object.hasOwn(manifest, "schemaVersion") && !Object.hasOwn(manifest, "scope")) return Object.keys(legacyMatrix);
 assert.equal(manifest.schemaVersion, 2, "Supported manifest schema");
 assert.ok(Array.isArray(manifest.scope) && manifest.scope.length, "Nonempty group scope");
 assert.equal(new Set(manifest.scope).size, manifest.scope.length, "Unique group scope");
 for (const group of manifest.scope) assert.ok(Object.hasOwn(matrix, group), `Unknown scope group: ${group}`);
 return manifest.scope;
}
export function validateCaptureScope(manifest) {
 const groups = manifestGroups(manifest);
 const expected = scopeKeys(groups, manifest.schemaVersion === 2 ? matrix : legacyMatrix);
 const actual = manifest.captures.map((e) => `${e.extension}/${e.state}`);
 assert.equal(new Set(actual).size, actual.length, "Duplicate capture state");
 assert.deepEqual([...actual].sort(), expected.sort(), "Complete declared capture scope");
 return groups;
}
export function assertAction(result, args) {
 assert.ok(result.ok, JSON.stringify(result));
 if (args[0] === "wait") assert.notEqual(result.result?.timedOut, true, `Wait timed out: ${args.join(" ")}`);
 return result.result;
}
