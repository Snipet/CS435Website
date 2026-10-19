/**
 * Starts a worker for the parse. Kept apart from model.ts so the worker's own
 * bundle does not refer to itself. Call it in the browser only (WorkerTask
 * calls it on the first request, from an effect).
 */
export function createParseWorker(): Worker {
	return new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
}
