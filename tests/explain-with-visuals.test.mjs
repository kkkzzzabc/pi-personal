import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const dir = fileURLToPath(new URL("../skills/explain-with-visuals/", import.meta.url));
const skill = readFileSync(join(dir, "SKILL.md"), "utf8");
const html = readFileSync(join(dir, "assets/starter.html"), "utf8");
const refs = ["design-system.md", "visual-patterns.md", "verification-and-delivery.md"];

// Structural checks and a minimal DOM double do not prove model compliance,
// HTML sanitization, visual quality, or every generated artifact's behavior.
test("visual skill has portable routing metadata and one entry point", () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
  assert.ok(fm);
  assert.match(fm, /^name: explain-with-visuals$/m);
  const description = /^description: >\n((?:  .*(?:\n|$))+)/m.exec(fm)?.[1];
  assert.ok(description?.trim());
  assert.ok(description.trim().length <= 1024);
  assert.match(fm, /^compatibility: .+/m);
  assert.doesNotMatch(fm, /^disable-model-invocation: true$/m);
  const entries = [];
  function visit(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const next = join(path, item.name);
      if (item.isDirectory()) visit(next);
      else if (item.name === "SKILL.md") entries.push(next);
    }
  }
  visit(dir);
  assert.deepEqual(entries, [join(dir, "SKILL.md")]);
});

test("all authored skill-relative Markdown and asset links resolve", () => {
  for (const name of ["SKILL.md", ...refs.map(name => `references/${name}`)]) {
    const path = join(dir, name);
    const text = readFileSync(path, "utf8");
    const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+\.(?:md|html))\)/g)];
    assert.ok(links.length, name);
    for (const [, target] of links) assert.ok(existsSync(resolve(dirname(path), target)), `${name}: ${target}`);
  }
  for (const ref of refs) assert.ok(skill.includes(`(references/${ref})`));
});

function luminance(hex) {
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels.reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
}

test("editorial foreground tokens meet 4.5:1 on both opaque theme backgrounds", () => {
  const roots = [...html.matchAll(/:root\s*\{([^}]+)\}/g)].map(match => match[1]);
  assert.equal(roots.length, 2);
  const design = readFileSync(join(dir, "references/design-system.md"), "utf8");
  for (const root of roots) {
    const tokens = Object.fromEntries([...root.matchAll(/--([a-z]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
    for (const name of ["page", "surface", "ink", "muted", "accent", "caution"]) {
      assert.ok(tokens[name], name);
      assert.ok(design.includes(tokens[name]), `${name} is documented`);
    }
    for (const fg of ["ink", "muted", "accent", "caution"]) {
      for (const bg of ["page", "surface"]) {
        const [low, high] = [luminance(tokens[fg]), luminance(tokens[bg])].sort((a, b) => a - b);
        assert.ok((high + 0.05) / (low + 0.05) >= 4.5, `${fg} on ${bg}`);
      }
    }
  }
});

test("starter is offline and preserves scalable accessible static content", () => {
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /charset="utf-8"/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /font-size: 1\.125rem/);
  assert.match(html, /line-height: 1\.65/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /focus-visible/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(html, /<(?:link|iframe|object|embed)\b|\bsrc\s*=|@import|url\(|\bfetch\s*\(|\beval\s*\(|\bXMLHttpRequest\b/i);
  assert.equal((html.match(/<ol class="flow">/g) ?? []).length, 2);
  assert.equal((html.match(/class="node" data-stage=/g) ?? []).length, 8);
  assert.doesNotMatch(html, /class="(?:node|flow|routes)"[^>]*\bhidden/);
  assert.match(html, /class="enhancement" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Illustrative data, not measurements/);
  assert.match(html, /--value: 70%/);
  assert.match(html, /--value: 30%/);
  assert.match(html, /7 \/ 10/);
  assert.match(html, /3 \/ 10/);
});

// Targeted checks for these authored figures, not a general HTML validator.
test("starter and Korean fixture place each caption last in its figure", () => {
  const fixture = readFileSync(new URL("./fixtures/explain-with-visuals/korean-content.html", import.meta.url), "utf8");
  for (const [name, source] of [["starter", html], ["Korean fixture", fixture]]) {
    const figures = [...source.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)];
    assert.equal(figures.length, 2, `${name}: expected both figures`);
    for (const [index, figure] of figures.entries()) {
      assert.equal((figure[1].match(/<figcaption\b/g) ?? []).length, 1, `${name}: figure ${index + 1} has one caption`);
      assert.match(figure[1], /<figcaption\b[^>]*>[\s\S]*?<\/figcaption>\s*$/, `${name}: caption must be the final child`);
    }
  }
});

test("step ordinals and current-state markers use the 16px label default", () => {
  for (const selector of [".node .number", ".current"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(html)?.[1];
    assert.ok(rule, `${selector}: CSS rule exists`);
    assert.match(rule, /font-size:\s*1rem\s*;/, `${selector}: must follow the label default`);
  }
});

test("starter step enhancement highlights corresponding roles without hiding paths", () => {
  const script = /<script>\n([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script);
  const container = { hidden: true };
  const status = { textContent: "static" };
  const buttons = ["all", "0", "1", "2", "3"].map(step => ({
    dataset: { step, message: `message-${step}` }, attrs: {}, listeners: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
  }));
  const nodes = Array.from({ length: 8 }, (_, i) => ({
    dataset: { stage: String(i % 4) }, marker: { hidden: true },
    querySelector(selector) { assert.equal(selector, ".current"); return this.marker; },
  }));
  const document = {
    querySelector(selector) { return { ".enhancement": container, ".status": status }[selector]; },
    querySelectorAll(selector) { return { "[data-step]": buttons, "[data-stage]": nodes }[selector]; },
  };
  runInNewContext(script, { document });
  assert.equal(container.hidden, false);
  buttons[3].listeners.click();
  assert.equal(status.textContent, "message-2");
  assert.deepEqual(buttons.map(b => b.attrs["aria-pressed"]), ["false", "false", "false", "true", "false"]);
  assert.equal(nodes.filter(n => n.dataset.active === "true").length, 2);
  assert.equal(nodes.filter(n => !n.marker.hidden).length, 2);
  assert.ok(nodes.every(n => !("hidden" in n)), "the enhancement never hides explanation nodes");
  buttons[0].listeners.click();
  assert.ok(nodes.every(n => n.marker.hidden && n.dataset.active === "false"));
  assert.doesNotThrow(() => runInNewContext(script, { document: {
    querySelector() { return null; }, querySelectorAll() { return []; },
  } }));
});

test("workflow records authorization, layered explanation, independent QA, and handoff", () => {
  const patterns = readFileSync(join(dir, "references/visual-patterns.md"), "utf8");
  const qa = readFileSync(join(dir, "references/verification-and-delivery.md"), "utf8");
  assert.match(skill, /read-only inquiry/);
  assert.match(skill, /plan mode/);
  assert.match(skill, /unique.*artifacts\/visuals|artifacts\/visuals.*unique/s);
  assert.match(skill, /No other local skill is a runtime/);
  for (const name of ["Relationship or structure", "Mechanism or sequence", "Comparison or choice", "Simple data"]) {
    assert.ok(patterns.includes(`## ${name}`));
  }
  for (const text of ["Quick understanding", "Mechanism understanding", "Accurate understanding"]) assert.ok(patterns.includes(text));
  assert.match(qa, /exactly one\ntask space/);
  assert.match(qa, /loopback-only/);
  assert.match(qa, /JavaScript disabled/);
  assert.match(qa, /Korean/);
  assert.match(qa, /Increased text size/);
  assert.match(qa, /absolute file path/);
});

test("Korean teaching fixture preserves comparison roles and known synthetic counts", () => {
  const fixture = readFileSync(new URL("./fixtures/explain-with-visuals/korean-content.html", import.meta.url), "utf8");
  assert.match(fixture, /캐시는 어떻게 반복 작업을 줄일까요/);
  assert.equal((fixture.match(/class="node" data-stage=/g) ?? []).length, 8);
  for (const stage of [0, 1, 2, 3]) assert.equal((fixture.match(new RegExp(`data-stage="${stage}"`, "g")) ?? []).length, 2);
  assert.match(fixture, /실측이 아닌 설명용 데이터/);
  assert.match(fixture, /--value: 70%/);
  assert.match(fixture, /--value: 30%/);
  assert.match(fixture, /7 \/ 10건/);
  assert.match(fixture, /3 \/ 10건/);
  assert.match(fixture, /중요한 한계/);
  assert.doesNotMatch(fixture, /<(?:script|link|iframe)\b|\bsrc\s*=/i);
});

test("repository documents the accepted design and usage", () => {
  const doc = readFileSync(new URL("../docs/plans/2026-10-11-explain-with-visuals-skill.md", import.meta.url), "utf8");
  assert.match(doc, /^date: 2026-10-11$/m);
  assert.match(doc, /^session: [0-9a-f-]+$/m);
  assert.match(doc, /docs\/research\/2026-10-11-visual-explanation-references\.md/);
  for (const heading of ["Goal", "Non-goals", "Design", "Phases", "Risks and open questions"]) assert.ok(doc.includes(`## ${heading}`));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.includes("/skill:explain-with-visuals"));
  assert.ok(readme.includes("(docs/plans/2026-10-11-explain-with-visuals-skill.md)"));
});
