import { describe, expect, it } from 'vitest';
import {
	bracketForm,
	parseGrammar,
	parseTrees,
	tokenizeInput,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import { nodeAtPath } from '$lib/components/grammar/tree-layout';
import {
	allowedTrees,
	binaryOperator,
	binaryOperators,
	filterTrees,
	filterWith,
	leftNestedTrees,
	operatorsOf,
	printDeclaration,
	readDeclarations,
	reasons,
	restrictGrammar,
	violations,
	type Declaration
} from './declarations';
import { orderTrees, shapeOf, shapeText } from './shape';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

function trees(g: Grammar, input: string): ParseNode[] {
	return orderTrees(parseTrees(g, tokenizeInput(input, g.terminals).tokens).trees);
}

const left = (ops: string): Declaration => ({ assoc: 'left', ops });
const right = (ops: string): Declaration => ({ assoc: 'right', ops });
const nonassoc = (ops: string): Declaration => ({ assoc: 'nonassoc', ops });

/** The groupings the declarations keep, and for the others why not. */
function outcome(g: Grammar, input: string, lines: Declaration[]) {
	const list = trees(g, input);
	const f = filterTrees(g, list, lines);
	return list.map((tree, i) => ({
		tree: shapeText(shapeOf(tree)),
		why: reasons(f.violations[i])
	}));
}

describe('operatorsOf', () => {
	it('reads the operators of a line as words separated by spaces', () => {
		expect(operatorsOf('+ -')).toEqual(['+', '-']);
		expect(operatorsOf('== !=')).toEqual(['==', '!=']);
		expect(operatorsOf(`'+' "=="  and`)).toEqual(['+', '==', 'and']);
		expect(operatorsOf('  ')).toEqual([]);
	});

	it('prints a declaration as bison writes it', () => {
		expect(printDeclaration(left('+  -'))).toBe('%left + -');
		expect(printDeclaration(nonassoc('<'))).toBe('%nonassoc <');
		expect(printDeclaration(right(''))).toBe('%right');
	});

	it('prints an operator of several characters whole, in quotes as the grammar writes it', () => {
		expect(printDeclaration(left('=='))).toBe('%left "=="');
		expect(printDeclaration(left('"==" !='))).toBe('%left "==" "!="');
		expect(printDeclaration(left('&& and'))).toBe('%left "&&" and');
	});
});

describe('operators of several characters', () => {
	const g = grammar('E → E "==" E | E "&&" E | E + E | int');

	it('are declared with or without quotes', () => {
		for (const ops of ['==', '"=="', "'=='"]) {
			const p = readDeclarations([left('&&'), nonassoc(ops), left('+')], g);
			expect(p.problems).toEqual([]);
			expect([...p.rules.keys()]).toEqual(['&&', '==', '+']);
			expect(p.rules.get('==')).toEqual({ level: 1, assoc: 'nonassoc', line: 2 });
		}
	});

	it('select a tree like any other operator', () => {
		const lines = [left('&&'), left('=='), left('+')];
		// In a token string, as in a grammar, == is written in quotes.
		expect(outcome(g, 'int "==" int + int', lines)).toEqual([
			{
				tree: '(int == int) + int',
				why: ['+ binds tighter than ==, so == cannot be an operand of +']
			},
			{ tree: 'int == (int + int)', why: [] }
		]);
		expect(filterTrees(g, trees(g, 'int "&&" int "==" int'), lines).undeclared).toEqual([]);
	});

	it('says how to write two operators that were typed as one word', () => {
		const p = readDeclarations([left('+-'), left('*/')], grammar('E → E + E | E - E | int'));
		expect(p.problems).toEqual([
			'+- on line 1 is not a terminal of the grammar. Write + - with spaces.',
			'*/ on line 2 is not a terminal of the grammar.'
		]);
		// ++ is not + twice: there is nothing to separate.
		expect(readDeclarations([left('++')], grammar('E → E + E | int')).problems).toEqual([
			'++ on line 1 is not a terminal of the grammar.'
		]);
		// One line, one report, also when an operator is repeated on it.
		const twice = readDeclarations([left('+'), right('+ + ? ?')], g);
		expect(twice.problems).toEqual([
			'+ is already declared on line 1; line 2 does not change it.',
			'? on line 2 is not a terminal of the grammar.'
		]);
	});
});

describe('readDeclarations', () => {
	it('gives later lines a higher level', () => {
		const p = readDeclarations([left('+ -'), left('* /'), right('^')]);
		expect([...p.rules]).toEqual([
			['+', { level: 0, assoc: 'left', line: 1 }],
			['-', { level: 0, assoc: 'left', line: 1 }],
			['*', { level: 1, assoc: 'left', line: 2 }],
			['/', { level: 1, assoc: 'left', line: 2 }],
			['^', { level: 2, assoc: 'right', line: 3 }]
		]);
		expect(p.problems).toEqual([]);
	});

	it('reports empty lines, repeats and operators the grammar does not have', () => {
		const g = grammar('E → E + E | E * E | int');
		const p = readDeclarations([left('+ +'), left(''), right('+ * ?')], g);
		expect(p.rules.get('+')).toEqual({ level: 0, assoc: 'left', line: 1 });
		expect(p.rules.get('*')).toEqual({ level: 2, assoc: 'right', line: 3 });
		expect(p.problems).toEqual([
			'Line 2 declares no operator.',
			'+ is already declared on line 1; line 3 does not change it.',
			'? on line 3 is not a terminal of the grammar.'
		]);
	});
});

describe('binaryOperators', () => {
	it('lists the operators of productions A → A op A', () => {
		expect(binaryOperators(grammar('E → E + E | E * E | ( E ) | int'))).toEqual(['+', '*']);
		expect(binaryOperators(grammar('E → E * E | S\nS → S + S | int'))).toEqual(['*', '+']);
		expect(binaryOperators(grammar('E → if E then E | OTHER'))).toEqual([]);
	});

	it('leaves out productions that fix how the operator groups (E → E + T)', () => {
		const cascade = grammar('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		expect(binaryOperators(cascade)).toEqual([]);
		expect(cascade.productions.map((p) => binaryOperator(cascade, p))).toEqual(
			cascade.productions.map(() => null)
		);
		expect(binaryOperators(grammar('E → T + E | T\nT → int'))).toEqual([]);
		// A non-terminal between two E is not an operator.
		const g = grammar('E → E Op E | int\nOp → + | *');
		expect(binaryOperators(g)).toEqual([]);
		expect(binaryOperator(g, undefined)).toBeNull();
	});
});

describe('associativity (slide 17)', () => {
	const g = grammar('E → E + E | int');

	it('%left + crosses out the right-nested tree of int + int + int', () => {
		expect(outcome(g, 'int + int + int', [left('+')])).toEqual([
			{ tree: '(int + int) + int', why: [] },
			{
				tree: 'int + (int + int)',
				why: ['+ is left-associative, so the right operand of + cannot be another +']
			}
		]);
	});

	it('%right + crosses out the left-nested tree', () => {
		expect(outcome(g, 'int + int + int', [right('+')])).toEqual([
			{
				tree: '(int + int) + int',
				why: ['+ is right-associative, so the left operand of + cannot be another +']
			},
			{ tree: 'int + (int + int)', why: [] }
		]);
	});

	it('%nonassoc + crosses out both', () => {
		const f = filterTrees(g, trees(g, 'int + int + int'), [nonassoc('+')]);
		expect(f.kept).toEqual([]);
		expect(f.violations.map(reasons)).toEqual([
			['+ is non-associative, so an operand of + cannot be another +'],
			['+ is non-associative, so an operand of + cannot be another +']
		]);
	});

	it('keeps exactly one of the five trees of int + int + int + int', () => {
		const list = trees(g, 'int + int + int + int');
		expect(list).toHaveLength(5);
		expect(filterTrees(g, list, [left('+')]).kept).toEqual([0]);
		expect(filterTrees(g, list, [right('+')]).kept).toEqual([4]);
	});

	it('keeps every tree without declarations and names the undeclared operator', () => {
		const f = filterTrees(g, trees(g, 'int + int + int'), []);
		expect(f.kept).toEqual([0, 1]);
		expect(f.undeclared).toEqual(['+']);
		expect(f.problems).toEqual([]);
	});
});

describe('precedence (slide 18)', () => {
	const g = grammar('E → E + E | E * E | int');

	it('%left + then %left * crosses out the tree of int + int * int with * at the root', () => {
		expect(outcome(g, 'int + int * int', [left('+'), left('*')])).toEqual([
			{
				tree: '(int + int) * int',
				why: ['* binds tighter than +, so + cannot be an operand of *']
			},
			{ tree: 'int + (int * int)', why: [] }
		]);
	});

	it('the other order of the lines crosses out the other tree', () => {
		expect(outcome(g, 'int + int * int', [left('*'), left('+')])).toEqual([
			{ tree: '(int + int) * int', why: [] },
			{
				tree: 'int + (int * int)',
				why: ['+ binds tighter than *, so * cannot be an operand of +']
			}
		]);
	});

	it('operators on one line share a precedence', () => {
		expect(outcome(g, 'int + int * int', [left('+ *')])).toEqual([
			{ tree: '(int + int) * int', why: [] },
			{
				tree: 'int + (int * int)',
				why: [
					'+ and * have the same precedence and are left-associative, so the right operand of + cannot be a *'
				]
			}
		]);
	});

	it('a declaration for one operator leaves the other alone', () => {
		const f = filterTrees(g, trees(g, 'int + int * int'), [left('+')]);
		expect(f.kept).toEqual([0, 1]);
		expect(f.undeclared).toEqual(['*']);
	});

	it('selects one tree of a longer string and marks the two operators of a violation', () => {
		const lines = [left('+'), left('*')];
		const list = trees(g, 'int * int + int * int + int');
		const f = filterTrees(g, list, lines);
		expect(f.kept).toHaveLength(1);
		expect(shapeText(shapeOf(list[f.kept[0]]))).toBe('((int * int) + (int * int)) + int');
		const [bad] = trees(g, 'int + int * int');
		const [v] = violations(g, bad, readDeclarations(lines));
		expect(v).toMatchObject({ kind: 'precedence', operator: '*', operand: '+', side: 'left' });
		expect(v.path).toEqual([]);
		expect(v.marks.map((path) => nodeAtPath(bad, path)?.symbol)).toEqual(['*', '+']);
	});
});

describe('operands', () => {
	it('are looked at through single productions but not through parentheses', () => {
		const lines = [left('+'), left('*')];
		const flat = grammar('E → E + E | E * E | ( E ) | int');
		const [paren] = trees(flat, '( int + int ) * int');
		expect(bracketForm(paren)).toBe('E( E( ( E( E(int) + E(int) ) ) ) * E(int) )');
		expect(violations(flat, paren, readDeclarations(lines))).toEqual([]);
		// E → S hides nothing: the + under it is still an operand of *.
		const g = grammar('E → E * E | S\nS → S + S | int');
		const [chained] = trees(g, 'int + int * int');
		expect(bracketForm(chained)).toBe('E( E( S( S(int) + S(int) ) ) * E( S(int) ) )');
		const found = violations(g, chained, readDeclarations(lines));
		expect(found.map((v) => v.message)).toEqual([
			'* binds tighter than +, so + cannot be an operand of *'
		]);
		expect(found[0].marks.map((path) => nodeAtPath(chained, path)?.symbol)).toEqual(['*', '+']);
	});

	it('are not restricted in a grammar that is already a cascade', () => {
		const g = grammar('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		const list = trees(g, 'int + int * int + int');
		expect(list).toHaveLength(1);
		expect(filterTrees(g, list, [left('+'), left('*')]).kept).toEqual([0]);
	});

	it('are not restricted by a declaration that goes against an unambiguous grammar', () => {
		// E → E + T makes + group to the left. %right + does not turn the one tree
		// of the string into a syntax error: bison uses declarations only where
		// two parses are possible.
		const g = grammar('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		for (const lines of [[right('+')], [nonassoc('+')], [left('*'), left('+')]]) {
			const f = filterTrees(g, trees(g, 'int + int + int'), lines);
			expect(f.kept).toEqual([0]);
			expect(f.violations).toEqual([[]]);
			expect(f.undeclared).toEqual([]);
		}
		const rightRecursive = grammar('E → T + E | T\nT → int');
		expect(
			filterTrees(rightRecursive, trees(rightRecursive, 'int + int + int'), [left('+')]).kept
		).toEqual([0]);
	});
});

describe('restrictGrammar', () => {
	it('writes %left + into E → E + E | int', () => {
		const g = grammar('E → E + E | int');
		const r = restrictGrammar(g, readDeclarations([left('+')], g))!;
		// The right operand is a copy of E without E → E + E.
		expect(r.grammar.start).toBe('E');
		expect(r.grammar.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ')}`)).toEqual([
			'E → E + E·1',
			'E → int',
			'E·1 → int'
		]);
		expect(r.origin).toEqual([0, 1, 1]);
		expect([...r.names]).toEqual([
			['E', 'E'],
			['E·1', 'E']
		]);
	});

	it('writes two levels into E → E + E | E * E | int: the cascade', () => {
		const g = grammar('E → E + E | E * E | int');
		const r = restrictGrammar(g, readDeclarations([left('+'), left('*')], g))!;
		const text = r.grammar.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ')}`);
		expect(text).toEqual([
			// Slide 8 has E → E + T | T; here T's alternatives stand in E.
			'E → E + E·1',
			'E → E·1 * E·2',
			'E → int',
			// T → T * F | F
			'E·1 → E·1 * E·2',
			'E·1 → int',
			// F → int
			'E·2 → int'
		]);
		expect(r.origin).toEqual([0, 1, 2, 1, 2, 2]);
		expect([...r.names.values()]).toEqual(['E', 'E', 'E']);
	});

	it('hands a restriction on through a single production', () => {
		const g = grammar('E → E * E | S\nS → S + S | int');
		const r = restrictGrammar(g, readDeclarations([left('+'), left('*')], g))!;
		const copies = [...r.names].filter(([, of]) => of === 'S').map(([name]) => name);
		// S as an operand of * may not be S → S + S.
		expect(copies.length).toBeGreaterThan(1);
		const banned = copies.filter(
			(name) => !r.grammar.productions.some((p) => p.lhs === name && p.rhs.includes('+'))
		);
		expect(banned.length).toBeGreaterThan(0);
	});

	it('is null when the declarations restrict nothing', () => {
		const g = grammar('E → E + E | int');
		expect(restrictGrammar(g, readDeclarations([], g))).toBeNull();
		expect(restrictGrammar(g, readDeclarations([left('*')], g))).toBeNull();
		const cascade = grammar('E → E + T | T\nT → int');
		expect(restrictGrammar(cascade, readDeclarations([right('+')], cascade))).toBeNull();
	});

	it('names its copies apart from the symbols of the grammar', () => {
		const g = grammar('E → E + E | "E·1" | int');
		const r = restrictGrammar(g, readDeclarations([left('+')], g))!;
		expect(new Set(r.grammar.nonterminals).size).toBe(2);
		expect(r.grammar.terminals).toContain('E·1');
		expect(r.grammar.nonterminals).not.toContain('E·1');
	});
});

describe('allowedTrees', () => {
	const operands = (ops: string[]) => ['int', ...ops.flatMap((op) => [op, 'int'])];

	/** The trees the declarations allow, by filtering every tree and by parsing with them. */
	function bothWays(g: Grammar, tokens: string[], lines: Declaration[]) {
		const precedence = readDeclarations(lines, g);
		const every = parseTrees(g, tokens, { limit: 100_000 }).trees;
		const filtered = filterWith(g, every, precedence)
			.kept.map((i) => bracketForm(every[i]))
			.sort();
		const allowed = allowedTrees(g, tokens, precedence, 100_000);
		return { filtered, allowed: allowed && allowed.trees.map(bracketForm).sort(), every };
	}

	it('finds the one tree %left + allows among the 42 of six operands', () => {
		const g = grammar('E → E + E | int');
		const tokens = operands(['+', '+', '+', '+', '+']);
		const found = allowedTrees(g, tokens, readDeclarations([left('+')], g), 20)!;
		expect(found.truncated).toBe(false);
		expect(found.trees.map((t) => shapeText(shapeOf(t)))).toEqual([
			'((((int + int) + int) + int) + int) + int'
		]);
		// A tree of the grammar itself: its symbols, productions and token ranges.
		const [tree] = found.trees;
		const every = parseTrees(g, tokens, { limit: 100 }).trees;
		expect(every).toHaveLength(42);
		expect(every.filter((t) => bracketForm(t) === bracketForm(tree))).toHaveLength(1);
		expect(tree).toEqual(every.find((t) => bracketForm(t) === bracketForm(tree)));
		expect(violations(g, tree, readDeclarations([left('+')], g))).toEqual([]);
	});

	it('finds the right-nested tree for %right + and none for %nonassoc +', () => {
		const g = grammar('E → E + E | int');
		const tokens = operands(['+', '+', '+', '+', '+']);
		const rightmost = allowedTrees(g, tokens, readDeclarations([right('+')], g), 20)!;
		expect(rightmost.trees.map((t) => shapeText(shapeOf(t)))).toEqual([
			'int + (int + (int + (int + (int + int))))'
		]);
		expect(allowedTrees(g, tokens, readDeclarations([nonassoc('+')], g), 20)).toEqual({
			trees: [],
			truncated: false
		});
	});

	it('agrees with filtering every tree of the string', () => {
		const flat = grammar('E → E + E | E * E | E - E | ( E ) | int');
		const strings = [
			operands(['+', '*', '+', '*']),
			operands(['-', '-', '*', '+', '-']),
			['(', 'int', '+', 'int', ')', '*', 'int', '+', 'int', '*', 'int']
		];
		const declarations: Declaration[][] = [
			[left('+ -'), left('*')],
			[left('*'), left('+'), right('-')],
			[right('+'), nonassoc('*')],
			[left('+')],
			[nonassoc('+ - *')],
			[left('- +'), right('*')]
		];
		for (const tokens of strings)
			for (const lines of declarations) {
				const { filtered, allowed, every } = bothWays(flat, tokens, lines);
				expect(every.length).toBeGreaterThan(4);
				expect(allowed, `${tokens.join(' ')} with ${lines.map(printDeclaration)}`).toEqual(
					filtered
				);
			}
	});

	it('agrees with filtering through single productions and next to other ambiguity', () => {
		const chained = grammar('E → E * E | S\nS → S + S | int');
		const ifs = grammar('S → if E then S | if E then S else S | E\nE → E + E | E < E | id');
		const cases: [Grammar, string[], Declaration[]][] = [
			[chained, operands(['+', '+', '*', '+', '*', '+']), [left('*'), left('+')]],
			[chained, operands(['+', '+', '*', '+']), [left('*'), right('+')]],
			[
				ifs,
				'if id < id + id then if id then id + id + id else id'.split(' '),
				[nonassoc('<'), left('+')]
			]
		];
		for (const [g, tokens, lines] of cases) {
			const { filtered, allowed, every } = bothWays(g, tokens, lines);
			expect(every.length).toBeGreaterThan(filtered.length);
			expect(filtered.length).toBeGreaterThan(0);
			expect(allowed).toEqual(filtered);
		}
	});

	it('leaves out the trees parseTrees leaves out for a grammar with a cycle', () => {
		const g = grammar('E → E + E | E | int');
		const { filtered, allowed } = bothWays(g, operands(['+', '+', '+']), [left('+')]);
		expect(filtered.length).toBeGreaterThan(0);
		expect(allowed).toEqual(filtered);
	});

	it('stops at the limit and is null without a restriction', () => {
		const g = grammar('E → E + E | E * E | int');
		const tokens = operands(['*', '*', '*', '*', '*', '*']);
		const some = allowedTrees(g, tokens, readDeclarations([left('+')], g), 5)!;
		expect(some.trees).toHaveLength(5);
		expect(some.truncated).toBe(true);
		expect(allowedTrees(g, tokens, readDeclarations([], g), 5)).toBeNull();
	});
});

describe('leftNestedTrees', () => {
	it('is the tree in which no right operand is built with an operator', () => {
		const g = grammar('E → E + E | E * E | ( E ) | int');
		const groupings = (input: string) =>
			leftNestedTrees(g, tokenizeInput(input, g.terminals).tokens, 20).map((t) =>
				shapeText(shapeOf(t))
			);
		expect(groupings('int + int * int + int')).toEqual(['((int + int) * int) + int']);
		expect(groupings('int * ( int + int * int ) + int')).toEqual([
			'(int * ((int + int) * int)) + int'
		]);
		expect(groupings('int')).toEqual(['int']);
	});

	it('is empty for a grammar without productions A → A op A', () => {
		const g = grammar('E → if E then E | if E then E else E | OTHER');
		expect(leftNestedTrees(g, ['if', 'OTHER', 'then', 'OTHER'], 20)).toEqual([]);
	});
});
