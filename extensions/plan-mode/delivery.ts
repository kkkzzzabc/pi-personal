/**
 * What the model has been told about plan mode, and which note (if any) to send next.
 *
 * Notes are sent once per prompt from `before_agent_start`, describing only the current
 * state, so toggling several times before a prompt yields at most one note. Transitions
 * made by the plan tools are already explained by their results, which record
 * `details.planModeDelivered`. Both sources are read back from the session on restore.
 */
import { ENTER_NOTE_TYPE, enterNote, LEAVE_NOTE_TYPE, leaveNote } from "./prompts.ts";
import type { PlanState } from "./state.ts";

export interface Delivered {
	mode: "plan" | "build";
	planFile?: string;
}

export const INITIAL_DELIVERED: Delivered = Object.freeze({ mode: "build" }) as Delivered;

export interface Note {
	customType: string;
	content: string;
	details: { planModeDelivered: Delivered };
}

function asDelivered(value: unknown): Delivered | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.mode !== "plan" && record.mode !== "build") return undefined;
	return typeof record.planFile === "string" ? { mode: record.mode, planFile: record.planFile } : { mode: record.mode };
}

interface EntryLike {
	type: string;
	customType?: string;
	details?: unknown;
	message?: { role?: string; details?: unknown };
}

/** Latest delivered state on the branch (oldest-first entries). */
export function latestDelivered(entries: readonly EntryLike[]): Delivered {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (entry.type === "custom_message" && (entry.customType === ENTER_NOTE_TYPE || entry.customType === LEAVE_NOTE_TYPE)) {
			const recorded = asDelivered((entry.details as { planModeDelivered?: unknown } | undefined)?.planModeDelivered);
			// Notes from older versions carry no details; their type still tells the mode.
			return recorded ?? { mode: entry.customType === ENTER_NOTE_TYPE ? "plan" : "build" };
		}
		if (entry.type === "message" && entry.message?.role === "toolResult") {
			const recorded = asDelivered((entry.message.details as { planModeDelivered?: unknown } | undefined)?.planModeDelivered);
			if (recorded) return recorded;
		}
	}
	return { ...INITIAL_DELIVERED };
}

/** The note that brings the model from `delivered` to `state`, or undefined when up to date. */
export function noteFor(delivered: Delivered, state: PlanState): Note | undefined {
	if (state.mode === "plan" && state.planFile) {
		if (delivered.mode === "plan" && delivered.planFile === state.planFile) return undefined;
		return {
			customType: ENTER_NOTE_TYPE,
			content: enterNote(state.planFile),
			details: { planModeDelivered: { mode: "plan", planFile: state.planFile } },
		};
	}
	if (delivered.mode === "build") return undefined;
	return { customType: LEAVE_NOTE_TYPE, content: leaveNote(), details: { planModeDelivered: { mode: "build" } } };
}
