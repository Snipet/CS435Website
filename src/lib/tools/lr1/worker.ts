/**
 * Starts the worker that builds the automata. Kept apart from build.ts so the
 * worker's own bundle does not refer to itself. Call it in the browser only
 * (WorkerTask calls it on the first request, from an effect).
 */
export function createBuildWorker(): Worker {
	return new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
}
