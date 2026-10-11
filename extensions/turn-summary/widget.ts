/** Width-safe three-line widget; theme colors are applied at render time. */
import type { Summary } from "./summary.ts";

export function summaryLines(summary: Summary): [string, string][] {
	return [["Done", summary.done], ["Open", summary.open], ["Next", summary.next]].filter((row): row is [string, string] => typeof row[1] === "string");
}
export function createWidget(lib: any, getSummary: () => Summary | undefined) {
	return (_tui: any, theme: any) => ({
		render(width: number): string[] {
			const summary = getSummary();
			if (!summary || width < 4) return [];
			return summaryLines(summary).map(([label, value]) => {
				const head = `${theme.fg("accent", "▏")}${theme.fg("accent", label.padEnd(5))}`;
				return lib.truncateToWidth(`${head}${value}`, width, "…");
			});
		},
		invalidate() {},
	});
}
