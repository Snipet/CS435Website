import { describe, expect, it } from 'vitest';
import { describeTree } from '$lib/components/grammar/tree-layout';
import { chainForms, formText } from '$lib/components/grammar/derivation-chain';
import {
	MAX_TOKENS,
	TREE_LIMIT,
	TREE_TONES,
	analyzeDeclarations,
	analyzeRewrite,
	assignValues,
	countText,
	leafLabeler,
	leftmostChain,
	listTrees,
	readSource,
	stringText,
	treeTone,
	verdictNote,
	verdictText,
	verdictTone,
	type Source
} from './model';
import { AMBIGUOUS, CASCADE, DANGLING_ELSE } from './presets';

const source = (grammar: string, input: string, more: { labels?: string; values?: string } = {}) =>
	readSource({ grammar, input, labels: more.labels ?? '', values: more.values ?? '' });

const listing = (s: Source) => listTrees(s.grammar!, s);

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

	it('stops at the limit and says there are more', () => {
		const s = source(AMBIGUOUS, Array.from({ length: 8 }, () => 'int').join(' + '));
		const l = listing(s);
		expect(l.trees).toHaveLength(TREE_LIMIT);
		expect(l.truncated).toBe(true);
		expect(countText(l)).toBe(`More than ${TREE_LIMIT} parse trees`);
		expect(verdictText(l)).toBe(`More than ${TREE_LIMIT} parse trees: the grammar is ambiguous`);
	});

	it('lists the trees of a 39-token string quickly', () => {
		const s = source(AMBIGUOUS, Array.from({ length: 20 }, () => 'int').join(' * '));
		const start = performance.now();
		const l = listing(s);
		expect(l.trees).toHaveLength(TREE_LIMIT);
		// Generous for slow CI machines; it takes a few milliseconds.
		expect(performance.now() - start).toBeLessThan(1000);
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
	});

	it('waits for a string the original grammar can read', () => {
		const bad = source(AMBIGUOUS, 'int ? int');
		const r = analyzeRewrite(bad, null, CASCADE);
		expect(r.grammar).not.toBeNull();
		expect(r.listing).toBeNull();
		expect(r.unknown).toEqual(['?']);
	});
});

describe('analyzeDeclarations', () => {
	it('gives the reasons per tree and the operators of the grammar', () => {
		const s = source('E → E + E | E * E | int', 'int + int * int');
		const d = analyzeDeclarations(s.grammar!, listing(s), [
			{ assoc: 'left', ops: '+' },
			{ assoc: 'left', ops: '*' }
		]);
		expect(d.kept).toEqual([1]);
		expect(d.reasons).toEqual([['* binds tighter than +, so + cannot be an operand of *'], []]);
		expect(d.operators).toEqual(['+', '*']);
		expect(d.undeclared).toEqual([]);
		expect(d.problems).toEqual([]);
	});
});
