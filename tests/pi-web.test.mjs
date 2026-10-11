import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const skillDir = fileURLToPath(new URL("../skills/pi-web/", import.meta.url));
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const ego = readFileSync(join(skillDir, "references/ego.md"), "utf8");
const aside = readFileSync(join(skillDir, "references/aside.md"), "utf8");

// Structural checks only: the installed-host tests validate parsing/delivery,
// and manual review covers policy meaning. None prove model compliance.
test("pi-web has routing frontmatter and one discoverable entry point", () => {
	const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
	assert.ok(frontmatter, "frontmatter is required");
	assert.match(frontmatter, /^name: pi-web$/m);
	const description = /^description: >\n((?:  .*(?:\n|$))+)/m.exec(frontmatter)?.[1];
	assert.ok(description?.trim(), "routing description is required");
	assert.ok(description.trim().length <= 1024);
	assert.match(frontmatter, /^compatibility: .+/m);
	assert.doesNotMatch(frontmatter, /^disable-model-invocation: true$/m);

	const entryPoints = [];
	function visit(dir) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (entry.name === "SKILL.md") entryPoints.push(path);
		}
	}
	visit(skillDir);
	assert.deepEqual(entryPoints, [join(skillDir, "SKILL.md")]);
});

test("authored skill-relative Markdown links resolve", () => {
	for (const name of ["SKILL.md", "references/ego.md", "references/aside.md"]) {
		const path = join(skillDir, name);
		const text = readFileSync(path, "utf8");
		const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)];
		assert.ok(links.length > 0, `${name} has reference links`);
		for (const [, target] of links) {
			assert.ok(existsSync(resolve(dirname(path), target)), `${name}: ${target}`);
		}
	}
	assert.ok(skill.includes("(references/ego.md)"));
	assert.ok(skill.includes("(references/aside.md)"));
});

test("routing names all four responsibilities and path-specific guidance", () => {
	const routes = [...skill.matchAll(/^\| \*\*([^*]+)\*\* \|/gm)].map((match) => match[1]);
	assert.deepEqual(routes, ["Ego direct execution", "Aside service integration", "Aside delegation", "Existing Aside state"]);
	assert.match(ego, /^## Ego direct execution$/m);
	for (const heading of ["Aside service integration", "Aside delegation", "Existing Aside state"]) {
		assert.ok(aside.includes(`\n## ${heading}\n`), heading);
	}
});

test("guidance includes approval, recovery, vendor, and lifecycle sections", () => {
	for (const heading of ["Approval and privacy", "Failure, interruption, and recovery", "Report"]) {
		assert.ok(skill.includes(`\n## ${heading}\n`), heading);
	}
	for (const text of [ego, aside]) assert.match(text, /^## Current vendor instructions$/m);
	assert.match(ego, /^## Task space and observation$/m);
	assert.match(ego, /^## User control and recovery$/m);
	assert.match(ego, /^## Completion and cleanup$/m);
	assert.match(aside, /^## Lifecycle and reporting$/m);
});

test("repository design record has provenance and is linked from README", () => {
	const record = readFileSync(new URL("../docs/plans/2026-10-11-pi-web-skill.md", import.meta.url), "utf8");
	assert.match(record, /^date: 2026-10-11$/m);
	assert.match(record, /^session: 01a12769-dbc3-768a-8634-77b4f367f8a7$/m);
	assert.match(record, /^based_on:\n  - docs\/plans\/2026-10-11-tui-check-skill.md$/m);
	for (const heading of ["Goal", "Non-goals", "Design", "Phases", "Risks and open questions"]) {
		assert.ok(record.includes(`\n## ${heading}\n`), heading);
	}
	assert.match(record, /^### Observed facts and evidence$/m);
	assert.match(record, /^### Accepted decisions and reasoning$/m);
	const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
	assert.ok(readme.includes("(docs/plans/2026-10-11-pi-web-skill.md)"));
});
