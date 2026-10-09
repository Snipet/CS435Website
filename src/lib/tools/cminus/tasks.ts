/**
 * The two computations the page hands to a worker (docs/ARCHITECTURE.md §5.4):
 * compiling the program, and running the compiled code on the TINY Machine.
 * Pure functions of plain data, so they also run on the main thread (while
 * prerendering, in tests, and when a worker cannot start).
 */
import {
	DEFAULT_STEP_BUDGET,
	compile,
	runCompilation,
	type Compilation,
	type IdentifierMode,
	type StopReason
} from '$lib/theory/cminus';

export interface CompileRequest {
	source: string;
	identifiers: IdentifierMode;
	optimize: boolean;
}

/** The whole compilation: plain objects, arrays and Maps, so it crosses to the page as it is. */
export function compileProgram(request: CompileRequest): Compilation {
	return compile(request.source, {
		identifiers: request.identifiers,
		optimize: request.optimize
	});
}

/** Instructions a run executes at most. */
export const STEP_BUDGET = DEFAULT_STEP_BUDGET;

/** Output values a run hands back; a program can print more than a page shows. */
export const MAX_OUTPUTS = 5000;

export interface RunRequest extends CompileRequest {
	/** The numbers input() reads, in order. */
	inputs: number[];
	/** Counts presses of Run, so that the same program and input run again. */
	attempt: number;
}

export interface RunOutput {
	/** The first `MAX_OUTPUTS` numbers the program printed. */
	outputs: number[];
	/** How many numbers it printed in all. */
	printed: number;
	stop: StopReason;
	/** Instructions executed. */
	steps: number;
	/** Address of the instruction the run ended at (see `RunResult.pc`). */
	pc: number | null;
	/** Input numbers read. */
	read: number;
	/** The step budget of the run. */
	budget: number;
}

/**
 * Compiles the program and runs its code (after the peephole pass) on the
 * TINY Machine. Null when the program does not compile.
 */
export function runProgram(request: RunRequest): RunOutput | null {
	const result = runCompilation(compileProgram(request), request.inputs, { maxSteps: STEP_BUDGET });
	if (!result) return null;
	return {
		outputs: result.outputs.slice(0, MAX_OUTPUTS),
		printed: result.outputs.length,
		stop: result.stop,
		steps: result.steps,
		pc: result.pc,
		read: result.machine.inPos,
		budget: STEP_BUDGET
	};
}

/** The part of a run request that says what is compiled. */
export function compileKey(request: CompileRequest): string {
	return JSON.stringify([request.source, request.identifiers, request.optimize]);
}
