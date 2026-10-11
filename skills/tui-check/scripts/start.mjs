#!/usr/bin/env node
/**
 * tui-check start: launch an isolated pi TUI inside an agent-tty session.
 *
 * Faux mode (default): node start.mjs --scenario <file> [options]
 *   Temporary agent dir, scripted faux model, no network or cost.
 * Real mode:          node start.mjs --real-model <provider/id> [options]
 *   Uses the user's agent dir in place for credentials (never copied); everything else
 *   is isolated by flags and temp dirs. Config files are fingerprinted so finish.mjs can
 *   report changes. Requires the user's approval for the task (cost, external calls).
 *
 * Prints run.json (also written to <out>/run.json). See references/start-options.md.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseScenario, shellQuote } from "./lib.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const FAUX_MODEL = "faux/faux-1";
export const REAL_DEFAULT_THINKING = "low";
export const DEFAULT_AGENT_TTY = join(homedir(), ".local/share/cli-display-tools/node_modules/.bin/agent-tty");
export const SUPPORTED_AGENT_TTY = "0.5.";
/** Config files in the user's agent dir whose changes a real run reports. */
export const FINGERPRINT_FILES = ["settings.json", "keybindings.json", "models.json", "trust.json"];

const REPEATABLE = new Set(["extension", "skill", "prompt-template", "theme", "agent-file", "pi-arg"]);
const VALUED = new Set([...REPEATABLE, "scenario", "real-model", "thinking", "tools", "fixture", "cols", "rows", "out", "ready-timeout"]);
const FLAGS = new Set(["context-files", "help"]);

export function parseArgs(argv) {
	const options = { extension: [], skill: [], "prompt-template": [], theme: [], "agent-file": [], "pi-arg": [] };
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
		const [rawName, inline] = arg.slice(2).split(/=(.*)/s, 2);
		if (FLAGS.has(rawName)) {
			options[rawName] = true;
			continue;
		}
		if (!VALUED.has(rawName)) throw new Error(`Unknown option: --${rawName}`);
		const value = inline ?? argv[++index];
		if (value === undefined) throw new Error(`--${rawName} needs a value`);
		if (REPEATABLE.has(rawName)) options[rawName].push(value);
		else options[rawName] = value;
	}
	if (options.help) return options;
	if (options.scenario && options["real-model"]) throw new Error("Use either --scenario (faux) or --real-model, not both");
	if (!options.scenario && !options["real-model"]) throw new Error("--scenario <file> (faux) or --real-model <provider/id> is required");
	options.mode = options["real-model"] ? "real" : "faux";
	if (options.mode === "real") {
		if (!/^[^/\s:]+\/[^\s:]+$/.test(options["real-model"])) {
			throw new Error("--real-model must be an exact <provider>/<model-id> (no patterns or :thinking suffix; use --thinking)");
		}
		if (options["agent-file"].length > 0) throw new Error("--agent-file is not allowed in real mode (it would write into the user's agent dir)");
		options.thinking ??= REAL_DEFAULT_THINKING;
	}
	for (const key of ["cols", "rows", "ready-timeout"]) {
		if (options[key] !== undefined && !/^\d+$/.test(options[key])) throw new Error(`--${key} must be a positive integer`);
	}
	for (const spec of options["agent-file"]) {
		if (!/^[^=/][^=]*=.+$/.test(spec) || spec.split("=")[0].split("/").includes("..")) {
			throw new Error(`--agent-file must be <relative name>=<source file>: ${spec}`);
		}
	}
	return options;
}

/** Model id shown in pi's footer (ready signal). */
export function footerModelId(model) {
	return model.slice(model.indexOf("/") + 1);
}

/**
 * pi arguments for an isolated run: no discovery, no MCP, offline startup, temp session dir.
 * Order: resources under test, faux model (faux mode), observer last.
 */
export function buildPiArgs(options, paths) {
	const args = ["-ne", "-ns", "-np", "--no-themes", "--no-mcp", "--offline", "--session-dir", paths.sessionDir];
	if (!options["context-files"]) args.push("-nc");
	for (const path of options.extension) args.push("-e", path);
	for (const path of options.skill) args.push("--skill", path);
	for (const path of options["prompt-template"]) args.push("--prompt-template", path);
	for (const path of options.theme) args.push("--theme", path);
	if (options.mode === "real") args.push("-e", paths.observer, "--model", options["real-model"]);
	else args.push("-e", paths.fauxModel, "-e", paths.observer, "--model", FAUX_MODEL);
	if (options.thinking) args.push("--thinking", options.thinking);
	if (options.tools) args.push("--tools", options.tools);
	args.push(...options["pi-arg"]);
	return args;
}

export function buildLaunchScript({ pi, workDir, env, args }) {
	const exports = Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
	return [
		"#!/bin/bash",
		"# Generated by tui-check start.mjs. Extra arguments are passed to pi (e.g. --session <id>).",
		`cd ${shellQuote(workDir)} || exit 1`,
		...exports,
		`${shellQuote(pi)} ${args.map(shellQuote).join(" ")} "$@"`,
		'echo "[tui-check] pi exited with status $?"',
		"",
	].join("\n");
}

/** The user's pi agent dir, following pi's rule (PI_CODING_AGENT_DIR, else ~/.pi/agent). */
export function userAgentDir(env = process.env, home = homedir()) {
	const fromEnv = env.PI_CODING_AGENT_DIR;
	if (!fromEnv) return join(home, ".pi", "agent");
	if (fromEnv === "~") return home;
	return fromEnv.startsWith("~/") ? join(home, fromEnv.slice(2)) : fromEnv;
}

/** sha256 per file (null when missing). */
export function fingerprint(dir, files = FINGERPRINT_FILES) {
	return Object.fromEntries(files.map((name) => {
		const path = join(dir, name);
		return [name, existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null];
	}));
}

/** Names whose fingerprint differs between two snapshots. */
export function changedFiles(before, after) {
	return Object.keys({ ...before, ...after }).filter((name) => before[name] !== after[name]).sort();
}

function findExecutable(name, extra = []) {
	const candidates = [...(process.env.PATH ?? "").split(delimiter).map((dir) => join(dir, name)), ...extra];
	return candidates.find((candidate) => {
		try {
			accessSync(candidate, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});
}

export function findAgentTty() {
	if (process.env.TUI_CHECK_AGENT_TTY) return process.env.TUI_CHECK_AGENT_TTY;
	return findExecutable("agent-tty", [DEFAULT_AGENT_TTY]);
}

/** Run agent-tty with --json; returns the parsed envelope (never throws on command failure). */
export function agentTty(bin, home, args) {
	// --json must precede "--", after which arguments belong to the spawned program.
	const separator = args.indexOf("--");
	const withJson = separator === -1 ? [...args, "--json"] : [...args.slice(0, separator), "--json", ...args.slice(separator)];
	const result = spawnSync(bin, ["--home", home, ...withJson], { encoding: "utf8" });
	try {
		return JSON.parse(result.stdout);
	} catch {
		return { ok: false, error: { message: (result.stderr || result.stdout || `exit ${result.status}`).trim() } };
	}
}

function fail(message, extra = {}) {
	process.stdout.write(`${JSON.stringify({ ok: false, error: message, ...extra }, null, 2)}\n`);
	process.exit(1);
}

export async function main(argv) {
	let options;
	try {
		options = parseArgs(argv);
	} catch (error) {
		fail(error.message);
	}
	if (options.help) {
		process.stdout.write("Usage: node start.mjs (--scenario <file> | --real-model <provider/id>) [options] (see references/start-options.md)\n");
		return;
	}
	const real = options.mode === "real";

	const tty = findAgentTty();
	if (!tty) fail("agent-tty not found (set TUI_CHECK_AGENT_TTY or install agent-tty 0.5.x)");
	const version = agentTty(tty, tmpdir(), ["version"]);
	const ttyVersion = version?.result?.cliVersion;
	if (!version.ok) fail(`agent-tty version failed: ${version.error?.message}`);
	const pi = findExecutable("pi");
	if (!pi) fail("pi not found on PATH");

	let scenarioText;
	if (!real) {
		try {
			scenarioText = readFileSync(options.scenario, "utf8");
			parseScenario(JSON.parse(scenarioText));
		} catch (error) {
			fail(`Invalid scenario ${options.scenario}: ${error.message}`);
		}
	}

	const runDir = resolve(options.out ?? mkdtempSync(join(tmpdir(), "tui-check-")));
	const paths = {
		runDir,
		ttyHome: join(runDir, "tty"),
		agentDir: real ? userAgentDir() : join(runDir, "agent"),
		sessionDir: join(runDir, "sessions"),
		workDir: join(runDir, "work"),
		logDir: join(runDir, "logs"),
		scenario: real ? undefined : join(runDir, "scenario.json"),
		modelLog: join(runDir, "logs", "model-input.jsonl"),
		launch: join(runDir, "launch.sh"),
		fauxModel: join(SCRIPT_DIR, "faux-model.ts"),
		observer: join(SCRIPT_DIR, "observer.ts"),
	};
	if (existsSync(join(runDir, "run.json"))) fail(`${runDir} already contains run.json; use a new --out`);
	const dirs = [paths.ttyHome, paths.sessionDir, paths.workDir, paths.logDir, ...(real ? [] : [paths.agentDir])];
	for (const dir of dirs) mkdirSync(dir, { recursive: true });
	if (options.fixture) cpSync(resolve(options.fixture), paths.workDir, { recursive: true });
	for (const spec of options["agent-file"]) {
		const [name, source] = spec.split(/=(.*)/s, 2);
		const target = join(paths.agentDir, name);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(resolve(source), target);
	}
	if (!real) writeFileSync(paths.scenario, scenarioText);

	const resolved = {
		...options,
		extension: options.extension.map((path) => resolve(path)),
		skill: options.skill.map((path) => resolve(path)),
		"prompt-template": options["prompt-template"].map((path) => resolve(path)),
		theme: options.theme.map((path) => resolve(path)),
	};
	const env = { PI_CODING_AGENT_DIR: paths.agentDir, PI_OFFLINE: "1", TUI_CHECK_MODEL_LOG: paths.modelLog };
	if (!real) {
		env.TUI_CHECK_SCENARIO = paths.scenario;
		// Scenario position survives session replacement and relaunch.
		env.TUI_CHECK_FAUX_STATE = join(paths.logDir, "faux-state.json");
	}
	const piArgs = buildPiArgs(resolved, paths);
	writeFileSync(paths.launch, buildLaunchScript({ pi, workDir: paths.workDir, env, args: piArgs }), { mode: 0o755 });

	const model = real ? options["real-model"] : FAUX_MODEL;
	const fingerprints = real ? fingerprint(paths.agentDir) : undefined;
	const cols = options.cols ?? "120";
	const rows = options.rows ?? "40";
	const created = agentTty(tty, paths.ttyHome, ["create", "--cwd", paths.workDir, "--cols", cols, "--rows", rows, "--", "/bin/bash", "--noprofile", "--norc"]);
	const sessionId = created?.result?.sessionId;
	if (!created.ok || !sessionId) fail(`agent-tty create failed: ${created.error?.message ?? "no session id"}`, { runDir });

	const run = {
		ok: false,
		ready: false,
		mode: options.mode,
		model,
		thinking: options.thinking,
		agentTty: { bin: tty, version: ttyVersion, supported: String(ttyVersion ?? "").startsWith(SUPPORTED_AGENT_TTY) },
		ttyHome: paths.ttyHome,
		sessionId,
		runDir,
		agentDir: paths.agentDir,
		userAgentDir: real,
		sessionDir: paths.sessionDir,
		workDir: paths.workDir,
		modelLog: paths.modelLog,
		...(real ? { fingerprints } : { scenario: paths.scenario }),
		launch: paths.launch,
		command: `bash ${shellQuote(paths.launch)}`,
		piArgs,
		cols: Number(cols),
		rows: Number(rows),
	};

	const launched = agentTty(tty, paths.ttyHome, ["run", sessionId, run.command, "--no-wait"]);
	const timeout = options["ready-timeout"] ?? "60000";
	const ready = launched.ok && agentTty(tty, paths.ttyHome, ["wait", sessionId, "--text", footerModelId(model), "--timeout", timeout]).ok;
	if (ready) agentTty(tty, paths.ttyHome, ["wait", sessionId, "--screen-stable-ms", "1000", "--timeout", timeout]);
	run.ready = ready;
	run.ok = ready;
	if (!ready) {
		const snap = agentTty(tty, paths.ttyHome, ["snapshot", sessionId, "--format", "text"]);
		run.error = launched.ok ? "pi did not become ready (footer model id not seen)" : `agent-tty run failed: ${launched.error?.message}`;
		run.screen = String(snap?.result?.text ?? "").split("\n").filter((line) => line.trim()).slice(-20);
	}
	writeFileSync(join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
	process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
	if (!ready) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
