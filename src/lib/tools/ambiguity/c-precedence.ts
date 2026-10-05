/**
 * The C operator precedence table shown with the precedence cascade
 * (Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 9): 15
 * levels, level 1 binding tightest. Levels, operators and associativity are
 * the slide's; the descriptions are short names of the operators.
 */
import type { Citation } from '$lib/lectures';

export type Associativity = 'Left-to-right' | 'Right-to-left';

export interface OperatorRow {
	/** Operators as written in C, separated by spaces. */
	operators: string;
	description: string;
}

export interface PrecedenceLevel {
	/** 1 (binds tightest) … 15. */
	level: number;
	rows: OperatorRow[];
	associativity: Associativity;
}

export const C_PRECEDENCE_CITE: Citation = { deck: '10', slide: 9 };

const LTR: Associativity = 'Left-to-right';
const RTL: Associativity = 'Right-to-left';
const row = (operators: string, description: string): OperatorRow => ({ operators, description });

export const C_PRECEDENCE: readonly PrecedenceLevel[] = [
	{
		level: 1,
		associativity: LTR,
		rows: [
			row('++ --', 'Postfix increment and decrement'),
			row('()', 'Function call'),
			row('[]', 'Array subscript'),
			row('.', 'Member access'),
			row('->', 'Member access through a pointer'),
			row('(type){list}', 'Compound literal')
		]
	},
	{
		level: 2,
		associativity: RTL,
		rows: [
			row('++ --', 'Prefix increment and decrement'),
			row('+ -', 'Unary plus and minus'),
			row('! ~', 'Logical NOT and bitwise NOT'),
			row('(type)', 'Cast'),
			row('*', 'Indirection (dereference)'),
			row('&', 'Address-of'),
			row('sizeof', 'Size of'),
			row('_Alignof', 'Alignment requirement')
		]
	},
	{ level: 3, associativity: LTR, rows: [row('* / %', 'Multiplication, division, remainder')] },
	{ level: 4, associativity: LTR, rows: [row('+ -', 'Addition and subtraction')] },
	{ level: 5, associativity: LTR, rows: [row('<< >>', 'Bitwise left and right shift')] },
	{
		level: 6,
		associativity: LTR,
		rows: [
			row('< <=', 'Less than, less than or equal'),
			row('> >=', 'Greater than, greater than or equal')
		]
	},
	{ level: 7, associativity: LTR, rows: [row('== !=', 'Equal, not equal')] },
	{ level: 8, associativity: LTR, rows: [row('&', 'Bitwise AND')] },
	{ level: 9, associativity: LTR, rows: [row('^', 'Bitwise XOR (exclusive or)')] },
	{ level: 10, associativity: LTR, rows: [row('|', 'Bitwise OR (inclusive or)')] },
	{ level: 11, associativity: LTR, rows: [row('&&', 'Logical AND')] },
	{ level: 12, associativity: LTR, rows: [row('||', 'Logical OR')] },
	{ level: 13, associativity: RTL, rows: [row('?:', 'Ternary conditional')] },
	{
		level: 14,
		associativity: RTL,
		rows: [
			row('=', 'Assignment'),
			row('+= -=', 'Assignment by sum and difference'),
			row('*= /= %=', 'Assignment by product, quotient, remainder'),
			row('<<= >>=', 'Assignment by left and right shift'),
			row('&= ^= |=', 'Assignment by bitwise AND, XOR, OR')
		]
	},
	{ level: 15, associativity: LTR, rows: [row(',', 'Comma')] }
];
