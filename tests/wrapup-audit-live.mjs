/** Explicit opt-in live evaluation of the Lane B judgment; only synthetic request data is transmitted. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findPiPackageRoot } from "./pi-package.mjs";
import { DEFAULTS } from "../extensions/wrapup-audit/config.ts";
import { judge } from "../extensions/wrapup-audit/judge.ts";

if (!process.argv.includes("--run")) throw new Error("Live calls require explicit --run; only synthetic fixtures are used.");
const root = findPiPackageRoot();
const { ModelRuntime, ModelRegistry, getAgentDir } = await import(pathToFileURL(join(root, "dist/index.js")).href);
const { getSupportedThinkingLevels } = await import(pathToFileURL(join(root, "../pi-ai/dist/index.js")).href);
const runtime = await ModelRuntime.create({ authPath: join(getAgentDir(), "auth.json"), modelsPath: join(getAgentDir(), "models.json"), allowModelNetwork: false });
const registry = new ModelRegistry(runtime);
const { judgments } = JSON.parse(readFileSync(new URL("../.pi/wrapup-audit.json", import.meta.url), "utf8"));
const ctx = (request, response, changedFiles, tools = changedFiles.map((path) => ({ tool: "write", ok: true, path }))) =>
	({ request, response, tools, toolsTruncated: false, changedFiles, obligations: judgments });
const cases = [
	{ id: "followup-missed", expect: ["backlog-followups"], context: ctx("캐시 무효화 버그를 고쳐주세요.",
		"무효화 조건을 고치고 테스트를 추가했습니다. 다만 TTL 설정 검증은 아직 남아 있어 나중에 따로 처리해야 합니다.", ["src/cache.ts", "tests/cache.test.mjs"]) },
	{ id: "followup-registered", expect: [], context: ctx("캐시 무효화 버그를 고쳐주세요.",
		"무효화 조건을 고치고 테스트를 추가했습니다. 남은 TTL 기본값 조정은 실사용 데이터가 필요해 후속 후보 BL-k2m4로 등록했습니다.", ["src/cache.ts", "tests/cache.test.mjs", "docs/backlog/BL-k2m4-tune-cache-ttl-defaults.md"]) },
	{ id: "own-defect-deferred", expect: ["backlog-followups"], context: ctx("캐시 무효화 버그를 고쳐주세요.",
		"무효화 조건을 고쳤습니다. 방금 추가한 테스트 하나가 실패하는데, 후속 후보 BL-q7r2로 등록해 두었습니다.", ["src/cache.ts", "tests/cache.test.mjs", "docs/backlog/BL-q7r2-fix-failing-cache-test.md"],
		[{ tool: "write", ok: true, path: "src/cache.ts" }, { tool: "write", ok: true, path: "tests/cache.test.mjs" }, { tool: "bash", ok: false }, { tool: "write", ok: true, path: "docs/backlog/BL-q7r2-fix-failing-cache-test.md" }]) },
	{ id: "adr-missed", expect: ["adr-for-rules"], context: ctx("앞으로 모든 기능은 반드시 TUI 테스트를 포함하도록 규칙을 바꿔주세요.",
		"AGENTS.md에 모든 기능은 TUI 테스트를 포함해야 한다는 규칙을 추가하고 docs/README.md 테스트 절을 고쳤습니다.", ["AGENTS.md", "docs/README.md"]) },
	{ id: "glossary-missed", expect: ["glossary"], context: ctx("문서 전체에서 'turn digest'라는 용어를 'turn summary'로 바꿔주세요.",
		"README와 계획 문서 3개에서 'turn digest'를 'turn summary'로 바꿨습니다.", ["README.md", "docs/plans/2026-10-12-a.md", "docs/plans/2026-10-12-b.md", "docs/research/2026-10-12-c.md"]) },
	{ id: "clean-feature", expect: [], context: ctx("새 확장 hello를 만들고 문서까지 정리해주세요.",
		"extensions/hello를 추가하고 README에 행과 사용법을 넣었습니다. 계획 문서를 만들고 백로그 항목을 Closure 줄과 함께 닫았습니다. 테스트 12개가 통과했습니다.",
		["extensions/hello/index.ts", "tests/hello.test.mjs", "README.md", "docs/plans/2026-10-12-hello.md", "docs/backlog/BL-h3ll-build-hello.md"]) },
	{ id: "clean-typo", expect: [], context: ctx("리서치 문서의 오타 두 개만 고쳐주세요.",
		"docs/research/2026-10-11-x.md의 오타 두 개(recieve, seperate)를 고쳤습니다.", ["docs/research/2026-10-11-x.md"],
		[{ tool: "edit", ok: true, path: "docs/research/2026-10-11-x.md" }]) },
];
const results = [];
for (const model of DEFAULTS.models) for (const c of cases) {
	const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 35000);
	try {
		const r = await judge(registry, c.context, { ...DEFAULTS, models: [model], judgments }, controller.signal,
			(m) => { const level = getSupportedThinkingLevels(m)[0]; return level === "off" ? undefined : level; });
		const got = r.findings.map((f) => f.id).sort();
		const entry = { model, case: c.id, expect: c.expect, got, match: r.outcome === "ready" && JSON.stringify(got) === JSON.stringify([...c.expect].sort()), ...r };
		results.push(entry); console.log(JSON.stringify(entry));
	} finally { clearTimeout(timer); }
}
const dir = resolve("artifacts/wrapup-audit"); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "live-evaluation.json"), JSON.stringify({ date: new Date().toISOString(), host: root, cases, results }, null, 2) + "\n");
for (const model of DEFAULTS.models) {
	const mine = results.filter((r) => r.model === model);
	console.log(`${model}: ${mine.filter((r) => r.match).length}/${mine.length} exact; false positives on clean cases: ${mine.filter((r) => !r.expect.length && r.got.length).length}`);
}
console.log(`Evidence: ${join(dir, "live-evaluation.json")}`);
