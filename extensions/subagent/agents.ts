/**
 * Role definitions (plan S1, S4, S6, S7).
 *
 * Prompts live in `agents/<role>.md` (frontmatter `name`, `description`; body is
 * the child's system prompt). Tools and context-file policy are fixed here, not
 * by the files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_DIFF_TOOL } from "./review-diff.ts";

export const READ_TOOLS = ["read", "grep", "find", "ls"] as const;

/**
 * Context files a child receives (S6):
 * - `parent`: the files the parent actually received, without the agent dir's global file;
 * - `none`: no context files; the parent puts needed context in the task.
 */
export type ContextFilePolicy = "parent" | "none";

interface RoleSpec {
	tools: readonly string[];
	contextFiles: ContextFilePolicy;
}

/** No bash, edit, write, or subagent: children are read-only and cannot delegate. */
export const ROLE_SPECS = {
	reviewer: { tools: [...READ_TOOLS, REVIEW_DIFF_TOOL], contextFiles: "parent" },
	explorer: { tools: [...READ_TOOLS], contextFiles: "none" },
} as const satisfies Record<string, RoleSpec>;

export type RoleName = keyof typeof ROLE_SPECS;
export const ROLE_NAMES = Object.keys(ROLE_SPECS) as RoleName[];
export const ROLE_TOOLS = Object.fromEntries(ROLE_NAMES.map((name) => [name, ROLE_SPECS[name].tools])) as {
	[K in RoleName]: (typeof ROLE_SPECS)[K]["tools"];
};

export interface RoleDefinition {
	name: RoleName;
	description: string;
	prompt: string;
	tools: readonly string[];
	reviewDiff: boolean;
	contextFiles: ContextFilePolicy;
}

export type ParseFrontmatter = (content: string) => { frontmatter: Record<string, unknown>; body: string };

export function isRoleName(value: unknown): value is RoleName {
	return typeof value === "string" && Object.hasOwn(ROLE_SPECS, value);
}

export function parseRole(name: RoleName, content: string, parse: ParseFrontmatter, file = `${name}.md`): RoleDefinition {
	const { frontmatter, body } = parse(content);
	if (frontmatter.name !== name) throw new Error(`${file}: frontmatter name must be "${name}".`);
	if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
		throw new Error(`${file}: frontmatter description is required.`);
	}
	if (!body.trim()) throw new Error(`${file}: the system prompt body is empty.`);
	return {
		name,
		description: frontmatter.description.trim(),
		prompt: body.trim(),
		tools: ROLE_SPECS[name].tools,
		reviewDiff: (ROLE_SPECS[name].tools as readonly string[]).includes(REVIEW_DIFF_TOOL),
		contextFiles: ROLE_SPECS[name].contextFiles,
	};
}

export function loadRoles(
	dir: string,
	parse: ParseFrontmatter,
	readFile: (path: string) => string = (file) => readFileSync(file, "utf8"),
): Record<RoleName, RoleDefinition> {
	const roles = {} as Record<RoleName, RoleDefinition>;
	for (const name of ROLE_NAMES) {
		const file = join(dir, `${name}.md`);
		roles[name] = parseRole(name, readFile(file), parse, file);
	}
	return roles;
}
