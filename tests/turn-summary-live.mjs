/** Explicit opt-in live evaluation; only synthetic session data is transmitted. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findPiPackageRoot } from "./pi-package.mjs";
import { DEFAULTS } from "../extensions/turn-summary/config.ts";
import { generateSummary } from "../extensions/turn-summary/summary.ts";

if (!process.argv.includes("--run")) throw new Error("Live calls require explicit --run; only synthetic fixtures are used.");
const root = findPiPackageRoot();
const { ModelRuntime, ModelRegistry, getAgentDir } = await import(pathToFileURL(join(root, "dist/index.js")).href);
const { getSupportedThinkingLevels } = await import(pathToFileURL(join(root, "../pi-ai/dist/index.js")).href);
const runtime = await ModelRuntime.create({ authPath: join(getAgentDir(), "auth.json"), modelsPath: join(getAgentDir(), "models.json"), allowModelNetwork: false });
const registry = new ModelRegistry(runtime);
const turn = (request, response, tools = []) => ({ request, response, tools, toolsTruncated: false });
const cases = [
	{ id: "complete", expect: "done reports rename and passing tests; open null or none", context: { sessionGoal: "parseConfig 함수 이름을 loadConfig로 바꿔주세요.", recent: [],
		currentTurn: turn("parseConfig를 loadConfig로 바꾸고 테스트를 돌려주세요.", "이름을 바꾸고 호출부 3곳을 수정했습니다. 테스트 42개가 모두 통과했습니다.", [{ tool: "edit", ok: true, path: "src/config.ts" }, { tool: "edit", ok: true, path: "src/app.ts" }, { tool: "bash", ok: true }]) } },
	{ id: "partial", expect: "done says 1 of 2; open names remaining test", context: { sessionGoal: "실패하는 테스트 2개를 고쳐주세요.", recent: [{ role: "assistant", text: "입력 검증과 타임아웃 테스트가 실패합니다." }],
		currentTurn: turn("먼저 하나 고쳐주세요.", "입력 검증 테스트를 고쳤습니다. 타임아웃 테스트는 아직 실패합니다.", [{ tool: "edit", ok: true, path: "src/validate.ts" }, { tool: "bash", ok: false }]) } },
	{ id: "failing-check", expect: "must not claim fixed; open reports failing test run", context: { recent: [],
		currentTurn: turn("로그인 버그를 고쳐주세요.", "로그인 핸들러의 조건문을 수정했습니다. 이제 정상 동작할 것입니다.", [{ tool: "edit", ok: true, path: "src/login.ts" }, { tool: "bash", ok: false }]) } },
	{ id: "tool-error", expect: "open reports the failed edit", context: { recent: [],
		currentTurn: turn("README에 설치 방법을 추가해주세요.", "README 수정을 시도했지만 대상 문구를 찾지 못해 수정하지 못했습니다.", [{ tool: "read", ok: true, path: "README.md" }, { tool: "edit", ok: false, path: "README.md" }]) } },
	{ id: "read-only", expect: "next must not imply implementing without a decision", context: { recent: [],
		currentTurn: turn("캐시 전략 A와 B의 차이만 설명해주세요. 구현은 하지 마세요.", "A는 단순하고 메모리를 적게 쓰며, B는 적중률이 높지만 무효화가 복잡합니다. 어떤 쪽이 맞을지는 사용 패턴에 달려 있습니다.") } },
	{ id: "trivial", expect: "abstain (summary null)", context: { recent: [], currentTurn: turn("2+2는?", "4입니다.") } },
	{ id: "stale-previous", expect: "must follow current turn (new failure), not previous 'all passing'", context: { recent: [],
		previousSummary: { done: "모든 테스트가 통과했습니다.", open: null, next: null, note: "Unverified earlier summary; current turn data takes precedence." },
		currentTurn: turn("캐시 옵션을 추가해주세요.", "캐시 옵션을 추가했지만, 테스트를 돌려 보니 캐시 무효화 테스트 하나가 새로 실패합니다.", [{ tool: "edit", ok: true, path: "src/cache.ts" }, { tool: "bash", ok: false }]) } },
];
const results = [];
for (const model of DEFAULTS.models) for (const c of cases) {
	const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 35000);
	try {
		const r = await generateSummary(registry, c.context, { ...DEFAULTS, models: [model] }, controller.signal,
			(m) => { const level = getSupportedThinkingLevels(m)[0]; return level === "off" ? undefined : level; });
		const entry = { model, case: c.id, expect: c.expect, ...r }; results.push(entry); console.log(JSON.stringify(entry));
	} finally { clearTimeout(timer); }
}
const dir = resolve("artifacts/turn-summary"); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "live-evaluation.json"), JSON.stringify({ date: new Date().toISOString(), host: root, cases, results }, null, 2) + "\n");
console.log(`Evidence: ${join(dir, "live-evaluation.json")}`);
