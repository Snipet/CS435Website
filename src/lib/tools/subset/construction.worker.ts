/** Worker that builds the Subset Construction page's NFA, DFA and layouts (see job.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeConstruction } from './job';

serveTask(computeConstruction);
