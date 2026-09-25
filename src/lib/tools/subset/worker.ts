/**
 * Starts the worker for the page's construction. Kept apart from job.ts so
 * the worker's own bundle does not refer to itself. Call it in the browser
 * only (WorkerTask calls it on the first request, from an effect).
 */
export function createConstructionWorker(): Worker {
	return new Worker(new URL('./construction.worker.ts', import.meta.url), { type: 'module' });
}
