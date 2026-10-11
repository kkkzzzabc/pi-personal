/**
 * Plan mode configuration.
 *
 * Optional file: `<agentDir>/plan-mode.json`, where agentDir follows pi's rule
 * (`PI_CODING_AGENT_DIR`, else `~/.pi/agent`). Missing file → defaults.
 * Unknown keys are ignored; invalid values fall back to defaults with a warning.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHome } from "./paths.ts";

export const CONFIG_FILE_NAME = "plan-mode.json";

// pi 1.1.0 agent ThinkingLevel (packages/agent/src/types.ts).
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export interface PlanModeConfig {
	/** Absolute directory for plan files. */
	plansDir: string;
	/** Thinking level applied while in plan mode (Phase 2). */
	thinkingLevel: string;
	/** Extra tool names kept active in plan mode. */
	extraTools: string[];
	/** Toggle shortcut (pi key id). `shift+tab` requires moving `app.thinking.cycle` in keybindings.json. */
	shortcut: string;
}

export interface LoadConfigResult {
	config: PlanModeConfig;
	path: string;
	warnings: string[];
}

export interface ConfigEnvironment {
	env?: NodeJS.ProcessEnv;
	home?: string;
	readFile?: (path: string) => string;
}

export function defaultConfig(home: string = homedir()): PlanModeConfig {
	return { plansDir: join(home, ".pi", "plans"), thinkingLevel: "high", extraTools: [], shortcut: "ctrl+alt+p" };
}

export function agentDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
	const fromEnv = env.PI_CODING_AGENT_DIR;
	return fromEnv ? expandHome(fromEnv, home) : join(home, ".pi", "agent");
}

export function loadConfig(options: ConfigEnvironment = {}): LoadConfigResult {
	const home = options.home ?? homedir();
	const path = join(agentDir(options.env ?? process.env, home), CONFIG_FILE_NAME);
	const config = defaultConfig(home);
	const warnings: string[] = [];
	const read = options.readFile ?? ((file: string) => readFileSync(file, "utf8"));

	let raw: string;
	try {
		raw = read(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			warnings.push(`Cannot read ${path}: ${(error as Error).message}. Using defaults.`);
		}
		return { config, path, warnings };
	}

	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch (error) {
		warnings.push(`Invalid JSON in ${path}: ${(error as Error).message}. Using defaults.`);
		return { config, path, warnings };
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		warnings.push(`${path} must contain a JSON object. Using defaults.`);
		return { config, path, warnings };
	}

	const value = data as Record<string, unknown>;
	if (value.plansDir !== undefined) {
		if (typeof value.plansDir === "string" && value.plansDir.trim() !== "") {
			config.plansDir = expandHome(value.plansDir.trim(), home);
		} else warnings.push(`${path}: "plansDir" must be a non-empty string.`);
	}
	if (value.thinkingLevel !== undefined) {
		if (typeof value.thinkingLevel === "string" && (THINKING_LEVELS as readonly string[]).includes(value.thinkingLevel)) {
			config.thinkingLevel = value.thinkingLevel;
		} else warnings.push(`${path}: "thinkingLevel" must be one of ${THINKING_LEVELS.join(", ")}.`);
	}
	if (value.extraTools !== undefined) {
		if (Array.isArray(value.extraTools) && value.extraTools.every((name) => typeof name === "string")) {
			config.extraTools = [...new Set(value.extraTools as string[])];
		} else warnings.push(`${path}: "extraTools" must be an array of tool names.`);
	}
	if (value.shortcut !== undefined) {
		if (typeof value.shortcut === "string" && /^[a-z0-9+]+$/i.test(value.shortcut.trim())) {
			config.shortcut = value.shortcut.trim().toLowerCase();
		} else warnings.push(`${path}: "shortcut" must be a key id such as "ctrl+alt+p" or "shift+tab".`);
	}
	return { config, path, warnings };
}
