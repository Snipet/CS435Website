import { describe, expect, it } from 'vitest';
import { describeTree } from '$lib/components/grammar/tree-layout';
import { chainForms, formText } from '$lib/components/grammar/derivation-chain';
import { bracketForm, parseGrammar, parseTrees } from '$lib/theory/grammar';
import type { Declaration } from './declarations';
import {
	EXTRA_LIMIT,
	MAX_TOKENS,
	POOL_LIMIT,
	TREE_LIMIT,
	TREE_TONES,
	analyzeDeclarations,
	analyzeRewrite,
	assignValues,
	countText,
	declarationSummary,
	leafLabeler,
	leftmostChain,
	listTrees,
	listedText,
	placeOf,
	readSource,
	rewriteSummary,
	selectedTree,
	shownText,
	stringText,
	treeEntry,
	treeTitle,
	treeTone,
	verdictNote,
	verdictText,
	verdictTone,
	type Source
} from './model';
import { AMBIGUOUS, CASCADE, DANGLING_ELSE } from './presets';
import { shapeKey, shapeOf } from './shape';

const source = (grammar: string, input: string, more: { labels?: string; values?: string } = {}) =>
	readSource({ grammar, input, labels: more.labels ?? '', values: more.values ?? '' });

const listing = (s: Source) => listTrees(s.grammar!, s);

/** `int + int + … + int` with n operands. */
const sum = (n: number, op = '+') => Array.from({ length: n }, () => 'int').join(` ${op} `);
/** The grouping of n operands that nests to the left: `((int + int) + int) + int`. */
const leftNested = (n: number, op = '+') =>
	Array.from({ length: n - 1 }).reduce<string>(
		(text, _, i) => `${i === 0 ? text : `(${text})`} ${op} int`,
		'int'
	);
/** … and to the right: `int + (int + (int + int))`. */
const rightNested = (n: number, op = '+') =>
	Array.from({ length: n - 1 }).reduce<string>(
		(text, _, i) => `int ${op} ${i === 0 ? text : `(${text})`}`,
		'int'
	);
const left = (ops: string): Declaration => ({ assoc: 'left', ops });
const right = (ops: string): Declaration => ({ assoc: 'right', ops });
const nonassoc = (ops: string): Declaration => ({ assoc: 'nonassoc', ops });

describe('readSource', () => {
	it('reads a grammar and a string of its terminals', () => {
		const s = source(AMBIGUOUS, 'int * int + int');
		expect(s.ready).toBe(true);
		expect(s.tokens).toEqual(['int', '*', 'int', '+', 'int']);
		expect(s.display).toEqual(s.tokens);
		expect(s.labelled).toBe(false);
		expect(s.grammarDiagnostics).toEqual([]);
		expect(s.inputDiagnostics).toEqual([]);
	});

	it('reports tokens that are not terminals, with their place in the string', () => {
		const s = source(AMBIGUOUS, 'int - E');
		expect(s.ready).toBe(false);
		expect(s.inputDiagnostics.map((d) => [d.message, d.span?.start])).toEqual([
			['- is not a terminal of the grammar.', 4],
			['E is a non-terminal. The input is a string of terminals.', 6]
		]);
	});

	it('is not ready without a grammar, and then says nothing about the tokens', () => {
		const s = source('E → ', 'int + int');
		expect(s.grammar).toBeNull();
		expect(s.ready).toBe(false);
		expect(s.grammarDiagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(s.inputDiagnostics).toEqual([]);
	});

	it('limits the length of the string', () => {
		const long = Array.from({ length: MAX_TOKENS / 2 + 1 }, () => 'int').join(' + ');
		const s = source(AMBIGUOUS, long);
		expect(s.tokens).toHaveLength(MAX_TOKENS + 1);
		expect(s.ready).toBe(false);
		expect(s.inputDiagnostics.map((d) => d.message)).toEqual([
			`The string has ${MAX_TOKENS + 1} tokens. Trees are listed for strings of up to ${MAX_TOKENS} tokens.`
		]);
		const fits = source(AMBIGUOUS, long.slice('int + '.length));
		expect(fits.tokens).toHaveLength(MAX_TOKENS - 1);
		expect(fits.ready).toBe(true);
	});

	it('applies the occurrence labels to the display only', () => {
		const s = source(DANGLING_ELSE, 'if OTHER then OTHER', { labels: 'OTHER = E, int = n' });
		expect(s.tokens).toEqual(['if', 'OTHER', 'then', 'OTHER']);
		expect(s.display).toEqual(['if', 'E₁', 'then', 'E₂']);
		expect(s.labelled).toBe(true);
		expect(s.labelProblems).toEqual(['int is not a terminal of the grammar.']);
		expect(s.ready).toBe(true);
	});

	it('reads the operand values', () => {
		expect(source(AMBIGUOUS, 'int', { values: '2 x' }).valuesError).toBe('x is not a number.');
		expect(source(AMBIGUOUS, 'int', { values: '2' }).values).toEqual([{ text: '2', value: 2 }]);
	});
});

describe('listTrees', () => {
	it('lists the trees in slide order with bracket form, grouping and value', () => {
		const l = listing(source(AMBIGUOUS, 'int * int + int', { values: '2 3 4' }));
		expect(l.truncated).toBe(false);
		expect(l.valuesNote).toBeNull();
		expect(
			l.trees.map((t) => [t.number, t.bracket, t.grouping, t.key, t.value?.ok && t.value.value])
		).toEqual([
			[1, 'E( E( E(int) * E(int) ) + E(int) )', '(int * int) + int', '[[int * int] + int]', 10],
			[2, 'E( E(int) * E( E(int) + E(int) ) )', 'int * (int + int)', '[int * [int + int]]', 14]
		]);
		expect(l.trees.map((t) => describeTree(t.abbreviated!))).toEqual([
			'+ ( * ( int int ) int )',
			'* ( int + ( int int ) )'
		]);
	});

	it('has no values without numbers, and says when their number does not fit', () => {
		const none = listing(source(AMBIGUOUS, 'int + int'));
		expect(none.trees.map((t) => t.value)).toEqual([null]);
		expect(none.valuesNote).toBeNull();
		const few = listing(source(AMBIGUOUS, 'int + int + int', { values: '1 2' }));
		expect(few.trees.map((t) => t.value)).toEqual([null, null]);
		expect(few.valuesNote).toBe('The string has 3 operands and the field has 2 values.');
		const one = listing(source(AMBIGUOUS, 'int', { values: '1 2' }));
		expect(one.valuesNote).toBe('The string has 1 operand and the field has 2 values.');
	});

	it('lists the first trees of a string that has more, and counts them all', () => {
		const l = listing(source(AMBIGUOUS, sum(8)));
		expect(l.trees).toHaveLength(TREE_LIMIT);
		expect(l.truncated).toBe(true);
		expect(l.total).toBe(429);
		expect(l.all).toHaveLength(429);
		expect(countText(l)).toBe('429 parse trees');
		expect(verdictText(l)).toBe('429 parse trees: the grammar is ambiguous');
		expect(listedText(l)).toBe('… and more: the first 20 of the 429 parse trees are listed.');
		expect(shownText(l, 20)).toBe('… and more: 20 of the 429 parse trees are shown.');
		expect(l.trees.map((t) => t.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
	});

	it('puts the trees in slide order before it cuts the list: the left-nested tree comes first', () => {
		// Six operands have 42 trees, and the parser finds the right-nested ones first.
		for (const n of [6, 7, 8]) {
			const s = source(AMBIGUOUS, sum(n));
			const l = listing(s);
			expect(l.trees[0].grouping).toBe(leftNested(n));
			expect(l.truncated).toBe(true);
			// The list is the start of all the trees in slide order.
			expect(l.trees.map((t) => t.tree)).toEqual(l.all!.slice(0, TREE_LIMIT));
			expect(bracketForm(l.all![l.all!.length - 1])).toBe(
				parseTrees(s.grammar!, s.tokens, { limit: 1 }).trees.map(bracketForm)[0]
			);
		}
		expect(listing(source(AMBIGUOUS, sum(6))).total).toBe(42);
		expect(listing(source(AMBIGUOUS, sum(8))).total).toBe(429);
		const mixed = listing(source(AMBIGUOUS, 'int + int * int + int * int + int'));
		expect(mixed.trees[0].grouping).toBe('((((int + int) * int) + int) * int) + int');
	});

	it('counts a string with more trees than it puts in order as "more than"', () => {
		// Nine operands: 1430 trees.
		const s = source(AMBIGUOUS, sum(9));
		const l = listing(s);
		expect(l.trees).toHaveLength(TREE_LIMIT);
		expect(l.truncated).toBe(true);
		expect(l.total).toBeNull();
		expect(l.all).toBeNull();
		expect(countText(l)).toBe('More than 500 parse trees');
		expect(verdictText(l)).toBe('More than 500 parse trees: the grammar is ambiguous');
		expect(verdictTone(l)).toBe('active');
		expect(listedText(l)).toBe('… and more: 20 of more than 500 parse trees are listed.');
		expect(shownText(l, 20)).toBe('… and more: 20 of more than 500 parse trees are shown.');
		expect(POOL_LIMIT).toBe(500);
		// The left-nested tree is still first, and no tree is listed twice.
		expect(l.trees[0].grouping).toBe(leftNested(9));
		expect(new Set(l.trees.map((t) => t.bracket)).size).toBe(TREE_LIMIT);
		const mixed = listing(
			source(AMBIGUOUS, 'int * int + int * int + int * int + int * int + int * int')
		);
		expect(mixed.total).toBeNull();
		expect(mixed.trees[0].grouping).toBe(
			'((((((((int * int) + int) * int) + int) * int) + int) * int) + int) * int'
		);
	});

	it('lists the trees of a 39-token string quickly', () => {
		const s = source(AMBIGUOUS, sum(20, '*'));
		const start = performance.now();
		const l = listing(s);
		expect(l.trees).toHaveLength(TREE_LIMIT);
		expect(l.trees[0].grouping).toBe(leftNested(20, '*'));
		// Generous for slow CI machines; it takes about 20 milliseconds.
		expect(performance.now() - start).toBeLessThan(1500);
	});

	it('finds the place of a tree among all the trees, and names a tree without one', () => {
		const s = source(AMBIGUOUS, sum(6));
		const l = listing(s);
		const [first] = parseTrees(s.grammar!, s.tokens, { limit: 1 }).trees;
		expect(placeOf(l, first)).toBe(42);
		expect(placeOf(l, l.trees[4].tree)).toBe(5);
		const entry = treeEntry(s.grammar!, s, first, placeOf(l, first));
		expect(entry).toMatchObject({ number: 42, grouping: rightNested(6) });
		expect(treeTitle(entry)).toBe('Tree 42');
		expect(placeOf({ all: null }, first)).toBe(0);
		expect(treeTitle({ number: 0 })).toBe('Another tree');
		// A tree of another string is none of them.
		expect(placeOf(l, listing(source(AMBIGUOUS, 'int')).trees[0].tree)).toBe(0);
	});

	it('labels groupings with the display names', () => {
		const s = source(DANGLING_ELSE, 'if OTHER then if OTHER then OTHER else OTHER', {
			labels: 'OTHER = E'
		});
		expect(listing(s).trees.map((t) => t.grouping)).toEqual([
			'if E₁ then (if E₂ then E₃) else E₄',
			'if E₁ then (if E₂ then E₃ else E₄)'
		]);
	});

	it('lists the tree of the empty string', () => {
		const s = source('S → a S | ε', '');
		const l = listing(s);
		expect(l.trees.map((t) => [t.bracket, t.grouping, t.abbreviated])).toEqual([
			['S(ε)', 'ε', null]
		]);
	});

	it('has no abbreviated tree under a grammar without operand terminals', () => {
		// No terminal is a whole right-hand side: abbreviating would keep the first a of each node.
		const l = listing(source('S → a S b | ε', 'a a b b'));
		expect(l.trees.map((t) => [t.grouping, t.abbreviated])).toEqual([['a (a b) b', null]]);
		// With an operand, the keywords around it are left out.
		const withOperand = listing(source('S → a S b | x', 'a a x b b'));
		expect(withOperand.trees.map((t) => describeTree(t.abbreviated!))).toEqual(['a ( a ( x ) )']);
	});
});

describe('verdictText', () => {
	it('says one tree, several trees (ambiguous) or none', () => {
		expect(verdictText(listing(source(AMBIGUOUS, 'int')))).toBe('1 parse tree');
		expect(verdictText(listing(source(AMBIGUOUS, 'int + int + int')))).toBe(
			'2 parse trees: the grammar is ambiguous'
		);
		expect(verdictText(listing(source(AMBIGUOUS, 'int + int + int + int')))).toBe(
			'5 parse trees: the grammar is ambiguous'
		);
		const none = listing(source(AMBIGUOUS, 'int +'));
		expect(verdictText(none)).toBe('No parse tree: the grammar does not generate the string');
		expect(verdictText(none, 'the rewritten grammar')).toBe(
			'No parse tree: the rewritten grammar does not generate the string'
		);
		expect(countText(none)).toBe('No parse tree');
	});
});

describe('verdictTone and treeTone', () => {
	it('tones one tree, several trees and no tree differently', () => {
		expect(verdictTone(listing(source(AMBIGUOUS, 'int')))).toBe('accept');
		expect(verdictTone(listing(source(AMBIGUOUS, 'int + int + int')))).toBe('active');
		expect(verdictTone(listing(source(AMBIGUOUS, 'int +')))).toBe('reject');
		expect(verdictNote(listing(source(AMBIGUOUS, 'int')))).toBeNull();
		expect(verdictNote(listing(source(AMBIGUOUS, 'int + int + int')))).toBe(
			'the grammar is ambiguous'
		);
	});

	it('alternates two colors over the trees of a string', () => {
		expect(TREE_TONES).toHaveLength(2);
		expect([1, 2, 3, 4].map(treeTone)).toEqual([
			TREE_TONES[0],
			TREE_TONES[1],
			TREE_TONES[0],
			TREE_TONES[1]
		]);
		expect(treeTone(0)).toBe(TREE_TONES[0]);
		expect(stringText(['int', '*', 'int'])).toBe('int * int');
	});
});

describe('assignValues', () => {
	it('gives the k-th operand token the k-th value', () => {
		const s = source('E → E + E | ( E ) | int | id', '( int + id )', { values: '4 5' });
		const { at, note } = assignValues(s.grammar!, s.tokens, s.values);
		expect(note).toBeNull();
		expect([...at].map(([i, v]) => [i, v.value])).toEqual([
			[1, 4],
			[3, 5]
		]);
	});
});

describe('leafLabeler', () => {
	it('relabels the leaves that stand for labelled tokens', () => {
		const s = source(DANGLING_ELSE, 'if OTHER then OTHER', { labels: 'OTHER = E' });
		const [entry] = listing(s).trees;
		const labels = leafLabeler(s.display);
		expect(describeTree(entry.tree, labels)).toBe('E ( if E ( E₁ ) then E ( E₂ ) )');
		expect(describeTree(entry.abbreviated!, labels)).toBe('if ( E₁ E₂ )');
		// Non-terminals, and leaves without a token index, keep their symbols.
		expect(labels(entry.tree, [])).toBeNull();
		expect(labels({ symbol: 'OTHER', terminal: true, children: [] }, [])).toBeNull();
	});
});

describe('leftmostChain', () => {
	it('gives the two leftmost derivations of int + int + int', () => {
		const s = source(AMBIGUOUS, 'int + int + int');
		const chains = listing(s).trees.map((t) => leftmostChain(s.grammar!, t.tree));
		expect(chains.map((c) => c.forms.map((f) => f.join(' ')))).toEqual([
			['E', 'E + E', 'E + E + E', 'int + E + E', 'int + int + E', 'int + int + int'],
			['E', 'E + E', 'int + E', 'int + E + E', 'int + int + E', 'int + int + int']
		]);
		expect(chains[0].steps).toEqual([
			{ index: 0, length: 3 },
			{ index: 0, length: 3 },
			{ index: 0, length: 1 },
			{ index: 2, length: 1 },
			{ index: 4, length: 1 }
		]);
		// DerivationChain takes them as they are.
		const forms = chainForms(chains[0].forms, chains[0].steps, s.grammar!.nonterminals);
		expect(forms).toHaveLength(6);
		expect(
			forms[1].segments.map((seg) => [seg.made, seg.symbols.map((x) => x.text).join(' ')])
		).toEqual([[true, 'E + E']]);
		expect(forms[1].segments[0].symbols.map((x) => x.replaced)).toEqual([true, false, false]);
		expect(formText(chains[1].forms[2])).toBe('int + E');
	});
});

describe('analyzeRewrite', () => {
	const s = source(AMBIGUOUS, 'int * int + int');
	const original = listing(s);

	it('is empty without a rewritten grammar', () => {
		const r = analyzeRewrite(s, original, '  \n');
		expect(r).toMatchObject({ empty: true, grammar: null, listing: null, matches: [] });
	});

	it('crosses out the original tree that the cascade has no counterpart for (slide 10)', () => {
		const r = analyzeRewrite(s, original, CASCADE);
		expect(r.diagnostics).toEqual([]);
		expect(r.unknown).toEqual([]);
		expect(r.listing!.trees.map((t) => t.bracket)).toEqual([
			'E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )'
		]);
		expect(r.matches).toEqual([1, null]);
		expect(r.origins).toEqual([1]);
	});

	it('keeps every original tree when the rewrite is the same grammar', () => {
		const r = analyzeRewrite(s, original, AMBIGUOUS);
		expect(r.matches).toEqual([1, 2]);
		expect(r.origins).toEqual([1, 2]);
		expect(verdictText(r.listing!, 'the rewritten grammar')).toBe(
			'2 parse trees: the rewritten grammar is ambiguous'
		);
	});

	it('crosses out the other tree for a cascade with the levels swapped', () => {
		const r = analyzeRewrite(s, original, 'E → E * T | T\nT → T + F | F\nF → int | ( E )');
		expect(r.listing!.trees.map((t) => t.grouping)).toEqual(['int * (int + int)']);
		expect(r.matches).toEqual([null, 1]);
		expect(r.origins).toEqual([2]);
	});

	it('reports a rewritten grammar with errors', () => {
		const r = analyzeRewrite(s, original, 'E → E + | ');
		expect(r.grammar).toBeNull();
		expect(r.listing).toBeNull();
		expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
	});

	it('names the tokens the rewritten grammar does not have, and then has no tree', () => {
		const r = analyzeRewrite(s, original, 'E → E + T | T\nT → int');
		expect(r.unknown).toEqual(['*']);
		expect(r.listing!.trees).toEqual([]);
		expect(r.matches).toEqual([null, null]);
	});

	it('gives an origin of null to a tree with a new structure', () => {
		// Right-recursive after removing the left recursion: no original tree groups like this.
		const r = analyzeRewrite(
			source(AMBIGUOUS, 'int + int'),
			listing(source(AMBIGUOUS, 'int + int')),
			'E → T R\nR → + T R | ε\nT → int'
		);
		expect(r.listing!.trees.map((t) => t.key)).toEqual(['[int [+ int]]']);
		expect(r.matches).toEqual([null]);
		expect(r.origins).toEqual([null]);
		expect(r.comparable).toBe(false);
	});

	it('draws the original trees it was given, and is comparable when a tree is kept', () => {
		const r = analyzeRewrite(s, original, CASCADE);
		expect(r.originals).toEqual(original.trees);
		expect(r.extra).toBe(0);
		expect(r.comparable).toBe(true);
		expect(rewriteSummary(original, r)).toBe(
			'1 of the 2 trees is crossed out: no tree of the rewritten grammar has its structure.'
		);
		const same = analyzeRewrite(s, original, AMBIGUOUS);
		expect(rewriteSummary(original, same)).toBe(
			'All 2 trees have the structure of a tree of the rewritten grammar.'
		);
		// No tree at all under the rewritten grammar: the string is not in its language.
		const none = analyzeRewrite(s, original, 'E → E + T | T\nT → int');
		expect(none.comparable).toBe(true);
		expect(rewriteSummary(original, none)).toBe(
			'2 of the 2 trees are crossed out: no tree of the rewritten grammar has their structure.'
		);
		const one = source(AMBIGUOUS, 'int');
		expect(rewriteSummary(listing(one), analyzeRewrite(one, listing(one), CASCADE))).toBe(
			'Its tree has the structure of a tree of the rewritten grammar.'
		);
		const gone = analyzeRewrite(one, listing(one), 'E → int + int');
		expect(rewriteSummary(listing(one), gone)).toBe(
			'The tree is crossed out: no tree of the rewritten grammar has its structure.'
		);
		const empty = source(AMBIGUOUS, 'int +');
		expect(rewriteSummary(listing(empty), analyzeRewrite(empty, listing(empty), CASCADE))).toBe(
			'The original grammar has no parse tree for the string.'
		);
	});
});

describe('analyzeRewrite for a string with more trees than are listed', () => {
	/** Every tree's shape under a grammar, to check an answer against. */
	const shapes = (grammar: string, input: string) => {
		const g = parseGrammar(grammar).grammar!;
		const s = source(grammar, input);
		return new Set(
			parseTrees(g, s.tokens, { limit: 100_000 }).trees.map((t) => shapeKey(shapeOf(t)))
		);
	};

	it('matches the cascade’s tree with the left-nested tree of 42 (six operands)', () => {
		const s = source(AMBIGUOUS, sum(6));
		const original = listing(s);
		expect(original.total).toBe(42);
		const r = analyzeRewrite(s, original, CASCADE);
		expect(r.listing!.trees.map((t) => t.grouping)).toEqual([leftNested(6)]);
		// The rewritten grammar's tree has a counterpart: tree 1 of the original grammar.
		expect(r.origins).toEqual([1]);
		expect(r.extra).toBe(0);
		expect(r.originals).toEqual(original.trees);
		expect(r.matches).toEqual([1, ...Array.from({ length: 19 }, () => null)]);
		expect(r.comparable).toBe(true);
		expect(rewriteSummary(original, r)).toBe(
			'19 of the 20 trees shown are crossed out: no tree of the rewritten grammar has their structure.'
		);
	});

	it('finds the kept tree when it is not one of the listed trees, and draws it first', () => {
		// Right recursion keeps the right-nested tree, the last of the 42.
		const s = source(AMBIGUOUS, sum(6), { values: '1 2 3 4 5 6' });
		const original = listing(s);
		const r = analyzeRewrite(s, original, 'E → T + E | T\nT → int | ( E )');
		expect(r.listing!.trees.map((t) => t.grouping)).toEqual([rightNested(6)]);
		expect(original.trees.map((t) => t.grouping)).not.toContain(rightNested(6));
		expect(r.origins).toEqual([42]);
		expect(r.extra).toBe(1);
		expect(r.originals).toHaveLength(TREE_LIMIT);
		expect(r.originals[0]).toMatchObject({
			number: 42,
			grouping: rightNested(6),
			value: { ok: true, value: 21, text: '1 + (2 + (3 + (4 + (5 + 6))))' }
		});
		// A tree of the original grammar: the one its parser finds first.
		expect(r.originals[0].tree).toEqual(parseTrees(s.grammar!, s.tokens, { limit: 1 }).trees[0]);
		expect(r.originals.slice(1)).toEqual(original.trees.slice(0, TREE_LIMIT - 1));
		expect(r.matches).toEqual([1, ...Array.from({ length: 19 }, () => null)]);
		expect(rewriteSummary(original, r)).toBe(
			'19 of the 20 trees shown are crossed out: no tree of the rewritten grammar has their structure. A kept tree from outside the listed ones is shown first.'
		);
	});

	it('finds the kept tree of a mixed string by its structure', () => {
		const input = 'int + int * int + int * int + int';
		const s = source(AMBIGUOUS, input);
		const original = listing(s);
		expect(original.total).toBe(42);
		const r = analyzeRewrite(s, original, CASCADE);
		const [only] = r.listing!.trees;
		expect(only.grouping).toBe('((int + (int * int)) + (int * int)) + int');
		expect(r.origins[0]).not.toBeNull();
		const kept = r.originals.filter((_, i) => r.matches[i] !== null);
		expect(kept.map((t) => t.grouping)).toEqual([only.grouping]);
		expect(kept[0].number).toBe(r.origins[0]);
		expect(placeOf(original, kept[0].tree)).toBe(kept[0].number);
	});

	it('finds the kept tree of a string with more trees than it puts in order', () => {
		const s = source(AMBIGUOUS, sum(12));
		const original = listing(s);
		expect(original.total).toBeNull();
		// The cascade keeps the left-nested tree, which is listed first.
		const cascade = analyzeRewrite(s, original, CASCADE);
		expect(cascade.origins).toEqual([1]);
		expect(cascade.matches.filter((m) => m !== null)).toEqual([1]);
		// Right recursion keeps the right-nested tree, whose place is not known.
		const r = analyzeRewrite(s, original, 'E → T + E | T\nT → int | ( E )');
		expect(r.origins).toEqual([0]);
		expect(r.extra).toBe(1);
		expect(r.originals[0]).toMatchObject({ number: 0, grouping: rightNested(12) });
		expect(treeTitle(r.originals[0])).toBe('Another tree');
		expect(r.matches[0]).toBe(1);
		expect(r.matches.slice(1).every((m) => m === null)).toBe(true);
		expect(r.comparable).toBe(true);
	});

	it('says a rewritten tree has no counterpart only when the original grammar has none', () => {
		// The tail form groups six operands as none of the 42 trees does, listed or not.
		const s = source('E → E + E | int', sum(6));
		const original = listing(s);
		const tail = analyzeRewrite(s, original, 'E → T X\nX → + T X | ε\nT → int | ( E )');
		expect(tail.listing!.trees).toHaveLength(1);
		expect(tail.origins).toEqual([null]);
		expect(tail.extra).toBe(0);
		expect(tail.comparable).toBe(false);
		expect(shapes('E → E + E | int', sum(6)).has(tail.listing!.trees[0].key)).toBe(false);
	});

	it('looks for the counterpart of a listed tree when the rewritten grammar has more trees than it lists', () => {
		// Each tree of the rewritten grammar has an int on one side of every +.
		const rewritten = 'E → T + E | E + T | T\nT → int';
		const s = source('E → E + E | int', sum(7));
		const original = listing(s);
		expect(original.total).toBe(132);
		const r = analyzeRewrite(s, original, rewritten);
		expect(r.listing!.truncated).toBe(true);
		const every = shapes(rewritten, sum(7));
		// Right for every tree drawn, listed under the rewritten grammar or not.
		expect(r.matches.map((m) => m !== null)).toEqual(r.originals.map((t) => every.has(t.key)));
		expect(r.matches).toContain(null);
		expect(r.matches.some((m) => m !== null && m > 0)).toBe(true);
		// And every listed tree of the rewritten grammar is a tree of the original one.
		const first = shapes('E → E + E | int', sum(7));
		expect(r.origins.map((o) => o !== null)).toEqual(r.listing!.trees.map((t) => first.has(t.key)));
		expect(r.origins.every((o) => o !== null)).toBe(true);
		expect(r.comparable).toBe(true);
	});

	it('keeps every listed tree when the rewritten grammar is the same grammar', () => {
		const s = source(AMBIGUOUS, sum(6));
		const original = listing(s);
		const r = analyzeRewrite(s, original, AMBIGUOUS);
		expect(r.matches).toEqual(original.trees.map((t) => t.number));
		expect(r.origins).toEqual(original.trees.map((t) => t.number));
		expect(rewriteSummary(original, r)).toBe(
			'All 20 trees shown have the structure of a tree of the rewritten grammar.'
		);
	});

	it('keeps a tree whose counterpart is outside the rewritten grammar’s listing (match 0)', () => {
		// The original grammar has one tree, the right-nested one. The "rewritten"
		// grammar has 42, and the right-nested tree is the last of them.
		const s = source('E → T + E | T\nT → int | ( E )', sum(6));
		const original = listing(s);
		expect(original.total).toBe(1);
		const r = analyzeRewrite(s, original, AMBIGUOUS);
		expect(r.listing!.total).toBe(42);
		expect(r.listing!.trees.map((t) => t.grouping)).not.toContain(rightNested(6));
		expect(r.matches).toEqual([0]);
		expect(r.origins).toEqual(r.listing!.trees.map(() => null));
		expect(r.comparable).toBe(true);
		expect(rewriteSummary(original, r)).toBe(
			'Its tree has the structure of a tree of the rewritten grammar.'
		);
	});

	it('draws a few kept trees from outside the list before the listed ones, 20 in all', () => {
		const s = source(AMBIGUOUS, sum(6));
		const original = listing(s);
		// The last 20 of the 42 trees as the list: none is among the first 20 of
		// the rewritten grammar, which is the same grammar.
		const last = original.all!.slice(-TREE_LIMIT);
		const tail = {
			...original,
			trees: last.map((tree, i) => treeEntry(s.grammar!, s, tree, 42 - TREE_LIMIT + i + 1))
		};
		const r = analyzeRewrite(s, tail, AMBIGUOUS);
		// Every listed tree of the rewritten grammar has its counterpart …
		expect(r.origins).toEqual(original.trees.map((t) => t.number));
		// … and the first few of them are drawn, so the listed trees are still shown.
		expect(r.extra).toBe(EXTRA_LIMIT);
		expect(r.originals).toHaveLength(TREE_LIMIT);
		expect(r.originals.slice(0, EXTRA_LIMIT)).toEqual(original.trees.slice(0, EXTRA_LIMIT));
		expect(r.originals.slice(EXTRA_LIMIT)).toEqual(tail.trees.slice(0, TREE_LIMIT - EXTRA_LIMIT));
		expect(r.matches.slice(0, EXTRA_LIMIT)).toEqual([1, 2, 3, 4]);
		expect(r.matches.slice(EXTRA_LIMIT).every((m) => m === 0)).toBe(true);
		expect(rewriteSummary(tail, r)).toBe(
			'All 20 trees shown have the structure of a tree of the rewritten grammar. 4 kept trees from outside the listed ones are shown first.'
		);
	});

	it('crosses out every tree shown when the rewritten grammar has no tree for the string', () => {
		const s = source(AMBIGUOUS, sum(6, '*'));
		const original = listing(s);
		const r = analyzeRewrite(s, original, 'E → E + T | T\nT → int');
		expect(r.listing!.trees).toEqual([]);
		expect(r.comparable).toBe(true);
		expect(rewriteSummary(original, r)).toBe(
			'All 20 trees shown are crossed out: no tree of the rewritten grammar has their structure.'
		);
	});
});

describe('a rewritten grammar with another structure', () => {
	it('is not compared: the tail form of the next deck matches neither tree of int + int + int', () => {
		const s = source(AMBIGUOUS, 'int + int + int');
		const original = listing(s);
		const r = analyzeRewrite(s, original, 'E → T X\nX → + T X | ε\nT → int | ( E )');
		expect(r.listing!.trees.map((t) => t.grouping)).toEqual(['int (+ int (+ int))']);
		expect(r.matches).toEqual([null, null]);
		expect(r.origins).toEqual([null]);
		expect(r.comparable).toBe(false);
		expect(rewriteSummary(original, r)).toBe(
			'The rewritten grammar groups the string differently from every tree of the original grammar, so the trees are not matched and none is crossed out.'
		);
	});

	it('is compared as soon as one of its trees has the structure of an original tree', () => {
		const s = source(AMBIGUOUS, 'int + int + int');
		const original = listing(s);
		// Right recursion: the right-nested tree.
		const r = analyzeRewrite(s, original, 'E → T + E | T\nT → int | ( E )');
		expect(r.matches).toEqual([null, 1]);
		expect(r.comparable).toBe(true);
	});

	it('waits for a string the original grammar can read', () => {
		const bad = source(AMBIGUOUS, 'int ? int');
		const r = analyzeRewrite(bad, null, CASCADE);
		expect(r.grammar).not.toBeNull();
		expect(r.listing).toBeNull();
		expect(r.unknown).toEqual(['?']);
		expect(r.originals).toEqual([]);
		expect(r.comparable).toBe(true);
	});
});

describe('analyzeDeclarations', () => {
	it('gives the reasons per tree and the operators of the grammar', () => {
		const s = source('E → E + E | E * E | int', 'int + int * int');
		const d = analyzeDeclarations(s.grammar!, s, listing(s), [
			{ assoc: 'left', ops: '+' },
			{ assoc: 'left', ops: '*' }
		]);
		expect(d.kept).toEqual([1]);
		expect(d.reasons).toEqual([['* binds tighter than +, so + cannot be an operand of *'], []]);
		expect(d.operators).toEqual(['+', '*']);
		expect(d.undeclared).toEqual([]);
		expect(d.problems).toEqual([]);
		// Every tree is listed: these are the listed trees, and one of the two is allowed.
		expect(d.trees).toEqual(listing(s).trees);
		expect(d.extra).toBe(0);
		expect(d.allowed).toBe(1);
		expect(selectedTree(listing(s), d)).toBe(1);
	});

	it('leaves the trees of an unambiguous grammar alone', () => {
		// E → E + T is not of the form A → A op A: %right + crosses nothing out.
		const s = source(CASCADE, 'int + int + int');
		const l = listing(s);
		const d = analyzeDeclarations(s.grammar!, s, l, [right('+')]);
		expect(d.kept).toEqual([0]);
		expect(d.reasons).toEqual([[]]);
		expect(d.operators).toEqual([]);
		expect(d.allowed).toBe(1);
		expect(selectedTree(l, d)).toBe(-1);
		expect(declarationSummary(l, d, 1)).toBe(
			'The grammar has no production of the form A → A op A, so declarations leave its trees as they are.'
		);
	});
});

describe('analyzeDeclarations for a string with more trees than are listed', () => {
	const ADDITION = 'E → E + E | int';
	const declare = (grammar: string, input: string, lines: Declaration[]) => {
		const s = source(grammar, input);
		const l = listing(s);
		return { s, l, d: analyzeDeclarations(s.grammar!, s, l, lines), lines };
	};
	const summary = ({ l, d, lines }: ReturnType<typeof declare>) =>
		declarationSummary(l, d, lines.length);

	it('keeps the left-nested tree of 42 for %left + (six operands)', () => {
		const v = declare(ADDITION, sum(6), [left('+')]);
		expect(v.l.total).toBe(42);
		expect(v.d.allowed).toBe(1);
		expect(v.d.kept).toEqual([0]);
		expect(v.d.extra).toBe(0);
		expect(v.d.trees).toEqual(v.l.trees);
		expect(v.d.trees[0].grouping).toBe(leftNested(6));
		expect(selectedTree(v.l, v.d)).toBe(0);
		expect(v.d.reasons.slice(1).every((why) => why.length > 0)).toBe(true);
		expect(summary(v)).toBe('The declarations keep one of the 42 trees and cross out the rest.');
	});

	it('finds the tree %right + keeps although it is not one of the listed trees', () => {
		const v = declare(ADDITION, sum(6), [right('+')]);
		expect(v.l.trees.map((t) => t.grouping)).not.toContain(rightNested(6));
		expect(v.d.allowed).toBe(1);
		expect(v.d.extra).toBe(1);
		expect(v.d.trees).toHaveLength(TREE_LIMIT);
		expect(v.d.trees[0]).toMatchObject({ number: 42, grouping: rightNested(6) });
		expect(v.d.trees.slice(1)).toEqual(v.l.trees.slice(0, TREE_LIMIT - 1));
		expect(v.d.kept).toEqual([0]);
		expect(v.d.reasons[0]).toEqual([]);
		expect(selectedTree(v.l, v.d)).toBe(0);
		expect(summary(v)).toBe(
			'The declarations keep one of the 42 trees and cross out the rest. A kept tree from outside the listed ones is shown first.'
		);
	});

	it('says the string is a syntax error only when no tree at all is allowed', () => {
		const none = declare(ADDITION, sum(6), [nonassoc('+')]);
		expect(none.d.allowed).toBe(0);
		expect(none.d.kept).toEqual([]);
		expect(selectedTree(none.l, none.d)).toBe(-1);
		expect(summary(none)).toBe(
			'The declarations cross out all of the 42 trees: with them, the string is a syntax error.'
		);
		// %left + allows a tree: that is not a syntax error, wherever the tree is listed.
		for (const lines of [[left('+')], [right('+')]])
			expect(summary(declare(ADDITION, sum(6), lines))).not.toMatch(/syntax error/);
	});

	it('selects one tree of a mixed string by precedence and associativity', () => {
		const v = declare('E → E + E | E * E | int', 'int + int * int + int * int + int', [
			left('+'),
			left('*')
		]);
		expect(v.l.total).toBe(42);
		expect(v.d.allowed).toBe(1);
		const index = selectedTree(v.l, v.d);
		expect(v.d.trees[index].grouping).toBe('((int + (int * int)) + (int * int)) + int');
		expect(v.d.kept).toEqual([index]);
		expect(v.d.trees[index].number).toBe(placeOf(v.l, v.d.trees[index].tree));
	});

	it('agrees with filtering every tree of the string', () => {
		const grammar = 'E → E + E | E * E | int';
		const input = 'int * int + int + int * int * int';
		const cases = [
			[left('+'), left('*')],
			[left('*'), right('+')],
			[left('+')],
			[nonassoc('*')],
			[right('+ *')]
		];
		for (const lines of cases) {
			const v = declare(grammar, input, lines);
			const every = v.l.all!;
			expect(every).toHaveLength(42);
			const all = analyzeDeclarations(
				v.s.grammar!,
				v.s,
				{
					...v.l,
					trees: every.map((tree, i) => treeEntry(v.s.grammar!, v.s, tree, i + 1)),
					truncated: false
				},
				lines
			);
			// The number of trees allowed, and which of the trees drawn are kept.
			expect(v.d.allowed).toBe(all.kept.length);
			const allowed = new Set(all.kept.map((i) => bracketForm(every[i])));
			expect(v.d.trees.map((t, i) => [t.bracket, v.d.kept.includes(i)])).toEqual(
				v.d.trees.map((t) => [t.bracket, allowed.has(t.bracket)])
			);
			// Every allowed tree is drawn while there is room for it.
			const drawn = new Set(v.d.trees.map((t) => t.bracket));
			if (allowed.size <= EXTRA_LIMIT) for (const b of allowed) expect(drawn.has(b)).toBe(true);
			expect(new Set(v.d.trees.map((t) => t.bracket)).size).toBe(v.d.trees.length);
		}
	});

	it('counts what a partial declaration keeps', () => {
		// + is declared, * is not: the trees differ in how * groups.
		const v = declare('E → E + E | E * E | int', 'int + int + int * int * int + int', [left('+')]);
		expect(v.l.total).toBe(42);
		expect(v.d.undeclared).toEqual(['*']);
		expect(v.d.allowed).toBeGreaterThan(1);
		expect(v.d.allowed).toBeLessThan(42);
		// A few of the kept trees from outside the list are drawn; the listed trees stay.
		expect(v.d.extra).toBeLessThanOrEqual(EXTRA_LIMIT);
		expect(v.d.trees).toHaveLength(TREE_LIMIT);
		expect(v.d.trees.slice(v.d.extra)).toEqual(v.l.trees.slice(0, TREE_LIMIT - v.d.extra));
		expect(v.d.kept.slice(0, v.d.extra)).toEqual(Array.from({ length: v.d.extra }, (_, i) => i));
		expect(selectedTree(v.l, v.d)).toBe(-1);
		expect(summary(v)).toMatch(
			new RegExp(`^The declarations keep ${v.d.allowed} of the 42 trees\\.`)
		);
	});

	it('keeps every tree when the declarations restrict nothing', () => {
		const empty = declare(ADDITION, sum(6), []);
		expect(empty.d.allowed).toBe(42);
		expect(empty.d.kept).toHaveLength(TREE_LIMIT);
		expect(summary(empty)).toBe('No declarations: all 42 trees are kept.');
		const other = declare(ADDITION, sum(6), [left('*')]);
		expect(other.d.allowed).toBe(42);
		expect(other.d.problems).toEqual(['* on line 1 is not a terminal of the grammar.']);
		expect(summary(other)).toBe('The declarations keep all of the 42 trees.');
	});

	it('finds the selected tree of a string with more trees than it puts in order', () => {
		const leftmost = declare(ADDITION, sum(12), [left('+')]);
		expect(leftmost.l.total).toBeNull();
		expect(leftmost.d.allowed).toBe(1);
		expect(leftmost.d.trees[selectedTree(leftmost.l, leftmost.d)]).toMatchObject({
			number: 1,
			grouping: leftNested(12)
		});
		expect(summary(leftmost)).toBe('The declarations keep one tree and cross out the rest.');
		const rightmost = declare(ADDITION, sum(12), [right('+')]);
		expect(rightmost.d.extra).toBe(1);
		expect(rightmost.d.trees[0]).toMatchObject({ number: 0, grouping: rightNested(12) });
		expect(selectedTree(rightmost.l, rightmost.d)).toBe(0);
		expect(summary(rightmost)).toBe(
			'The declarations keep one tree and cross out the rest. A kept tree from outside the listed ones is shown first.'
		);
		const none = declare(ADDITION, sum(12), [nonassoc('+')]);
		expect(summary(none)).toBe(
			'The declarations cross out every tree: with them, the string is a syntax error.'
		);
		const all = declare(ADDITION, sum(12), []);
		expect(all.d.allowed).toBeNull();
		expect(summary(all)).toBe('No declarations: every tree is kept.');
		expect(summary(declare(ADDITION, sum(12), [left('*')]))).toBe(
			'The declarations keep more than 500 trees.'
		);
	});
});

describe('declarationSummary', () => {
	const of = (grammar: string, input: string, lines: Declaration[]) => {
		const s = source(grammar, input);
		const l = listing(s);
		return declarationSummary(l, analyzeDeclarations(s.grammar!, s, l, lines), lines.length);
	};
	const SUMS = 'E → E + E | E * E | int';

	it('says what is kept of a string whose trees are all listed', () => {
		expect(of(SUMS, 'int + int * int', [])).toBe('No declarations: all 2 trees are kept.');
		expect(of(SUMS, 'int', [])).toBe('No declarations: the tree is kept.');
		expect(of(SUMS, 'int', [left('+')])).toBe('The declarations keep the tree.');
		expect(of(SUMS, 'int + int * int', [left('+'), left('*')])).toBe(
			'The declarations keep one of the 2 trees and cross out the rest.'
		);
		expect(of(SUMS, 'int + int * int', [left('+')])).toBe(
			'The declarations keep all of the 2 trees.'
		);
		expect(of(SUMS, 'int + int + int', [nonassoc('+')])).toBe(
			'The declarations cross out all of the 2 trees: with them, the string is a syntax error.'
		);
		expect(of(SUMS, 'int + int + int * int', [left('+')])).toBe(
			'The declarations keep 3 of the 5 trees.'
		);
		expect(of(SUMS, 'int +', [left('+')])).toBe('The string has no parse tree.');
		expect(of(DANGLING_ELSE, 'if OTHER then OTHER', [left('+')])).toMatch(
			/^The grammar has no production of the form A → A op A/
		);
	});
});
