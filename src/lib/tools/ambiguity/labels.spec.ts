import { describe, expect, it } from 'vitest';
import { splitSubscript } from '$lib/components/grammar/tree-layout';
import { displayTokens, parseLabels, subscript } from './labels';

describe('parseLabels', () => {
	it('reads terminal = label items', () => {
		expect([...parseLabels('OTHER = E').map]).toEqual([['OTHER', 'E']]);
		expect([...parseLabels('OTHER=E, id = x; num=n\n').map]).toEqual([
			['OTHER', 'E'],
			['id', 'x'],
			['num', 'n']
		]);
		expect(parseLabels('').map.size).toBe(0);
		expect(parseLabels(' , ').problems).toEqual([]);
	});

	it('reports items it cannot use', () => {
		expect(parseLabels('OTHER').problems).toEqual(['OTHER is not of the form OTHER = E.']);
		expect(parseLabels('OTHER = E, OTHER = F')).toEqual({
			map: new Map([['OTHER', 'E']]),
			problems: ['OTHER is listed twice; the first label is used.']
		});
		const checked = parseLabels('OTHER = E, int = n', ['if', 'then', 'OTHER']);
		expect([...checked.map]).toEqual([['OTHER', 'E']]);
		expect(checked.problems).toEqual(['int is not a terminal of the grammar.']);
	});
});

describe('displayTokens', () => {
	it('shows the k-th OTHER as E with subscript k (slide 12)', () => {
		const tokens = 'if OTHER then if OTHER then OTHER else OTHER'.split(' ');
		expect(displayTokens(tokens, new Map([['OTHER', 'E']])).join(' ')).toBe(
			'if E₁ then if E₂ then E₃ else E₄'
		);
	});

	it('leaves other tokens alone and numbers terminals with one label together', () => {
		expect(displayTokens(['int', '+', 'int'], new Map())).toEqual(['int', '+', 'int']);
		const map = new Map([
			['id', 'x'],
			['num', 'x'],
			['OTHER', 'E']
		]);
		expect(displayTokens(['id', '+', 'num', '+', 'OTHER', '+', 'id'], map)).toEqual([
			'x₁',
			'+',
			'x₂',
			'+',
			'E₁',
			'+',
			'x₃'
		]);
	});

	it('writes subscripts that the tree view draws as subscripts', () => {
		expect(subscript(12)).toBe('₁₂');
		expect(splitSubscript('E₁₂')).toEqual({ base: 'E', sub: '12' });
	});
});
