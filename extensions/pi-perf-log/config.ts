/** Independent configuration; never reads another extension's settings. */
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export interface PerfLogConfig {
	enabled: boolean;
	/** Absolute output directory; null means `<agentDir>/perf`. */
	dir: string | null;
}
export const DEFAULTS: PerfLogConfig = { enabled: true, dir: null };

export function validateConfig(data: unknown): Partial<PerfLogConfig> {
	if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected an object");
	const value = data as Record<string, unknown>;
	if (Object.keys(value).some((key) => !Object.hasOwn(DEFAULTS, key))) throw new Error("Unknown configuration field");
	if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new Error("enabled must be a boolean");
	if (value.dir !== undefined && value.dir !== null && (typeof value.dir !== "string" || !isAbsolute(value.dir))) throw new Error("dir must be an absolute path or null");
	return value as Partial<PerfLogConfig>;
}

export function loadConfig(agentDir: string, cwd: string, trusted: boolean, read = (file: string) => readFileSync(file, "utf8")): { config: PerfLogConfig; error?: string } {
	const config: PerfLogConfig = { ...DEFAULTS };
	for (const file of [join(agentDir, "pi-perf-log.json"), ...(trusted ? [join(cwd, ".pi", "pi-perf-log.json")] : [])]) {
		try {
			Object.assign(config, validateConfig(JSON.parse(read(file))));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			// Never include file contents or arbitrary exception text in diagnostics.
			return { config: { ...config, enabled: false }, error: "Invalid or unreadable pi-perf-log configuration; check documented fields" };
		}
	}
	return { config };
}

export function outputDir(config: PerfLogConfig, agentDir: string): string {
	return config.dir ?? join(agentDir, "perf");
}
