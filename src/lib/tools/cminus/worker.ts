/**
 * Starts the page's workers. Kept apart from tasks.ts so a worker's own
 * bundle does not refer to itself. Call these in the browser only (WorkerTask
 * calls them on the first request, from an effect).
 */
export function createCompileWorker(): Worker {
	return new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });
}

export function createRunWorker(): Worker {
	return new Worker(new URL('./run.worker.ts', import.meta.url), { type: 'module' });
}
