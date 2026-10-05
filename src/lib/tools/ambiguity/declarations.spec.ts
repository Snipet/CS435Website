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
	binaryOperators,
	filterTrees,
	operatorsOf,
	printDeclaration,
	readDeclarations,
	reasons,
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
	it('reads operators as grammar symbols', () => {
		expect(operatorsOf('+ -')).toEqual(['+', '-']);
		expect(operatorsOf('+-')).toEqual(['+', '-']);
		expect(operatorsOf(`'+' "=="  and`)).toEqual(['+', '==', 'and']);
		expect(operatorsOf('  ')).toEqual([]);
	});

	it('prints a declaration as bison writes it', () => {
		expect(printDeclaration(left('+  -'))).toBe('%left + -');
		expect(printDeclaration(nonassoc('<'))).toBe('%nonassoc <');
		expect(printDeclaration(right(''))).toBe('%right');
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
	it('lists the operators of productions A → B op C', () => {
		expect(binaryOperators(grammar('E → E + E | E * E | ( E ) | int'))).toEqual(['+', '*']);
		expect(binaryOperators(grammar('E → E + T | T\nT → T * F | F\nF → int | ( E )'))).toEqual([
			'+',
			'*'
		]);
		expect(binaryOperators(grammar('E → if E then E | OTHER'))).toEqual([]);
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
});
