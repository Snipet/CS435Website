import { describe, expect, it } from 'vitest';
import { parseGrammar, type Grammar } from '$lib/theory/grammar';
import { ARITHMETIC, CASCADE, ENGLISH } from './presets';
import { spellingOf } from './spelling';
import { CHOMSKY_TABLE, chomskyOf, productionNumbers, tupleOf } from './tuple';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

describe('the four-tuple (Introduction to Parsing, slide 14)', () => {
	it('lists N, T, S and the numbered productions of the arithmetic grammar', () => {
		const t = tupleOf(grammar(ARITHMETIC));
		expect(t.nonterminals).toBe('{ E }');
		expect(t.terminals).toBe('{ int, +, *, (, ) }');
		expect(t.start).toBe('E');
		expect(t.productions.map((p) => `${p.number}. ${p.lhs} → ${p.rhs}`)).toEqual([
			'1. E → int',
			'2. E → E + E',
			'3. E → E * E',
			'4. E → ( E )'
		]);
		expect(t.warnings).toEqual([]);
	});

	it('writes one production per alternative and ε for an empty right-hand side', () => {
		const t = tupleOf(grammar('S → ε | ( S )'));
		expect(t.productions.map((p) => `${p.lhs} → ${p.rhs}`)).toEqual(['S → ε', 'S → ( S )']);
		expect(tupleOf(grammar(CASCADE)).productions).toHaveLength(6);
	});

	it('quotes terminals of several words', () => {
		const t = tupleOf(grammar(ENGLISH));
		expect(t.terminals).toBe('{ "the cat", "the mat", "the floor", sat, saw, on, under }');
		expect(t.start).toBe('Sentence');
		expect(t.productions[6]).toMatchObject({ number: 7, lhs: 'Noun', rhs: '"the cat"' });
	});

	it('keeps the quotes of the grammar text: every terminal of slide 25 is quoted', () => {
		const t = tupleOf(grammar(ENGLISH), spellingOf(ENGLISH));
		expect(t.nonterminals).toBe(
			'{ Sentence, NounPhrase, VerbPhrase, PrepositionalPhrase, Noun, Verb, Preposition }'
		);
		expect(t.terminals).toBe('{ "the cat", "the mat", "the floor", "sat", "saw", "on", "under" }');
		expect(t.start).toBe('Sentence');
		expect(t.productions.slice(6).map((p) => `${p.lhs} → ${p.rhs}`)).toEqual([
			'Noun → "the cat"',
			'Noun → "the mat"',
			'Noun → "the floor"',
			'Verb → "sat"',
			'Verb → "saw"',
			'Preposition → "on"',
			'Preposition → "under"'
		]);
	});

	it('names symbols in its warnings as the grammar writes them', () => {
		const text = 'S → "a"\n"Rest" → "b"';
		expect(tupleOf(grammar(text), spellingOf(text)).warnings).toEqual([
			'"Rest" is not reachable from the start symbol S.'
		]);
	});

	it('warns about non-terminals that are never reached or derive no terminal string', () => {
		expect(tupleOf(grammar('S → a\nA → b\nB → c')).warnings).toEqual([
			'A, B are not reachable from the start symbol S.'
		]);
		expect(tupleOf(grammar('S → a\nA → b')).warnings).toEqual([
			'A is not reachable from the start symbol S.'
		]);
		expect(tupleOf(grammar('S → a | A\nA → A b')).warnings).toEqual([
			'A derives no string of terminals.'
		]);
		expect(tupleOf(grammar('S → A\nA → A a')).warnings).toEqual([
			'S, A derive no string of terminals.'
		]);
	});
});

describe('the Chomsky hierarchy (slide 23)', () => {
	it('reproduces the table of the slide', () => {
		expect(CHOMSKY_TABLE.map((r) => [r.type, r.language, r.recognizer])).toEqual([
			[0, 'Unrestricted or recursively enumerable', 'Turing machine'],
			[1, 'Context Sensitive', 'Linear Bounded Automaton (ND)'],
			[2, 'Context Free', 'Push-down Automaton (ND)'],
			[3, 'Regular', 'NFA or DFA']
		]);
		expect(CHOMSKY_TABLE.map((r) => r.form.join('; '))).toEqual([
			'αXβ → αδβ; X ∈ N ∪ T; α, β, δ ∈ (N ∪ T)*',
			'αVβ → αδβ; V ∈ N; δ ≠ ε',
			'V → α; V ∈ N; α ∈ (N ∪ T)*',
			'V → w | wU; w ∈ T*; U, V ∈ N'
		]);
	});

	it('calls a grammar of productions V → w | wU type 3', () => {
		for (const text of ['S → 0 | 1', 'S → 1 A\nA → 0 | 1', 'S → 1 A\nA → 0 | 1 A']) {
			const c = chomskyOf(grammar(text));
			expect(c).toMatchObject({
				type: 3,
				name: 'Type 3 (regular)',
				form: 'every production has the form V → w | wU',
				recognizer: 'NFA or DFA',
				breaking: [],
				breakingText: null
			});
			expect(tupleOf(grammar(text)).productions.every((p) => p.regular)).toBe(true);
		}
	});

	it('calls any other grammar type 2 and names the productions that break the form', () => {
		const balanced = chomskyOf(grammar('S → ε | ( S )'));
		expect(balanced).toMatchObject({
			type: 2,
			name: 'Type 2 (context free)',
			form: 'V → α',
			recognizer: 'push-down automaton (ND)',
			breaking: [2]
		});
		expect(balanced.breakingText).toBe('Production 2 does not have the type 3 form V → w | wU.');

		const arithmetic = chomskyOf(grammar(ARITHMETIC));
		expect(arithmetic.breaking).toEqual([2, 3, 4]);
		expect(arithmetic.breakingText).toBe(
			'Productions 2, 3 and 4 do not have the type 3 form V → w | wU.'
		);
		expect(tupleOf(grammar(ARITHMETIC)).productions.map((p) => p.regular)).toEqual([
			true,
			false,
			false,
			false
		]);
	});

	it('shortens a long list of production numbers', () => {
		expect(productionNumbers([4])).toBe('Production 4');
		expect(productionNumbers([1, 2])).toBe('Productions 1 and 2');
		expect(productionNumbers([1, 2, 3, 4, 5, 6, 7, 8])).toBe(
			'Productions 1, 2, 3, 4, 5, 6, 7 and 8'
		);
		expect(productionNumbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(
			'Productions 1, 2, 3, 4, 5, 6, 7 and 5 more'
		);
	});
});
