import { describe, expect, it } from 'vitest';
import { operatorWords, operatorsOf } from './operators';

describe('operatorsOf', () => {
	it('reads words separated by spaces', () => {
		expect(operatorsOf('+ -')).toEqual(['+', '-']);
		expect(operatorsOf('  *   /  % ')).toEqual(['*', '/', '%']);
		expect(operatorsOf('and or')).toEqual(['and', 'or']);
		expect(operatorsOf('  ')).toEqual([]);
		expect(operatorsOf('')).toEqual([]);
	});

	it('keeps an operator of several characters whole', () => {
		expect(operatorsOf('== !=')).toEqual(['==', '!=']);
		expect(operatorsOf('&&')).toEqual(['&&']);
		expect(operatorsOf('||')).toEqual(['||']);
		expect(operatorsOf('< <= > >=')).toEqual(['<', '<=', '>', '>=']);
		expect(operatorsOf('<<= >>=')).toEqual(['<<=', '>>=']);
		// Every level of the C table, as the table writes it.
		expect(operatorsOf('= += -= *= /= %= &= ^= |= <<= >>=')).toHaveLength(11);
	});

	it('takes quotes as optional and not part of the operator', () => {
		expect(operatorsOf(`'+' "=="  and`)).toEqual(['+', '==', 'and']);
		expect(operatorsOf('"=="')).toEqual(operatorsOf('=='));
		expect(operatorsOf('"not in" in')).toEqual(['not in', 'in']);
	});

	it('reads characters with nothing between them as one operator', () => {
		expect(operatorsOf('+-')).toEqual(['+-']);
		expect(operatorsOf('+ -')).toEqual(['+', '-']);
	});

	it('reads ∗ as *', () => {
		expect(operatorsOf('∗ ∗∗')).toEqual(['*', '**']);
	});
});

describe('operatorWords', () => {
	it('says which grammar symbols a word is made of', () => {
		expect(operatorWords('== + "!="')).toEqual([
			{ name: '==', parts: ['=', '='] },
			{ name: '+', parts: ['+'] },
			{ name: '!=', parts: ['!='] }
		]);
		expect(operatorWords('+-')).toEqual([{ name: '+-', parts: ['+', '-'] }]);
	});
});
