/**
 * Hand-built lecture parse trees used by the grammar component tests and the
 * notation page. They mirror the slide figures, so the components can be
 * checked without the grammar engine.
 */
import type { ParseNode } from '$lib/theory/grammar/types';

/** A terminal leaf. */
export const leaf = (symbol: string): ParseNode => ({ symbol, terminal: true, children: [] });

/** A non-terminal with the production applied at it; no children makes an ε-production. */
export const branch = (
	symbol: string,
	production: number,
	...children: ParseNode[]
): ParseNode => ({
	symbol,
	terminal: false,
	production,
	children
});

/** E → int. */
const int = (production: number) => branch('E', production, leaf('int'));

/**
 * The two trees of a op1 b op2 c in a grammar E → E op E | … | int:
 * (a op1 b) op2 c and a op1 (b op2 c). `ids` gives the production of each
 * operator and of E → int.
 */
function nested(
	op1: string,
	op2: string,
	ids: Record<string, number>
): { left: ParseNode; right: ParseNode } {
	const e = () => int(ids.int);
	return {
		left: branch('E', ids[op2], branch('E', ids[op1], e(), leaf(op1), e()), leaf(op2), e()),
		right: branch('E', ids[op1], e(), leaf(op1), branch('E', ids[op2], e(), leaf(op2), e()))
	};
}

/**
 * int + int + int under E → E + E | E * E | ( E ) | int
 * (Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 4).
 */
export const sumTrees = nested('+', '+', { '+': 0, '*': 1, int: 3 });

/** int * int + int under the same grammar (slide 5). */
export const productSumTrees = nested('*', '+', { '+': 0, '*': 1, int: 3 });

/** int + int + int under E → E + E | int; `%left +` rejects `right` (slide 17). */
export const leftAssocTrees = nested('+', '+', { '+': 0, int: 1 });

/**
 * int + int * int under E → E + E | E * E | int; `%left +` then `%left *`
 * rejects `left`, the tree with * at the root (slide 18).
 */
export const precedenceTrees = nested('+', '*', { '+': 0, '*': 1, int: 2 });

/**
 * int * int + int under E → E + T | T, T → T * F | F, F → int | ( E ): the
 * only tree (slide 10).
 */
export const cascadeTree: ParseNode = branch(
	'E',
	0,
	branch(
		'E',
		1,
		branch(
			'T',
			2,
			branch('T', 3, branch('F', 4, leaf('int'))),
			leaf('*'),
			branch('F', 4, leaf('int'))
		)
	),
	leaf('+'),
	branch('T', 3, branch('F', 4, leaf('int')))
);

/** ( int ) under E → T | T + E, T → int | int * T | ( E ) (Top-Down Parsing, slide 16). */
export const parenTree: ParseNode = branch(
	'E',
	0,
	branch('T', 4, leaf('('), branch('E', 0, branch('T', 2, leaf('int'))), leaf(')'))
);

/** int * int under E → T + E | T, T → ( E ) | int | int * T (Top-Down Parsing, slide 20). */
export const instanceTree: ParseNode = branch(
	'E',
	1,
	branch('T', 4, leaf('int'), leaf('*'), branch('T', 3, leaf('int')))
);

/** The slide's instance numbers for `instanceTree`: E0, T1, T2. */
export const instanceLabels: Readonly<Record<string, string>> = {
	'': 'E0',
	'0': 'T1',
	'0.2': 'T2'
};

/** ( ) under S → ε | ( S ) (Introduction to Parsing, slide 27): an ε-production inside. */
export const emptyParensTree: ParseNode = branch('S', 1, leaf('('), branch('S', 0), leaf(')'));
