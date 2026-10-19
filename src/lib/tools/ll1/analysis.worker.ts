/** Worker that computes the LL(1) page's analysis of a grammar (see model.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeAnalysis } from './model';

serveTask(computeAnalysis);
