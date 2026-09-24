import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { EOF, ERROR_STATE, columnOf, driverTable, lookup, stateName } from './table';
import { RELOP_POSITIONS, relopDfa, stuDfa } from './machines';

describe('relop table', () => {
	const t = driverTable(relopDfa());

	it('has the columns <, =, >, other', () => {
		expect(t.columns.map((c) => c.header)).toEqual(['<', '=', '>', 'other']);
		expect(t.columns.map((c) => c.other)).toEqual([false, false, false, true]);
		expect(t.eofColumn).toBe(3);
	});

	it('holds the slide-16 transitions', () => {
		const E = ERROR_STATE;
		expect(t.T).toEqual([
			[1, 5, 6, E],
			[4, 2, 3, 4],
			[E, E, E, E],
			[E, E, E, E],
			[E, E, E, E],
			[E, E, E, E],
			[8, 7, 8, 8],
			[E, E, E, E],
			[E, E, E, E]
		]);
	});

	it('marks accepting and retracting states with their tokens', () => {
		expect(t.accept).toEqual([false, false, true, true, true, true, false, true, true]);
		expect(t.retract).toEqual([false, false, false, false, true, false, false, false, true]);
		expect(t.token).toEqual([null, null, 'LE', 'NE', 'LT', 'EQ', null, 'GE', 'GT']);
		expect(t.dead.every((d) => !d)).toBe(true);
	});

	it('looks characters and EOF up by column', () => {
		expect(columnOf(t, '<')).toBe(0);
		expect(columnOf(t, 'x')).toBe(3);
		expect(columnOf(t, EOF)).toBe(3);
		expect(lookup(t, 1, EOF)).toMatchObject({ to: 4, transition: 5 });
		expect(lookup(t, 0, 'x')).toMatchObject({ to: ERROR_STATE, transition: null });
		expect(stateName(t, ERROR_STATE)).toBe('error');
		expect(stateName(t, 4)).toBe('4');
	});

	it('has a position for every state', () => {
		expect([...RELOP_POSITIONS.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
	});
});

describe('S, T, U table', () => {
	const t = driverTable(stuDfa());

	it('matches slide 14, plus an other column for every other character', () => {
		expect(t.columns.map((c) => c.header)).toEqual(['0', '1', 'other']);
		const names = t.T.map((row) => row.map((s) => stateName(t, s)));
		expect(names).toEqual([
			['T', 'U', 'error'],
			['T', 'U', 'error'],
			['T', 'U', 'error']
		]);
		expect(t.token).toEqual([null, null, null]);
		expect(t.accept).toEqual([false, false, true]);
		expect(columnOf(t, EOF)).toBe(2);
		expect(lookup(t, 1, EOF).to).toBe(ERROR_STATE);
	});
});

describe('columns', () => {
	it('use definition names and have no other column when the labels cover everything', () => {
		const dfa = {
			states: [
				{ id: 0, name: 'A', accepting: false },
				{ id: 1, name: 'B', accepting: true }
			],
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.range('0', '9') },
				{ id: 1, from: 1, to: 1, label: CharSet.range('0', '9').complement() }
			],
			start: 0
		};
		const t = driverTable(dfa, { names: [{ name: 'digit', set: CharSet.range('0', '9') }] });
		expect(t.columns.map((c) => c.header)).toEqual(['digit', '[^0-9]']);
		expect(t.eofColumn).toBeNull();
		expect(lookup(t, 1, EOF).to).toBe(ERROR_STATE);
	});

	it('flag states that cannot reach an accepting state', () => {
		const dfa = {
			states: [
				{ id: 0, name: 'A', accepting: false },
				{ id: 1, name: 'B', accepting: true },
				{ id: 2, name: 'D', accepting: false }
			],
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.single('a') },
				{ id: 1, from: 0, to: 2, label: CharSet.single('b') },
				{ id: 2, from: 2, to: 2, label: CharSet.of('ab') }
			],
			start: 0
		};
		expect(driverTable(dfa).dead).toEqual([false, false, true]);
	});
});
