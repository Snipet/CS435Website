/** Worker that runs the C- Compiler page's program on the TINY Machine (see tasks.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { runProgram } from './tasks';

serveTask(runProgram);
