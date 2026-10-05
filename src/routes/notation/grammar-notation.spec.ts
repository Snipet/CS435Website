import { describe, expect, it } from 'vitest';
import {
	danglingElseGrammar,
	ebnfRewrites,
	expressionGrammar,
	grammarSegments,
	numberProductions,
	productionFunctions
} from './grammar-notation';

const names = (text: string) =>
	numberProductions(text).map((f) => `${f.name}${f.number}: ${f.production}`);

describe('numberProductions', () => {
	it('numbers the productions of each non-terminal from 1 in the order written', () => {
		expect(names('E → T | T + E\nT → int | int * T | ( E )')).toEqual([
			'E1: E → T',
			'E2: E → T + E',
			'T1: T → int',
			'T2: T → int * T',
			'T3: T → ( E )'
		]);
	});

	it('follows the order of the text, not the productions', () => {
		// Top-Down Parsing, slide 20: the same productions in another order.
		expect(names('E → T + E | T\nT → ( E ) | int | int * T')).toEqual([
			'E1: E → T + E',
			'E2: E → T',
			'T1: T → ( E )',
			'T2: T → int',
			'T3: T → int * T'
		]);
	});

	it('reads continuation lines, repeated left-hand sides and ε', () => {
		expect(names(danglingElseGrammar)).toEqual([
			'E1: E → if E then E',
			'E2: E → if E then E else E',
			'E3: E → OTHER'
		]);
		expect(names('E → int\nE → E + E\n// done\nE -> ( E )')).toEqual([
			'E1: E → int',
			'E2: E → E + E',
			'E3: E → ( E )'
		]);
		expect(names('S → ε | ( S )')).toEqual(['S1: S → ε', 'S2: S → ( S )']);
		expect(names('')).toEqual([]);
	});
});

describe('productionFunctions', () => {
	// Top-Down Parsing, slides 31–34, in the order the code on slide 34 lists them.
	const slides = [
		{ name: 'E', number: 1, production: 'E → T' },
		{ name: 'E', number: 2, production: 'E → T + E' },
		{ name: 'T', number: 1, production: 'T → int' },
		{ name: 'T', number: 2, production: 'T → int * T' },
		{ name: 'T', number: 3, production: 'T → ( E )' }
	];

	it('are the functions of the slides', () => {
		expect(productionFunctions).toEqual(slides);
	});

	it('number the grammar the page shows with them', () => {
		expect(productionFunctions).toEqual(numberProductions(expressionGrammar));
	});
});

describe('grammarSegments', () => {
	const join = (text: string, opts?: Parameters<typeof grammarSegments>[1]) =>
		grammarSegments(text, opts)
			.map((s) => s.text)
			.join('');

	it('splits the text without changing it', () => {
		for (const text of [expressionGrammar, danglingElseGrammar, '', '  E → T  ']) {
			expect(join(text)).toBe(text);
		}
		for (const r of ebnfRewrites) {
			expect(join(r.before, { nonterminals: r.nonterminals })).toBe(r.before);
			expect(join(r.after, { ebnf: true, nonterminals: r.nonterminals })).toBe(r.after);
		}
	});

	it('colors non-terminals and metasymbols and leaves terminals plain', () => {
		expect(grammarSegments('E → int')).toEqual([
			{ text: 'E', className: 'hl-name' },
			{ text: ' ' },
			{ text: '→', className: 'hl-operator' },
			{ text: ' int' }
		]);
	});

	it('takes non-terminals that have no production in the text', () => {
		const x = grammarSegments('A → X op A | X', { nonterminals: ['X'] }).filter(
			(s) => s.text === 'X'
		);
		expect(x.map((s) => s.className)).toEqual(['hl-name', 'hl-name']);
	});
});
