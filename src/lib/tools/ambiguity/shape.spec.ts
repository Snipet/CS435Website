import { describe, expect, it } from 'vitest';
import {
	bracketForm,
	parseGrammar,
	parseTrees,
	tokenizeInput,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import { describeTree } from '$lib/components/grammar/tree-layout';
import {
	abbreviate,
	foldTree,
	operandTerminals,
	orderTrees,
	shapeKey,
	shapeOf,
	shapeText
} from './shape';
import { AMBIGUOUS, CASCADE, DANGLING_ELSE, MATCHED_IF } from './presets';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

function trees(g: Grammar, input: string): ParseNode[] {
	return parseTrees(g, tokenizeInput(input, g.terminals).tokens).trees;
}

const keys = (g: Grammar, input: string) => trees(g, input).map((t) => shapeKey(shapeOf(t)));

describe('foldTree', () => {
	it('visits children before their parent, left to right', () => {
		const [tree] = trees(grammar(CASCADE), 'int + int');
		const order: string[] = [];
		const size = foldTree<number>(tree, (node, children) => {
			order.push(node.symbol);
			return children.reduce((a, b) => a + b, 1);
		});
		expect(order.join(' ')).toBe('int F T E + int F T E');
		expect(size).toBe(9);
	});

	it('takes a tree far deeper than the call stack', () => {
		const g = grammar('S → ( S ) | x');
		const depth = 6000;
		const input = [...Array(depth).fill('('), 'x', ...Array(depth).fill(')')];
		const [tree] = parseTrees(g, input).trees;
		expect(shapeKey(shapeOf(tree))).toBe('x');
		expect(orderTrees([tree])).toEqual([tree]);
	});
});

describe('shapeOf', () => {
	it('collapses single-child chains: the cascade tree has the shape of the ambiguous one', () => {
		const amb = grammar(AMBIGUOUS);
		const cascade = grammar(CASCADE);
		expect(keys(cascade, 'int * int + int')).toEqual(['[[int * int] + int]']);
		expect(keys(amb, 'int * int + int').sort()).toEqual([
			'[[int * int] + int]',
			'[int * [int + int]]'
		]);
		expect(shapeKey(shapeOf(trees(cascade, 'int')[0]))).toBe('int');
	});

	it('collapses parentheses to what they enclose', () => {
		const cascade = grammar(CASCADE);
		expect(keys(cascade, '( int + int ) * int')).toEqual(['[[int + int] * int]']);
		expect(keys(cascade, '( ( int ) )')).toEqual(['int']);
		expect(keys(grammar(AMBIGUOUS), '( int + int ) * int')).toEqual(['[[int + int] * int]']);
	});

	it('numbers the leaves by token, parentheses included', () => {
		const [tree] = trees(grammar(CASCADE), '( int + int ) * int');
		const shape = shapeOf(tree)!;
		const leaves: [string, number][] = [];
		const walk = (s: typeof shape): void => {
			if (s.kind === 'leaf') leaves.push([s.symbol, s.at]);
			else s.parts.forEach(walk);
		};
		walk(shape);
		expect(leaves).toEqual([
			['int', 1],
			['+', 2],
			['int', 3],
			['*', 5],
			['int', 6]
		]);
	});

	it('drops ε-productions', () => {
		const g = grammar('E → T R\nR → + T R | ε\nT → int');
		expect(keys(g, 'int + int')).toEqual(['[int [+ int]]']);
		expect(keys(g, 'int')).toEqual(['int']);
		expect(shapeOf(trees(grammar('S → ε'), '')[0])).toBeNull();
		expect(shapeKey(null)).toBe('ε');
		expect(shapeText(null)).toBe('ε');
	});

	it('gives the dangling-else trees of both grammars the same shapes', () => {
		const input = 'if OTHER then if OTHER then OTHER else OTHER';
		const inner = '[if OTHER then [if OTHER then OTHER else OTHER]]';
		const outer = '[if OTHER then [if OTHER then OTHER] else OTHER]';
		expect(keys(grammar(DANGLING_ELSE), input).sort()).toEqual([inner, outer].sort());
		expect(keys(grammar(MATCHED_IF), input)).toEqual([inner]);
	});
});

describe('shapeText', () => {
	it('writes the grouping with parentheses, the outermost group bare', () => {
		const amb = grammar(AMBIGUOUS);
		expect(trees(amb, 'int * int + int').map((t) => shapeText(shapeOf(t)))).toEqual([
			'(int * int) + int',
			'int * (int + int)'
		]);
		expect(shapeText(shapeOf(trees(amb, 'int')[0]))).toBe('int');
	});

	it('names tokens with the label function', () => {
		const g = grammar(DANGLING_ELSE);
		const display = ['if', 'E₁', 'then', 'if', 'E₂', 'then', 'E₃', 'else', 'E₄'];
		const texts = trees(g, 'if OTHER then if OTHER then OTHER else OTHER').map((t) =>
			shapeText(shapeOf(t), (at) => display[at])
		);
		expect(texts.sort()).toEqual([
			'if E₁ then (if E₂ then E₃ else E₄)',
			'if E₁ then (if E₂ then E₃) else E₄'
		]);
	});
});

describe('operandTerminals', () => {
	it('lists the terminals that are a whole right-hand side', () => {
		expect([...operandTerminals(grammar(AMBIGUOUS))]).toEqual(['int']);
		expect([...operandTerminals(grammar(CASCADE))]).toEqual(['int']);
		expect([...operandTerminals(grammar(MATCHED_IF))]).toEqual(['OTHER']);
		expect([...operandTerminals(grammar('E → E + E | id | num | ( E )'))]).toEqual(['id', 'num']);
		// A non-terminal alone on a right-hand side is not an operand.
		expect([...operandTerminals(grammar('E → T\nT → T * x | y'))]).toEqual(['y']);
	});
});

describe('abbreviate', () => {
	const input = 'if OTHER then if OTHER then OTHER else OTHER';
	const abbreviated = (g: Grammar, text: string) =>
		trees(g, text).map((t) => describeTree(abbreviate(shapeOf(t)!, operandTerminals(g))));

	it('draws an if with only its sub-expressions: two children if-then, three if-then-else', () => {
		const g = grammar(DANGLING_ELSE);
		expect(abbreviated(g, input).sort()).toEqual([
			'if ( OTHER if ( OTHER OTHER ) OTHER )',
			'if ( OTHER if ( OTHER OTHER OTHER ) )'
		]);
		expect(abbreviated(grammar(MATCHED_IF), input)).toEqual([
			'if ( OTHER if ( OTHER OTHER OTHER ) )'
		]);
	});

	it('keeps the token index of every leaf', () => {
		const g = grammar(MATCHED_IF);
		const tree = abbreviate(shapeOf(trees(g, input)[0])!, operandTerminals(g));
		const starts: (number | undefined)[] = [];
		foldTree(tree, (node) => {
			if (node.terminal) starts.push(node.start);
			return null;
		});
		expect(starts).toEqual([1, 4, 6, 8]);
		expect(tree.terminal).toBe(false);
		expect(tree.production).toBeUndefined();
	});

	it('draws an operator with its operands', () => {
		const g = grammar(AMBIGUOUS);
		expect(abbreviated(g, 'int * int + int')).toEqual([
			'+ ( * ( int int ) int )',
			'* ( int + ( int int ) )'
		]);
		expect(abbreviated(g, '( int )')).toEqual(['int']);
	});

	it('keeps the non-terminal for a group without a keyword, and makes a keyword group a leaf', () => {
		const g = grammar('S → S S | x | begin end');
		expect(abbreviated(g, 'x x')).toEqual(['S ( x x )']);
		const [tree] = trees(g, 'begin end').map((t) => abbreviate(shapeOf(t)!, operandTerminals(g)));
		expect(tree).toEqual({ symbol: 'begin', terminal: true, children: [] });
	});
});

describe('orderTrees', () => {
	const ordered = (g: Grammar, input: string) => orderTrees(trees(g, input)).map(bracketForm);

	it('puts the left-nested tree first (slide 4)', () => {
		const g = grammar(AMBIGUOUS);
		// The parser lists the right-nested tree first.
		expect(trees(g, 'int + int + int').map(bracketForm)[0]).toBe(
			'E( E(int) + E( E(int) + E(int) ) )'
		);
		expect(ordered(g, 'int + int + int')).toEqual([
			'E( E( E(int) + E(int) ) + E(int) )',
			'E( E(int) + E( E(int) + E(int) ) )'
		]);
	});

	it('puts the tree with + at the root first for int * int + int (slide 5)', () => {
		expect(ordered(grammar(AMBIGUOUS), 'int * int + int')).toEqual([
			'E( E( E(int) * E(int) ) + E(int) )',
			'E( E(int) * E( E(int) + E(int) ) )'
		]);
	});

	it('puts the tree with * at the root first for int + int * int (slide 18)', () => {
		expect(ordered(grammar('E → E + E | E * E | int'), 'int + int * int')).toEqual([
			'E( E( E(int) + E(int) ) * E(int) )',
			'E( E(int) + E( E(int) * E(int) ) )'
		]);
	});

	it('puts the else on the outer if first (slide 12): equal leftmost subtrees, smaller rightmost', () => {
		expect(ordered(grammar(DANGLING_ELSE), 'if OTHER then if OTHER then OTHER else OTHER')).toEqual(
			[
				'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) ) else E(OTHER) )',
				'E( if E(OTHER) then E( if E(OTHER) then E(OTHER) else E(OTHER) ) )'
			]
		);
	});

	it('orders five trees from fully left-nested to fully right-nested', () => {
		const g = grammar('E → E + E | int');
		const groupings = orderTrees(trees(g, 'int + int + int + int')).map((t) =>
			shapeText(shapeOf(t))
		);
		expect(groupings).toEqual([
			'((int + int) + int) + int',
			'(int + (int + int)) + int',
			'(int + int) + (int + int)',
			'int + ((int + int) + int)',
			'int + (int + (int + int))'
		]);
	});

	it('does not change its argument and keeps trees that tie in order', () => {
		const g = grammar(AMBIGUOUS);
		const list = trees(g, 'int + int + int');
		const copy = [...list];
		orderTrees(list);
		expect(list).toEqual(copy);
		expect(orderTrees([])).toEqual([]);
		const twice = [list[0], list[0]];
		expect(orderTrees(twice)[0]).toBe(list[0]);
	});
});
