/**
 * Client for the native `pi-cua-helper` process: JSON lines over stdio, one request at a time.
 * See native/cua-helper/Sources/pi-cua-helper/main.swift for the protocol.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_HELPER_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"native",
	"cua-helper",
	".build",
	"release",
	"pi-cua-helper",
);

export const BUILD_HINT = "Build it with `npm run build:cua-helper` in the pi-personal package.";

export class HelperError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "HelperError";
		this.code = code;
	}
}

interface Pending {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

export interface RequestOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
}

export class HelperClient {
	private child?: ChildProcessWithoutNullStreams;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private queue: Promise<unknown> = Promise.resolve();
	private stderr = "";

	readonly binaryPath: string;

	constructor(binaryPath: string = process.env.PI_CUA_HELPER || DEFAULT_HELPER_PATH) {
		this.binaryPath = binaryPath;
	}

	/** Requests run strictly in order; element indexes depend on the previous state read. */
	request<T = unknown>(method: string, params: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<T> {
		const run = this.queue.then(() => this.send<T>(method, params, options));
		this.queue = run.catch(() => undefined);
		return run;
	}

	close(): void {
		const child = this.child;
		this.child = undefined;
		this.failAll(new HelperError("closed", "The helper was stopped."));
		child?.stdin.end();
		child?.kill("SIGTERM");
	}

	private start(): ChildProcessWithoutNullStreams {
		if (this.child) return this.child;
		if (!existsSync(this.binaryPath)) {
			throw new HelperError("helper_missing", `Computer-use helper not found at ${this.binaryPath}. ${BUILD_HINT}`);
		}
		const child = spawn(this.binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });
		child.stdout.on("data", (chunk: Buffer) => this.onData(chunk.toString("utf8")));
		child.stderr.on("data", (chunk: Buffer) => {
			this.stderr = (this.stderr + chunk.toString("utf8")).slice(-2000);
		});
		const onGone = (reason: string) => {
			if (this.child !== child) return;
			this.child = undefined;
			this.failAll(new HelperError("helper_exited", `The helper ${reason}.${this.stderr ? ` stderr: ${this.stderr.trim()}` : ""}`));
		};
		child.on("error", (error) => onGone(`failed to start: ${error.message}`));
		child.on("exit", (code, signal) => onGone(`exited (${signal ?? code})`));
		this.child = child;
		return child;
	}

	private send<T>(method: string, params: Record<string, unknown>, options: RequestOptions): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (options.signal?.aborted) return reject(new HelperError("aborted", "Aborted."));
			let child: ChildProcessWithoutNullStreams;
			try {
				child = this.start();
			} catch (error) {
				return reject(error as Error);
			}
			const id = this.nextId++;
			const timeoutMs = options.timeoutMs ?? 30_000;
			const onAbort = () => {
				const pending = this.pending.get(id);
				this.pending.delete(id);
				if (pending) clearTimeout(pending.timer);
				// The helper cannot cancel an in-flight request; restart it so later calls are not blocked.
				this.close();
				reject(new HelperError("aborted", "Aborted."));
			};
			const timer = setTimeout(() => {
				this.pending.delete(id);
				options.signal?.removeEventListener("abort", onAbort);
				this.close();
				reject(new HelperError("timeout", `${method} timed out after ${timeoutMs} ms.`));
			}, timeoutMs);
			options.signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(id, {
				timer,
				resolve: (value) => {
					options.signal?.removeEventListener("abort", onAbort);
					resolve(value as T);
				},
				reject: (error) => {
					options.signal?.removeEventListener("abort", onAbort);
					reject(error);
				},
			});
			child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
		});
	}

	private onData(text: string): void {
		this.buffer += text;
		let newline = this.buffer.indexOf("\n");
		while (newline >= 0) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			newline = this.buffer.indexOf("\n");
			if (!line) continue;
			let message: { id?: number; result?: unknown; error?: { code?: string; message?: string } };
			try {
				message = JSON.parse(line);
			} catch {
				continue;
			}
			const pending = typeof message.id === "number" ? this.pending.get(message.id) : undefined;
			if (!pending) continue;
			this.pending.delete(message.id as number);
			clearTimeout(pending.timer);
			if (message.error) {
				pending.reject(new HelperError(message.error.code ?? "error", message.error.message ?? "Helper error."));
			} else {
				pending.resolve(message.result);
			}
		}
	}

	private failAll(error: Error): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}
