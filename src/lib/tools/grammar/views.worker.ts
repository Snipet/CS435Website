/** Worker that computes the Context-Free Grammars page's Earley-based views (see views.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { computeViews } from './views';

serveTask(computeViews);
