import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { agentTty, findAgentTty } from "../skills/tui-check/scripts/start.mjs";
import { findPiPackageRoot } from "./pi-package.mjs";

const skillDir = fileURLToPath(new URL("../skills/explain-with-visuals/", import.meta.url));
const scripts = fileURLToPath(new URL("../skills/tui-check/scripts/", import.meta.url));
const root = findPiPackageRoot();
const tty = findAgentTty();
const hasPi = spawnSync("pi", ["--version"], { encoding: "utf8" }).status === 0;
const references = ["references/design-system.md", "references/visual-patterns.md", "references/verification-and-delivery.md", "assets/starter.html"];

test("installed Pi loads one visual explanation skill without diagnostics", { skip: root ? false : "Pi package not found" }, async () => {
  const { loadSkills } = await import(pathToFileURL(join(root, "dist/core/skills.js")).href);
  const result = loadSkills({ cwd: tmpdir(), skillPaths: [skillDir], includeDefaults: false });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.skills.map(skill => skill.name), ["explain-with-visuals"]);
  assert.ok(result.skills[0].description.length <= 1024);
  for (const ref of references) assert.ok(existsSync(join(skillDir, ref)));
});

// Scripted responses establish resource delivery, not automatic selection,
// generated explanation quality, or browser behavior. No live provider runs.
test("offline Pi TUI advertises and expands visual skill and delivers supporting files", {
  skip: !tty ? "agent-tty not found" : !hasPi ? "Pi not found" : false,
  timeout: 120_000,
}, t => {
  const out = mkdtempSync(join(tmpdir(), "explain-with-visuals-tui-"));
  const runFile = join(out, "run.json");
  const scenario = join(out, "input-scenario.json");
  writeFileSync(scenario, JSON.stringify({ responses: [
    { text: "VISUAL-SKILL-ADVERTISED" },
    { toolCalls: references.map(name => ({ name: "read", args: { path: join(skillDir, name) } })) },
    { text: "VISUAL-SKILL-REFERENCES-DELIVERED" },
  ] }));
  t.diagnostic(`Retained offline TUI evidence: ${out}`);
  try {
    const started = spawnSync(process.execPath, [join(scripts, "start.mjs"),
      "--scenario", scenario, "--skill", skillDir, "--tools", "read", "--out", out,
    ], { encoding: "utf8", timeout: 90_000 });
    assert.equal(started.status, 0, started.stderr || started.stdout);
    const run = JSON.parse(started.stdout);
    assert.equal(run.ok, true, JSON.stringify(run));
    assert.equal(run.mode, "faux");
    assert.equal(run.model, "faux/faux-1");
    assert.equal(run.userAgentDir, false);
    assert.equal(run.agentTty.supported, true);
    for (const flag of ["-ne", "-ns", "-np", "--no-themes", "--no-mcp", "--offline", "-nc"]) assert.ok(run.piArgs.includes(flag));
    assert.equal(run.piArgs[run.piArgs.indexOf("--tools") + 1], "read");
    const call = args => {
      const result = agentTty(run.agentTty.bin, run.ttyHome, args);
      assert.equal(result.ok, true, JSON.stringify(result));
      return result;
    };
    call(["type", run.sessionId, "Inspect advertised metadata only; do not generate an artifact or open a browser."]);
    call(["send-keys", run.sessionId, "Enter"]);
    call(["wait", run.sessionId, "--text", "VISUAL-SKILL-ADVERTISED", "--timeout", "15000"]);
    writeFileSync(join(out, "advertisement.txt"), String(call(["snapshot", run.sessionId, "--format", "text"]).result.text));
    const first = JSON.parse(readFileSync(run.modelLog, "utf8").trim().split("\n")[0]);
    assert.equal(first.messages[0].role, "system");
    const system = first.messages[0].text;
    assert.deepEqual([...system.matchAll(/<skill>\s*<name>([^<]+)<\/name>/g)].map(m => m[1]), ["explain-with-visuals"]);
    assert.ok(system.includes(join(skillDir, "SKILL.md")));
    assert.ok(!system.includes("# Explain with visuals"));

    const request = "Read the supporting files only. Do not write HTML or run any browser CLI.";
    call(["type", run.sessionId, `/skill:explain-with-visuals ${request}`]);
    call(["wait", run.sessionId, "--screen-stable-ms", "500"]);
    call(["send-keys", run.sessionId, "Escape"]);
    call(["send-keys", run.sessionId, "Enter"]);
    call(["wait", run.sessionId, "--text", "VISUAL-SKILL-REFERENCES-DELIVERED", "--timeout", "20000"]);
    writeFileSync(join(out, "references.txt"), String(call(["snapshot", run.sessionId, "--format", "text"]).result.text));
    const log = readFileSync(run.modelLog, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(log.length, 3);
    for (const record of log) {
      assert.equal(record.model, "faux/faux-1");
      assert.deepEqual(record.activeTools, ["read"]);
    }
    const expanded = log[1].messages.at(-1);
    assert.equal(expanded.role, "user");
    assert.ok(expanded.text.includes(`<skill name="explain-with-visuals" location="${join(skillDir, "SKILL.md")}">`));
    const body = readFileSync(join(skillDir, "SKILL.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    assert.ok(expanded.text.includes(body));
    assert.ok(expanded.text.endsWith(request));
    const results = log[2].messages.filter(message => message.role === "toolResult");
    assert.equal(results.length, references.length);
    for (const [index, result] of results.entries()) {
      assert.equal(result.toolName, "read");
      assert.notEqual(result.isError, true);
      assert.ok(result.text.includes(readFileSync(join(skillDir, references[index]), "utf8").trim()), references[index]);
    }
  } finally {
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
