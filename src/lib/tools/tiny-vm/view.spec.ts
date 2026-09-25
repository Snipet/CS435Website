import { describe, expect, it } from 'vitest';
import { PC_REG } from './machine';
import { parseTM } from './parse';
import { FACTORIAL_PROGRAM } from './presets';
import { MAX_CONSOLE, RUN_BUDGET, Trace } from './trace';
import {
	back,
	captionString,
	clampPosition,
	currentAddress,
	describe as describeView,
	forward,
	jumpTarget,
	lastPosition,
	memoryAddress,
	run,
	snapToInstruction,
	viewAt,
	type Granularity
} from './view';

const trace = (text: string, inputs: number[] = []) => new Trace(parseTM(text).program, inputs);
const factorial = (n: number[] = [3]) => trace(FACTORIAL_PROGRAM, n);

/** Captions of every position, stepping forward from reset. */
function captions(tr: Trace, mode: Granularity, limit = 200): string[] {
	const out: string[] = [];
	let t = 0;
	for (let i = 0; i < limit; i++) {
		out.push(captionString(describeView(viewAt(tr, t, mode), mode)));
		const next = forward(tr, t, mode);
		if (next === t) break;
		t = next;
	}
	return out;
}

describe('Trace', () => {
	it('runs the slide 14 factorial with input 3: prints 6 after 15 steps', () => {
		const tr = factorial();
		tr.runTo(Infinity);
		expect(tr.count).toBe(15);
		expect(tr.end?.kind).toBe('stopped');
		const m = tr.machineAt(15);
		expect([...m.reg]).toEqual([0, 6, 1, 0, 0, 0, 0, 9]);
		expect(tr.consoleAt(15).lines.map((l) => [l.text, l.value])).toEqual([
			['Enter value for IN instruction: ', 3],
			['OUT instruction prints: 6', undefined],
			['HALT: 0,0,0', undefined]
		]);
	});

	it('computes n! for other inputs and prints nothing for n ≤ 0', () => {
		const out = (n: number) => {
			const tr = factorial([n]);
			tr.runTo(Infinity);
			return tr
				.consoleAt(tr.count)
				.lines.filter((l) => l.kind === 'out')
				.map((l) => l.text);
		};
		expect(out(1)).toEqual(['OUT instruction prints: 1']);
		expect(out(5)).toEqual(['OUT instruction prints: 120']);
		expect(out(0)).toEqual([]);
		expect(out(-4)).toEqual([]);
	});

	it('rebuilds any earlier state from checkpoints', () => {
		const loop = trace('0: LDA 1,1(1)\n1: LDA 7,-2(7)');
		loop.runTo(1000);
		expect(loop.count).toBe(1000);
		expect(loop.machineAt(0).reg[1]).toBe(0);
		expect(loop.machineAt(301).reg[1]).toBe(151);
		expect(loop.machineAt(1000).reg[1]).toBe(500);
		const { before, record, after } = loop.step(600);
		expect(before.reg[1]).toBe(300);
		expect(record.pc).toBe(0);
		expect(after.reg[1]).toBe(301);
	});

	it('stops at an IN with no input left', () => {
		const tr = factorial([]);
		tr.runTo(10);
		expect(tr.count).toBe(0);
		expect(tr.end).toMatchObject({ kind: 'waiting', wait: { pc: 0, r: 0 } });
	});

	it('keeps at most MAX_CONSOLE lines and reports the rest as dropped', () => {
		const tr = trace('0: OUT 0,0,0\n1: LDA 7,-2(7)');
		tr.runTo(2 * MAX_CONSOLE + 10);
		expect(tr.consoleAt(2 * MAX_CONSOLE).lines).toHaveLength(MAX_CONSOLE);
		expect(tr.consoleAt(2 * MAX_CONSOLE).dropped).toBe(false);
		expect(tr.consoleAt(2 * MAX_CONSOLE + 1).dropped).toBe(true);
	});
});

describe('positions', () => {
	it('steps by instruction between multiples of 3 and by phase one at a time', () => {
		const tr = factorial();
		expect(forward(tr, 0, 'instruction')).toBe(3);
		expect(forward(tr, 3, 'phase')).toBe(4);
		expect(forward(tr, 4, 'instruction')).toBe(6);
		expect(back(6, 'instruction')).toBe(3);
		expect(back(4, 'instruction')).toBe(3);
		expect(back(4, 'phase')).toBe(3);
		expect(back(0, 'phase')).toBe(0);
	});

	it('runs to HALT and stops there', () => {
		const tr = factorial();
		expect(run(tr, 0, 'instruction')).toEqual({ t: 45, budgetSpent: false });
		expect(lastPosition(tr)).toBe(45);
		expect(forward(tr, 45, 'instruction')).toBe(45);
		expect(forward(tr, 45, 'phase')).toBe(45);
	});

	it('stops a run at an IN that needs a value: before it, or after its decode', () => {
		const tr = factorial([]);
		expect(run(tr, 0, 'instruction').t).toBe(0);
		expect(run(tr, 0, 'phase').t).toBe(2);
		expect(forward(tr, 0, 'instruction')).toBe(0);
		expect(forward(tr, 1, 'phase')).toBe(2);
		expect(forward(tr, 2, 'phase')).toBe(2);
	});

	it('spends the run budget on a loop without HALT', () => {
		const tr = trace('0: LDA 7,-1(7)');
		const r = run(tr, 0, 'instruction', 1000);
		expect(r).toEqual({ t: 3000, budgetSpent: true });
		expect(run(tr, r.t, 'instruction', 1000).t).toBe(6000);
		expect(RUN_BUDGET).toBe(100_000);
	});

	it('clamps positions to the run', () => {
		expect(clampPosition(factorial(), 1000)).toBe(45);
		expect(clampPosition(factorial(), -5)).toBe(0);
		expect(clampPosition(factorial([]), 50)).toBe(2);
	});

	it('ends early when fetch or decode fails', () => {
		const imem = trace('0: LDA 7,2000(0)');
		expect(run(imem, 0, 'instruction').t).toBe(4);
		expect(forward(imem, 3, 'instruction')).toBe(4);
		expect(back(4, 'instruction')).toBe(3);
		const dmem = trace('0: LD 0,1024(0)');
		expect(run(dmem, 0, 'phase').t).toBe(2);
	});

	it('snaps to an instruction boundary when switching to instruction steps', () => {
		const tr = factorial();
		expect(snapToInstruction(tr, 4)).toBe(6);
		expect(snapToInstruction(tr, 6)).toBe(6);
		expect(snapToInstruction(factorial([]), 2)).toBe(0);
		const dmem = trace('0: LD 0,1024(0)');
		expect(snapToInstruction(dmem, 1)).toBe(2);
		expect(snapToInstruction(dmem, 2)).toBe(2);
	});
});

describe('viewAt and captions', () => {
	it('describes the phases of JLE 0,6(7) as on the slides', () => {
		const tr = factorial();
		const at = (t: number) => captionString(describeView(viewAt(tr, t, 'phase'), 'phase'));
		expect(at(4)).toBe('Fetch: pc = reg[7] = 1; reg[7] = 2; instruction JLE 0,6(7)');
		expect(at(5)).toBe('Decode: RA class; r = 0, m = 6 + reg[7] = 6 + 2 = 8');
		expect(at(6)).toBe('Execute: reg[0] = 3 is not ≤ 0, so no jump');
	});

	it('walks the whole factorial run phase by phase', () => {
		expect(captions(factorial(), 'phase')).toEqual([
			'Reset: all registers are 0 (so the PC, reg[7], is 0); dMem[0] = 1023 and every other dMem cell is 0',
			'Fetch: pc = reg[7] = 0; reg[7] = 1; instruction IN 0,0,0',
			'Decode: RR class; r = 0, s = 0, t = 0',
			'Execute: IN reads 3 into reg[0]',
			'Fetch: pc = reg[7] = 1; reg[7] = 2; instruction JLE 0,6(7)',
			'Decode: RA class; r = 0, m = 6 + reg[7] = 6 + 2 = 8',
			'Execute: reg[0] = 3 is not ≤ 0, so no jump',
			'Fetch: pc = reg[7] = 2; reg[7] = 3; instruction LDC 1,1(0)',
			'Decode: RA class; r = 1, m = 1 + reg[0] = 1 + 3 = 4',
			'Execute: reg[1] = 1',
			'Fetch: pc = reg[7] = 3; reg[7] = 4; instruction LDC 2,1(0)',
			'Decode: RA class; r = 2, m = 1 + reg[0] = 1 + 3 = 4',
			'Execute: reg[2] = 1',
			'Fetch: pc = reg[7] = 4; reg[7] = 5; instruction MUL 1,1,0',
			'Decode: RR class; r = 1, s = 1, t = 0',
			'Execute: reg[1] = reg[1] * reg[0] = 1 * 3 = 3',
			'Fetch: pc = reg[7] = 5; reg[7] = 6; instruction SUB 0,0,2',
			'Decode: RR class; r = 0, s = 0, t = 2',
			'Execute: reg[0] = reg[0] - reg[2] = 3 - 1 = 2',
			'Fetch: pc = reg[7] = 6; reg[7] = 7; instruction JNE 0,-3(7)',
			'Decode: RA class; r = 0, m = -3 + reg[7] = -3 + 7 = 4',
			'Execute: reg[0] = 2 ≠ 0, so reg[7] = m = 4',
			'Fetch: pc = reg[7] = 4; reg[7] = 5; instruction MUL 1,1,0',
			'Decode: RR class; r = 1, s = 1, t = 0',
			'Execute: reg[1] = reg[1] * reg[0] = 3 * 2 = 6',
			'Fetch: pc = reg[7] = 5; reg[7] = 6; instruction SUB 0,0,2',
			'Decode: RR class; r = 0, s = 0, t = 2',
			'Execute: reg[0] = reg[0] - reg[2] = 2 - 1 = 1',
			'Fetch: pc = reg[7] = 6; reg[7] = 7; instruction JNE 0,-3(7)',
			'Decode: RA class; r = 0, m = -3 + reg[7] = -3 + 7 = 4',
			'Execute: reg[0] = 1 ≠ 0, so reg[7] = m = 4',
			'Fetch: pc = reg[7] = 4; reg[7] = 5; instruction MUL 1,1,0',
			'Decode: RR class; r = 1, s = 1, t = 0',
			'Execute: reg[1] = reg[1] * reg[0] = 6 * 1 = 6',
			'Fetch: pc = reg[7] = 5; reg[7] = 6; instruction SUB 0,0,2',
			'Decode: RR class; r = 0, s = 0, t = 2',
			'Execute: reg[0] = reg[0] - reg[2] = 1 - 1 = 0',
			'Fetch: pc = reg[7] = 6; reg[7] = 7; instruction JNE 0,-3(7)',
			'Decode: RA class; r = 0, m = -3 + reg[7] = -3 + 7 = 4',
			'Execute: reg[0] = 0, so no jump',
			'Fetch: pc = reg[7] = 7; reg[7] = 8; instruction OUT 1,0,0',
			'Decode: RR class; r = 1, s = 0, t = 0',
			'Execute: OUT prints reg[1] = 6',
			'Fetch: pc = reg[7] = 8; reg[7] = 9; instruction HALT 0,0,0',
			'Decode: RR class; r = 0, s = 0, t = 0',
			'Execute: HALT prints "HALT: 0,0,0"; stepTM returns srHALT'
		]);
	});

	it('summarizes whole instructions when stepping by instruction', () => {
		const got = captions(factorial(), 'instruction');
		expect(got).toHaveLength(16);
		expect(got.slice(1, 4)).toEqual([
			'0: IN 0,0,0: IN reads 3 into reg[0]',
			'1: JLE 0,6(7): m = 6 + reg[7] = 6 + 2 = 8; reg[0] = 3 is not ≤ 0, so no jump',
			'2: LDC 1,1(0): reg[1] = 1'
		]);
		expect(got[7]).toBe(
			'6: JNE 0,-3(7): m = -3 + reg[7] = -3 + 7 = 4; reg[0] = 2 ≠ 0, so reg[7] = m = 4'
		);
	});

	it('shows the PC increment after fetch and the full effect after execute', () => {
		const tr = factorial();
		const fetched = viewAt(tr, 4, 'phase');
		expect(fetched.machine.reg[PC_REG]).toBe(2);
		expect(fetched.written).toEqual([{ reg: 7, before: 1, after: 2 }]);
		expect(fetched.status).toBe('running');
		expect(fetched.executed).toBe(1);
		expect(currentAddress(fetched)).toBe(1);
		expect(jumpTarget(fetched)).toBeNull();
		expect(jumpTarget(viewAt(tr, 5, 'phase'))).toBe(8);

		const jne = viewAt(tr, 21, 'instruction');
		expect(jne.record?.pc).toBe(6);
		expect(jne.machine.reg[PC_REG]).toBe(4);
		expect(jne.written).toEqual([{ reg: 7, before: 6, after: 4 }]);
		expect(viewAt(tr, 21, 'phase').written).toEqual([{ reg: 7, before: 7, after: 4 }]);
		expect(jne.status).toBe('srOKAY');
		expect(jne.executed).toBe(7);

		const halted = viewAt(tr, 45, 'instruction');
		expect(halted.status).toBe('srHALT');
		expect(halted.executed).toBe(15);
	});

	it('reports waiting at the IN that has no value', () => {
		const tr = factorial([]);
		const start = viewAt(tr, 0, 'instruction');
		expect(start.status).toBe('waiting');
		expect(start.waiting?.pc).toBe(0);
		expect(viewAt(tr, 0, 'phase').status).toBe('ready');
		const decoded = viewAt(tr, 2, 'phase');
		expect(decoded.status).toBe('waiting');
		expect(captionString(describeView(decoded, 'phase'))).toBe(
			'Decode: RR class; r = 0, s = 0, t = 0'
		);
		expect(decoded.machine.reg[PC_REG]).toBe(1);
	});

	it('describes errors where they happen', () => {
		const div = trace('0: DIV 0,0,1');
		expect(captions(div, 'instruction')).toEqual([
			expect.stringMatching(/^Reset/),
			'0: DIV 0,0,1: reg[1] = 0, so stepTM returns srZERODIVIDE'
		]);
		const dmem = trace('0: ST 0,1(6)\n1: HALT');
		const dmemRun = new Trace(parseTM('0: LDA 6,1023(0)\n1: ST 0,1(6)').program, []);
		expect(captions(dmemRun, 'phase').at(-1)).toBe(
			'Decode: RM class; r = 0, m = 1 + reg[6] = 1 + 1023 = 1024, outside dMem (0 … 1023), so stepTM returns srDMEM_ERR'
		);
		expect(captions(dmem, 'instruction')).toHaveLength(3);
		const imem = trace('0: LDA 7,-5(7)');
		expect(captions(imem, 'instruction').at(-1)).toBe(
			'Fetch: pc = reg[7] = -4, outside iMem (0 … 1023), so stepTM returns srIMEM_ERR'
		);
		expect(viewAt(imem, 4, 'instruction').status).toBe('srIMEM_ERR');
		expect(viewAt(imem, 4, 'instruction').executed).toBe(2);
	});

	it('marks the dMem cell of LD and ST from decode on', () => {
		const tr = trace('0: ST 0,5(0)');
		expect(memoryAddress(viewAt(tr, 1, 'phase'))).toBeNull();
		expect(memoryAddress(viewAt(tr, 2, 'phase'))).toBe(5);
		expect(viewAt(tr, 3, 'phase').memWrite).toEqual({ addr: 5, before: 0, after: 0 });
	});
});
