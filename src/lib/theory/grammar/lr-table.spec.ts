import { describe, expect, it } from 'vitest';
import { bracketForm } from './derive';
import { lr0Automaton, lr1Automaton, printItem } from './lr';
import { lrParse } from './lr-parse';
import {
	lrTable,
	printAction,
	readPrecedence,
	rulePrecedence,
	type LrConflict,
	type LrTable,
	type PrecedenceDeclaration
} from './lr-table';
import {
	AMBIGUOUS_OPERATORS,
	BOTTOM_UP,
	BOTTOM_UP_REVERSED,
	DANGLING_ELSE_S,
	ID_SEQUENCE,
	ID_SEQUENCE_FIXED,
	LEFT_FACTORED,
	grammar,
	input
} from './test-helpers';
import type { Grammar } from './types';

/** Each state's filled entries: `int s1, E g2`, in column order. */
const rows = (t: LrTable): string[] =>
	t.action.map((row, i) =>
		[
			...row.flatMap((a, c) => (a ? [`${t.terminals[c]} ${printAction(t.augmented, a)}`] : [])),
			...t.goto[i].flatMap((k, c) => (k === null ? [] : [`${t.nonterminals[c]} g${k}`]))
		].join(', ')
	);

/** A conflict in the words of Bottom-up Parsing III, slides 16–21. */
const describeConflict = (t: LrTable, c: LrConflict): string =>
	`${c.state} on ${c.terminal}: ${c.kind} ${c.items
		.map((i) => printItem(t.augmented, i, { brackets: true }))
		.join(' and ')} → ${printAction(t.augmented, c.resolution.action, { style: 'long' })}`;

const tableOf = (text: string, precedence?: PrecedenceDeclaration[]): LrTable =>
	lrTable(lr1Automaton(grammar(text)), { precedence });

const parsed = (t: LrTable, text: string): string | null => {
	const p = lrParse(t, input(t.augmented.grammar, text));
	return p.tree ? bracketForm(p.tree) : p.outcome;
};

const OPERATORS: PrecedenceDeclaration[] = [
	{ assoc: 'left', terminals: ['+'] },
	{ assoc: 'left', terminals: ['*'] }
];

describe('lrTable', () => {
	it('builds the action/goto table of Bottom-up Parsing II, slides 18–19', () => {
		for (const text of [BOTTOM_UP, BOTTOM_UP_REVERSED]) {
			const t = tableOf(text);
			expect(t.method).toBe('lr1');
			expect(t.nonterminals).toEqual(['E']);
			expect(t.terminals.at(-1)).toBe('$');
			const byColumn = (i: number, col: string): string | null => {
				const a = t.action[i][t.terminals.indexOf(col)];
				return a ? printAction(t.augmented, a) : null;
			};
			const cells = t.action.map((_, i) =>
				[
					...['int', '+', '(', ')', '$'].flatMap((col) => {
						const cell = byColumn(i, col);
						return cell ? [`${col} ${cell}`] : [];
					}),
					...(t.goto[i][0] === null ? [] : [`E g${t.goto[i][0]}`])
				].join(', ')
			);
			expect(cells).toEqual([
				'int s1, E g2',
				'+ r(E → int), $ r(E → int)',
				'+ s3, $ accept',
				'( s4',
				'int s5, E g6',
				'+ r(E → int), ) r(E → int)',
				'+ s8, ) s7',
				'+ r(E → E + ( E )), $ r(E → E + ( E ))',
				'( s9',
				'int s5, E g10',
				'+ s8, ) s11',
				'+ r(E → E + ( E )), ) r(E → E + ( E ))'
			]);
			expect(t.conflicts).toEqual([]);
			expect(t.unresolved).toBe(0);
		}
	});

	it('uses the grammar production ids in reduce entries', () => {
		const t = tableOf(BOTTOM_UP);
		expect(t.action[1][t.terminals.indexOf('$')]).toEqual({ kind: 'reduce', production: 1 });
		expect(t.action[2][t.terminals.indexOf('$')]).toEqual({ kind: 'accept' });
		expect(t.action[0][t.terminals.indexOf('int')]).toEqual({ kind: 'shift', state: 1 });
		expect(t.goto[9]).toEqual([10]);
	});

	it('writes entries short or long', () => {
		const t = tableOf(BOTTOM_UP);
		const aug = t.augmented;
		expect(printAction(aug, { kind: 'shift', state: 4 })).toBe('s4');
		expect(printAction(aug, { kind: 'shift', state: 4 }, { style: 'long' })).toBe('shift 4');
		expect(printAction(aug, { kind: 'reduce', production: 0 })).toBe('r(E → E + ( E ))');
		expect(printAction(aug, { kind: 'reduce', production: 1 }, { style: 'long' })).toBe(
			'reduce E → int'
		);
		expect(printAction(aug, { kind: 'accept' })).toBe('accept');
		expect(printAction(aug, { kind: 'error' })).toBe('error');
	});

	it('finds the shift/reduce conflicts of E → E + E | E * E | int (slide 18) and defaults to shift', () => {
		const t = tableOf(AMBIGUOUS_OPERATORS);
		expect(t.conflicts.map((c) => describeConflict(t, c))).toEqual([
			'5 on +: shift/reduce [E → E •+ E, +] and [E → E + E•, +] → shift 3',
			'5 on *: shift/reduce [E → E •* E, *] and [E → E + E•, *] → shift 4',
			'6 on +: shift/reduce [E → E •+ E, +] and [E → E * E•, +] → shift 3',
			'6 on *: shift/reduce [E → E •* E, *] and [E → E * E•, *] → shift 4'
		]);
		expect(t.unresolved).toBe(4);
		expect(t.conflicts.every((c) => c.resolution.by === 'default')).toBe(true);
		expect(t.conflicts[0].resolution.reason).toBe(
			'No precedence is declared for the rule E → E + E (its last terminal is +) or for the terminal +.'
		);
		expect(t.conflicts[0].actions).toEqual([
			{ kind: 'shift', state: 3 },
			{ kind: 'reduce', production: 0 }
		]);
		// Shifting everywhere groups to the right.
		expect(parsed(t, 'int * int + int')).toBe('E( E(int) * E( E(int) + E(int) ) )');
	});

	it('resolves them with %left + then %left * (slides 19–21)', () => {
		const t = tableOf(AMBIGUOUS_OPERATORS, OPERATORS);
		expect(t.conflicts.map((c) => [describeConflict(t, c), c.resolution.reason])).toEqual([
			[
				'5 on +: shift/reduce [E → E •+ E, +] and [E → E + E•, +] → reduce E → E + E',
				'The rule E → E + E and the terminal + have the same precedence and are left associative.'
			],
			[
				'5 on *: shift/reduce [E → E •* E, *] and [E → E + E•, *] → shift 4',
				'The terminal * has higher precedence than the rule E → E + E.'
			],
			[
				'6 on +: shift/reduce [E → E •+ E, +] and [E → E * E•, +] → reduce E → E * E',
				'The rule E → E * E has higher precedence than the terminal +.'
			],
			[
				'6 on *: shift/reduce [E → E •* E, *] and [E → E * E•, *] → reduce E → E * E',
				'The rule E → E * E and the terminal * have the same precedence and are left associative.'
			]
		]);
		expect(t.conflicts.every((c) => c.resolution.by === 'precedence')).toBe(true);
		expect(t.unresolved).toBe(0);
		expect(parsed(t, 'int + int * int')).toBe('E( E(int) + E( E(int) * E(int) ) )');
		expect(parsed(t, 'int * int + int')).toBe('E( E( E(int) * E(int) ) + E(int) )');
		expect(parsed(t, 'int + int + int')).toBe('E( E( E(int) + E(int) ) + E(int) )');
	});

	it('shifts for %right and makes an error entry for %nonassoc', () => {
		const right = tableOf(AMBIGUOUS_OPERATORS, [
			{ assoc: 'right', terminals: ['+'] },
			{ assoc: 'left', terminals: ['*'] }
		]);
		expect(right.conflicts[0].resolution).toEqual({
			action: { kind: 'shift', state: 3 },
			by: 'precedence',
			reason:
				'The rule E → E + E and the terminal + have the same precedence and are right associative.'
		});
		expect(parsed(right, 'int + int + int')).toBe('E( E(int) + E( E(int) + E(int) ) )');
		const nonassoc = tableOf(AMBIGUOUS_OPERATORS, [
			{ assoc: 'nonassoc', terminals: ['+'] },
			{ assoc: 'left', terminals: ['*'] }
		]);
		expect(nonassoc.conflicts[0].resolution.action).toEqual({ kind: 'error' });
		expect(nonassoc.action[5][nonassoc.terminals.indexOf('+')]).toEqual({ kind: 'error' });
		expect(parsed(nonassoc, 'int + int')).toBe('E( E(int) + E(int) )');
		const run = lrParse(nonassoc, input(nonassoc.augmented.grammar, 'int + int + int'));
		expect(run.outcome).toBe('error');
		expect(run.rows.at(-1)!.text).toBe('error: action[5, +] is an error entry');
	});

	it('leaves a conflict unresolved when only one side has a precedence', () => {
		const t = tableOf(AMBIGUOUS_OPERATORS, [{ assoc: 'left', terminals: ['*'] }]);
		expect(t.unresolved).toBe(3);
		expect(t.conflicts.map((c) => c.resolution.reason)).toEqual([
			'No precedence is declared for the rule E → E + E (its last terminal is +) or for the terminal +.',
			'No precedence is declared for the rule E → E + E (its last terminal is +).',
			'No precedence is declared for the terminal +.',
			'The rule E → E * E and the terminal * have the same precedence and are left associative.'
		]);
	});

	it('finds the dangling else (slide 17) and shifts by default, or by precedence (slide 22)', () => {
		const t = tableOf(DANGLING_ELSE_S);
		expect(t.conflicts.map((c) => describeConflict(t, c))).toEqual([
			'14 on else: shift/reduce [S → if E then S •else S, else] and [S → if E then S•, else] → shift 15'
		]);
		expect(t.conflicts[0].resolution).toMatchObject({
			by: 'default',
			reason:
				'No precedence is declared for the rule S → if E then S (its last terminal is then) or for the terminal else.'
		});
		const nested = 'if OTHER then if OTHER then OTHER else OTHER';
		const inner = 'S( if E(OTHER) then S( if E(OTHER) then S(OTHER) else S(OTHER) ) )';
		expect(parsed(t, nested)).toBe(inner);
		const declared = tableOf(DANGLING_ELSE_S, [
			{ assoc: 'nonassoc', terminals: ['then'] },
			{ assoc: 'nonassoc', terminals: ['else'] }
		]);
		expect(declared.conflicts[0].resolution).toEqual({
			action: { kind: 'shift', state: 15 },
			by: 'precedence',
			reason: 'The terminal else has higher precedence than the rule S → if E then S.'
		});
		expect(declared.unresolved).toBe(0);
		expect(parsed(declared, nested)).toBe(inner);
	});

	it('finds the reduce/reduce conflict of S → ε | id | id S on $ (slides 24–25)', () => {
		const t = tableOf(ID_SEQUENCE);
		expect(t.conflicts.map((c) => describeConflict(t, c))).toEqual([
			'1 on $: reduce/reduce [S → •, $] and [S → id•, $] → reduce S → ε'
		]);
		expect(t.conflicts[0].resolution).toEqual({
			action: { kind: 'reduce', production: 0 },
			by: 'default',
			reason: 'S → ε is the earlier rule.'
		});
		expect(parsed(t, 'id')).toBe('S( id S(ε) )');
		expect(tableOf(ID_SEQUENCE_FIXED).conflicts).toEqual([]);
	});

	it('builds LR(0) and SLR(1) tables on the LR(0) automaton', () => {
		const a = lr0Automaton(grammar(LEFT_FACTORED));
		const lr0 = lrTable(a);
		expect(lr0.method).toBe('lr0');
		expect(lr0.conflicts.length).toBeGreaterThan(0);
		expect(lr0.conflicts.every((c) => c.kind === 'shift/reduce')).toBe(true);
		const slr = lrTable(a, { method: 'slr1' });
		expect(slr.conflicts).toEqual([]);
		// An LR(0) state reduces on every terminal; SLR(1) only on Follow.
		const b = lrTable(lr0Automaton(grammar(BOTTOM_UP)));
		expect(rows(b)[1]).toBe(
			'+ r(E → int), ( r(E → int), ) r(E → int), int r(E → int), $ r(E → int)'
		);
		expect(rows(lrTable(lr0Automaton(grammar(BOTTOM_UP)), { method: 'slr1' }))[1]).toBe(
			'+ r(E → int), ) r(E → int), $ r(E → int)'
		);
		expect(() => lrTable(a, { method: 'lr1' })).toThrow();
	});

	it('returns plain data', () => {
		const t = tableOf(AMBIGUOUS_OPERATORS, OPERATORS);
		expect(structuredClone(t)).toEqual(t);
	});
});

describe('readPrecedence and rulePrecedence', () => {
	const g: Grammar = grammar(AMBIGUOUS_OPERATORS);

	it('gives later lines higher levels', () => {
		const { terminals, diagnostics } = readPrecedence(g, OPERATORS);
		expect(Object.fromEntries(terminals)).toEqual({
			'+': { level: 1, assoc: 'left' },
			'*': { level: 2, assoc: 'left' }
		});
		expect(diagnostics).toEqual([]);
	});

	it('warns about lines it cannot use', () => {
		const { terminals, diagnostics } = readPrecedence(g, [
			{ assoc: 'left', terminals: ['+', '-'] },
			{ assoc: 'right', terminals: [] },
			{ assoc: 'left', terminals: ['E', '+'] }
		]);
		expect(diagnostics.map((d) => d.message)).toEqual([
			'- on line 1 is not a terminal of the grammar.',
			'Line 2 (%right) declares no terminal.',
			'E on line 3 is a non-terminal: precedence is declared for terminals.',
			'+ is already declared on line 1; line 3 does not change it.'
		]);
		expect(terminals.get('+')).toEqual({ level: 1, assoc: 'left' });
	});

	it('takes a rule’s precedence from its last terminal', () => {
		const { terminals } = readPrecedence(g, OPERATORS);
		expect(rulePrecedence(g, terminals, 1)).toEqual({
			terminal: '*',
			precedence: { level: 2, assoc: 'left' }
		});
		expect(rulePrecedence(g, terminals, 2)).toEqual({ terminal: 'int', precedence: null });
		const h = grammar('S → A B\nA → a\nB → b');
		expect(rulePrecedence(h, terminals, 0)).toEqual({ terminal: null, precedence: null });
	});
});
