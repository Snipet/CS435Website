/**
 * Starts the worker for the page's views. Kept apart from views.ts so the
 * worker's own bundle does not refer to itself. Call it in the browser only
 * (WorkerTask calls it on the first request, from an effect).
 */
export function createViewsWorker(): Worker {
	return new Worker(new URL('./views.worker.ts', import.meta.url), { type: 'module' });
}
