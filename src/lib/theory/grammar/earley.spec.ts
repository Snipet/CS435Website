import { describe, expect, it } from 'vitest';
import { chomskyType, leftRecursion, sentenceLengths } from './analyze';
import { bracketForm, derivationFromTree, treeFromDerivation, yieldOf } from './derive';
import { compareGrammars, enumerateLanguage, parseTrees, recognizes } from './earley';
import { printSymbols } from './parse';
import {
	AMBIGUOUS,
	ARITHMETIC,
	ARITHMETIC_ID,
	CASCADE,
	COOL,
	DANGLING_ELSE,
	ENGLISH,
	MATCHED_IF,
	TOP_DOWN,
	TOP_DOWN_2,
	bruteForce,
	forms,
	grammar,
	input,
	random,
	randomGrammar
} from './test-helpers';
import type { Grammar, ParseNode } from './types';

const accepts = (g: Grammar, text: string): boolean => recognizes(g, input(g, text));

/** Sentences as text, shortest first, up to `maxLength` tokens. */
const language = (g: Grammar, maxLength: number, limit = 1000) => {
	const { strings, truncated } = enumerateLanguage(g, { maxLength, limit });
	return { strings: strings.map((s) => printSymbols(s)), truncated };
};
const limited = (g: Grammar, maxLength: number, limit: number): boolean =>
	enumerateLanguage(g, { maxLength, limit }).limited;

const walk = (tree: ParseNode, visit: (node: ParseNode, path: ParseNode[]) => void): void => {
	const go = (node: ParseNode, path: ParseNode[]) => {
		visit(node, path);
		for (const child of node.children) go(child, [...path, node]);
	};
	go(tree, []);
};

/** What is wrong with `tree` as a parse tree of `tokens` under `g`: productions, ranges, repeats. */
function treeProblems(g: Grammar, tokens: readonly string[], tree: ParseNode): string[] {
	const isNonterminal = new Set(g.nonterminals);
	const problems: string[] = [];
	const check = (ok: boolean, what: string, node: ParseNode) => {
		if (!ok) problems.push(`${what} at ${node.symbol} [${node.start}, ${node.end})`);
	};
	check(tree.symbol === g.start, 'root is not the start symbol', tree);
	check(tree.start === 0 && tree.end === tokens.length, 'root does not cover the input', tree);
	walk(tree, (node, path) => {
		check(node.terminal === !isNonterminal.has(node.symbol), 'wrong terminal flag', node);
		check(
			yieldOf(node).join(' ') === tokens.slice(node.start, node.end).join(' '),
			'yield is not the tokens of the range',
			node
		);
		if (node.terminal) {
			check(node.children.length === 0, 'terminal with children', node);
			check(node.production === undefined, 'terminal with a production', node);
			check(node.end === node.start! + 1, 'terminal does not cover one token', node);
			return;
		}
		const p = g.productions[node.production!];
		check(
			p !== undefined && p.id === node.production && p.lhs === node.symbol,
			'wrong production',
			node
		);
		check(
			p !== undefined && node.children.map((c) => c.symbol).join(' ') === p.rhs.join(' '),
			'children are not the right-hand side',
			node
		);
		let at = node.start!;
		for (const child of node.children) {
			check(child.start === at, 'child does not start where the last one ended', child);
			at = child.end!;
		}
		check(at === node.end, 'children do not cover the range', node);
		// No ancestor has the same non-terminal over the same tokens.
		check(
			!path.some(
				(up) => up.symbol === node.symbol && up.start === node.start && up.end === node.end
			),
			'repeats an ancestor',
			node
		);
	});
	return problems;
}

const expectValidTree = (g: Grammar, tokens: readonly string[], tree: ParseNode): void =>
	expect(treeProblems(g, tokens, tree)).toEqual([]);

describe('recognizes', () => {
	it('accepts ( int + int ) * int and rejects ( int ) ) (Introduction to Parsing, slides 12–13)', () => {
		const g = grammar(ARITHMETIC);
		expect(accepts(g, '( int + int ) * int')).toBe(true);
		expect(accepts(g, '( int ) )')).toBe(false);
		for (const text of ['int', 'int + int', '( ( int ) )', 'int * int + int * ( int )'])
			expect(accepts(g, text)).toBe(true);
		for (const text of ['', 'int int', '+', '( int', 'int +', ') int (', '( )'])
			expect(accepts(g, text)).toBe(false);
	});

	it('accepts the six strings of slide 28', () => {
		const g = grammar(ARITHMETIC_ID);
		for (const text of ['id', '(id)', '(id) ∗ id', 'id + id', 'id ∗ id', 'id ∗ (id)'])
			expect(accepts(g, text)).toBe(true);
		expect(accepts(g, 'id id')).toBe(false);
		expect(accepts(g, 'id ∗')).toBe(false);
	});

	it('accepts the five strings of slide 30 (COOL fragment)', () => {
		const g = grammar(COOL);
		for (const text of [
			'id',
			'if id then id else id fi',
			'while id loop id pool',
			'if while id loop id pool then id else id fi',
			'if if id then id else id fi then id else id fi'
		])
			expect(accepts(g, text)).toBe(true);
		for (const text of ['if id then id fi', 'while id loop id', 'id id', 'if id then id else id'])
			expect(accepts(g, text)).toBe(false);
	});

	it('accepts "the cat" "on" "the mat" "sat" (slide 25)', () => {
		const g = grammar(ENGLISH);
		expect(accepts(g, '"the cat" "on" "the mat" "sat"')).toBe(true);
		expect(accepts(g, '"the cat" "on" "the mat" "under" "the floor" "sat"')).toBe(true);
		expect(accepts(g, '"the cat" "saw" "the mat" "on" "the floor"')).toBe(true);
		expect(accepts(g, '"sat" "the cat"')).toBe(false);
		expect(accepts(g, '"the cat" "on" "sat"')).toBe(false);
	});

	it('accepts ( int ) and int * int with E → T | T + E ; T → int | int * T | ( E )', () => {
		for (const text of [TOP_DOWN, TOP_DOWN_2]) {
			const g = grammar(text);
			expect(accepts(g, '( int )')).toBe(true);
			expect(accepts(g, 'int * int')).toBe(true);
			expect(accepts(g, 'int * int + ( int + int )')).toBe(true);
			expect(accepts(g, 'int * ( int )')).toBe(true);
			expect(accepts(g, '( int ) * int')).toBe(false);
			expect(accepts(g, 'int +')).toBe(false);
		}
	});

	it('handles ε-productions', () => {
		const parens = grammar('S → ε | ( S )');
		for (const text of ['', '( )', '( ( ) )', '( ( ( ( ) ) ) )'])
			expect(accepts(parens, text)).toBe(true);
		for (const text of ['(', ')', '( ) )', '( ( )', ') (', '( ) ( )'])
			expect(accepts(parens, text)).toBe(false);

		const optional = grammar('S → A B c\nA → a | ε\nB → ε | b B');
		for (const text of ['c', 'a c', 'b c', 'a b b b c']) expect(accepts(optional, text)).toBe(true);
		for (const text of ['', 'a', 'b a c', 'a a c', 'c c'])
			expect(accepts(optional, text)).toBe(false);

		const nested = grammar('S → A A A\nA → B B | a\nB → ε | b');
		for (const text of ['', 'a', 'b', 'a a a', 'b b b b b b', 'b a b b'])
			expect(accepts(nested, text)).toBe(true);
		for (const text of ['a a a a', 'b b b b b b b', 'a b a b a b a'])
			expect(accepts(nested, text)).toBe(false);
	});

	it('handles left recursion, right recursion and recursion hidden behind ε', () => {
		const left = grammar('S → 1 | S 0');
		const right = grammar('S → 1 A\nA → 0 | 1 A');
		expect(accepts(left, '1 0 0 0')).toBe(true);
		expect(accepts(left, '0 1')).toBe(false);
		expect(accepts(right, '1 1 1 0')).toBe(true);
		expect(accepts(right, '1 0 1')).toBe(false);
		const hidden = grammar('S → A S b | c\nA → ε | a');
		for (const text of ['c', 'c b', 'a c b', 'c b b', 'a a c b b'])
			expect(accepts(hidden, text)).toBe(true);
		for (const text of ['a c', 'c b b b a', 'a a a c b b'])
			expect(accepts(hidden, text)).toBe(false);
	});

	it('handles grammars with cycles', () => {
		expect(recognizes(grammar('A → A | a'), ['a'])).toBe(true);
		expect(recognizes(grammar('A → A | a'), ['a', 'a'])).toBe(false);
		const g = grammar('S → S S | a | ε');
		expect(recognizes(g, [])).toBe(true);
		expect(recognizes(g, ['a', 'a', 'a', 'a'])).toBe(true);
		expect(recognizes(g, ['a', 'b'])).toBe(false);
	});

	it('matches terminals only: the name of a non-terminal is not a token', () => {
		const g = grammar(AMBIGUOUS);
		expect(recognizes(g, ['E'])).toBe(false);
		expect(recognizes(g, ['int', '+', 'E'])).toBe(false);
		expect(recognizes(g, ['int', '+', 'x'])).toBe(false);
		expect(recognizes(g, ['int', '+', 'int'])).toBe(true);
		expect(recognizes(grammar('S → S a'), [])).toBe(false);
	});
});

describe('parseTrees: lecture trees', () => {
	it('finds the two trees of int + int + int (Ambiguity …, slide 4)', () => {
		const g = grammar(AMBIGUOUS);
		const result = parseTrees(g, input(g, 'int + int + int'));
		expect(result.truncated).toBe(false);
		expect(result.trees).toHaveLength(2);
		expect(new Set(result.trees.map(bracketForm))).toEqual(
			new Set(['E( E( E(int) + E(int) ) + E(int) )', 'E( E(int) + E( E(int) + E(int) ) )'])
		);
	});

	it('finds the two trees of int * int + int (slide 5)', () => {
		expect(forms(grammar(AMBIGUOUS), 'int * int + int')).toEqual([
			'E( E( E(int) * E(int) ) + E(int) )',
			'E( E(int) * E( E(int) + E(int) ) )'
		]);
	});

	it('finds the one tree of int * int + int under E → E + T | T ; … (slide 10)', () => {
		const g = grammar(CASCADE);
		expect(forms(g, 'int * int + int')).toEqual([
			'E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )'
		]);
		expect(leftRecursion(g).map((r) => [r.nonterminal, r.immediate])).toEqual([
			['E', true],
			['T', true]
		]);
		expect(forms(g, 'int + int + int')).toEqual([
			'E( E( E( T( F(int) ) ) + T( F(int) ) ) + T( F(int) ) )'
		]);
	});

	it('finds the two trees of the dangling else (slides 11–12)', () => {
		const g = grammar(DANGLING_ELSE);
		const result = parseTrees(g, input(g, 'if OTHER then if OTHER then OTHER else OTHER'));
		expect(result.truncated).toBe(false);
		expect(result.trees.map(bracketForm)).toEqual([
			// if E1 then ( if E2 then E3 else E4 )
			'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) else E(OTHER) ) )',
			// if E1 then ( if E2 then E3 ) else E4
			'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) ) else E(OTHER) )'
		]);
	});

	it('finds one tree, rooted at E → UIF, under the MIF/UIF grammar (slides 13–14)', () => {
		const g = grammar(MATCHED_IF);
		const { trees, truncated } = parseTrees(
			g,
			input(g, 'if OTHER then if OTHER then OTHER else OTHER')
		);
		expect(truncated).toBe(false);
		expect(trees.map(bracketForm)).toEqual([
			'E( UIF( if E( MIF(OTHER) ) then E( MIF( if E( MIF(OTHER) ) then MIF(OTHER) else MIF(OTHER) ) ) ) )'
		]);
		expect(trees[0].production).toBe(1);
		expect(g.productions[1]).toMatchObject({ lhs: 'E', rhs: ['UIF'] });
		expect(trees[0].children[0].symbol).toBe('UIF');
	});

	it('finds the two trees of slides 17 and 18', () => {
		expect(forms(grammar('E → E + E | int'), 'int + int + int')).toEqual([
			'E( E(int) + E( E(int) + E(int) ) )',
			'E( E( E(int) + E(int) ) + E(int) )'
		]);
		expect(forms(grammar('E → E + E | E * E | int'), 'int + int * int')).toEqual([
			'E( E(int) + E( E(int) * E(int) ) )',
			'E( E( E(int) + E(int) ) * E(int) )'
		]);
	});

	it('finds the trees of the recursive-descent examples (Top-Down Parsing, slides 16 and 20)', () => {
		expect(forms(grammar(TOP_DOWN), '( int )')).toEqual(['E( T( ( E( T(int) ) ) ) )']);
		expect(forms(grammar(TOP_DOWN_2), 'int * int')).toEqual(['E( T( int * T(int) ) )']);
	});
});

describe('parseTrees', () => {
	it('gives nodes their production and the tokens they cover', () => {
		const g = grammar(CASCADE);
		const tokens = input(g, 'int * int + int');
		const [tree] = parseTrees(g, tokens).trees;
		expect(tree).toMatchObject({ symbol: 'E', terminal: false, production: 0, start: 0, end: 5 });
		expect(tree.children.map((c) => [c.symbol, c.terminal, c.production, c.start, c.end])).toEqual([
			['E', false, 1, 0, 3],
			['+', true, undefined, 3, 4],
			['T', false, 3, 4, 5]
		]);
		expectValidTree(g, tokens, tree);
	});

	it('is checked by a validator that notices a wrong tree', () => {
		const g = grammar(CASCADE);
		const tokens = input(g, 'int * int + int');
		const broken = (change: (tree: ParseNode) => void): string[] => {
			const [tree] = parseTrees(g, tokens).trees;
			change(tree);
			return treeProblems(g, tokens, tree);
		};
		expect(broken(() => {})).toEqual([]);
		expect(broken((t) => (t.production = 1))).toEqual([
			'children are not the right-hand side at E [0, 5)'
		]);
		expect(broken((t) => (t.children[2].start = 3))).toContain(
			'child does not start where the last one ended at T [3, 5)'
		);
		expect(broken((t) => t.children.pop()).length).toBeGreaterThan(0);
		expect(broken((t) => (t.children[1].terminal = false)).length).toBeGreaterThan(0);
		const loop = grammar('A → A | a');
		const [inner] = parseTrees(loop, ['a']).trees;
		const outer: ParseNode = { ...inner, production: 0, children: [inner] };
		expect(treeProblems(loop, ['a'], outer)).toEqual(['repeats an ancestor at A [0, 1)']);
	});

	it('gives an ε-production a node without children', () => {
		const g = grammar('S → ε | ( S )');
		const [tree] = parseTrees(g, ['(', ')']).trees;
		expect(tree.children[1]).toEqual({
			symbol: 'S',
			terminal: false,
			children: [],
			production: 0,
			start: 1,
			end: 1
		});
		expect(parseTrees(g, []).trees).toEqual([
			{ symbol: 'S', terminal: false, children: [], production: 0, start: 0, end: 0 }
		]);
	});

	it('returns no tree for a string outside the language', () => {
		const g = grammar(ARITHMETIC);
		expect(parseTrees(g, input(g, '( int ) )'))).toEqual({ trees: [], truncated: false });
		expect(parseTrees(g, [])).toEqual({ trees: [], truncated: false });
		expect(parseTrees(g, ['E'])).toEqual({ trees: [], truncated: false });
	});

	it('lists earlier productions first, then shorter left parts', () => {
		// Production order decides at the root: E → E * E is written before E → E + E here.
		expect(forms(grammar('E → E * E | E + E | int'), 'int * int + int')).toEqual([
			'E( E(int) * E( E(int) + E(int) ) )',
			'E( E( E(int) * E(int) ) + E(int) )'
		]);
		// Within E → E + E the left E takes one token before it takes three or five.
		expect(forms(grammar('E → E + E | int'), 'int + int + int + int')).toEqual([
			'E( E(int) + E( E(int) + E( E(int) + E(int) ) ) )',
			'E( E(int) + E( E( E(int) + E(int) ) + E(int) ) )',
			'E( E( E(int) + E(int) ) + E( E(int) + E(int) ) )',
			'E( E( E(int) + E( E(int) + E(int) ) ) + E(int) )',
			'E( E( E( E(int) + E(int) ) + E(int) ) + E(int) )'
		]);
	});

	it('finds every tree: the Catalan numbers for E → E + E | int', () => {
		const g = grammar('E → E + E | int');
		const sum = (n: number) => Array.from({ length: n }, () => 'int').join(' + ');
		const counts = [1, 2, 3, 4, 5, 6, 7].map(
			(n) => parseTrees(g, input(g, sum(n)), { limit: 1000 }).trees.length
		);
		expect(counts).toEqual([1, 1, 2, 5, 14, 42, 132]);
	});

	it('finds every tree when ambiguity comes from ε', () => {
		const g = grammar('S → A B\nA → a | ε\nB → a | ε');
		expect(forms(g, 'a')).toEqual(['S( A(ε) B(a) )', 'S( A(a) B(ε) )']);
		expect(forms(g, '')).toEqual(['S( A(ε) B(ε) )']);
		expect(forms(g, 'a a')).toEqual(['S( A(a) B(a) )']);
		const hidden = grammar('S → A S b | c\nA → ε | a');
		expect(forms(hidden, 'a c b b')).toEqual([
			'S( A(ε) S( A(a) S(c) b ) b )',
			'S( A(a) S( A(ε) S(c) b ) b )'
		]);
	});

	it('stops at the limit and says there are more', () => {
		const g = grammar('E → E + E | int');
		const tokens = input(g, Array.from({ length: 11 }, () => 'int').join(' + '));
		const byDefault = parseTrees(g, tokens);
		expect(byDefault.trees).toHaveLength(50);
		expect(byDefault.truncated).toBe(true);
		const all = parseTrees(g, tokens, { limit: 20000 });
		expect(all.trees).toHaveLength(16796);
		expect(all.truncated).toBe(false);
		expect(new Set(all.trees.map(bracketForm)).size).toBe(16796);
		expect(byDefault.trees).toEqual(all.trees.slice(0, 50));
	});

	it('reports truncation exactly at the limit', () => {
		const g = grammar(AMBIGUOUS);
		const tokens = input(g, 'int + int + int');
		expect(parseTrees(g, tokens, { limit: 2 })).toMatchObject({ truncated: false });
		expect(parseTrees(g, tokens, { limit: 2 }).trees).toHaveLength(2);
		const one = parseTrees(g, tokens, { limit: 1 });
		expect(one.trees.map(bracketForm)).toEqual(['E( E(int) + E( E(int) + E(int) ) )']);
		expect(one.truncated).toBe(true);
		expect(parseTrees(g, tokens, { limit: 0 })).toEqual({ trees: [], truncated: true });
		expect(parseTrees(g, input(g, 'int +'), { limit: 0 })).toEqual({ trees: [], truncated: false });
	});

	it('hands out trees that share no nodes', () => {
		const g = grammar(AMBIGUOUS);
		const { trees } = parseTrees(g, input(g, 'int + int * int + int'));
		const seen = new Set<ParseNode>();
		let count = 0;
		for (const tree of trees)
			walk(tree, (node) => {
				seen.add(node);
				count++;
			});
		expect(trees).toHaveLength(5);
		expect(seen.size).toBe(count);
	});

	it('does not loop on A → A | a: a derivation never revisits a non-terminal over the same tokens', () => {
		expect(forms(grammar('A → A | a'), 'a')).toEqual(['A(a)']);
		expect(forms(grammar('A → B | a\nB → A'), 'a')).toEqual(['A(a)']);
		expect(forms(grammar('S → A\nA → B | a\nB → A | a'), 'a')).toEqual([
			'S( A( B(a) ) )',
			'S( A(a) )'
		]);
	});

	it('does not loop on cycles through ε', () => {
		const g = grammar('S → S S | a | ε');
		expect(forms(g, '')).toEqual(['S(ε)']);
		expect(forms(g, 'a')).toEqual(['S(a)']);
		expect(forms(g, 'a a a')).toEqual(['S( S(a) S( S(a) S(a) ) )', 'S( S( S(a) S(a) ) S(a) )']);
		expect(parseTrees(g, input(g, 'a a a a a')).trees).toHaveLength(14);

		const mutual = grammar('S → A A\nA → S | ε | a');
		expect(forms(mutual, '')).toEqual(['S( A(ε) A(ε) )']);
		expect(forms(mutual, 'a')).toEqual(['S( A(ε) A(a) )', 'S( A(a) A(ε) )']);
		// A over the first a cannot go through S again: that S would need an A over the same a.
		expect(forms(mutual, 'a a')).toEqual(['S( A(a) A(a) )']);
		const three = parseTrees(mutual, ['a', 'a', 'a']);
		expect(three.trees.map(bracketForm)).toEqual([
			'S( A(a) A( S( A(a) A(a) ) ) )',
			'S( A( S( A(a) A(a) ) ) A(a) )'
		]);
		for (const tree of three.trees) expectValidTree(mutual, ['a', 'a', 'a'], tree);
	});

	it('parses long inputs with left and right recursion', () => {
		const left = grammar(CASCADE);
		const right = grammar(TOP_DOWN);
		const tokens = Array.from({ length: 401 }, (_, i) =>
			i % 2 === 0 ? 'int' : i % 4 === 1 ? '+' : '*'
		);
		for (const g of [left, right]) {
			const { trees, truncated } = parseTrees(g, tokens);
			expect(trees).toHaveLength(1);
			expect(truncated).toBe(false);
			expect(yieldOf(trees[0])).toEqual(tokens);
		}
		const ambiguous = grammar(AMBIGUOUS);
		expect(parseTrees(ambiguous, tokens.slice(0, 101), { limit: 3 })).toMatchObject({
			truncated: true
		});
	});

	it('throws a plain error for a tree too deep to build', () => {
		const g = grammar('S → ε | ( S )');
		const depth = 20000;
		const tokens = Array.from({ length: 2 * depth }, (_, i) => (i < depth ? '(' : ')'));
		expect(recognizes(g, tokens)).toBe(true);
		expect(() => parseTrees(g, tokens)).toThrow('The input is too long');
		expect(parseTrees(g, tokens.slice(depth - 100, depth + 100)).trees).toHaveLength(1);
	});

	it('returns valid trees whose derivations rebuild them', () => {
		const cases: [string, string[]][] = [
			[AMBIGUOUS, ['int + int * int + int', '( int + int ) * int']],
			[DANGLING_ELSE, ['if OTHER then if OTHER then if OTHER then OTHER else OTHER else OTHER']],
			[ENGLISH, ['"the cat" "on" "the mat" "saw" "the cat" "under" "the floor"']],
			['S → A S b | c\nA → ε | a', ['a c b b', 'a a c b b b']],
			['S → S S | a | ε', ['a a a a']]
		];
		for (const [text, inputs] of cases) {
			const g = grammar(text);
			for (const sentence of inputs) {
				const tokens = input(g, sentence);
				const { trees } = parseTrees(g, tokens);
				expect(trees.length).toBeGreaterThan(0);
				for (const tree of trees) {
					expectValidTree(g, tokens, tree);
					expect(treeFromDerivation(g, derivationFromTree(g, tree, 'leftmost'))).toEqual(tree);
				}
			}
		}
	});
});

describe('enumerateLanguage', () => {
	it('lists L(G) = { "0", "1" } for S → 0 | 1 (Introduction to Parsing, slide 26)', () => {
		expect(enumerateLanguage(grammar('S → 0 | 1'), { maxLength: 10, limit: 100 })).toEqual({
			strings: [['0'], ['1']],
			truncated: false,
			limited: false
		});
	});

	it('lists { 1 0, 1 1 } for S → 1 A ; A → 0 | 1', () => {
		const g = grammar('S → 1 A\nA → 0 | 1');
		const { strings, truncated } = enumerateLanguage(g, { maxLength: 10, limit: 100 });
		expect(new Set(strings.map((s) => s.join(' ')))).toEqual(new Set(['1 0', '1 1']));
		expect(truncated).toBe(false);
		// T = { 1, 0 } in order of appearance, so 1 1 is listed before 1 0.
		expect(g.terminals).toEqual(['1', '0']);
		expect(strings).toEqual([
			['1', '1'],
			['1', '0']
		]);
	});

	it('lists 1 0, 1 1 0, 1 1 1 0 … for S → 1 A ; A → 0 | 1 A, a type 3 grammar (slide 27)', () => {
		const g = grammar('S → 1 A\nA → 0 | 1 A');
		expect(language(g, 4)).toEqual({ strings: ['1 0', '1 1 0', '1 1 1 0'], truncated: true });
		expect(language(g, 7).strings).toHaveLength(6);
		expect(chomskyType(g).type).toBe(3);
	});

	it('lists ε, ( ), ( ( ) ) … for S → ε | ( S ), a type 2 grammar (slide 27)', () => {
		const g = grammar('S → ε | ( S )');
		expect(enumerateLanguage(g, { maxLength: 4, limit: 100 })).toEqual({
			strings: [[], ['(', ')'], ['(', '(', ')', ')']],
			truncated: true,
			limited: false
		});
		expect(language(g, 5).strings).toEqual(['ε', '( )', '( ( ) )']);
		expect(chomskyType(g).type).toBe(2);
	});

	it('orders sentences by length, then by the order of the grammar’s terminals', () => {
		// T = { +, *, (, ), int }
		expect(language(grammar(AMBIGUOUS), 5).strings).toEqual([
			'int',
			'( int )',
			'int + int',
			'int * int',
			'( ( int ) )',
			'( int + int )',
			'( int * int )',
			'( int ) + int',
			'( int ) * int',
			'int + ( int )',
			'int + int + int',
			'int + int * int',
			'int * ( int )',
			'int * int + int',
			'int * int * int'
		]);
		// T = { int, +, *, (, ) }
		expect(language(grammar(ARITHMETIC), 3).strings).toEqual([
			'int',
			'int + int',
			'int * int',
			'( int )'
		]);
		expect(language(grammar('S → b | a | S S'), 2).strings).toEqual([
			'b',
			'a',
			'b b',
			'b a',
			'a b',
			'a a'
		]);
	});

	it('lists each sentence once, however many trees it has', () => {
		const { strings } = language(grammar(AMBIGUOUS), 9, 100000);
		expect(new Set(strings).size).toBe(strings.length);
		expect(strings).toHaveLength(257);
		expect(language(grammar('A → A | a | B\nB → a | A'), 3)).toEqual({
			strings: ['a'],
			truncated: false
		});
	});

	it('stops at the limit and says there are more', () => {
		const g = grammar(AMBIGUOUS);
		expect(language(g, 5, 3)).toEqual({
			strings: ['int', '( int )', 'int + int'],
			truncated: true
		});
		expect(language(g, 5, 0)).toEqual({ strings: [], truncated: true });
		const finite = grammar('S → a | b | c c');
		expect(language(finite, 5, 3)).toEqual({ strings: ['a', 'b', 'c c'], truncated: false });
		expect(language(finite, 5, 2)).toEqual({ strings: ['a', 'b'], truncated: true });
		expect(language(finite, 1, 10)).toEqual({ strings: ['a', 'b'], truncated: true });
	});

	it('sets limited only when the limit cut the list', () => {
		const g = grammar(AMBIGUOUS);
		// Four sentences have at most three tokens.
		expect(limited(g, 3, 3)).toBe(true);
		expect(limited(g, 3, 4)).toBe(false);
		expect(limited(g, 3, 0)).toBe(true);
		expect(language(g, 3, 4).truncated).toBe(true);
		expect(limited(grammar('S → a a a'), 2, 0)).toBe(false);
		expect(limited(grammar('S → S a'), 5, 0)).toBe(false);
	});

	it('sets truncated when there are sentences longer than maxLength', () => {
		expect(language(grammar('S → a a a'), 2)).toEqual({ strings: [], truncated: true });
		expect(language(grammar('S → a a a'), 3)).toEqual({ strings: ['a a a'], truncated: false });
		expect(language(grammar('S → ε | ( S )'), 0)).toEqual({ strings: ['ε'], truncated: true });
		expect(language(grammar('S → ε'), 0)).toEqual({ strings: ['ε'], truncated: false });
	});

	it('returns nothing for the empty language', () => {
		expect(language(grammar('S → S a'), 5)).toEqual({ strings: [], truncated: false });
		expect(language(grammar('S → A\nA → A a | S'), 5)).toEqual({ strings: [], truncated: false });
	});

	it('terminates on cycles, ε-productions and useless non-terminals', () => {
		expect(language(grammar('S → S S | a | ε'), 3)).toEqual({
			strings: ['ε', 'a', 'a a', 'a a a'],
			truncated: true
		});
		expect(language(grammar('S → A A\nA → S | ε | a'), 2).strings).toEqual(['ε', 'a', 'a a']);
		expect(language(grammar('S → a | S C | b B\nC → C c\nB → B'), 6)).toEqual({
			strings: ['a'],
			truncated: false
		});
		expect(language(grammar('S → A S | a\nA → ε'), 6)).toEqual({
			strings: ['a'],
			truncated: false
		});
	});

	it('takes a large maxLength in stride when the language is small or the limit is', () => {
		expect(language(grammar('S → 0 | 1'), 1e9)).toEqual({ strings: ['0', '1'], truncated: false });
		expect(language(grammar('S → a S | b S | c S | ε'), 40, 5)).toEqual({
			strings: ['ε', 'a', 'b', 'c', 'a a'],
			truncated: true
		});
		expect(language(grammar(ENGLISH), 3).strings.slice(0, 3)).toEqual([
			'"the cat" sat',
			'"the cat" saw',
			'"the mat" sat'
		]);
	});
});

describe('compareGrammars', () => {
	it('finds no difference between the ambiguous and the E/T/F grammar up to length 7', () => {
		expect(compareGrammars(grammar(AMBIGUOUS), grammar(CASCADE), { maxLength: 7 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 7
		});
	});

	it('finds no difference between the dangling-else and the MIF/UIF grammar up to length 9', () => {
		const a = grammar(DANGLING_ELSE);
		const b = grammar(MATCHED_IF);
		expect(compareGrammars(a, b, { maxLength: 9 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 9
		});
		// The comparison is not vacuous: there are nested ifs within the bound.
		expect(language(a, 9).strings).toContain('if OTHER then if OTHER then OTHER else OTHER');
		expect(language(a, 9).strings).toEqual(language(b, 9).strings);
	});

	it('finds no difference between the two orders of the top-down grammar', () => {
		expect(compareGrammars(grammar(TOP_DOWN), grammar(TOP_DOWN_2), { maxLength: 8 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 8
		});
	});

	it('lists the sentences only one grammar generates', () => {
		const all = grammar('S → a S | ε');
		const even = grammar('S → a a S | ε');
		expect(compareGrammars(all, even, { maxLength: 4 })).toEqual({
			onlyA: [['a'], ['a', 'a', 'a']],
			onlyB: [],
			checkedUpTo: 4
		});
		expect(compareGrammars(even, all, { maxLength: 4 }).onlyB).toEqual([['a'], ['a', 'a', 'a']]);
		expect(compareGrammars(grammar('S → a | b'), grammar('X → c | b'), { maxLength: 3 })).toEqual({
			onlyA: [['a']],
			onlyB: [['c']],
			checkedUpTo: 3
		});
	});

	it('shows what the right-recursive grammar loses: ( int ) * int', () => {
		const { onlyA, onlyB } = compareGrammars(grammar(CASCADE), grammar(TOP_DOWN), { maxLength: 5 });
		expect(onlyA.map((s) => printSymbols(s))).toEqual(['( int ) * int']);
		expect(onlyB).toEqual([]);
	});

	it('lists each side in its own grammar’s order', () => {
		const a = grammar('S → x | y | z | x x');
		const b = grammar('S → q');
		expect(compareGrammars(a, b, { maxLength: 2 }).onlyA).toEqual([
			['x'],
			['y'],
			['z'],
			['x', 'x']
		]);
		expect(compareGrammars(b, grammar('S → z | y | x'), { maxLength: 2 }).onlyB).toEqual([
			['z'],
			['y'],
			['x']
		]);
	});

	it('compares with the empty language and with length 0', () => {
		const empty = grammar('S → S a');
		expect(compareGrammars(empty, grammar('T → T b'), { maxLength: 6 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 6
		});
		expect(compareGrammars(empty, grammar('S → a | ε'), { maxLength: 6 })).toEqual({
			onlyA: [],
			onlyB: [[], ['a']],
			checkedUpTo: 6
		});
		expect(compareGrammars(grammar('S → ε | a'), grammar('S → a'), { maxLength: 0 })).toEqual({
			onlyA: [[]],
			onlyB: [],
			checkedUpTo: 0
		});
		expect(compareGrammars(grammar('S → 0 | 1'), grammar('S → 1 | 0'), { maxLength: 1e9 })).toEqual(
			{
				onlyA: [],
				onlyB: [],
				checkedUpTo: 1e9
			}
		);
	});

	it('stops at the last length it could finish when a language is too large', () => {
		const a = grammar('S → a S | b S | ε');
		const b = grammar('S → a S | b S | c | ε');
		// |L(B)| by length: 1, 3, 6, 12: the fourth level passes 20 sentences.
		const result = compareGrammars(a, b, { maxLength: 10, maxSentences: 20 });
		expect(result.checkedUpTo).toBe(2);
		expect(result.onlyA).toEqual([]);
		expect(result.onlyB.map((s) => printSymbols(s))).toEqual(['c', 'a c', 'b c']);
		expect(compareGrammars(a, b, { maxLength: 2, maxSentences: 20 }).checkedUpTo).toBe(2);
		expect(compareGrammars(b, a, { maxLength: 10, maxSentences: 22 }).checkedUpTo).toBe(3);
		expect(compareGrammars(a, b, { maxLength: 6 }).checkedUpTo).toBe(6);
	});
});

/**
 * Counts parse trees the slow way, with the same rule about loops: a node may
 * not repeat the non-terminal and token range of an ancestor. Gives up (null)
 * after `budget` steps.
 */
function countTrees(g: Grammar, tokens: readonly string[], budget: number): number | null {
	const isNonterminal = new Set(g.nonterminals);
	let steps = 0;
	const count = (x: string, a: number, b: number, path: string[]): number => {
		const key = `${x} ${a} ${b}`;
		if (path.includes(key)) return 0;
		let total = 0;
		for (const p of g.productions) if (p.lhs === x) total += ways(p.rhs, 0, a, b, [...path, key]);
		return total;
	};
	const ways = (rhs: string[], k: number, a: number, b: number, path: string[]): number => {
		if (++steps > budget) throw new Error('budget');
		if (k === rhs.length) return a === b ? 1 : 0;
		if (!isNonterminal.has(rhs[k]))
			return a < b && tokens[a] === rhs[k] ? ways(rhs, k + 1, a + 1, b, path) : 0;
		let total = 0;
		for (let m = a; m <= b; m++) {
			const rest = ways(rhs, k + 1, m, b, path);
			if (rest > 0) total += count(rhs[k], a, m, path) * rest;
		}
		return total;
	};
	try {
		return count(g.start, 0, tokens.length, []);
	} catch {
		return null;
	}
}

const allStrings = (terminals: readonly string[], max: number): string[][] => {
	const out: string[][] = [[]];
	for (let from = 0, length = 0; length < max; length++) {
		const to = out.length;
		for (let i = from; i < to; i++) for (const t of terminals) out.push([...out[i], t]);
		from = to;
	}
	return out;
};

describe('the Earley parser against the definitions, on random grammars', () => {
	const ROUNDS = 1000;

	it('lists exactly the sentences the productions generate, in order', () => {
		const next = random(2026);
		let sentences = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const expected = bruteForce(g, 5);
			const { strings } = enumerateLanguage(g, { maxLength: 5, limit: 1e6 });
			expect(strings, printSymbols(g.productions.map((p) => `${p.lhs}→${p.rhs.join('')}`))).toEqual(
				expected
			);
			sentences += expected.length;
		}
		expect(sentences).toBeGreaterThan(2500);
	});

	it('recognizes exactly those sentences', () => {
		const next = random(7);
		let accepted = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const expected = new Set(bruteForce(g, 4).map((s) => s.join(' ')));
			for (const tokens of allStrings(g.terminals, 4)) {
				const inLanguage = expected.has(tokens.join(' '));
				expect(recognizes(g, tokens)).toBe(inLanguage);
				if (inLanguage) accepted++;
			}
		}
		expect(accepted).toBeGreaterThan(2000);
	});

	it('finds as many trees as counting by hand, all valid and distinct', () => {
		const next = random(99);
		let compared = 0;
		let ambiguous = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			for (const tokens of bruteForce(g, 4).slice(0, 12)) {
				const { trees, truncated } = parseTrees(g, tokens, { limit: 300 });
				expect(trees.length).toBeGreaterThan(0);
				for (const tree of trees) expectValidTree(g, tokens, tree);
				expect(new Set(trees.map((t) => JSON.stringify(t))).size).toBe(trees.length);
				if (truncated) continue;
				const expected = countTrees(g, tokens, 200000);
				if (expected === null) continue;
				expect(trees.length).toBe(expected);
				compared++;
				if (expected > 1) ambiguous++;
			}
		}
		expect(compared).toBeGreaterThan(2000);
		expect(ambiguous).toBeGreaterThan(400);
	});

	it('agrees with sentenceLengths about the shortest and longest sentence', () => {
		const next = random(31);
		let finite = 0;
		let infinite = 0;
		for (let round = 0; round < ROUNDS; round++) {
			const g = randomGrammar(next);
			const range = sentenceLengths(g);
			const upTo5 = bruteForce(g, 5);
			if (!range) {
				expect(upTo5).toEqual([]);
				expect(enumerateLanguage(g, { maxLength: 40, limit: 1 }).strings).toEqual([]);
				continue;
			}
			if (range.min <= 5) expect(upTo5[0].length).toBe(range.min);
			else expect(upTo5).toEqual([]);
			if (range.max <= 5) {
				expect(upTo5[upTo5.length - 1].length).toBe(range.max);
				expect(enumerateLanguage(g, { maxLength: 40, limit: 1e6 })).toEqual({
					strings: upTo5,
					truncated: false,
					limited: false
				});
				finite++;
			} else if (range.max === Infinity) {
				// Some sentence is longer than five tokens.
				const beyond = enumerateLanguage(g, { maxLength: 90, limit: upTo5.length + 1 });
				expect(beyond.strings).toHaveLength(upTo5.length + 1);
				expect(beyond.truncated).toBe(true);
				infinite++;
			}
		}
		expect(finite).toBeGreaterThan(250);
		expect(infinite).toBeGreaterThan(250);
	});
});
