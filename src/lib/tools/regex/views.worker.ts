/** Worker that computes the Regular Expressions page's DFA-based views (see views.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { viewsComputer } from './views';

serveTask(viewsComputer());
