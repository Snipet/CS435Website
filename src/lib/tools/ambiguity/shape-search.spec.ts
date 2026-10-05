import { describe, expect, it } from 'vitest';
import {
	bracketForm,
	parseGrammar,
	parseTrees,
	tokenizeInput,
	yieldOf,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import { AMBIGUOUS, CASCADE, DANGLING_ELSE, MATCHED_IF } from './presets';
import { shapeFinder, treeWithShape } from './shape-search';
import { shapeKey, shapeOf, type Shape } from './shape';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

const tokensOf = (g: Grammar, input: string) => tokenizeInput(input, g.terminals).tokens;
const all = (g: Grammar, tokens: string[]): ParseNode[] =>
	parseTrees(g, tokens, { limit: 100_000 }).trees;
const operands = (n: number, op = '+') => Array.from({ length: n }, () => 'int').join(` ${op} `);

/** Nodes carry the token range they cover, as the trees of parseTrees do. */
function ranges(tree: ParseNode): string {
	const out: string[] = [];
	const open = [tree];
	while (open.length > 0) {
		const node = open.pop()!;
		out.push(`${node.symbol}[${node.start},${node.end})`);
		for (let i = node.children.length - 1; i >= 0; i--) open.push(node.children[i]);
	}
	return out.join(' ');
}

/**
 * For every tree of `input` under `g`: the search finds a tree with its shape,
 * and that tree is one of the trees of the string.
 */
function findsEveryTree(g: Grammar, input: string): number {
	const tokens = tokensOf(g, input);
	const trees = all(g, tokens);
	const brackets = new Set(trees.map(bracketForm));
	const find = shapeFinder(g, tokens);
	for (const tree of trees) {
		const shape = shapeOf(tree);
		const found = find(shape);
		expect(found, `${input}: ${bracketForm(tree)}`).not.toBeNull();
		expect(shapeKey(shapeOf(found!))).toBe(shapeKey(shape));
		expect(yieldOf(found!)).toEqual(tokens);
		expect(brackets.has(bracketForm(found!))).toBe(true);
	}
	return trees.length;
}

describe('treeWithShape', () => {
	it('finds the tree of the ambiguous grammar with the shape of the cascade’s tree (slide 10)', () => {
		const amb = grammar(AMBIGUOUS);
		const cascade = grammar(CASCADE);
		const tokens = tokensOf(amb, 'int * int + int');
		const [only] = all(cascade, tokens);
		const found = treeWithShape(amb, tokens, shapeOf(only));
		expect(bracketForm(found!)).toBe('E( E( E(int) * E(int) ) + E(int) )');
		// And the other way round, through the single productions E → T → F.
		const back = treeWithShape(cascade, tokens, shapeOf(found!));
		expect(bracketForm(back!)).toBe(bracketForm(only));
		expect(ranges(back!)).toBe(ranges(only));
	});

	it('says when a grammar has no tree of a shape', () => {
		const amb = grammar(AMBIGUOUS);
		const cascade = grammar(CASCADE);
		const tokens = tokensOf(amb, 'int * int + int');
		const wrong = all(amb, tokens).find((t) => shapeKey(shapeOf(t)) === '[int * [int + int]]')!;
		expect(treeWithShape(cascade, tokens, shapeOf(wrong))).toBeNull();
		// A shape of other tokens is not a tree of these.
		const other = shapeOf(all(amb, tokensOf(amb, 'int + int'))[0]);
		expect(treeWithShape(amb, tokens, other)).toBeNull();
	});

	it('finds one tree among the 42 of six operands without listing them', () => {
		const amb = grammar(AMBIGUOUS);
		const cascade = grammar(CASCADE);
		const tokens = tokensOf(amb, operands(6));
		const [only] = all(cascade, tokens);
		const found = treeWithShape(amb, tokens, shapeOf(only))!;
		expect(shapeKey(shapeOf(found))).toBe('[[[[[int + int] + int] + int] + int] + int]');
		expect(all(amb, tokens)).toHaveLength(42);
	});

	it('finds a tree in a string of 20 operands quickly', () => {
		const amb = grammar(AMBIGUOUS);
		const cascade = grammar(CASCADE);
		const tokens = tokensOf(amb, Array.from({ length: 20 }, () => 'int').join(' * '));
		const [only] = all(cascade, tokens);
		const start = performance.now();
		const found = treeWithShape(amb, tokens, shapeOf(only));
		// Generous for slow CI machines; it takes about a millisecond.
		expect(performance.now() - start).toBeLessThan(500);
		expect(shapeKey(shapeOf(found!))).toBe(shapeKey(shapeOf(only)));
	});

	it('finds every tree of a string by its shape', () => {
		expect(findsEveryTree(grammar(AMBIGUOUS), operands(5))).toBe(14);
		expect(findsEveryTree(grammar(AMBIGUOUS), 'int * int + int * int')).toBe(5);
		expect(findsEveryTree(grammar(CASCADE), 'int + int * int + int')).toBe(1);
		expect(findsEveryTree(grammar('E → E + E | E * E | int'), 'int + int * int + int')).toBe(5);
		const ifs = 'if OTHER then if OTHER then if OTHER then OTHER else OTHER else OTHER';
		expect(findsEveryTree(grammar(DANGLING_ELSE), ifs)).toBe(3);
		expect(findsEveryTree(grammar(MATCHED_IF), ifs)).toBe(1);
	});

	it('goes through parentheses, around a group and around a single token', () => {
		const amb = grammar(AMBIGUOUS);
		expect(findsEveryTree(amb, '( int + int ) * int')).toBe(1);
		expect(findsEveryTree(amb, '( ( int ) ) + ( int * int + int )')).toBe(2);
		expect(findsEveryTree(grammar(CASCADE), '( int + int ) * ( ( int ) )')).toBe(1);
		// The parenthesized tree and the bare one have the same shape at other tokens.
		const bare = shapeOf(all(amb, ['int', '+', 'int'])[0]);
		expect(treeWithShape(amb, ['(', 'int', '+', 'int', ')'], bare)).toBeNull();
	});

	it('goes through ε-productions and non-terminals that derive ε', () => {
		expect(findsEveryTree(grammar('E → T X\nX → + T X | ε\nT → int | ( E )'), operands(4))).toBe(1);
		expect(findsEveryTree(grammar('S → a S b | ε'), 'a a b b')).toBe(1);
		expect(findsEveryTree(grammar('S → A B\nA → a A | ε\nB → b B | ε'), 'a a b')).toBe(1);
		expect(findsEveryTree(grammar('S → A S A | x\nA → ε | a'), 'a x a')).toBe(3);
		expect(findsEveryTree(grammar('S → A S A | S S | x\nA → ε | a'), 'a x x a')).toBeGreaterThan(2);
		// Parentheses around nothing: a child without a shape that covers tokens.
		expect(findsEveryTree(grammar('S → S S | ( L ) | x\nL → S | ε'), 'x ( ) ( x )')).toBe(2);
	});

	it('finds the tree of the empty string', () => {
		const g = grammar('S → A B\nA → a A | ε\nB → b | ε');
		const found = treeWithShape(g, [], null);
		expect(bracketForm(found!)).toBe('S( A(ε) B(ε) )');
		expect(treeWithShape(grammar('S → a'), [], null)).toBeNull();
		expect(treeWithShape(g, ['a'], null)).toBeNull();
	});

	it('returns a tree without repeats for a grammar with a cycle', () => {
		// A → B → A: parseTrees lists only the trees in which no node repeats an ancestor.
		const g = grammar('A → B | a\nB → A | b');
		expect(findsEveryTree(g, 'a')).toBe(1);
		expect(findsEveryTree(g, 'b')).toBe(1);
		const lists = grammar('S → S S | a | ε');
		expect(findsEveryTree(lists, 'a a a')).toBeGreaterThan(1);
	});

	it('matches leaves by token, so the same grouping at other operands is another shape', () => {
		const g = grammar('E → E + E | int');
		const tokens = tokensOf(g, operands(3));
		const leaf = (at: number): Shape => ({ kind: 'leaf', symbol: at % 2 ? '+' : 'int', at });
		const group = (...parts: Shape[]): Shape => ({ kind: 'group', symbol: 'E', parts });
		const left = group(group(leaf(0), leaf(1), leaf(2)), leaf(3), leaf(4));
		expect(shapeKey(shapeOf(treeWithShape(g, tokens, left)!))).toBe('[[int + int] + int]');
		// Three operands cannot be one flat group under E → E + E.
		expect(treeWithShape(g, tokens, group(...[0, 1, 2, 3, 4].map(leaf)))).toBeNull();
		// Leaves in the wrong place.
		expect(
			treeWithShape(g, tokens, group(group(leaf(0), leaf(1), leaf(4)), leaf(3), leaf(2)))
		).toBeNull();
	});
});

describe('shapeFinder', () => {
	it('answers several shapes of one string', () => {
		const g = grammar('E → E + E | int');
		const tokens = tokensOf(g, operands(7));
		const trees = all(g, tokens);
		expect(trees).toHaveLength(132);
		const find = shapeFinder(g, tokens);
		const found = trees.map((tree) => bracketForm(find(shapeOf(tree))!));
		// Each shape belongs to one tree of this grammar.
		expect(found).toEqual(trees.map(bracketForm));
	});
});
