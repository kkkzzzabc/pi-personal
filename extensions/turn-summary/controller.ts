import type { Generation, Summary } from "./summary.ts";

/** Revision numbers reject late results even when providers ignore cancellation. */
export class SummaryController {
	private revision = 0;
	private request?: AbortController;
	summary?: Summary;
	state = "idle";
	last?: Generation;
	calls = 0;
	input = 0;
	output = 0;
	cost = 0;

	invalidate(state = "idle"): void {
		this.revision++; this.request?.abort(); this.request = undefined; this.summary = undefined; this.state = state;
	}
	async run(generate: (signal: AbortSignal) => Promise<Generation>, isCurrent: () => boolean, changed: () => void): Promise<void> {
		this.invalidate("summarizing");
		const revision = this.revision; const request = new AbortController(); this.request = request;
		changed();
		try {
			const result = await generate(request.signal);
			// Aggregate usage is kept even when the visible result became stale.
			this.calls += result.attempts.filter((a) => a.outcome !== "unavailable").length;
			for (const a of result.attempts) { this.input += a.input ?? 0; this.output += a.output ?? 0; this.cost += a.cost ?? 0; }
			if (revision !== this.revision || request.signal.aborted) return;
			if (!isCurrent()) { this.invalidate("discarded"); changed(); return; }
			this.last = result; this.state = result.outcome; this.summary = result.summary ?? undefined; changed();
		} catch {
			if (revision === this.revision && !request.signal.aborted && isCurrent()) { this.last = undefined; this.state = "failed"; changed(); }
		} finally { if (this.request === request) this.request = undefined; }
	}
}
