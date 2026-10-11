#!/usr/bin/env node
/**
 * tui-check finish: quit pi, destroy the agent-tty session, and summarize.
 *
 * Usage: node finish.mjs <run.json>
 * Never deletes the run directory; artifacts stay for review.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { agentTty, changedFiles, fingerprint } from "./start.mjs";

const EXIT_PATTERN = "To resume this session|\\[tui-check\\] pi exited";

export function findResumeCommand(screenText) {
	const match = /To resume this session:\s*(pi\s.+)$/m.exec(screenText);
	return match ? match[1].trim() : undefined;
}

/** Session id from a pi session file name (`<timestamp>_<id>.jsonl`). */
export function sessionIdFromFile(path) {
	return /_([0-9a-f-]+)\.jsonl$/i.exec(path)?.[1];
}

/**
 * Command that reopens the latest session with the same isolation and extensions (run it inside
 * an agent-tty session). Uses session file names (timestamp-prefixed, sorted) because the
 * on-screen resume hint can wrap.
 */
export function relaunchCommand(launchScript, sessionFiles) {
	const latest = [...sessionFiles].sort((a, b) => a.split("/").at(-1).localeCompare(b.split("/").at(-1))).at(-1);
	if (!latest) return undefined;
	const id = sessionIdFromFile(latest);
	return id ? `bash ${launchScript} --session ${id}` : undefined;
}

export function listSessionFiles(dir) {
	if (!existsSync(dir)) return [];
	const files = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) files.push(...listSessionFiles(path));
		else if (name.endsWith(".jsonl")) files.push(path);
	}
	return files.sort();
}

export function countLines(path) {
	if (!existsSync(path)) return 0;
	return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
}

export async function main(argv) {
	const runPath = argv[0];
	if (!runPath) {
		process.stdout.write("Usage: node finish.mjs <run.json>\n");
		process.exit(2);
	}
	const run = JSON.parse(readFileSync(runPath, "utf8"));
	const { bin } = run.agentTty;
	const call = (args) => agentTty(bin, run.ttyHome, args);

	let exited = false;
	for (let attempt = 0; attempt < 2 && !exited; attempt++) {
		call(["send-keys", run.sessionId, "Ctrl+D"]);
		exited = call(["wait", run.sessionId, "--regex", EXIT_PATTERN, "--timeout", "8000"]).ok;
	}
	const screen = String(call(["snapshot", run.sessionId, "--format", "text"])?.result?.text ?? "");
	const destroyed = call(["destroy", run.sessionId]);

	const sessionFiles = listSessionFiles(run.sessionDir);
	const configChanges = run.fingerprints
		? changedFiles(run.fingerprints, fingerprint(run.agentDir, Object.keys(run.fingerprints)))
		: undefined;
	const summary = {
		ok: exited && destroyed.ok,
		mode: run.mode,
		model: run.model,
		sessionId: run.sessionId,
		piExited: exited,
		ttySessionDestroyed: Boolean(destroyed.ok),
		resumeCommand: findResumeCommand(screen),
		relaunch: relaunchCommand(run.launch, sessionFiles),
		sessionFiles,
		modelLog: { path: run.modelLog, calls: countLines(run.modelLog) },
		...(configChanges ? { userAgentDir: run.agentDir, configChanges } : {}),
		runDir: run.runDir,
		note: "Run directory kept for review; delete it manually when done.",
	};
	if (!exited) summary.screen = screen.split("\n").filter((line) => line.trim()).slice(-15);
	writeFileSync(join(run.runDir, "finish.json"), `${JSON.stringify(summary, null, 2)}\n`);
	process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
	if (!summary.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
