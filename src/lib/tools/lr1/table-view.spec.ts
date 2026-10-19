import { describe, expect, it } from 'vitest';
import { lr0Automaton, lr1Automaton } from '$lib/theory/grammar/lr';
import { lrTable } from '$lib/theory/grammar/lr-table';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	actionCell,
	actionCellName,
	actionColumns,
	actionEntry,
	conflictCells,
	edgeCell,
	gotoCellName,
	gotoEntry,
	reduceSubscript
} from './table-view';

const table = (text: string) => lrTable(lr1Automaton(parseGrammar(text).grammar!));
const t = table('E → E + ( E ) | int');
const col = (x: string) => t.terminals.indexOf(x);
const conflicts = conflictCells(t);

describe('entries', () => {
	it('writes shifts, gotos, reductions and accept as slide 19 does', () => {
		expect(actionEntry(t.augmented, { kind: 'shift', state: 4 })).toEqual({
			code: 's4',
			words: 'shift 4'
		});
		expect(actionEntry(t.augmented, { kind: 'reduce', production: 0 })).toEqual({
			code: 'r',
			sub: 'E→E+(E)',
			words: 'reduce E → E + ( E )'
		});
		expect(actionEntry(t.augmented, { kind: 'accept' }).code).toBe('accept');
		expect(actionEntry(t.augmented, { kind: 'error' }).code).toBe('error');
		expect(gotoEntry(6)).toEqual({ code: 'g6', words: 'goto 6' });
		expect(reduceSubscript(t.augmented, 1)).toBe('E→int');
		const eps = lrTable(lr1Automaton(parseGrammar('S → ε | id S').grammar!));
		expect(reduceSubscript(eps.augmented, 0)).toBe('S→ε');
	});

	it('names cells for screen readers', () => {
		const c = actionCell(t, 2, col('$'), conflicts);
		expect(actionCellName(t, 2, col('$'), c)).toBe('action[2, $] = accept');
		expect(actionCellName(t, 3, col('int'), actionCell(t, 3, col('int'), conflicts))).toBe(
			'action[3, int] is blank'
		);
		expect(gotoCellName(t, 4, 0)).toBe('Goto[4, E] = 6');
		expect(gotoCellName(t, 3, 0)).toBe('Goto[3, E] is blank');
	});

	it('finds the cell of an edge', () => {
		expect(edgeCell(t, { from: 3, symbol: '(' })).toEqual({
			state: 3,
			kind: 'action',
			column: col('(')
		});
		expect(edgeCell(t, { from: 4, symbol: 'E' })).toEqual({ state: 4, kind: 'goto', column: 0 });
		expect(edgeCell(t, { from: 4, symbol: 'x' })).toBeNull();
	});
});

describe('conflicts', () => {
	const amb = table('E → E + E | E * E | int');
	const ambConflicts = conflictCells(amb);

	it('shows every action of a cell with a conflict and the one the table keeps', () => {
		expect(conflicts.size).toBe(0);
		expect(ambConflicts.size).toBe(amb.conflicts.length);
		const [key] = [...ambConflicts.keys()];
		const [state, column] = key.split(' ').map(Number);
		const cell = actionCell(amb, state, column, ambConflicts);
		expect(cell.entries.map((e) => e.code)).toEqual([expect.stringMatching(/^s\d+$/), 'r']);
		expect(cell.kept?.code).toMatch(/^s\d+$/);
		expect(actionCellName(amb, state, column, cell)).toMatch(
			/^action\[\d+, [+*]\]: conflict, shift \d+ or reduce E → E [+*] E; the table keeps shift \d+$/
		);
	});

	it('lists the reductions of a reduce/reduce conflict in grammar order', () => {
		const rr = table('S → ε | id | id S');
		const cells = conflictCells(rr);
		const [key] = [...cells.keys()];
		const [state, column] = key.split(' ').map(Number);
		const cell = actionCell(rr, state, column, cells);
		expect(cell.entries.map((e) => e.sub)).toEqual(['S→ε', 'S→id']);
		expect(cell.kept?.sub).toBe('S→ε');
	});

	it('fills every column of an LR(0) reduction', () => {
		const lr0 = lrTable(lr0Automaton(parseGrammar('E → E + ( E ) | int').grammar!), {
			method: 'lr0'
		});
		expect(lr0.action[1].every((a) => a?.kind === 'reduce')).toBe(true);
	});
});

describe('actionColumns', () => {
	const order = (text: string) => {
		const a = lr1Automaton(parseGrammar(text).grammar!);
		const tt = lrTable(a);
		return actionColumns(tt, a.edges).map((k) => tt.terminals[k]);
	};

	it('puts the terminals in the order the DFA first shifts them, then $', () => {
		expect(t.terminals).toEqual(['+', '(', ')', 'int', '$']);
		expect(order('E → E + ( E ) | int')).toEqual(['int', '+', '(', ')', '$']);
		expect(order('E → int | E + ( E )')).toEqual(['int', '+', '(', ')', '$']);
		expect(order('E → E + E | E * E | int')).toEqual(['int', '+', '*', '$']);
	});

	it('puts a terminal no edge carries after the others, in grammar order', () => {
		// The order of the edges of state 0 (b, then c), then a; y is never shifted (D is
		// unreachable, so the DFA has no edge on y), so it comes last before $.
		const cols = order('S → C a | b\nC → c\nD → y');
		expect(cols).toEqual(['b', 'c', 'a', 'y', '$']);
		// Every column once.
		expect(new Set(cols).size).toBe(cols.length);
	});
});
