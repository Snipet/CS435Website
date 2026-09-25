import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import type { Automaton } from '$lib/theory/automata/types';
import { EOF, ERROR_STATE, columnOf, driverTable, labelClasses, lookup, stateName } from './table';
import { RELOP_POSITIONS, relopDfa, stuDfa } from './machines';
import { LEX2_DEFS, LEX2_RULES } from './presets';
import { buildRuleDfa, compileRules, minimalRuleDfa, nameGroups, withTokenNames } from './rules';
import { tableSize } from './sizes';

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

	it('matches slide 14: 3 states × the input symbols 0 and 1', () => {
		expect(t.columns.map((c) => c.header)).toEqual(['0', '1']);
		const names = t.T.map((row) => row.map((s) => stateName(t, s)));
		expect(names).toEqual([
			['T', 'U'],
			['T', 'U'],
			['T', 'U']
		]);
		expect(t.names).toEqual(['S', 'T', 'U']);
		expect(t.token).toEqual([null, null, null]);
		expect(t.accept).toEqual([false, false, true]);
	});

	it('has no entry for other characters or EOF', () => {
		expect(t.eofColumn).toBeNull();
		expect(columnOf(t, EOF)).toBeNull();
		expect(columnOf(t, 'x')).toBeNull();
		expect(lookup(t, 1, EOF)).toMatchObject({ column: null, to: ERROR_STATE, transition: null });
		expect(lookup(t, 0, '2')).toMatchObject({ column: null, to: ERROR_STATE });
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

	describe('merged', () => {
		const E = ERROR_STATE;
		const letter = CharSet.range('A', 'Z').union(CharSet.range('a', 'z'));
		const names = [
			{ name: 'digit', set: CharSet.range('0', '9') },
			{ name: 'letter', set: letter }
		];
		// letter (letter | digit)* with [A-Z] and [a-z] on separate transitions to the same states.
		const dfa: Automaton = {
			states: [
				{ id: 0, name: '0', accepting: false },
				{ id: 1, name: '1', accepting: true, accept: { rule: 0, token: 'Id' } }
			],
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.range('A', 'Z') },
				{ id: 1, from: 0, to: 1, label: CharSet.range('a', 'z') },
				{ id: 2, from: 1, to: 1, label: CharSet.range('0', '9') },
				{ id: 3, from: 1, to: 1, label: CharSet.range('A', 'Z') },
				{ id: 4, from: 1, to: 1, label: CharSet.range('a', 'z') }
			],
			start: 0
		};
		const t = driverTable(dfa, { names });

		it('share one column when every state has the same next state on them', () => {
			expect(labelClasses(dfa)).toHaveLength(3);
			expect(t.columns.map((c) => c.header)).toEqual(['digit', 'letter']);
			expect(t.columns[1].set.equals(letter)).toBe(true);
			expect(t.T).toEqual([
				[E, 1],
				[1, 1]
			]);
			expect(driverTable(dfa).columns.map((c) => c.header)).toEqual(['0–9', 'A–Z,a–z']);
		});

		it('look up the transition whose label holds the character', () => {
			expect(lookup(t, 0, 'Q')).toMatchObject({ column: 1, to: 1, transition: 0 });
			expect(lookup(t, 0, 'q')).toMatchObject({ column: 1, to: 1, transition: 1 });
			expect(lookup(t, 1, 'q')).toMatchObject({ column: 1, to: 1, transition: 4 });
			expect(lookup(t, 1, '7')).toMatchObject({ column: 0, to: 1, transition: 2 });
			expect(lookup(t, 0, '7')).toMatchObject({ column: 0, to: E, transition: null });
			expect(lookup(t, 0, EOF)).toMatchObject({ column: null, to: E, transition: null });
		});

		it('keep a named set out of an unnamed column', () => {
			// 0 moves to 1 on digit and on _; 1 loops on letter.
			const u: Automaton = {
				states: dfa.states,
				transitions: [
					{ id: 0, from: 0, to: 1, label: CharSet.range('0', '9') },
					{ id: 1, from: 0, to: 1, label: CharSet.of('_') },
					{ id: 2, from: 1, to: 1, label: letter }
				],
				start: 0
			};
			expect(driverTable(u).columns.map((c) => c.header)).toEqual(['0–9,_', 'A–Z,a–z']);
			const named = driverTable(u, { names });
			expect(named.columns.map((c) => c.header)).toEqual(['digit', 'letter', '_']);
			expect(named.T).toEqual([
				[1, E, 1],
				[E, 1, E]
			]);
			expect(lookup(named, 0, '_')).toMatchObject({ column: 2, to: 1, transition: 1 });
			expect(tableSize(u, names)).toMatchObject({ classes: 3, labelClasses: 3 });
			expect(tableSize(u)).toMatchObject({ classes: 2, labelClasses: 3 });
		});

		it('never include the other column, so EOF keeps its entry', () => {
			const relopLike: Automaton = {
				states: [
					{ id: 0, name: '0', accepting: false },
					{ id: 1, name: '1', accepting: true }
				],
				transitions: [
					{ id: 0, from: 0, to: 1, label: CharSet.single('<') },
					{ id: 1, from: 0, to: 1, label: CharSet.single('<').complement(), display: 'other' }
				],
				start: 0
			};
			const r = driverTable(relopLike);
			expect(r.columns.map((c) => [c.header, c.other])).toEqual([
				['<', false],
				['other', true]
			]);
			expect(lookup(r, 0, EOF)).toMatchObject({ column: 1, to: 1, transition: 1 });
			expect(lookup(r, 0, 'x')).toMatchObject({ column: 1, to: 1, transition: 1 });
		});

		it('come from rules whose label classes no state tells apart', () => {
			const compiled = compileRules("lower = 'a' | … | 'z'", [
				{ name: 'Word', re: 'lower+' },
				{ name: 'Never', re: "ɸ 'q'" }
			]);
			const built = buildRuleDfa(compiled.rules!);
			if (!built.ok) throw new Error('too large');
			expect(labelClasses(built.full)).toHaveLength(2);
			const w = driverTable(built.full, { names: compiled.names });
			expect(w.columns.map((c) => c.header)).toEqual(['lower']);
			expect(w.T).toEqual([[1], [2], [2]]);
		});

		it('stay apart in the Lexical Analysis II DFA as built, whose states differ on A–Z and a–z', () => {
			const compiled = compileRules(LEX2_DEFS, LEX2_RULES);
			const built = buildRuleDfa(compiled.rules!);
			if (!built.ok) throw new Error('too large');
			const full = driverTable(built.full, { names: compiled.names });
			expect(full.columns.map((c) => c.header)).toEqual(['␣', '+', 'digit', 'A–Z', 'a–z']);
			// 0 →A–Z 4 and 0 →a–z 5: equivalent states, but different ones.
			expect(full.T[0].slice(3)).toEqual([4, 5]);
			const names = compiled.rules!.map((r) => r.name);
			const min = withTokenNames(minimalRuleDfa(built.full, nameGroups(names)), names);
			const minimal = driverTable(min, { names: compiled.names });
			expect(minimal.columns.map((c) => c.header)).toEqual(['␣', '+', 'digit', 'letter']);
		});
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
