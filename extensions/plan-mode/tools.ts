/**
 * Plan-mode tool set.
 *
 * Starting from the tools active before plan mode, keep only:
 * - built-in read tools and shells (bash is restrained by instructions, not blocked),
 * - edit/write (the write guard limits them to the plan file),
 * - plan-mode tools,
 * - tools whose author marked them `annotations.readOnlyHint === true`,
 * - configured extra tools.
 * Tools that were inactive stay inactive; nothing is added.
 */
import type { ToolInfo } from "@earendil-works/pi-coding-agent";

export const PLAN_BASE_TOOLS: ReadonlySet<string> = new Set([
	"read",
	"grep",
	"find",
	"ls",
	"bash",
	"powershell",
	"edit",
	"write",
]);

/** Tools that write files and are restricted to the plan file. */
export const GUARDED_WRITE_TOOLS: ReadonlySet<string> = new Set(["edit", "write"]);

/** Tools owned by this extension that are visible only in plan mode (Phase 3). */
export const PLAN_ONLY_TOOLS: ReadonlySet<string> = new Set(["exit_plan_mode"]);

/** Tools owned by this extension that are visible only in build mode (Phase 3). */
export const BUILD_ONLY_TOOLS: ReadonlySet<string> = new Set(["enter_plan_mode"]);

type ToolMeta = Pick<ToolInfo, "name" | "annotations">;

export function computePlanTools(
	activeBefore: readonly string[],
	allTools: readonly ToolMeta[],
	extraTools: readonly string[] = [],
): string[] {
	const readOnly = new Set(allTools.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name));
	const extra = new Set(extraTools);
	const registered = new Set(allTools.map((tool) => tool.name));
	const kept = activeBefore.filter(
		(name) => !BUILD_ONLY_TOOLS.has(name) && (PLAN_BASE_TOOLS.has(name) || readOnly.has(name) || extra.has(name)),
	);
	const planOnly = [...PLAN_ONLY_TOOLS].filter((name) => registered.has(name));
	return [...new Set([...kept, ...planOnly])];
}

/**
 * Active tools for build mode: the saved set without plan-only tools. Build-only tools return
 * only if they were active before plan mode, so a user's `--tools` choice is respected.
 */
export function computeBuildTools(saved: readonly string[]): string[] {
	return [...new Set(saved.filter((name) => !PLAN_ONLY_TOOLS.has(name)))];
}
