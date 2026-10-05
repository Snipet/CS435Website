/** Worker that compares the original and the rewritten grammar (see compare.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { compareTexts } from './compare';

serveTask(compareTexts);
