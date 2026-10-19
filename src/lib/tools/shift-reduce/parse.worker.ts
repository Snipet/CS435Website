/** Worker that builds the LR(1) table and runs the parse of the Shift-Reduce Parsing page (see model.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeParse } from './model';

serveTask(computeParse);
