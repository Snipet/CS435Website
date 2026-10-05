import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { C_PRECEDENCE, C_PRECEDENCE_CITE } from './c-precedence';

describe('the C operator precedence table (slide 9)', () => {
	it('has 15 levels, numbered from 1', () => {
		expect(C_PRECEDENCE.map((l) => l.level)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
		expect(formatCitation(C_PRECEDENCE_CITE)).toBe(
			'Ambiguity, Precedence, Associativity & Top-Down Parsing · slide 9'
		);
	});

	it('has the slide’s operators on each level', () => {
		const operators = C_PRECEDENCE.map((l) => l.rows.map((r) => r.operators).join('   '));
		expect(operators).toEqual([
			'++ --   ()   []   .   ->   (type){list}',
			'++ --   + -   ! ~   (type)   *   &   sizeof   _Alignof',
			'* / %',
			'+ -',
			'<< >>',
			'< <=   > >=',
			'== !=',
			'&',
			'^',
			'|',
			'&&',
			'||',
			'?:',
			'=   += -=   *= /= %=   <<= >>=   &= ^= |=',
			','
		]);
	});

	it('has the slide’s associativity: right-to-left for levels 2, 13 and 14', () => {
		const rightToLeft = C_PRECEDENCE.filter((l) => l.associativity === 'Right-to-left');
		expect(rightToLeft.map((l) => l.level)).toEqual([2, 13, 14]);
		expect(
			C_PRECEDENCE.filter((l) => l.associativity === 'Left-to-right').map((l) => l.level)
		).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15]);
	});

	it('describes every row', () => {
		for (const level of C_PRECEDENCE)
			for (const row of level.rows) expect(row.description.length).toBeGreaterThan(3);
		// * binds tighter than +: a smaller level number.
		const levelOf = (description: string) =>
			C_PRECEDENCE.find((l) => l.rows.some((r) => r.description.startsWith(description)))!.level;
		expect(levelOf('Multiplication')).toBeLessThan(levelOf('Addition'));
	});
});
