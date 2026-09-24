import { describe, expect, it } from 'vitest';
import { addState, setEdgeLabel } from '$lib/components/graph/edit';
import { edgeKey } from '$lib/components/graph/layout';
import { CharSet } from '$lib/theory/charset';
import { automatonFromText, complete } from '$lib/theory/automata/core';
import type { Positions } from '$lib/theory/automata/types';
import { defaultTrapPosition, positionsWithTrap, remapSelection, stripTrap } from './trap';

const a = automatonFromText('alphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 0 B');
const pos: Positions = new Map([
	[0, { x: 0, y: 0 }],
	[1, { x: 130, y: 0 }]
]);

describe('trap drawing', () => {
	it('places the trap below and right of the drawing', () => {
		expect(defaultTrapPosition(pos)).toEqual({ x: 240, y: 110 });
		expect(positionsWithTrap(pos, 2, null)!.get(2)).toEqual({ x: 240, y: 110 });
		expect(positionsWithTrap(pos, 2, { x: 5, y: 6 })!.get(2)).toEqual({ x: 5, y: 6 });
		expect(positionsWithTrap(null, 2, null)).toBeNull();
	});

	it('strips the trap from an edit made on the completed drawing', () => {
		const { automaton: shown, trap } = complete(a);
		expect(trap).toBe(2);
		// The user adds a state C (after the trap) and gives B a 1-edge to it.
		const added = addState(shown);
		const edited = setEdgeLabel(added.automaton, 1, added.id, {
			symbols: CharSet.single('1'),
			epsilon: false
		});
		const p: Positions = new Map([...positionsWithTrap(pos, 2, null)!, [3, { x: 260, y: 0 }]]);
		const out = stripTrap(edited, p);
		expect(out.machine.states.map((s) => s.name)).toEqual(['A', 'B', 'C']);
		expect(out.machine.states.some((s) => s.trap)).toBe(false);
		expect(out.machine.transitions.map((t) => [t.from, t.to])).toEqual([
			[0, 0],
			[0, 1],
			[1, 2]
		]);
		expect(out.positions.get(2)).toEqual({ x: 260, y: 0 });
		expect(out.positions.size).toBe(3);
		expect(out.trapAt).toEqual({ x: 240, y: 110 });
		expect(remapSelection({ kind: 'state', id: 3 }, out.map)).toEqual({ kind: 'state', id: 2 });
		// The trap keeps its place after every state.
		expect(remapSelection({ kind: 'state', id: 2 }, out.map)).toEqual({ kind: 'state', id: 3 });
	});

	it('leaves a machine without a trap alone', () => {
		const out = stripTrap(a, pos);
		expect(out.machine).toBe(a);
		expect(out.trapAt).toBeNull();
	});

	it('renumbers selected edges and drops ones that touch removed states', () => {
		const map = new Map([
			[0, 0],
			[1, 1],
			[3, 2]
		]);
		expect(remapSelection({ kind: 'edge', key: edgeKey(1, 3, false) }, map)).toEqual({
			kind: 'edge',
			key: edgeKey(1, 2, false)
		});
		expect(remapSelection({ kind: 'edge', key: edgeKey(3, 0, true) }, map)).toEqual({
			kind: 'edge',
			key: edgeKey(2, 0, true)
		});
		expect(remapSelection({ kind: 'edge', key: edgeKey(1, 2, false) }, map)).toBeNull();
		expect(remapSelection({ kind: 'state', id: 2 }, map)).toBeNull();
		expect(remapSelection(null, map)).toBeNull();
	});
});
