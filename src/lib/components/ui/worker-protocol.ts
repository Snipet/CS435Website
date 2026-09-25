/**
 * Messages between a `WorkerTask` (worker-task.svelte.ts, on the page) and the
 * worker that computes for it, plus `serveTask`, the worker's side:
 *
 * ```ts
 * // views.worker.ts
 * import { serveTask } from '$lib/components/ui/worker-protocol';
 * serveTask(computeViews);
 * ```
 *
 * The worker posts `READY` once its module has loaded, then one response per
 * request. Inputs and outputs are copied with the structured clone algorithm,
 * so they must be plain data (see theory/automata/serialize.ts for engine
 * objects).
 */

export interface TaskRequest<I> {
	id: number;
	input: I;
}

export type TaskResponse<O> =
	{ id: number; ok: true; output: O } | { id: number; ok: false; error: string };

/** Posted by a worker once it is ready for requests. */
export const READY = 'ready';
export type TaskMessage<O> = TaskResponse<O> | typeof READY;

/** What a `WorkerTask` needs from a worker: a `Worker`, or a stand-in in tests. */
export interface TaskWorker {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

/** A worker's global scope, as far as `serveTask` needs it. */
export interface TaskScope {
	onmessage: ((event: MessageEvent) => void) | null;
	postMessage(message: unknown): void;
}

export function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** Runs `compute` for request `id`: its output, or the error it threw. */
export function answer<O>(id: number, compute: () => O): TaskResponse<O> {
	try {
		return { id, ok: true, output: compute() };
	} catch (e) {
		return { id, ok: false, error: errorText(e) };
	}
}

/**
 * The worker's side: answers every request with `compute(input)`. An output
 * that cannot be cloned is answered as an error.
 */
export function serveTask<I, O>(
	compute: (input: I) => O,
	scope: TaskScope = self as unknown as TaskScope
): void {
	scope.onmessage = (event) => {
		const { id, input } = event.data as TaskRequest<I>;
		const response = answer(id, () => compute(input));
		try {
			scope.postMessage(response);
		} catch (e) {
			scope.postMessage({ id, ok: false, error: errorText(e) } satisfies TaskResponse<O>);
		}
	};
	scope.postMessage(READY);
}
