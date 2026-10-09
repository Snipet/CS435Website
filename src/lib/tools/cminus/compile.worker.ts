/** Worker that compiles the C- Compiler page's program (see tasks.ts). */
import { serveTask } from '$lib/components/ui/worker-protocol';
import { compileProgram } from './tasks';

serveTask(compileProgram);
