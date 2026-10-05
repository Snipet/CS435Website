/**
 * Starts the worker for the grammar comparison. Kept apart from compare.ts so
 * the worker's own bundle does not refer to itself. Call it in the browser only
 * (WorkerTask calls it on the first request, from an effect).
 */
export function createCompareWorker(): Worker {
	return new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module' });
}
