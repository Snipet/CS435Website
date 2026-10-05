import { describe, expect, it } from 'vitest';
import {
	derivationFromTree,
	parseGrammar,
	recognizes,
	sentenceLengths,
	treeFromDerivation,
	yieldOf,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import { randomGrammar, random as seeded } from '$lib/theory/grammar/test-helpers';
import { derivationKind } from './builder';
import { ARITHMETIC, CASCADE, COOL, ENGLISH } from './presets';
import {
	RANDOM_DEFAULTS,
	freshSeed,
	generator,
	randomSentence,
	shortestExpansions
} from './random';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

/** Number of expansions in a tree. */
function expansions(tree: ParseNode): number {
	let n = 0;
	const stack = [tree];
	while (stack.length > 0) {
		const node = stack.pop()!;
		if (node.terminal) continue;
		n++;
		stack.push(...node.children);
	}
	return n;
}

/** The sentence a call must return for a language that is not empty. */
function sentenceOf(g: Grammar, seed: number, opts = {}) {
	const r = randomSentence(g, seed, opts);
	if (!r.ok) throw new Error(`no sentence: ${r.reason}`);
	return r;
}

describe('generator', () => {
	it('gives the same numbers in [0, 1) for the same seed', () => {
		const a = generator(42);
		const b = generator(42);
		const xs = Array.from({ length: 50 }, () => a());
		expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
		expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
		expect(new Set(xs).size).toBeGreaterThan(40);
		expect(generator(43)()).not.toBe(xs[0]);
	});

	it('makes seeds that fit in 32 bits', () => {
		expect(freshSeed(() => 0)).toBe(0);
		expect(freshSeed(() => 0.5)).toBe(2 ** 31);
		expect(freshSeed(() => 1 - Number.EPSILON)).toBe(2 ** 32 - 1);
		const seed = freshSeed();
		expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
	});
});

describe('shortestExpansions', () => {
	it('finds the shortest string of each non-terminal and the production that starts it', () => {
		const g = grammar(CASCADE);
		const s = shortestExpansions(g);
		const entry = (n: string) => [n, s.get(n)?.length, s.get(n)?.nodes, s.get(n)?.production.id];
		expect(g.nonterminals.map(entry)).toEqual([
			['E', 1, 3, 1],
			['T', 1, 2, 3],
			['F', 1, 1, 4]
		]);
	});

	it('prefers the smaller tree among strings of one length', () => {
		// S → A B | c: both give one token only if A or B is empty.
		const s = shortestExpansions(grammar('S → A B | c\nA → ε\nB → b'));
		expect(s.get('S')).toMatchObject({ length: 1, nodes: 1 });
		expect(s.get('S')!.production.rhs).toEqual(['c']);
	});

	it('has no entry for a non-terminal that derives no terminal string', () => {
		const s = shortestExpansions(grammar('S → a | A\nA → A b'));
		expect(s.has('A')).toBe(false);
		expect(s.get('S')).toMatchObject({ length: 1 });
		expect(shortestExpansions(grammar('S → S a')).size).toBe(0);
	});

	it('agrees with sentenceLengths on random grammars', () => {
		const next = seeded(7);
		for (let i = 0; i < 300; i++) {
			const g = randomGrammar(next);
			expect(shortestExpansions(g).get(g.start)?.length).toBe(sentenceLengths(g)?.min);
		}
	});

	it('handles a long chain of unit productions listed in the worst order', () => {
		const n = 3000;
		const lines = Array.from({ length: n }, (_, i) => `A${i} → A${i + 1}`);
		const g = grammar([...lines, `A${n} → a`].join('\n'));
		const s = shortestExpansions(g);
		expect(s.get('A0')).toMatchObject({ length: 1, nodes: n + 1 });
	});
});

describe('randomSentence', () => {
	it('is the same sentence for the same grammar and seed', () => {
		const g = grammar(ENGLISH);
		for (let seed = 0; seed < 20; seed++)
			expect(randomSentence(g, seed)).toEqual(randomSentence(g, seed));
		const sentences = new Set(
			Array.from({ length: 40 }, (_, seed) => sentenceOf(g, seed).sentence.join(' '))
		);
		expect(sentences.size).toBeGreaterThan(8);
	});

	it.each([
		['the English grammar', ENGLISH],
		['the arithmetic grammar', ARITHMETIC],
		['the COOL fragment', COOL],
		['the cascade grammar', CASCADE],
		['nested parentheses', 'S → ε | ( S )'],
		['a grammar that doubles', 'S → S S | a']
	])('gives sentences of %s with their leftmost derivation', (_, text) => {
		const g = grammar(text);
		for (let seed = 0; seed < 60; seed++) {
			const r = sentenceOf(g, seed);
			expect(recognizes(g, r.sentence)).toBe(true);
			expect(yieldOf(r.tree)).toEqual(r.sentence);
			expect(r.sentence.length).toBeLessThanOrEqual(RANDOM_DEFAULTS.maxLength);
			expect(r.derivation).toEqual(derivationFromTree(g, r.tree, 'leftmost'));
			expect(derivationKind(g, r.derivation).leftmost).toBe(true);
			expect(yieldOf(treeFromDerivation(g, r.derivation))).toEqual(r.sentence);
		}
	});

	it('takes the shortest expansion everywhere at depth 0', () => {
		expect(sentenceOf(grammar(ARITHMETIC), 5, { maxDepth: 0 }).sentence).toEqual(['int']);
		expect(sentenceOf(grammar(ENGLISH), 5, { maxDepth: 0 }).sentence).toEqual(['the cat', 'sat']);
		expect(sentenceOf(grammar('S → ε | ( S )'), 5, { maxDepth: 0 }).sentence).toEqual([]);
	});

	it('follows the length bound when the grammar allows it', () => {
		const g = grammar(ARITHMETIC);
		for (let seed = 0; seed < 40; seed++) {
			expect(sentenceOf(g, seed, { maxLength: 3 }).sentence.length).toBeLessThanOrEqual(3);
			expect(sentenceOf(g, seed, { maxLength: 1 }).sentence).toEqual(['int']);
		}
		// Every sentence of S → a a a is longer than the bound: it is still given.
		expect(sentenceOf(grammar('S → a a a'), 1, { maxLength: 2 }).sentence).toEqual(['a', 'a', 'a']);
	});

	it('stops choosing at random after the choice budget', () => {
		// Each S → S S doubles the work, and ε keeps every sentence within the length bound.
		const g = grammar('S → S S | ε');
		for (let seed = 0; seed < 40; seed++) {
			const r = sentenceOf(g, seed, { maxDepth: 50, maxChoices: 25 });
			// Every choice opens at most two non-terminals, each closed by one S → ε.
			expect(expansions(r.tree)).toBeLessThanOrEqual(25 + 26);
			expect(r.sentence).toEqual([]);
		}
	});

	it('reports an empty language', () => {
		expect(randomSentence(grammar('S → S a'), 1)).toEqual({ ok: false, reason: 'empty' });
		expect(randomSentence(grammar('S → A\nA → A a'), 1)).toEqual({ ok: false, reason: 'empty' });
	});

	it('never uses a production that leads to no sentence', () => {
		const g = grammar('S → a | A | S b\nA → A c');
		for (let seed = 0; seed < 60; seed++) {
			const r = sentenceOf(g, seed);
			expect(r.sentence).not.toContain('c');
			expect(recognizes(g, r.sentence)).toBe(true);
		}
	});

	it('gives up on a tree that passes the node limit', () => {
		// The only sentence has 2¹² tokens.
		const lines = Array.from({ length: 12 }, (_, i) => `A${i} → A${i + 1} A${i + 1}`);
		const g = grammar([...lines, 'A12 → a'].join('\n'));
		expect(randomSentence(g, 1)).toEqual({ ok: false, reason: 'too-large' });
	});

	it('returns a sentence or a reason for random grammars, within the node limit', () => {
		const next = seeded(11);
		for (let i = 0; i < 400; i++) {
			const g = randomGrammar(next);
			const r = randomSentence(g, i);
			if (!r.ok) {
				expect(r.reason === 'empty' ? sentenceLengths(g) : 'too-large').toBe(
					r.reason === 'empty' ? null : 'too-large'
				);
				continue;
			}
			expect(recognizes(g, r.sentence)).toBe(true);
			expect(expansions(r.tree)).toBeLessThanOrEqual(RANDOM_DEFAULTS.maxNodes);
			expect(r.derivation.steps).toHaveLength(expansions(r.tree));
		}
	});
});
