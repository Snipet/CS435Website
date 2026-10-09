import { describe, expect, it } from 'vitest';
import { IADDR_SIZE, resetMachine, stepTM } from '$lib/tools/tiny-vm/machine';
import { parseTM } from '$lib/tools/tiny-vm/parse';
import type { TmCode } from './codegen';
import { compile } from './compile';
import { DEFAULT_STEP_BUDGET, instructionMemory, runTM } from './run';

function code(source: string, optimize = true): TmCode {
	const c = compile(source, { optimize });
	expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	return c.codegen!.peephole.code;
}

const inMain = (body: string) => `void main(void) { ${body} }`;

describe('runTM', () => {
	it('halted: main returned and the machine reached the HALT after the call', () => {
		const tm = code(inMain('output(input() + 1);'));
		const r = runTM(tm, [41]);
		expect(r).toMatchObject({ stop: 'halted', outputs: [42], pc: tm.haltAddress });
		expect(r.pc).toBe(5);
		expect(r.steps).toBeGreaterThan(10);
		// The pc has moved past the HALT, as on the machine.
		expect(r.machine.reg[7]).toBe(6);
		expect(r.machine.inPos).toBe(1);
	});

	it('counts the instructions executed', () => {
		// Prelude 5, main: ST, LD pc; then HALT.
		expect(runTM(code(inMain('')), []).steps).toBe(8);
		const longer = runTM(code(inMain('output(1);')), []);
		// LDC, ST argument; ST fp, LDA fp, LDA ac, LDA pc; output: ST, LD, OUT, LD pc; LD fp.
		expect(longer.steps).toBe(8 + 11);
	});

	it('input-exhausted: an IN with no value left, and the machine waits there', () => {
		const tm = code(inMain('output(input()); output(input()); output(input());'));
		const r = runTM(tm, [7, 8]);
		expect(r).toMatchObject({ stop: 'input-exhausted', outputs: [7, 8] });
		expect(tm.instructions[r.pc!].instr.op).toBe('IN');
		expect(r.pc).toBe(tm.entries.get('input')! + 1);
		expect(r.machine.reg[7]).toBe(r.pc);
		expect(runTM(tm, []).outputs).toEqual([]);
		expect(runTM(tm, [7, 8, 9])).toMatchObject({ stop: 'halted', outputs: [7, 8, 9] });
		// More input than the program reads is fine.
		expect(runTM(tm, [7, 8, 9, 10])).toMatchObject({ stop: 'halted', outputs: [7, 8, 9] });
	});

	it('step-budget: stops a program that does not end', () => {
		const tm = code(inMain('int n; n = 0; while (1) { n = n + 1; output(n); }'));
		const r = runTM(tm, [], { maxSteps: 1000 });
		expect(r.stop).toBe('step-budget');
		expect(r.steps).toBe(1000);
		expect(r.outputs.length).toBeGreaterThan(10);
		expect(r.outputs.slice(0, 3)).toEqual([1, 2, 3]);
		expect(r.pc).toBe(r.machine.reg[7]);
		expect(tm.instructions[r.pc!]).toBeDefined();
		// A larger budget goes further, and the same budget gives the same run.
		expect(runTM(tm, [], { maxSteps: 2000 }).outputs.length).toBeGreaterThan(r.outputs.length);
		expect(runTM(tm, [], { maxSteps: 1000 }).outputs).toEqual(r.outputs);
		expect(runTM(tm, [], { maxSteps: 0 })).toMatchObject({ stop: 'step-budget', steps: 0, pc: 0 });
	});

	it('the default budget is a million instructions', () => {
		expect(DEFAULT_STEP_BUDGET).toBe(1_000_000);
		const r = runTM(code(inMain('while (1) ;')), []);
		expect(r).toMatchObject({ stop: 'step-budget', steps: DEFAULT_STEP_BUDGET, outputs: [] });
	});

	it('a budget that is exactly enough lets the program halt', () => {
		const tm = code(inMain('output(1);'));
		const { steps } = runTM(tm, []);
		expect(runTM(tm, [], { maxSteps: steps }).stop).toBe('halted');
		expect(runTM(tm, [], { maxSteps: steps - 1 }).stop).toBe('step-budget');
	});

	it('memory-error: recursion that never ends runs out of data memory', () => {
		const tm = code('void f(int n) { output(n); f(n + 1); } void main(void) { f(1); }');
		const r = runTM(tm, []);
		expect(r.stop).toBe('memory-error');
		// Each record takes 5 cells of the 1024.
		expect(r.outputs.length).toBeGreaterThan(150);
		expect(r.outputs.length).toBeLessThan(300);
		expect(r.outputs.slice(0, 3)).toEqual([1, 2, 3]);
		expect(tm.instructions[r.pc!].instr.op).toBe('ST');
	});

	it('memory-error: a subscript far past the end of an array', () => {
		const r = runTM(
			code('int a[2]; void main(void) { output(1); a[input()] = 5; output(2); }'),
			[5000]
		);
		expect(r).toMatchObject({ stop: 'memory-error', outputs: [1] });
	});

	it('zero-divide', () => {
		const source = inMain('int d; d = input(); output(10 / d); output(20 / d);');
		const tm = code(source);
		expect(runTM(tm, [5])).toMatchObject({ stop: 'halted', outputs: [2, 4] });
		const r = runTM(tm, [0]);
		expect(r).toMatchObject({ stop: 'zero-divide', outputs: [] });
		const at = tm.instructions[r.pc!];
		expect(at.instr.op).toBe('DIV');
		expect(source.slice(at.span!.start, at.span!.end)).toBe('10 / d');
	});

	it('negative-subscript: the HALT a negative subscript jumps to', () => {
		const tm = code('int a[3]; void main(void) { output(a[input()]); output(9); }');
		const r = runTM(tm, [-5]);
		expect(r).toMatchObject({
			stop: 'negative-subscript',
			outputs: [],
			pc: tm.negativeSubscriptAddress
		});
		expect(r.pc).toBe(6);
		expect(runTM(tm, [2])).toMatchObject({ stop: 'halted', outputs: [0, 9], pc: 5 });
	});

	it('prints 32-bit integers, and reads input values as such', () => {
		const tm = code(inMain('int x; x = input(); output(x); output(x + 1); output(0 - x);'));
		expect(runTM(tm, [2147483647]).outputs).toEqual([2147483647, -2147483648, -2147483647]);
		expect(runTM(tm, [-2147483648]).outputs).toEqual([-2147483648, -2147483647, -2147483648]);
		// A value outside the range wraps around, as on the machine.
		expect(runTM(tm, [4294967298]).outputs).toEqual([2, 3, -2]);
	});

	it('returns the machine as it stopped', () => {
		const r = runTM(code('int g; void main(void) { g = input() * 2; }'), [21]);
		expect(r.machine.dMem[1023]).toBe(42);
		expect(r.machine.reg[6]).toBe(1023);
		expect(r.machine.dMem[0]).toBe(0);
		// main's record starts right below the one global.
		expect(r.machine.reg[5]).toBe(1022);
	});

	it('does not run code that is too large to load', () => {
		const tm = code(inMain('output(1);'));
		const padded: TmCode = {
			...tm,
			instructions: Array.from({ length: IADDR_SIZE + 1 }, (_, addr) => ({
				...tm.instructions[addr % tm.instructions.length],
				addr
			}))
		};
		expect(runTM(padded, [])).toMatchObject({
			stop: 'memory-error',
			steps: 0,
			pc: null,
			outputs: []
		});
		// Exactly 1024 instructions load.
		const full: TmCode = { ...tm, instructions: padded.instructions.slice(0, IADDR_SIZE) };
		expect(runTM(full, []).pc).not.toBeNull();
	});

	it('a wild jump out of instruction memory is a memory error', () => {
		// The cell above a one-element local array holds main's return address:
		// the upper bound of a subscript is not checked.
		const tm = code(inMain('int a[1]; a[1] = 0 - 7; output(1);'), false);
		const r = runTM(tm, []);
		expect(r.stop).toBe('memory-error');
		expect(r.outputs).toEqual([1]);
		expect(r.pc).toBe(-7);
	});

	it('takes the same steps as stepping the machine by hand', () => {
		const tm = code(inMain('int n; n = input(); while (n > 0) { output(n); n = n - 1; }'));
		const r = runTM(tm, [3]);
		const machine = resetMachine();
		const iMem = instructionMemory(tm);
		let steps = 0;
		for (;;) {
			const rec = stepTM(machine, iMem, [3], steps);
			if (rec.kind !== 'step') throw new Error('waiting');
			steps++;
			if (rec.result !== 'srOKAY') break;
		}
		expect(steps).toBe(r.steps);
		expect([...machine.dMem]).toEqual([...r.machine.dMem]);
		expect(r.outputs).toEqual([3, 2, 1]);
	});

	it('the listing loaded by the TINY Machine tool runs the same', () => {
		const tm = code(inMain('int n; n = input(); while (n > 0) { output(n * n); n = n - 1; }'));
		const { program, diagnostics } = parseTM(tm.listing);
		expect(diagnostics).toEqual([]);
		const machine = resetMachine();
		const printed: string[] = [];
		for (let i = 0; i < 10000; i++) {
			const rec = stepTM(machine, program, [4], i);
			if (rec.kind !== 'step') break;
			if (rec.output && rec.instr?.op === 'OUT') printed.push(rec.output);
			if (rec.result !== 'srOKAY') break;
		}
		expect(printed).toEqual([16, 9, 4, 1].map((v) => `OUT instruction prints: ${v}`));
		expect(runTM(tm, [4]).outputs).toEqual([16, 9, 4, 1]);
	});
});

describe('instructionMemory', () => {
	it('gives the instruction at an address, and nothing past the code', () => {
		const tm = code(inMain(''));
		const iMem = instructionMemory(tm);
		expect(iMem.get(0)).toEqual({ op: 'LD', a1: 6, a2: 0, a3: 0 });
		expect(iMem.get(5)).toEqual({ op: 'HALT', a1: 0, a2: 0, a3: 0 });
		expect(iMem.get(tm.instructions.length)).toBeUndefined();
		expect(iMem.get(-1)).toBeUndefined();
	});
});
