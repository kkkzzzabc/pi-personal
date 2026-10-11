/** Deterministic Lane A checks. Pure: file access is injected. */
import type { Rule } from "./config.ts";
import type { Changed } from "./paths.ts";

export interface Finding { rule: string; path: string; message: string }

/** Top-of-file YAML frontmatter as raw `key: value` strings (no nested parsing). */
export function frontmatter(content: string): Map<string, string> | undefined {
	const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
	if (!m) return undefined;
	const fields = new Map<string, string>();
	for (const line of m[1].split(/\r?\n/)) {
		const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
		if (kv) fields.set(kv[1], kv[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, ""));
	}
	return fields;
}

function hasAmendment(content: string, today: string): boolean {
	const at = content.search(/^## Amendments\s*$/m);
	if (at < 0) return false;
	const rest = content.slice(at);
	const end = rest.slice(1).search(/^## /m);
	const section = end < 0 ? rest : rest.slice(0, end + 1);
	return new RegExp(`^### ${today}\\b`, "m").test(section);
}

export function checkRules(changed: readonly Changed[], rules: readonly Rule[], read: (path: string) => string | undefined, sessionId: string, today: string): Finding[] {
	const findings: Finding[] = [];
	const cache = new Map<string, string | undefined>();
	const get = (p: string) => { if (!cache.has(p)) cache.set(p, read(p)); return cache.get(p); };
	for (const rule of rules) {
		const pattern = new RegExp(rule.match, "u");
		for (const change of changed) {
			const m = pattern.exec(change.path);
			if (!m) continue;
			const miss = () => findings.push({ rule: rule.id, path: change.path, message: rule.message });
			if (rule.type === "mention") {
				if (!change.created) continue;
				const needle = rule.mustContain.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
				if (!(get(rule.file) ?? "").includes(needle)) miss();
				continue;
			}
			const content = get(change.path);
			if (content === undefined) continue; // Deleted or unreadable since the change.
			const fm = frontmatter(content);
			if (rule.type === "frontmatter") {
				if (change.created && (!fm || rule.keys.some((k) => !fm.has(k)))) miss();
			} else if (rule.type === "amendment") {
				const owner = fm?.get("session");
				if (!change.created && owner && owner !== sessionId && !hasAmendment(content, today)) miss();
			} else if (rule.type === "field-line") {
				const value = fm?.get(rule.field);
				if (value !== undefined && rule.values.includes(value) && !content.split(/\r?\n/).some((l) => l.startsWith(rule.linePrefix))) miss();
			}
		}
	}
	return findings;
}

export const STEER_TYPE = "wrapup-audit";
/** Visible continuation request; permits declining out-of-scope fixes. */
export function steeringMessage(findings: readonly Finding[]): string {
	const items = findings.map((f) => `- ${f.path} [${f.rule}]: ${f.message}`).join("\n");
	return `Wrap-up audit (automatic, once per request): these project obligations look unmet for files changed during this request:
${items}

Fix an item only if it is within the current request's scope and your current permissions (for example, not in plan mode or a read-only task). Otherwise, briefly report each item you did not fix and why. Do not start unrelated work.`;
}
