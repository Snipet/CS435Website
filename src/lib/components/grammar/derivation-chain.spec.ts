import { describe, expect, it } from 'vitest';
import { chainForms, formText, type ChainForm } from './derivation-chain';

/** `E *[E]* {( E )}`: replaced symbols in *[ ]*, the replacement in { }. */
const show = (form: ChainForm) =>
	form.empty
		? 'ε'
		: form.segments
				.map((seg) => {
					const text = seg.symbols.map((s) => (s.replaced ? `*[${s.text}]*` : s.text)).join(' ');
					return seg.made ? `{${text}}` : text;
				})
				.join(' ');

// Introduction to Parsing, slide 12: E → E * E → ( E ) * E → ( E + E ) * E → …
const forms = [
	['E'],
	['E', '*', 'E'],
	['(', 'E', ')', '*', 'E'],
	['(', 'E', '+', 'E', ')', '*', 'E']
];
const steps = [
	{ index: 0, length: 3 },
	{ index: 0, length: 3 },
	{ index: 1, length: 3 }
];

describe('chainForms', () => {
	it('marks the replaced non-terminal and its replacement in each step', () => {
		expect(chainForms(forms, steps, ['E']).map(show)).toEqual([
			'*[E]*',
			'{*[E]* * E}',
			'{( *[E]* )} * E',
			'( {E + E} ) * E'
		]);
	});

	it('styles the symbols named as non-terminals', () => {
		const [, second] = chainForms(forms, steps, ['E']);
		expect(second.segments.flatMap((s) => s.symbols.map((x) => x.nonterminal))).toEqual([
			true,
			false,
			true
		]);
		// OTHER is a terminal unless it is listed.
		const other = chainForms([['E'], ['OTHER']], [{ index: 0, length: 1 }], ['E']);
		expect(other[1].segments[0].symbols[0]).toMatchObject({ text: 'OTHER', nonterminal: false });
	});

	it('leaves forms unmarked without steps', () => {
		expect(chainForms(forms).map(show)).toEqual(['E', 'E * E', '( E ) * E', '( E + E ) * E']);
		expect(chainForms(forms).map((f) => f.index)).toEqual([0, 1, 2, 3]);
	});

	it('marks nothing in the next form for an ε-production', () => {
		// S → ( S ) → ( ) with S → ε.
		const chain = chainForms(
			[['S'], ['(', 'S', ')'], ['(', ')']],
			[
				{ index: 0, length: 3 },
				{ index: 1, length: 0 }
			],
			['S']
		);
		expect(chain.map(show)).toEqual(['*[S]*', '{( *[S]* )}', '( )']);
	});

	it('shows an empty form as ε', () => {
		const chain = chainForms([['S'], []], [{ index: 0, length: 0 }], ['S']);
		expect(chain[1]).toMatchObject({ empty: true, text: 'ε', segments: [] });
		expect(chain.map(show)).toEqual(['*[S]*', 'ε']);
	});

	it('marks nothing after the last form', () => {
		const chain = chainForms(
			[['E'], ['int']],
			[
				{ index: 0, length: 1 },
				{ index: 0, length: 1 }
			],
			['E']
		);
		expect(chain.map(show)).toEqual(['*[E]*', '{int}']);
	});

	it('ignores steps that do not point at a symbol and clips long replacements', () => {
		expect(chainForms([['E'], ['T']], [{ index: 4, length: 1 }]).map(show)).toEqual(['E', 'T']);
		expect(chainForms([['E'], ['T']], [{ index: -1, length: 1 }]).map(show)).toEqual(['E', 'T']);
		expect(chainForms([['E'], ['T']], [{ index: 0.5, length: 1 }]).map(show)).toEqual(['E', 'T']);
		expect(chainForms([['E'], ['T']], [{ index: 0, length: 9 }]).map(show)).toEqual([
			'*[E]*',
			'{T}'
		]);
	});

	it('gives each form as text', () => {
		expect(chainForms(forms, steps).map((f) => f.text)).toEqual([
			'E',
			'E * E',
			'( E ) * E',
			'( E + E ) * E'
		]);
		expect(chainForms([])).toEqual([]);
	});
});

describe('formText', () => {
	it('joins symbols with spaces and writes the empty form as ε', () => {
		expect(formText(['E', '+', 'T'])).toBe('E + T');
		expect(formText([])).toBe('ε');
	});
});
