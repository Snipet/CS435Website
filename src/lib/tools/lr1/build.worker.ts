/** Worker that builds the automata, tables and parse of the LR(1) Parser Builder (see build.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeBuild } from './build';

serveTask(computeBuild);
