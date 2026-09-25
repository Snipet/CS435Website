import { describe, expect, it } from 'vitest';
import { dMemRows, iMemRows, rangeText, withGaps, type Row } from './listing';
import { resetMachine } from './machine';
import { parseTM } from './parse';

const shape = <T>(rows: Row<T>[]) =>
	rows.map((r) => (r.kind === 'gap' ? `gap ${rangeText(r.from, r.to)}` : `${r.addr}`));

describe('memory rows', () => {
	it('collapses the cells between shown addresses', () => {
		expect(shape(withGaps([3, 1, 3, 9, -1, 12], 10, () => 0))).toEqual([
			'gap 0',
			'1',
			'gap 2',
			'3',
			'gap 4–8',
			'9'
		]);
		expect(shape(withGaps([], 4, () => 0))).toEqual(['gap 0–3']);
	});

	it('lists loaded instructions, and the PC when it points past them', () => {
		const { program } = parseTM('0: IN 0,0,0\n1: HALT');
		expect(shape(iMemRows(program, [1, null]))).toEqual(['0', '1', 'gap 2–1023']);
		const rows = iMemRows(program, [5]);
		expect(shape(rows)).toEqual(['0', '1', 'gap 2–4', '5', 'gap 6–1023']);
		const empty = rows[3];
		expect(empty.kind === 'cell' && empty.cell).toEqual({
			instr: { op: 'HALT', a1: 0, a2: 0, a3: 0 },
			loaded: false,
			comment: '',
			line: null
		});
	});

	it('shows dMem[0], the top cell, non-zero cells and marked cells', () => {
		const m = resetMachine();
		m.dMem[7] = -2;
		expect(shape(dMemRows(m.dMem, [500, null]))).toEqual([
			'0',
			'gap 1–6',
			'7',
			'gap 8–499',
			'500',
			'gap 501–1022',
			'1023'
		]);
	});
});
