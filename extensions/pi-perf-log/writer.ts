/** Appends one JSON line per record to `<dir>/<sessionId>.jsonl`. Never throws. */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PerfRecord } from "./recorder.ts";

export interface Writer {
	append(record: PerfRecord): boolean;
}

export function createWriter(dirFor: () => string): Writer {
	const prepared = new Set<string>();
	return {
		append(record) {
			if (!record.sessionId) return false;
			try {
				const dir = dirFor();
				if (!prepared.has(dir)) {
					mkdirSync(dir, { recursive: true });
					prepared.add(dir);
				}
				appendFileSync(join(dir, `${record.sessionId}.jsonl`), `${JSON.stringify(record)}\n`);
				return true;
			} catch {
				return false;
			}
		},
	};
}
