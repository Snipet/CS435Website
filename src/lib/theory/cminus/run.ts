/**
 * Runs generated TM code on the site's TINY Machine (the machine of the
 * tiny-vm tool: `stepTM` is imported, not copied).
 */
import {
	IADDR_SIZE,
	PC_REG,
	resetMachine,
	stepTM,
	type InstructionMemory,
	type Machine
} from '$lib/tools/tiny-vm/machine';
import type { TmCode } from './codegen';

/**
 * Why a run ended.
 * - `halted`: the program finished (main returned and the machine reached HALT).
 * - `input-exhausted`: input() was called with no input value left.
 * - `step-budget`: the step budget was used up.
 * - `memory-error`: a data address outside memory (the stack ran out, or a
 *   wild subscript), a program counter outside instruction memory, or code
 *   too large to load. The interpreter reports it when calls nest too deeply
 *   and when the global variables with one activation record do not fit in
 *   the machine's data memory.
 * - `zero-divide`: a division by zero.
 * - `negative-subscript`: an array was indexed with a negative value.
 * - `subscript-out-of-range`: only the interpreter reports it: a subscript
 *   past the end of the array. Compiled code does not check the upper bound.
 */
export type StopReason =
	| 'halted'
	| 'input-exhausted'
	| 'step-budget'
	| 'memory-error'
	| 'zero-divide'
	| 'negative-subscript'
	| 'subscript-out-of-range';

/** Instructions a run executes at most, unless `maxSteps` says otherwise. */
export const DEFAULT_STEP_BUDGET = 1_000_000;

export interface RunOptions {
	/** Instructions executed at most (default DEFAULT_STEP_BUDGET). */
	maxSteps?: number;
}

export interface RunResult {
	/** The integers the program printed, in order. */
	outputs: number[];
	stop: StopReason;
	/** Instructions executed. */
	steps: number;
	/**
	 * Address of the instruction the run ended at: the HALT, the IN that found
	 * no input, the instruction that failed, or the next one to run when the
	 * budget ran out. Null when the code was too large to load.
	 */
	pc: number | null;
	/** Registers and data memory at the end. */
	machine: Machine;
}

/**
 * True when the code fits in the machine's instruction memory, so `runTM` can
 * load it. A program compiles when its code after the peephole pass fits; ask
 * this of `CodegenResult.code` before running the code from before that pass,
 * which is longer.
 */
export function isLoadable(code: TmCode): boolean {
	return code.instructions.length <= IADDR_SIZE;
}

/** The code as the machine's instruction memory. */
export function instructionMemory(code: TmCode): InstructionMemory {
	const cells = code.instructions;
	return { get: (addr) => cells[addr]?.instr };
}

/**
 * Loads the code into a fresh machine and runs it with the given input values.
 * Code longer than instruction memory (not `isLoadable`) is not run:
 * `memory-error`, 0 steps, `pc` null.
 */
export function runTM(
	code: TmCode,
	inputs: readonly number[],
	options: RunOptions = {}
): RunResult {
	const maxSteps = options.maxSteps ?? DEFAULT_STEP_BUDGET;
	const machine = resetMachine();
	const outputs: number[] = [];
	if (!isLoadable(code)) {
		return { outputs, stop: 'memory-error', steps: 0, pc: null, machine };
	}
	const iMem = instructionMemory(code);
	let steps = 0;
	while (steps < maxSteps) {
		const rec = stepTM(machine, iMem, inputs, steps);
		if (rec.kind === 'waiting') {
			return { outputs, stop: 'input-exhausted', steps, pc: rec.pc, machine };
		}
		if (rec.instr) steps++;
		if (rec.instr?.op === 'OUT' && rec.result === 'srOKAY') outputs.push(rec.values.r);
		switch (rec.result) {
			case 'srOKAY':
				break;
			case 'srHALT':
				return {
					outputs,
					stop: rec.pc === code.negativeSubscriptAddress ? 'negative-subscript' : 'halted',
					steps,
					pc: rec.pc,
					machine
				};
			case 'srZERODIVIDE':
				return { outputs, stop: 'zero-divide', steps, pc: rec.pc, machine };
			case 'srIMEM_ERR':
			case 'srDMEM_ERR':
				return { outputs, stop: 'memory-error', steps, pc: rec.pc, machine };
		}
	}
	return { outputs, stop: 'step-budget', steps, pc: machine.reg[PC_REG], machine };
}
