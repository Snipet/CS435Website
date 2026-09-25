import { describe, expect, it } from 'vitest';
import { parseTM } from './parse';
import { FACTORIAL_PROGRAM } from './presets';
import { STEP_TM, stepTMFocus, stepTMLines } from './steptm';
import { Trace } from './trace';
import { viewAt, type Granularity } from './view';

const lines = (program: string, inputs: number[], t: number, mode: Granularity) => {
	const view = viewAt(new Trace(parseTM(program).program, inputs), t, mode);
	const { active, path } = stepTMLines(view, mode);
	return {
		active: [...active].map((i) => STEP_TM[i].text.trim()),
		path: [...path].map((i) => STEP_TM[i].text.trim())
	};
};

describe('stepTM listing', () => {
	it('has a case for every opcode', () => {
		for (const op of ['HALT', 'IN', 'OUT', 'ADD', 'SUB', 'MUL', 'DIV', 'LD', 'ST', 'LDA', 'LDC']) {
			expect(
				STEP_TM.some((l) => l.tag === `op-${op}`),
				op
			).toBe(true);
		}
		for (const op of ['JLT', 'JLE', 'JGT', 'JGE', 'JEQ', 'JNE']) {
			expect(
				STEP_TM.some((l) => l.tag === `op-${op}`),
				op
			).toBe(true);
		}
	});

	it('marks nothing at reset', () => {
		expect(lines(FACTORIAL_PROGRAM, [3], 0, 'phase')).toEqual({ active: [], path: [] });
	});

	it('marks the fetch lines after fetch', () => {
		expect(lines(FACTORIAL_PROGRAM, [3], 4, 'phase')).toEqual({
			active: [
				'pc = reg[PC_REG];',
				'if ((pc < 0) || (pc > IADDR_SIZE))',
				'reg[PC_REG] = pc + 1;',
				'currentinstruction = iMem[pc];'
			],
			path: []
		});
	});

	it('marks the RA decode case after decoding JLE, with fetch as the path', () => {
		const { active, path } = lines(FACTORIAL_PROGRAM, [3], 5, 'phase');
		expect(active).toEqual([
			'switch (opClass(currentinstruction.iop)) {',
			'case opclRA:',
			'r = iarg1; s = iarg3; m = iarg2 + reg[s];',
			'break;',
			'}'
		]);
		expect(path).toHaveLength(4);
	});

	it('marks the executed case and return srOKAY', () => {
		const { active } = lines(FACTORIAL_PROGRAM, [3], 6, 'phase');
		expect(active).toEqual([
			'switch (currentinstruction.iop) {',
			'case opJLE: if (reg[r] <= 0) reg[PC_REG] = m; break;',
			'}',
			'return srOKAY;'
		]);
	});

	it('marks the whole path of an instruction when stepping by instruction', () => {
		const { active, path } = lines('0: DIV 0,0,1', [], 3, 'instruction');
		expect(path).toEqual([]);
		expect(active).toContain('pc = reg[PC_REG];');
		expect(active).toContain('case opclRR:');
		expect(active).toContain('else return srZERODIVIDE;');
		expect(active).not.toContain('return srOKAY;');
	});

	it('marks the failing returns', () => {
		expect(lines('0: LDA 7,5000(0)', [], 4, 'phase').active).toContain('return srIMEM_ERR;');
		const dmem = lines('0: LD 0,1024(0)', [], 2, 'phase').active;
		expect(dmem).toContain('return srDMEM_ERR;');
		expect(dmem).not.toContain('break;');
	});
});

describe('stepTMFocus', () => {
	const focus = (program: string, inputs: number[], t: number, mode: Granularity = 'phase') => {
		const i = stepTMFocus(viewAt(new Trace(parseTM(program).program, inputs), t, mode));
		return i === null ? null : STEP_TM[i].text.trim();
	};

	it('points at the block the latest phase ran', () => {
		expect(focus(FACTORIAL_PROGRAM, [3], 0)).toBeNull();
		expect(focus(FACTORIAL_PROGRAM, [3], 4)).toBe('pc = reg[PC_REG];');
		expect(focus(FACTORIAL_PROGRAM, [3], 5)).toBe('case opclRA:');
		expect(focus(FACTORIAL_PROGRAM, [3], 6)).toMatch(/^case opJLE:/);
		expect(focus(FACTORIAL_PROGRAM, [3], 6, 'instruction')).toMatch(/^case opJLE:/);
		expect(focus(FACTORIAL_PROGRAM, [], 2)).toBe('case opclRR:');
	});

	it('points at the error return when a phase fails', () => {
		expect(focus('0: LDA 7,5000(0)', [], 4)).toBe('return srIMEM_ERR;');
		expect(focus('0: LD 0,1024(0)', [], 2)).toBe('return srDMEM_ERR;');
	});
});
