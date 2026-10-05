import { describe, expect, it } from 'vitest';
import {
	applyStep,
	bracketForm,
	derivationFromTree,
	nonterminalPositions,
	treeEquals,
	treeFromDerivation,
	yieldOf
} from './derive';
import { parseTrees } from './earley';
import { makeGrammar, printSymbols } from './parse';
import {
	AMBIGUOUS,
	CASCADE,
	COOL,
	DANGLING_ELSE,
	MATCHED_IF,
	TOP_DOWN,
	grammar,
	input
} from './test-helpers';
import type { Derivation, Grammar, ParseNode } from './types';

const trees = (g: Grammar, text: string): ParseNode[] => parseTrees(g, input(g, text)).trees;

/** The sentential forms of a derivation, start included. */
const forms = (d: Derivation): string[] =>
	[d.start, ...d.steps.map((s) => s.form)].map((form) => printSymbols(form));

const node = (symbol: string, production: number, ...children: ParseNode[]): ParseNode => ({
	symbol,
	terminal: false,
	children,
	production
});
const leaf = (symbol: string): ParseNode => ({ symbol, terminal: true, children: [] });
const open = (symbol: string): ParseNode => ({ symbol, terminal: false, children: [] });

describe('applyStep', () => {
	const g = grammar(CASCADE);

	it('replaces the non-terminal at the index with the right-hand side', () => {
		expect(applyStep(['E'], 0, g.productions[0])).toEqual(['E', '+', 'T']);
		expect(applyStep(['E', '+', 'T'], 2, g.productions[3])).toEqual(['E', '+', 'F']);
		expect(applyStep(['int', '*', 'F', '+', 'T'], 2, g.productions[5])).toEqual([
			'int',
			'*',
			'(',
			'E',
			')',
			'+',
			'T'
		]);
	});

	it('removes the non-terminal for an ε-production', () => {
		const parens = grammar('S → ε | ( S )');
		expect(applyStep(['(', 'S', ')'], 1, parens.productions[0])).toEqual(['(', ')']);
		expect(applyStep(['S'], 0, parens.productions[0])).toEqual([]);
	});

	it('leaves its arguments alone', () => {
		const form = ['E', '+', 'T'];
		applyStep(form, 0, g.productions[1]);
		expect(form).toEqual(['E', '+', 'T']);
		expect(g.productions[1].rhs).toEqual(['T']);
	});

	it('throws when the position does not hold the left-hand side', () => {
		expect(() => applyStep(['E', '+', 'T'], 1, g.productions[0])).toThrow(/position 1 holds \+/);
		expect(() => applyStep(['E'], 3, g.productions[0])).toThrow(/holds nothing/);
	});
});

describe('nonterminalPositions', () => {
	it('lists where the non-terminals are', () => {
		const g = grammar(CASCADE);
		expect(nonterminalPositions(g, ['int', '*', 'F', '+', 'T'])).toEqual([2, 4]);
		expect(nonterminalPositions(g, ['E'])).toEqual([0]);
		expect(nonterminalPositions(g, ['int', '*', 'int'])).toEqual([]);
		expect(nonterminalPositions(g, [])).toEqual([]);
	});

	it('does not go by capital letters: OTHER is a terminal', () => {
		const g = grammar(DANGLING_ELSE);
		expect(nonterminalPositions(g, ['if', 'OTHER', 'then', 'E', 'else', 'E'])).toEqual([3, 5]);
	});
});

describe('derivationFromTree', () => {
	it('gives the leftmost derivation of the slide-10 tree of int * int + int', () => {
		const g = grammar(CASCADE);
		const [tree] = trees(g, 'int * int + int');
		const d = derivationFromTree(g, tree, 'leftmost');
		expect(forms(d)).toEqual([
			'E',
			'E + T',
			'T + T',
			'T * F + T',
			'F * F + T',
			'int * F + T',
			'int * int + T',
			'int * int + F',
			'int * int + int'
		]);
		expect(d.start).toEqual(['E']);
		expect(d.steps.map((s) => s.index)).toEqual([0, 0, 0, 0, 0, 2, 4, 4]);
		// E → E + T; E → T; T → T * F; T → F; F → int; F → int; T → F; F → int
		expect(d.steps.map((s) => s.production)).toEqual([0, 1, 2, 3, 4, 4, 3, 4]);
	});

	it('gives the rightmost derivation of the same tree', () => {
		const g = grammar(CASCADE);
		const [tree] = trees(g, 'int * int + int');
		const d = derivationFromTree(g, tree, 'rightmost');
		expect(forms(d)).toEqual([
			'E',
			'E + T',
			'E + F',
			'E + int',
			'T + int',
			'T * F + int',
			'T * int + int',
			'F * int + int',
			'int * int + int'
		]);
		expect(d.steps.map((s) => s.index)).toEqual([0, 2, 2, 0, 0, 2, 0, 0]);
	});

	it('gives two different leftmost derivations for the two trees of int + int + int', () => {
		const g = grammar(AMBIGUOUS);
		const both = trees(g, 'int + int + int');
		expect(both.map(bracketForm)).toEqual([
			'E( E(int) + E( E(int) + E(int) ) )',
			'E( E( E(int) + E(int) ) + E(int) )'
		]);
		const [right, left] = both.map((tree) => forms(derivationFromTree(g, tree, 'leftmost')));
		expect(right).toEqual([
			'E',
			'E + E',
			'int + E',
			'int + E + E',
			'int + int + E',
			'int + int + int'
		]);
		expect(left).toEqual([
			'E',
			'E + E',
			'E + E + E',
			'int + E + E',
			'int + int + E',
			'int + int + int'
		]);
		expect(left).not.toEqual(right);
		expect(yieldOf(both[0])).toEqual(yieldOf(both[1]));
		expect(yieldOf(both[0])).toEqual(['int', '+', 'int', '+', 'int']);
	});

	it('handles ε-productions in both orders', () => {
		const g = grammar('S → A B c\nA → a | ε\nB → ε | b B');
		const [tree] = trees(g, 'b c');
		expect(forms(derivationFromTree(g, tree, 'leftmost'))).toEqual([
			'S',
			'A B c',
			'B c',
			'b B c',
			'b c'
		]);
		expect(forms(derivationFromTree(g, tree, 'rightmost'))).toEqual([
			'S',
			'A B c',
			'A b B c',
			'A b c',
			'b c'
		]);
		const empty = grammar('S → ε | ( S )');
		expect(forms(derivationFromTree(empty, trees(empty, '')[0], 'rightmost'))).toEqual(['S', 'ε']);
	});

	it('keeps the unexpanded non-terminals of a partial tree in the forms', () => {
		const g = grammar(CASCADE);
		// E( E + T( T * F ) ) with only the right T expanded
		const partial = node(
			'E',
			0,
			open('E'),
			leaf('+'),
			node('T', 2, open('T'), leaf('*'), open('F'))
		);
		expect(forms(derivationFromTree(g, partial, 'leftmost'))).toEqual(['E', 'E + T', 'E + T * F']);
		expect(forms(derivationFromTree(g, partial, 'rightmost'))).toEqual(['E', 'E + T', 'E + T * F']);
		expect(derivationFromTree(g, open('E'), 'leftmost')).toEqual({ start: ['E'], steps: [] });
	});

	it('throws when a node does not match its production', () => {
		const g = grammar(CASCADE);
		expect(() => derivationFromTree(g, node('E', 0, leaf('int')), 'leftmost')).toThrow(
			/node E does not match production 0/
		);
		expect(() => derivationFromTree(g, node('T', 0), 'leftmost')).toThrow(/node T/);
		expect(() => derivationFromTree(g, node('E', 99), 'leftmost')).toThrow(/production 99/);
	});
});

describe('treeFromDerivation', () => {
	const cases: [string, string[]][] = [
		[CASCADE, ['int * int + int', '( int + int ) * int', 'int']],
		[AMBIGUOUS, ['int + int + int', 'int * int + int', '( int ) * int + int * int']],
		[DANGLING_ELSE, ['if OTHER then if OTHER then OTHER else OTHER']],
		[MATCHED_IF, ['if OTHER then if OTHER then OTHER else OTHER']],
		[TOP_DOWN, ['( int )', 'int * int']],
		[COOL, ['if while id loop id pool then id else id fi']],
		['S → ε | ( S )', ['', '( ( ) )']],
		['S → A B c\nA → a | ε\nB → ε | b B', ['c', 'a b b c']]
	];

	it('rebuilds a tree from its leftmost and its rightmost derivation', () => {
		let checked = 0;
		for (const [text, inputs] of cases) {
			const g = grammar(text);
			for (const sentence of inputs) {
				const all = trees(g, sentence);
				expect(all.length).toBeGreaterThan(0);
				for (const tree of all) {
					for (const order of ['leftmost', 'rightmost'] as const) {
						const rebuilt = treeFromDerivation(g, derivationFromTree(g, tree, order));
						expect(treeEquals(rebuilt, tree)).toBe(true);
						// A finished derivation also gives the token ranges back.
						expect(rebuilt).toEqual(tree);
						checked++;
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(30);
	});

	it('accepts a partial derivation: unexpanded non-terminals are leaves', () => {
		const g = grammar(CASCADE);
		const [tree] = trees(g, 'int * int + int');
		const d = derivationFromTree(g, tree, 'leftmost');
		const fringes = d.steps.map((_, n) => {
			const partial = treeFromDerivation(g, { start: d.start, steps: d.steps.slice(0, n) });
			return printSymbols(yieldOf(partial));
		});
		expect(fringes).toEqual(forms(d).slice(0, -1));

		const three = treeFromDerivation(g, { start: d.start, steps: d.steps.slice(0, 3) });
		expect(bracketForm(three)).toBe('E( E( T(T * F) ) + T )');
		expect(three.children[2]).toEqual({ symbol: 'T', terminal: false, children: [] });
		expect(three.start).toBeUndefined();
		expect(treeFromDerivation(g, { start: ['E'], steps: [] })).toEqual({
			symbol: 'E',
			terminal: false,
			children: []
		});
	});

	it('round-trips a partial tree', () => {
		const g = grammar(CASCADE);
		const partial = node(
			'E',
			0,
			open('E'),
			leaf('+'),
			node('T', 2, open('T'), leaf('*'), open('F'))
		);
		for (const order of ['leftmost', 'rightmost'] as const)
			expect(treeFromDerivation(g, derivationFromTree(g, partial, order))).toEqual(partial);
	});

	it('follows the productions of the steps, in any order of replacement', () => {
		const g = grammar(CASCADE);
		// E → E + T → E + F → T + F → T + int → F + int → int + int
		const steps = [
			{ index: 0, production: 0, form: [] },
			{ index: 2, production: 3, form: [] },
			{ index: 0, production: 1, form: [] },
			{ index: 2, production: 4, form: [] },
			{ index: 0, production: 3, form: [] },
			{ index: 0, production: 4, form: [] }
		];
		const tree = treeFromDerivation(g, { start: ['E'], steps });
		expect(bracketForm(tree)).toBe('E( E( T( F(int) ) ) + T( F(int) ) )');
		expect([tree.start, tree.end]).toEqual([0, 3]);
		expect(tree.children.map((c) => [c.start, c.end])).toEqual([
			[0, 1],
			[1, 2],
			[2, 3]
		]);
	});

	it('throws on a step that does not fit and on a start that is not one symbol', () => {
		const g = grammar(CASCADE);
		const step = (index: number, production: number) => ({ index, production, form: [] });
		expect(() => treeFromDerivation(g, { start: ['E'], steps: [step(0, 2)] })).toThrow(/step 1/);
		expect(() => treeFromDerivation(g, { start: ['E'], steps: [step(0, 0), step(1, 0)] })).toThrow(
			/step 2/
		);
		expect(() => treeFromDerivation(g, { start: ['E'], steps: [step(4, 0)] })).toThrow(/step 1/);
		expect(() => treeFromDerivation(g, { start: ['E'], steps: [step(0, 42)] })).toThrow(/step 1/);
		expect(() => treeFromDerivation(g, { start: ['E', '+', 'T'], steps: [] })).toThrow(
			/single symbol/
		);
	});
});

describe('yieldOf', () => {
	it('reads the leaves left to right', () => {
		const g = grammar(CASCADE);
		expect(yieldOf(trees(g, '( int + int ) * int')[0])).toEqual([
			'(',
			'int',
			'+',
			'int',
			')',
			'*',
			'int'
		]);
		expect(yieldOf(leaf('int'))).toEqual(['int']);
	});

	it('skips ε-productions', () => {
		const g = grammar('S → ε | ( S )');
		expect(yieldOf(trees(g, '( ( ) )')[0])).toEqual(['(', '(', ')', ')']);
		expect(yieldOf(trees(g, '')[0])).toEqual([]);
		expect(yieldOf(node('S', 0))).toEqual([]);
	});

	it('includes the unexpanded non-terminals of a partial tree', () => {
		const partial = node(
			'E',
			0,
			open('E'),
			leaf('+'),
			node('T', 2, open('T'), leaf('*'), open('F'))
		);
		expect(yieldOf(partial)).toEqual(['E', '+', 'T', '*', 'F']);
		expect(yieldOf(open('E'))).toEqual(['E']);
	});
});

describe('treeEquals', () => {
	const g = grammar(AMBIGUOUS);
	const [first, second] = trees(g, 'int + int + int');

	it('compares shape, symbols and productions', () => {
		expect(treeEquals(first, structuredClone(first))).toBe(true);
		expect(treeEquals(first, second)).toBe(false);
		expect(treeEquals(node('E', 3, leaf('int')), node('E', 3, leaf('int')))).toBe(true);
		expect(treeEquals(node('E', 3, leaf('int')), node('E', 2, leaf('int')))).toBe(false);
		expect(treeEquals(node('E', 3, leaf('int')), node('E', 3, leaf('id')))).toBe(false);
		expect(treeEquals(node('E', 3, leaf('int')), node('E', 3))).toBe(false);
		expect(treeEquals(leaf('E'), open('E'))).toBe(false);
		expect(treeEquals(open('E'), node('E', 0))).toBe(false);
	});

	it('does not compare token ranges', () => {
		const moved = structuredClone(first);
		moved.start = 7;
		moved.children[0].end = undefined;
		expect(treeEquals(first, moved)).toBe(true);
	});

	it('tells the two trees of one string apart under every grammar that has two', () => {
		const dangling = grammar(DANGLING_ELSE);
		const [a, b] = trees(dangling, 'if OTHER then if OTHER then OTHER else OTHER');
		expect(treeEquals(a, b)).toBe(false);
		expect(treeEquals(a, a)).toBe(true);
	});
});

describe('bracketForm', () => {
	it('writes the trees of the ambiguity slides', () => {
		const g = grammar(CASCADE);
		expect(bracketForm(trees(g, 'int * int + int')[0])).toBe(
			'E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )'
		);
	});

	it('writes ε-productions, leaves and unexpanded non-terminals', () => {
		const g = grammar('S → ε | ( S )');
		expect(bracketForm(trees(g, '')[0])).toBe('S(ε)');
		expect(bracketForm(trees(g, '( )')[0])).toBe('S( ( S(ε) ) )');
		expect(bracketForm(leaf('int'))).toBe('int');
		expect(bracketForm(open('E'))).toBe('E');
		expect(bracketForm(node('S', 0, leaf('1'), open('A')))).toBe('S(1 A)');
	});
});

describe('trees of any depth', () => {
	const depth = 20000;
	// A0 → A1 ; … ; A19999 → A20000 ; A20000 → a
	const chain = makeGrammar([
		...Array.from({ length: depth }, (_, i) => ({ lhs: `A${i}`, rhs: [`A${i + 1}`] })),
		{ lhs: `A${depth}`, rhs: ['a'] }
	]);
	const derivation: Derivation = {
		start: ['A0'],
		steps: chain.productions.map((p) => ({ index: 0, production: p.id, form: p.rhs }))
	};
	const deepest = (tree: ParseNode): ParseNode => {
		let at = tree;
		while (at.children.length > 0) at = at.children[at.children.length - 1];
		return at;
	};

	it('builds the tree of a derivation of 20001 steps and numbers its tokens', () => {
		const tree = treeFromDerivation(chain, derivation);
		expect(tree).toMatchObject({ symbol: 'A0', production: 0, start: 0, end: 1 });
		expect(deepest(tree)).toEqual({ symbol: 'a', terminal: true, children: [], start: 0, end: 1 });
		expect(yieldOf(tree)).toEqual(['a']);
		for (const order of ['leftmost', 'rightmost'] as const)
			expect(derivationFromTree(chain, tree, order)).toEqual(derivation);
	});

	it('compares and writes such a tree', () => {
		const tree = treeFromDerivation(chain, derivation);
		const same = treeFromDerivation(chain, derivation);
		expect(treeEquals(tree, same)).toBe(true);
		deepest(same).symbol = 'b';
		expect(treeEquals(tree, same)).toBe(false);
		const text = bracketForm(tree);
		expect(text.startsWith('A0( A1( A2( ')).toBe(true);
		expect(text.includes(` A${depth - 1}( A${depth}(a) ) ) ) `)).toBe(true);
		expect(text.endsWith(' ) ) )')).toBe(true);
		expect(text.split('(')).toHaveLength(depth + 2);
		expect(text.split(')')).toHaveLength(depth + 2);
	});

	it('handles 20000 nested parentheses from the parser', () => {
		const g = grammar('S → ε | ( S )');
		const tokens = Array.from({ length: 2 * depth }, (_, i) => (i < depth ? '(' : ')'));
		const [tree] = parseTrees(g, tokens).trees;
		expect(yieldOf(tree)).toEqual(tokens);
		expect(treeEquals(tree, parseTrees(g, tokens).trees[0])).toBe(true);
		const text = bracketForm(tree);
		expect(text.startsWith('S( ( S( ( S( ')).toBe(true);
		expect(text.includes(' ( S( ( S(ε) ) ) ) ) ')).toBe(true);
		expect(text.endsWith(' ) ) ) )')).toBe(true);
		expect(text.split('S(')).toHaveLength(depth + 2);
	});
});
