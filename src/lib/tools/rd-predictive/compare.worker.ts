/** Worker that compares the grammar as written with a rewritten one (see compare.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { compareTexts } from './compare';

serveTask(compareTexts);
