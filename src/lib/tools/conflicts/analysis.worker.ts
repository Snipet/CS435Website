/** Worker that builds the tables, conflicts, parses and report of the page (see analysis.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { analyze } from './analysis';

serveTask(analyze);
