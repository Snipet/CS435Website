import { describe, expect, it } from 'vitest';
import {
	compareGrammars,
	leftRecursion,
	ll1Table,
	parseGrammar,
	type Grammar
} from '$lib/theory/grammar';
import { random, randomGrammar } from '$lib/theory/grammar/test-helpers';
import { BOTTOM_UP, SLIDE_5, SLIDE_6 } from './presets';
import { MAX_ALTERNATIVES, readName, rewriteForLL1 } from './rewrite';

const grammar = (text: string): Grammar => {
	const { grammar, diagnostics } = parseGrammar(text);
	if (!grammar) throw new Error(JSON.stringify(diagnostics));
	return grammar;
};

const rewrite = (text: string, names?: Record<string, string>) =>
	rewriteForLL1(grammar(text), { names });

describe('rewriteForLL1', () => {
	it('left-factors the grammar of slide 5 into the grammar of slide 6, without EBNF', () => {
		const r = rewrite(SLIDE_5, { 'E’': 'X', 'T’': 'Y' });
		expect(r.text).toBe(SLIDE_6);
		expect(r.text).toBe('E → T X\nX → + E | ε\nT → int Y | ( E )\nY → * T | ε');
		expect(r.before).toBe(SLIDE_5);
		expect(r.fresh).toEqual([
			{ key: 'E’', base: 'E', name: 'X', error: null },
			{ key: 'T’', base: 'T', name: 'Y', error: null }
		]);
		expect(r.changes.map((c) => [c.kind, c.before, c.after])).toEqual([
			['left-factor', ['E → T + E | T'], ['E → T X', 'X → + E | ε']],
			['left-factor', ['T → int | int * T | ( E )'], ['T → int Y | ( E )', 'Y → * T | ε']]
		]);
		expect(r.changes[0].text).toBe(
			'T + E and T share the prefix T: they become T X, and the new non-terminal X derives what follows the prefix.'
		);
		expect(r.changes[0].cite).toEqual({ deck: '12', slide: 6 });
		expect(r.notes).toEqual([]);
		// The result is LL(1): the table of slide 7.
		expect(ll1Table(r.grammar).ll1).toBe(true);
		expect(ll1Table(grammar(SLIDE_5)).ll1).toBe(false);
	});

	it('names new non-terminals A’ by default', () => {
		const r = rewrite(SLIDE_5);
		expect(r.text).toBe('E → T E’\nE’ → + E | ε\nT → int T’ | ( E )\nT’ → * T | ε');
		expect(r.fresh.map((f) => f.name)).toEqual(['E’', 'T’']);
		expect(r.changes[1].after).toEqual(['T → int T’ | ( E )', 'T’ → * T | ε']);
	});

	it('removes the left recursion of Bottom-Up Parsing, slide 3', () => {
		const r = rewrite(BOTTOM_UP);
		expect(r.text).toBe('E → int E’\nE’ → + ( E ) E’ | ε');
		expect(r.changes).toHaveLength(1);
		expect(r.changes[0]).toMatchObject({
			kind: 'left-recursion',
			nonterminal: 'E',
			before: ['E → E + ( E ) | int'],
			after: ['E → int E’', 'E’ → + ( E ) E’ | ε'],
			cite: { deck: '11', slide: [24, 26] }
		});
		expect(r.changes[0].text).toBe(
			'E has the form A → A α | β with α = + ( E ) and β = int. Each β is followed by the new non-terminal E’, which derives any number of α with right recursion.'
		);
		expect(ll1Table(r.grammar).ll1).toBe(true);
	});

	it('removes left recursion from every rule of the precedence cascade', () => {
		const r = rewrite('E → E + T | T\nT → T * F | F\nF → ( E ) | int');
		expect(r.text).toBe('E → T E’\nE’ → + T E’ | ε\nT → F T’\nT’ → * F T’ | ε\nF → ( E ) | int');
		expect(ll1Table(r.grammar).ll1).toBe(true);
	});

	it('removes left recursion through another non-terminal (Top-Down Parsing, slide 27)', () => {
		const r = rewrite('S → A a | d\nA → S b');
		expect(r.changes.map((c) => c.kind)).toEqual(['substitution', 'left-recursion']);
		expect(r.changes[0].after).toEqual(['A → A a b | d b']);
		expect(r.changes[0].cite).toEqual({ deck: '11', slide: 27 });
		expect(r.text).toBe('S → A a | d\nA → d b A’\nA’ → a b A’ | ε');
		expect(leftRecursion(r.grammar)).toEqual([]);
	});

	it('factors the rests again when they share a prefix', () => {
		const r = rewrite('A → a b c | a b d | a e');
		expect(r.text).toBe('A → a A’\nA’ → b A’’ | e\nA’’ → c | d');
		expect(r.changes.map((c) => c.nonterminal)).toEqual(['A', 'A’']);
	});

	it('keeps a grammar without left recursion or common prefixes as it is', () => {
		const r = rewrite(SLIDE_6);
		expect(r.changes).toEqual([]);
		expect(r.fresh).toEqual([]);
		expect(r.text).toBe(SLIDE_6);
	});

	it('drops A → A and leaves a rule without β as it is', () => {
		const loop = rewrite('S → S | a');
		expect(loop.text).toBe('S → a');
		expect(loop.changes[0].kind).toBe('dropped');
		const stuck = rewrite('S → a B\nB → B b');
		expect(stuck.notes.map((n) => n.message)).toEqual([
			'Every alternative of B starts with B, so it derives no string of terminals and there is no β to start from. Its rule is left as it is.',
			'Left recursion remains: B. It goes through a non-terminal that derives ε, or the general algorithm stopped.'
		]);
	});

	it('keeps the names asked for only when they can be used', () => {
		const r = rewrite(SLIDE_5, { 'E’': 'T', 'T’': 'two words' });
		expect(r.fresh).toEqual([
			{ key: 'E’', base: 'E', name: 'E’', error: 'T is already a symbol of the grammar.' },
			{ key: 'T’', base: 'T', name: 'T’', error: 'A name is one symbol, such as X or E’.' }
		]);
		const same = rewrite(SLIDE_5, { 'E’': 'Z', 'T’': 'Z' });
		expect(same.fresh.map((f) => [f.name, f.error])).toEqual([
			['Z', null],
			['T’', 'Z is the name of another new non-terminal.']
		]);
		// A default name another new non-terminal asked for is primed again.
		const taken = rewrite(SLIDE_5, { 'E’': 'T’' });
		expect(taken.fresh.map((f) => f.name)).toEqual(['T’', 'T’’']);
		expect(taken.text).toBe('E → T T’\nT’ → + E | ε\nT → int T’’ | ( E )\nT’’ → * T | ε');
		// Swapped names are fine; X' is read as X’.
		expect(rewrite(SLIDE_5, { 'E’': 'T’', 'T’': 'E’' }).fresh.map((f) => f.name)).toEqual([
			'T’',
			'E’'
		]);
		expect(rewrite(SLIDE_5, { 'E’': "X'" }).fresh[0].name).toBe('X’');
		// A name equal to the default is the default.
		expect(rewrite(SLIDE_5, { 'E’': 'E’' }).fresh[0]).toMatchObject({ name: 'E’', error: null });
	});

	it('keeps the language of every grammar it rewrites', () => {
		const next = random(17);
		let changed = 0;
		for (let i = 0; i < 150; i++) {
			const g = randomGrammar(next);
			const r = rewriteForLL1(g);
			if (r.changes.length > 0) changed++;
			const compared = compareGrammars(g, r.grammar, { maxLength: 5 });
			expect(compared.onlyA, r.before).toEqual([]);
			expect(compared.onlyB, r.text).toEqual([]);
			// The result reads back as itself.
			expect(parseGrammar(r.text).grammar?.productions.map((p) => [p.lhs, p.rhs])).toEqual(
				r.grammar.productions.map((p) => [p.lhs, p.rhs])
			);
		}
		expect(changed).toBeGreaterThan(30);
	});

	it('stops substituting when a non-terminal gets too many alternatives', () => {
		const many = Array.from({ length: MAX_ALTERNATIVES }, (_, i) => `a${i}`).join(' | ');
		const text = `S → A A | x\nA → B B | y\nB → S | ${many}`;
		const r = rewrite(text);
		expect(MAX_ALTERNATIVES).toBe(200);
		expect(r.notes[0].message).toBe(
			'Substituting S into B gives more than 200 alternatives. The rewrite stops removing left recursion here.'
		);
	});
});

describe('readName', () => {
	const taken = new Set(['E', 'T', 'int']);

	it('reads one symbol, primes included', () => {
		expect(readName('X', taken)).toEqual({ name: 'X', error: null });
		expect(readName(" E' ", taken)).toEqual({ name: 'E’', error: null });
		expect(readName('expr-tail', taken)).toEqual({ name: 'expr-tail', error: null });
	});

	it('says why a name cannot be used', () => {
		expect(readName('', taken).error).toBe('Write a name for the new non-terminal.');
		expect(readName('E', taken).error).toBe('E is already a symbol of the grammar.');
		expect(readName('X Y', taken).error).toBe('A name is one symbol, such as X or E’.');
		expect(readName('→', taken).error).toBe('A name is one symbol, such as X or E’.');
		expect(readName('ε', taken).error).toBe('ε is the empty string.');
		expect(readName('$', taken).error).toBe('$ marks the end of the input.');
		expect(readName('(', taken).error).toBe('A name has a letter or a digit, such as X or E’.');
	});
});
