/** Worker that runs the LL(1) page's parser on a token string (see model.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeParse } from './model';

serveTask(computeParse);
