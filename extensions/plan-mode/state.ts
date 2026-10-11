/**
 * Plan-mode state and its persistence as session custom entries.
 *
 * Every change appends a `plan-mode` entry; the latest one on the current
 * branch wins, so resume, fork, and tree navigation restore the matching state.
 */

export const STATE_ENTRY_TYPE = "plan-mode";

export type Mode = "plan" | "build";

export interface PlanState {
	mode: Mode;
	/** Current plan file while in plan mode. */
	planFile?: string;
	/** Active tools saved on entering plan mode. */
	toolsBefore?: string[];
	/** Thinking level saved on entering plan mode (Phase 2). */
	thinkingBefore?: string;
	/** Last approved plan file (Phase 3). */
	approvedPlanFile?: string;
}

export const BUILD_STATE: PlanState = Object.freeze({ mode: "build" }) as PlanState;

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Validate persisted data; returns undefined for malformed entries. */
export function parseState(data: unknown): PlanState | undefined {
	if (typeof data !== "object" || data === null) return undefined;
	const value = data as Record<string, unknown>;
	if (value.mode !== "plan" && value.mode !== "build") return undefined;
	const state: PlanState = { mode: value.mode };
	if (typeof value.planFile === "string") state.planFile = value.planFile;
	if (isStringArray(value.toolsBefore)) state.toolsBefore = [...value.toolsBefore];
	if (typeof value.thinkingBefore === "string") state.thinkingBefore = value.thinkingBefore;
	if (typeof value.approvedPlanFile === "string") state.approvedPlanFile = value.approvedPlanFile;
	if (state.mode === "plan" && (state.planFile === undefined || state.toolsBefore === undefined)) return undefined;
	return state;
}

interface EntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

/** Latest valid state among `entries` (oldest first), or build mode. */
export function restoreState(entries: readonly EntryLike[]): PlanState {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
		const state = parseState(entry.data);
		if (state) return state;
	}
	return { ...BUILD_STATE };
}
