import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { formatInstruction } from './machine';
import { parseInputs } from './input';
import { parseTM, programKey } from './parse';
import { DEFAULT_PRESET_ID, FACTORIAL_PSEUDO, presetById, presets } from './presets';
import { Trace } from './trace';

function runPreset(id: string, input?: string) {
	const p = presetById(id)!;
	const { program } = parseTM(p.value.program);
	const tr = new Trace(program, parseInputs(input ?? p.value.input).values);
	tr.runTo(Infinity);
	const out = tr
		.consoleAt(tr.count)
		.lines.filter((l) => l.kind === 'out')
		.map((l) => Number(l.text.replace('OUT instruction prints: ', '')));
	const end = tr.end;
	return {
		tr,
		out,
		result: end?.kind === 'stopped' ? end.record.result : end?.kind,
		last: end?.kind === 'stopped' ? end.record : null
	};
}

describe('presets', () => {
	it('all parse without diagnostics and have valid input', () => {
		for (const p of presets) {
			const { diagnostics, program } = parseTM(p.value.program);
			expect(diagnostics, p.id).toEqual([]);
			expect(program.entries.length, p.id).toBeGreaterThan(0);
			expect(parseInputs(p.value.input).invalid, p.id).toEqual([]);
		}
	});

	it('have unique ids and a default', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		expect(presetById(DEFAULT_PRESET_ID)?.id).toBe('factorial');
		expect(presetById('nope')).toBeUndefined();
		expect(presetById(null)).toBeUndefined();
	});

	it('reproduce the slide 14 program exactly as printed', () => {
		const p = presetById('factorial')!;
		expect(p.cite).toEqual({ deck: '00', slide: 14 });
		expect(formatCitation(p.cite!)).toBe(
			'Intro: Compilers, interpreters, and language processors · slide 14'
		);
		expect(p.value.program.split('\n')).toEqual([
			'0:  IN    0, 0, 0',
			'1:  JLE   0, 6(7)',
			'2:  LDC   1, 1, 0',
			'3:  LDC   2, 1, 0',
			'4:  MUL   1, 1, 0',
			'5:  SUB   0, 0, 2',
			'6:  JNE   0, -3(7)',
			'7:  OUT   1, 0, 0',
			'8:  HALT'
		]);
		const { program } = parseTM(p.value.program);
		expect(program.entries.map((e) => `${e.addr}: ${formatInstruction(e.instr)}`)).toEqual([
			'0: IN 0,0,0',
			'1: JLE 0,6(7)',
			'2: LDC 1,1(0)',
			'3: LDC 2,1(0)',
			'4: MUL 1,1,0',
			'5: SUB 0,0,2',
			'6: JNE 0,-3(7)',
			'7: OUT 1,0,0',
			'8: HALT 0,0,0'
		]);
		expect(p.question?.text).toBe('What does this code do?');
		expect(p.value.input).toBe('3');
	});

	it('factorial prints n! for n > 0 and nothing otherwise', () => {
		expect(runPreset('factorial').out).toEqual([6]);
		expect(runPreset('factorial', '4').out).toEqual([24]);
		expect(runPreset('factorial', '0').out).toEqual([]);
		expect(runPreset('factorial').result).toBe('srHALT');
	});

	it('links every factorial instruction to its pseudo-code line', () => {
		const lines = FACTORIAL_PSEUDO.lines;
		const at = (addr: number) => lines[FACTORIAL_PSEUDO.lineOf[addr]].trim();
		expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(at)).toEqual([
			'r0 = read',
			'if 0 < r0 then',
			'r1 = 1',
			'r2 = 1',
			'r1 = r1 * r0',
			'r0 = r0 - r2',
			'until r0 == 0',
			'write r1',
			'halt'
		]);
		expect(lines[4]).toBe('* repeat');
	});

	it('sum until 0 keeps the sum in dMem[1023]', () => {
		const { out, tr, result } = runPreset('sum');
		expect(out).toEqual([47]);
		expect(result).toBe('srHALT');
		const m = tr.machineAt(tr.count);
		expect(m.dMem[1023]).toBe(47);
		expect(m.reg[6]).toBe(1023);
		expect(runPreset('sum', '0').out).toEqual([0]);
	});

	it('division by zero stops with srZERODIVIDE at the DIV', () => {
		const { out, result, last } = runPreset('divide');
		expect(out).toEqual([]);
		expect(result).toBe('srZERODIVIDE');
		expect(last?.pc).toBe(2);
		expect(runPreset('divide', '7 2').out).toEqual([3]);
	});

	it('larger of two prints the larger input either way round', () => {
		expect(runPreset('max').out).toEqual([42]);
		expect(runPreset('max', '42 17').out).toEqual([42]);
		expect(runPreset('max', '-3 -3').out).toEqual([-3]);
	});

	it('only the factorial program matches the slide program', () => {
		const key = programKey(parseTM(presetById('factorial')!.value.program).program);
		const others = presets.filter((p) => p.id !== 'factorial');
		for (const p of others) expect(programKey(parseTM(p.value.program).program)).not.toBe(key);
	});
});
