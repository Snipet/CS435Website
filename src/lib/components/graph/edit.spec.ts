import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import type { Automaton } from '$lib/theory/automata/types';
import {
	addState,
	edgeSymbols,
	edgeTransitions,
	letterName,
	nextStateName,
	remapPositions,
	removeEdge,
	removeStates,
	setEdgeLabel,
	setStart,
	updateState
} from './edit';
import { edgeKey } from './layout';
import { dfaEndsIn00, mixedNfa } from './fixtures';

const labelsOf = (a: Automaton) =>
	a.transitions.map((t) => `${t.id}:${t.from}>${t.to}:${t.label ? t.label.key() : 'ε'}`);

describe('names', () => {
	it('counts A … Z, AA …', () => {
		expect([0, 1, 25, 26, 27, 52].map(letterName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'BA']);
	});

	it('picks the first unused letter', () => {
		expect(nextStateName(dfaEndsIn00)).toBe('D');
		const gap = updateState(dfaEndsIn00, 1, { name: 'X' });
		expect(nextStateName(gap)).toBe('B');
	});
});

describe('addState', () => {
	it('appends a state with the next free name without touching the input', () => {
		const before = JSON.stringify(labelsOf(dfaEndsIn00));
		const { automaton, id } = addState(dfaEndsIn00);
		expect(id).toBe(3);
		expect(automaton.states[3]).toEqual({ id: 3, name: 'D', accepting: false });
		expect(dfaEndsIn00.states).toHaveLength(3);
		expect(JSON.stringify(labelsOf(dfaEndsIn00))).toBe(before);
	});

	it('makes the first state of an empty machine the start', () => {
		const { automaton } = addState({ states: [], transitions: [], start: 0 });
		expect(automaton.start).toBe(0);
		expect(automaton.states[0].name).toBe('A');
	});
});

describe('removeStates', () => {
	it('reindexes states, transitions and the start', () => {
		const { automaton, map } = removeStates(dfaEndsIn00, [1]);
		expect(automaton.states.map((s) => [s.id, s.name])).toEqual([
			[0, 'A'],
			[1, 'C']
		]);
		expect([...map]).toEqual([
			[0, 0],
			[2, 1]
		]);
		// Transitions through B are gone; ids stay 0…n−1.
		expect(labelsOf(automaton)).toEqual(['0:0>0:49', '1:1>1:48', '2:1>0:49']);
		expect(automaton.start).toBe(0);
	});

	it('moves the start to the first state when the start is removed', () => {
		const a = setStart(dfaEndsIn00, 1);
		expect(removeStates(a, [1]).automaton.start).toBe(0);
		expect(removeStates(dfaEndsIn00, [0]).automaton.start).toBe(0);
	});

	it('carries positions through the renumbering', () => {
		const { map } = removeStates(dfaEndsIn00, [0]);
		const pos = remapPositions(
			new Map([
				[0, { x: 0, y: 0 }],
				[1, { x: 10, y: 0 }],
				[2, { x: 20, y: 0 }]
			]),
			map
		);
		expect([...pos]).toEqual([
			[0, { x: 10, y: 0 }],
			[1, { x: 20, y: 0 }]
		]);
	});
});

describe('edge edits', () => {
	it('finds and removes an edge by key', () => {
		expect(edgeTransitions(mixedNfa, edgeKey(0, 1, false)).map((t) => t.id)).toEqual([0, 1]);
		const a = removeEdge(mixedNfa, edgeKey(0, 1, false));
		expect(labelsOf(a)[0]).toBe('0:0>1:ε');
		expect(a.transitions.every((t, i) => t.id === i)).toBe(true);
		expect(removeEdge(mixedNfa, 'nope')).toBe(mixedNfa);
	});

	it('replaces an edited edge in place', () => {
		const a = setEdgeLabel(
			mixedNfa,
			0,
			1,
			{ symbols: CharSet.of('xy'), epsilon: false },
			{ epsilon: false }
		);
		expect(edgeSymbols(edgeTransitions(a, edgeKey(0, 1, false)))!.equals(CharSet.of('xy'))).toBe(
			true
		);
		expect(a.transitions[0]).toMatchObject({ id: 0, from: 0, to: 1 });
		expect(a.transitions).toHaveLength(mixedNfa.transitions.length - 1);
	});

	it('adds new edges, merging symbols into an existing symbol edge', () => {
		const a = setEdgeLabel(dfaEndsIn00, 1, 0, { symbols: CharSet.of('x'), epsilon: true });
		const sym = edgeTransitions(a, edgeKey(1, 0, false));
		expect(sym).toHaveLength(1);
		expect(sym[0].label!.equals(CharSet.of('1x'))).toBe(true);
		expect(edgeTransitions(a, edgeKey(1, 0, true))).toHaveLength(1);
		expect(a.transitions.every((t, i) => t.id === i)).toBe(true);
	});

	it('turns an ε edge into a symbol edge', () => {
		const a = setEdgeLabel(
			mixedNfa,
			2,
			0,
			{ symbols: CharSet.of('z'), epsilon: false },
			{ epsilon: true }
		);
		expect(edgeTransitions(a, edgeKey(2, 0, true))).toHaveLength(0);
		expect(edgeTransitions(a, edgeKey(2, 0, false))[0].label!.equals(CharSet.of('z'))).toBe(true);
	});

	it('ignores edges between missing states', () => {
		expect(setEdgeLabel(dfaEndsIn00, 0, 9, { symbols: CharSet.of('a'), epsilon: false })).toBe(
			dfaEndsIn00
		);
	});
});

describe('state edits', () => {
	it('updates fields and the start without mutating', () => {
		const a = updateState(dfaEndsIn00, 1, { accepting: true, name: 'Q' });
		expect(a.states[1]).toEqual({ id: 1, name: 'Q', accepting: true });
		expect(dfaEndsIn00.states[1].accepting).toBe(false);
		expect(setStart(a, 2).start).toBe(2);
		expect(setStart(a, 7)).toBe(a);
		expect(updateState(a, 9, { name: 'x' })).toBe(a);
	});
});
