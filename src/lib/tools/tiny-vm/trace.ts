/**
 * A run of the TINY Machine from reset, computed lazily as far as it is
 * needed. The run is a pure function of the program and the input values, so
 * any earlier machine state can be rebuilt: the trace keeps a checkpoint every
 * `CHECKPOINT_EVERY` steps and replays from the nearest one.
 */
import {
	cloneMachine,
	resetMachine,
	stepTM,
	type ExecRecord,
	type InstructionMemory,
	type Machine,
	type WaitRecord
} from './machine';

export const CHECKPOINT_EVERY = 256;
/** Instructions one "Run" executes at most. */
export const RUN_BUDGET = 100_000;
/** Most stepTM calls a trace holds. */
export const MAX_TRACE = 1_000_000;
/** Most console lines kept; later ones are counted. */
export const MAX_CONSOLE = 5_000;

export type TraceEnd =
	/** HALT or an error: the last record's result is not srOKAY. */
	| { kind: 'stopped'; record: ExecRecord }
	/** An IN with no input left; nothing ran for it yet. */
	| { kind: 'waiting'; wait: WaitRecord }
	/** MAX_TRACE calls without stopping. */
	| { kind: 'limit' };

export interface ConsoleLine {
	/** The stepTM call that printed it. */
	step: number;
	kind: 'in' | 'out' | 'halt';
	text: string;
	/** The value IN read. */
	value?: number;
}

/** The terminal prompt of tm.c's IN. */
export const IN_PROMPT = 'Enter value for IN instruction: ';

export class Trace {
	readonly program: InstructionMemory;
	readonly inputs: readonly number[];
	#m: Machine;
	#count = 0;
	#end: TraceEnd | null = null;
	#checkpoints: Machine[] = [];
	#console: ConsoleLine[] = [];
	/** The call that printed the first line not kept, if any. */
	#firstDropped: number | null = null;

	constructor(program: InstructionMemory, inputs: readonly number[]) {
		this.program = program;
		this.inputs = inputs;
		this.#m = resetMachine();
		this.#checkpoints.push(cloneMachine(this.#m));
	}

	/** stepTM calls made so far (each counts, including a final HALT or error). */
	get count(): number {
		return this.#count;
	}

	/** Why the run cannot go on, or null while it can. */
	get end(): TraceEnd | null {
		return this.#end;
	}

	/** Runs until `n` calls have been made or the machine stops; returns `count`. */
	runTo(n: number): number {
		const target = Math.min(Math.floor(n), MAX_TRACE);
		while (this.#count < target && !this.#end) {
			const rec = stepTM(this.#m, this.program, this.inputs, this.#count);
			if (rec.kind === 'waiting') {
				this.#end = { kind: 'waiting', wait: rec };
				break;
			}
			this.#log(rec);
			this.#count++;
			if (this.#count % CHECKPOINT_EVERY === 0) this.#checkpoints.push(cloneMachine(this.#m));
			if (rec.result !== 'srOKAY') this.#end = { kind: 'stopped', record: rec };
		}
		if (!this.#end && this.#count >= MAX_TRACE) this.#end = { kind: 'limit' };
		return this.#count;
	}

	#log(rec: ExecRecord) {
		const add = (line: ConsoleLine) => {
			if (this.#console.length < MAX_CONSOLE) this.#console.push(line);
			else this.#firstDropped ??= line.step;
		};
		if (rec.input) {
			add({ step: rec.index, kind: 'in', text: IN_PROMPT, value: rec.input.value });
		}
		if (rec.output)
			add({ step: rec.index, kind: rec.result === 'srHALT' ? 'halt' : 'out', text: rec.output });
	}

	/** A copy of the machine after `k` calls (0 ≤ k ≤ count). */
	machineAt(k: number): Machine {
		if (k < 0 || k > this.#count) throw new RangeError(`No machine after ${k} steps`);
		if (k === this.#count) return cloneMachine(this.#m);
		const c = Math.floor(k / CHECKPOINT_EVERY);
		const m = cloneMachine(this.#checkpoints[c]);
		for (let i = c * CHECKPOINT_EVERY; i < k; i++) stepTM(m, this.program, this.inputs, i);
		return m;
	}

	/** Call `k` (0 ≤ k < count) with the machine before and after it. */
	step(k: number): { before: Machine; record: ExecRecord; after: Machine } {
		if (k < 0 || k >= this.#count) throw new RangeError(`Step ${k} has not run`);
		const after = this.machineAt(k);
		const before = cloneMachine(after);
		const record = stepTM(after, this.program, this.inputs, k) as ExecRecord;
		return { before, record, after };
	}

	/** Console lines printed by the first `k` calls; `dropped` when some were not kept. */
	consoleAt(k: number): { lines: ConsoleLine[]; dropped: boolean } {
		const lines = this.#console;
		let lo = 0;
		let hi = lines.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (lines[mid].step < k) lo = mid + 1;
			else hi = mid;
		}
		const dropped = this.#firstDropped !== null && k > this.#firstDropped;
		return { lines: lines.slice(0, lo), dropped };
	}
}
