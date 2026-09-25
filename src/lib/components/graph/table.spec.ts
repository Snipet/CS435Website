import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import type { Automaton } from '$lib/theory/automata/types';
import { tableColumns } from './table';
import { dfaEndsIn00, relopDfa, thompsonNfa } from './fixtures';

const headers = (a: Automaton, opts?: Parameters<typeof tableColumns>[1]) =>
	tableColumns(a, opts).map((c) => c.header);

const states = (n: number) =>
	Array.from({ length: n }, (_, id) => ({
		id,
		name: String.fromCharCode(65 + id),
		accepting: false
	}));

describe('tableColumns', () => {
	it('gives one column per symbol, ascending', () => {
		expect(headers(dfaEndsIn00)).toEqual(['0', '1']);
		expect(headers(thompsonNfa)).toEqual(['0', '1']);
	});

	it('splits a shared label into single symbols as on the slides', () => {
		const a: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.of('01') },
				{ id: 1, from: 1, to: 1, label: CharSet.of('01') }
			],
			start: 0
		};
		expect(headers(a)).toEqual(['0', '1']);
	});

	it('includes symbols of the declared alphabet that no transition uses', () => {
		const a: Automaton = {
			states: states(2),
			transitions: [{ id: 0, from: 0, to: 1, label: CharSet.of('1') }],
			start: 0,
			alphabet: CharSet.of('01')
		};
		expect(headers(a)).toEqual(['0', '1']);
	});

	it('heads the class behind display overrides with their text, last', () => {
		const cols = tableColumns(relopDfa);
		expect(cols.map((c) => c.header)).toEqual(['<', '=', '>', 'other']);
		expect(cols[3].set.has('a')).toBe(true);
		expect(cols[3].set.has('<')).toBe(false);
	});

	it('keeps large classes and named sets whole', () => {
		const letters = CharSet.range('a', 'z');
		const a: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: letters },
				{ id: 1, from: 1, to: 1, label: CharSet.of('_') }
			],
			start: 0
		};
		expect(headers(a)).toEqual(['_', 'a–z']);
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		const b: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: digit.set },
				{ id: 1, from: 1, to: 1, label: CharSet.of('x') }
			],
			start: 0
		};
		expect(headers(b, { names: [digit] })).toEqual(['digit', 'x']);
	});

	it('uses given classes as they are', () => {
		const classes = [CharSet.of('='), CharSet.of('<>'), CharSet.of('<=>').complement()];
		expect(headers(relopDfa, { classes })).toEqual(['=', '<,>', 'other']);
	});

	it('merges classes that every state treats alike into one column', () => {
		const letter = { name: 'letter', set: CharSet.range('A', 'Z').union(CharSet.range('a', 'z')) };
		const a: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.range('A', 'Z') },
				{ id: 1, from: 0, to: 1, label: CharSet.range('a', 'z') },
				{ id: 2, from: 1, to: 1, label: CharSet.range('A', 'Z') },
				{ id: 3, from: 1, to: 1, label: CharSet.range('a', 'z') },
				{ id: 4, from: 1, to: 1, label: CharSet.range('0', '9') }
			],
			start: 0
		};
		expect(headers(a)).toEqual(['0–9', 'A–Z,a–z']);
		expect(headers(a, { names: [letter] })).toEqual(['0–9', 'letter']);
		expect(tableColumns(a)[1].set.equals(letter.set)).toBe(true);
	});

	it('keeps classes apart when a state moves to different states on them', () => {
		const a: Automaton = {
			states: states(3),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.range('A', 'Z') },
				{ id: 1, from: 0, to: 2, label: CharSet.range('a', 'z') }
			],
			start: 0
		};
		expect(headers(a)).toEqual(['A–Z', 'a–z']);
	});

	it('still gives one column per symbol for small alphabets, in ascending order', () => {
		const a: Automaton = {
			states: states(3),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.of('0') },
				{ id: 1, from: 0, to: 1, label: CharSet.of('2') },
				{ id: 2, from: 0, to: 2, label: CharSet.of('1') }
			],
			start: 0
		};
		// 0 and 2 merge into one class, which is split again, around 1.
		expect(headers(a)).toEqual(['0', '1', '2']);
		const b: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.of('0') },
				{ id: 1, from: 0, to: 1, label: CharSet.of('1') }
			],
			start: 0
		};
		expect(headers(b)).toEqual(['0', '1']);
		// A merged class that is a named set stays whole.
		const bit = { name: 'bit', set: CharSet.of('01') };
		expect(headers(b, { names: [bit] })).toEqual(['bit']);
	});

	it('keeps a named set whole when it merges with a class that is not named', () => {
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		const a: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: digit.set },
				{ id: 1, from: 0, to: 1, label: CharSet.of('x') }
			],
			start: 0
		};
		expect(headers(a, { names: [digit] })).toEqual(['digit', 'x']);
	});

	it('never merges a class headed by a display override', () => {
		const a: Automaton = {
			states: states(2),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.of('<') },
				{ id: 1, from: 0, to: 1, label: CharSet.of('<').complement(), display: 'other' }
			],
			start: 0
		};
		expect(headers(a)).toEqual(['<', 'other']);
	});

	it('heads only the class common to every label with that text', () => {
		const a: Automaton = {
			states: states(3),
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.of('a') },
				{ id: 1, from: 0, to: 2, label: CharSet.of('a').complement(), display: 'other' },
				{ id: 2, from: 1, to: 2, label: CharSet.of('b').complement(), display: 'other' }
			],
			start: 0
		};
		// 'b' is inside only the first 'other', so it keeps its own header.
		const hs = headers(a);
		expect(hs.slice(0, 2)).toEqual(['a', 'b']);
		expect(hs[hs.length - 1]).toBe('other');
	});
});
