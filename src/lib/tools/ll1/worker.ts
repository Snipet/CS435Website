/**
 * Starts the workers of the LL(1) page. Kept apart from model.ts so the
 * workers' own bundles do not refer to themselves. Call them in the browser
 * only (WorkerTask calls them on the first request, from an effect).
 */
export function createAnalysisWorker(): Worker {
	return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
}

export function createParseWorker(): Worker {
	return new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
}
