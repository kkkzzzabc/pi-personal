/**
 * Locate the installed @earendil-works/pi-coding-agent package for integration tests.
 *
 * Order:
 * 1. PI_PACKAGE_DIR (explicit package root).
 * 2. Managed install: ~/.pi/agent/install/current-version → releases/<version>/node_modules/….
 * 3. The `pi` on PATH: follow symlinks and `exec "<path>"` shell wrappers to the package's
 *    bin script, then walk up to the package root (covers local fork installs).
 * Returns undefined when none is found.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PACKAGE_NAME = "@earendil-works/pi-coding-agent";

function isPackageRoot(dir) {
	try {
		return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === PACKAGE_NAME;
	} catch {
		return false;
	}
}

function packageRootAbove(file) {
	let dir = dirname(file);
	for (;;) {
		if (isPackageRoot(dir)) return dir;
		const nested = join(dir, "node_modules", PACKAGE_NAME);
		if (isPackageRoot(nested)) return nested;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/** Follow symlinks and simple `exec "<path>"` shell wrappers (bounded). */
export function resolveExecutable(path, depth = 0) {
	if (depth > 5 || !existsSync(path)) return undefined;
	const real = realpathSync(path);
	const head = readFileSync(real, "utf8").slice(0, 2048);
	if (!head.startsWith("#!/bin/sh") && !head.startsWith("#!/bin/bash")) return real;
	const target = /^\s*exec\s+"([^"]+)"/m.exec(head)?.[1];
	return target ? resolveExecutable(target, depth + 1) : real;
}

export function findPiPackageRoot(env = process.env, home = homedir()) {
	if (env.PI_PACKAGE_DIR) return env.PI_PACKAGE_DIR;
	const marker = join(home, ".pi/agent/install/current-version");
	if (existsSync(marker)) {
		const root = join(home, ".pi/agent/install/releases", readFileSync(marker, "utf8").trim(), "node_modules", PACKAGE_NAME);
		if (isPackageRoot(root)) return root;
	}
	const which = spawnSync("sh", ["-c", "command -v pi"], { encoding: "utf8", env });
	const bin = which.status === 0 ? which.stdout.trim() : "";
	if (!bin) return undefined;
	const script = resolveExecutable(bin);
	return script ? packageRootAbove(script) : undefined;
}
