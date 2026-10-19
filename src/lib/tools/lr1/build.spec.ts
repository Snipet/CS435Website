import { describe, expect, it } from 'vitest';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	METHOD_AUTOMATON,
	METHOD_NAMES,
	METHODS,
	closureOrderOf,
	computeBuild,
	readGrammar,
	readInput
} from './build';
import { CMINUS_INPUT } from './presets';
import { edgeIndex, selectedCell, selectedRow, validSelection } from './selection';

const request = (grammar: string, input = '', method: (typeof METHODS)[number] = 'lr1') => ({
	grammar,
	input,
	order: 'grammar' as const,
	method
});

describe('readGrammar and readInput', () => {
	const g = parseGrammar('E → E + ( E ) | int').grammar!;

	it('reads the token string, with or without the closing $', () => {
		expect(readInput('int + ( int )', g)).toEqual({
			tokens: ['int', '+', '(', 'int', ')'],
			diagnostics: []
		});
		expect(readInput('int $', g).tokens).toEqual(['int']);
		expect(readInput('', g).tokens).toEqual([]);
		expect(readInput('int + (int)', g).tokens).toEqual(['int', '+', '(', 'int', ')']);
	});

	it('reports symbols that are not terminals, and a $ before the end', () => {
		expect(readInput('int - int', g).tokens).toBeNull();
		expect(readInput('E + int', g).diagnostics[0].message).toMatch(/non-terminal/);
		expect(readInput('int $ int', g).diagnostics.at(-1)!.message).toMatch(/only the last token/);
		expect(readGrammar('E →').grammar).toBeNull();
	});

	it('takes each non-terminal’s productions last first when asked', () => {
		const deck15 = parseGrammar('E → int | E + ( E )').grammar!;
		expect(closureOrderOf(deck15, 'reversed')).toEqual([1, 0]);
		expect(closureOrderOf(deck15, 'grammar')).toBeUndefined();
	});
});

describe('computeBuild', () => {
	it('builds every method and parses with the chosen one', () => {
		for (const method of METHODS) {
			const b = computeBuild(request('E → E + ( E ) | int', 'int + ( int )', method))!;
			expect(b.method).toBe(method);
			expect(b.automaton.kind).toBe(METHOD_AUTOMATON[method]);
			expect(b.table.method).toBe(method === 'lalr1' ? 'lr1' : method);
			expect(b.lr1.kind).toBe('lr1');
			expect(b.parse?.outcome).toBe('accept');
			expect(b.summary).toEqual({
				lr1: { states: 12, conflicts: 0, shiftReduce: 0, reduceReduce: 0, truncated: false },
				lalr1: { states: 7, conflicts: 0, shiftReduce: 0, reduceReduce: 0, truncated: false },
				slr1: { states: 7, conflicts: 0, shiftReduce: 0, reduceReduce: 0, truncated: false },
				lr0: { states: 7, conflicts: 0, shiftReduce: 0, reduceReduce: 0, truncated: false }
			});
		}
		expect(METHOD_NAMES).toEqual({ lr1: 'LR(1)', lalr1: 'LALR(1)', slr1: 'SLR(1)', lr0: 'LR(0)' });
	});

	it('tells the methods apart where they differ', () => {
		// LR(1) but not LALR(1): merging the states of c gives a reduce/reduce conflict.
		const b = computeBuild(request('S → a A d | b B d | a B e | b A e\nA → c\nB → c'))!;
		expect(b.summary.lr1.conflicts).toBe(0);
		expect(b.summary.lalr1.reduceReduce).toBeGreaterThan(0);
		expect(b.summary.lr1.states).toBeGreaterThan(b.summary.lalr1.states);
	});

	it('is null for a grammar with errors, and parses nothing for an input with errors', () => {
		expect(computeBuild(request('E →'))).toBeNull();
		expect(computeBuild(request('E → int', 'x'))!.parse).toBeNull();
		expect(computeBuild(request('E → int', ''))!.parse?.outcome).toBe('error');
	});

	it('builds the C- grammar in a fraction of a second, as data a worker can send', () => {
		const t0 = performance.now();
		const b = computeBuild(request(CMINUS_BNF, CMINUS_INPUT))!;
		expect(performance.now() - t0).toBeLessThan(2000);
		expect(b.lr1.states.length).toBeGreaterThan(300);
		expect(b.lr1.steps).toEqual([]);
		expect(b.parse?.outcome).toBe('accept');
		expect(structuredClone(b)).toEqual(b);
	});
});

describe('selection', () => {
	const b = computeBuild(request('E → E + ( E ) | int'))!;
	const a = b.automaton;

	it('marks the row of a state, or of the state an edge leaves, and the cell of an edge', () => {
		expect(selectedRow(a, { kind: 'state', state: 4 })).toBe(4);
		const e = edgeIndex(a, 3, '(')!;
		expect(selectedRow(a, { kind: 'edge', edge: e })).toBe(3);
		expect(selectedCell(a, b.table, { kind: 'edge', edge: e })).toEqual({
			state: 3,
			kind: 'action',
			column: b.table.terminals.indexOf('(')
		});
		expect(selectedCell(a, b.table, { kind: 'edge', edge: edgeIndex(a, 4, 'E')! })).toEqual({
			state: 4,
			kind: 'goto',
			column: 0
		});
		expect(selectedCell(a, b.table, { kind: 'state', state: 4 })).toBeNull();
		expect(selectedRow(a, null)).toBeNull();
		expect(edgeIndex(a, 3, 'int')).toBeNull();
	});

	it('drops a selection the automaton does not have', () => {
		expect(validSelection(a, { kind: 'state', state: 40 })).toBeNull();
		expect(validSelection(a, { kind: 'edge', edge: 40 })).toBeNull();
		expect(validSelection(a, { kind: 'state', state: 3 })).toEqual({ kind: 'state', state: 3 });
		expect(selectedRow(a, { kind: 'state', state: 40 })).toBeNull();
	});
});
