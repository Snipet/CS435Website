/**
 * Starts the worker for the page's analysis. Kept apart from analysis.ts so
 * the worker's own bundle does not refer to itself. Call it in the browser only
 * (WorkerTask calls it on the first request, from an effect).
 */
export function createAnalysisWorker(): Worker {
	return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
}
