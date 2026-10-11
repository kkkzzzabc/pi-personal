import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const scripts = join(workspace, "skills/tui-check/scripts");
const globalPath = join(workspace, "instructions/pi-global.md");
const project = readFileSync(join(workspace, "AGENTS.md"), "utf8").trim();
const personal = readFileSync(globalPath, "utf8").trim();
const root = findPiPackageRoot();
const tty = findAgentTty();
const hasPi = spawnSync("pi", ["--version"], { encoding: "utf8" }).status === 0;

// This opt-in check reads the deployed instruction only, never auth/settings.
test("deployed personal instructions match the canonical file and public context discovery", {
  skip: process.env.VERIFY_PI_GLOBAL_DEPLOYMENT === "1" && root ? false : "Deployment check is opt-in",
}, async () => {
  const deployed = join(homedir(), ".pi/agent/AGENTS.md");
  assert.equal(readFileSync(deployed, "utf8"), readFileSync(globalPath, "utf8"));
  const { loadProjectContextFiles } = await import(pathToFileURL(join(root, "dist/core/resource-loader.js")).href);
  const files = loadProjectContextFiles({ cwd: workspace, agentDir: join(homedir(), ".pi/agent") });
  assert.equal(files.filter(f => resolve(f.path) === resolve(deployed)).length, 1);
  assert.equal(files.filter(f => resolve(f.path) === resolve(workspace, "AGENTS.md")).length, 1);
  assert.equal(files.find(f => resolve(f.path) === resolve(deployed)).content.trim(), personal);
  assert.equal(files.find(f => resolve(f.path) === resolve(workspace, "AGENTS.md")).content.trim(), project);
});

// Scripted output proves context delivery, not compliance by a live model.
for (const withGlobal of [true, false]) {
  test(`fresh offline Pi TUI loads the compact project rules ${withGlobal ? "with" : "without"} personal rules`, {
    skip: !tty ? "agent-tty not found" : !hasPi ? "Pi not found" : false,
    timeout: 120_000,
  }, t => {
    const out = mkdtempSync(join(tmpdir(), "instruction-split-tui-"));
    const fixture = join(out, "fixture");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "AGENTS.md"), project + "\n");
    const scenario = join(out, "input-scenario.json");
    const signal = withGlobal ? "INSTRUCTION-SPLIT-BOTH-DELIVERED" : "INSTRUCTION-SPLIT-LOCAL-DELIVERED";
    writeFileSync(scenario, JSON.stringify({ responses: [{ text: signal }] }));
    t.diagnostic(`Retained offline instruction evidence: ${out}`);
    try {
      const args = [join(scripts, "start.mjs"), "--scenario", scenario,
        "--fixture", fixture, "--context-files", "--tools", "read", "--out", out];
      if (withGlobal) args.push("--agent-file", `AGENTS.md=${globalPath}`);
      const started = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 90_000 });
      assert.equal(started.status, 0, started.stderr || started.stdout);
      const run = JSON.parse(started.stdout);
      assert.equal(run.ok, true);
      assert.equal(run.mode, "faux");
      assert.equal(run.userAgentDir, false);
      assert.equal(run.agentTty.supported, true);
      assert.ok(run.piArgs.includes("--offline"));
      assert.ok(!run.piArgs.includes("-nc"));
      const call = args => {
        const result = agentTty(run.agentTty.bin, run.ttyHome, args);
        assert.equal(result.ok, true, JSON.stringify(result));
        return result;
      };
      call(["type", run.sessionId, "Report the resource-delivery checkpoint only."]);
      call(["send-keys", run.sessionId, "Enter"]);
      call(["wait", run.sessionId, "--text", signal, "--timeout", "15000"]);
      const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
      assert.equal(log.length, 1);
      assert.equal(log[0].model, "faux/faux-1");
      assert.deepEqual(log[0].activeTools, ["read"]);
      assert.equal(log[0].messages[0].role, "system");
      const system = log[0].messages[0].text;
      assert.equal(system.split(project).length - 1, 1);
      assert.equal(system.split(personal).length - 1, withGlobal ? 1 : 0);
      assert.ok(!system.includes("# 개인 작업 지침"));
      assert.ok(!system.includes("<addendum>"));
      assert.ok(system.includes("You are an expert coding assistant"));
      writeFileSync(join(out, "assertions.json"), JSON.stringify({
        mode: "faux", calls: 1, projectOccurrences: 1,
        personalOccurrences: withGlobal ? 1 : 0,
        activeTools: log[0].activeTools, passed: true,
      }, null, 2) + "\n");
    } finally {
      const runFile = join(out, "run.json");
      if (existsSync(runFile)) {
        const finished = spawnSync(process.execPath, [join(scripts, "finish.mjs"), runFile], { encoding: "utf8", timeout: 30_000 });
        assert.equal(finished.status, 0, finished.stderr || finished.stdout);
        const result = JSON.parse(finished.stdout);
        assert.equal(result.ok, true);
        assert.equal(result.piExited, true);
        assert.equal(result.ttySessionDestroyed, true);
      }
    }
  });
}
