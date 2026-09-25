import { describe, expect, it } from 'vitest';
import { addState, remapPositions, removeStates, setEdgeLabel } from '$lib/components/graph/edit';
import { edgeKey } from '$lib/components/graph/layout';
import { tableColumns } from '$lib/components/graph/table';
import { CharSet } from '$lib/theory/charset';
import { automatonFromText, complete } from '$lib/theory/automata/core';
import type { Positions } from '$lib/theory/automata/types';
import { formalDefinition } from './definition';
import { presetById } from './presets';
import {
	completeForDrawing,
	defaultTrapPosition,
	positionsWithTrap,
	remapSelection,
	resolveDrawingEdit,
	samePositions,
	stripTrap
} from './trap';

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

describe('edits on the drawing', () => {
	const drawn = complete(a).automaton;
	const drawnPos = positionsWithTrap(pos, 2, null)!;
	const moved = (p: Positions, id: number, dx: number): Positions =>
		new Map([...p].map(([k, q]) => [k, k === id ? { x: q.x + dx, y: q.y } : q]));

	it('keeps the machine itself when a state is dragged with the trap drawn', () => {
		// The editor reports the same drawing with new positions.
		const edit = resolveDrawingEdit(a, pos, drawn, drawn, moved(drawnPos, 0, 40));
		expect(edit.machine).toBe(a);
		expect(edit.changed).toBe(true);
		expect(edit.redraw).toBe(false);
		expect(edit.positions.get(0)).toEqual({ x: 40, y: 0 });
		expect(edit.positions.has(2)).toBe(false);
	});

	it('moves only the trap when the trap is dragged', () => {
		const edit = resolveDrawingEdit(a, pos, drawn, drawn, moved(drawnPos, 2, 40));
		expect(edit).toMatchObject({ machine: a, changed: false, redraw: false, trapRemoved: false });
		expect(edit.trapAt).toEqual({ x: 280, y: 110 });
	});

	it('keeps the machine itself when a state is dragged without the trap', () => {
		const edit = resolveDrawingEdit(a, pos, a, a, moved(pos, 1, 10));
		expect(edit.machine).toBe(a);
		expect(edit.changed).toBe(true);
		expect(edit.map).toBeNull();
	});

	it('puts the drawing back when the trap is deleted', () => {
		const { automaton, map } = removeStates(drawn, [2]);
		const edit = resolveDrawingEdit(a, pos, drawn, automaton, remapPositions(drawnPos, map));
		expect(edit.machine).toBe(a);
		expect(edit.changed).toBe(false);
		expect(edit.trapRemoved).toBe(true);
		expect(edit.redraw).toBe(true);
		// With automatic layout the editor reports the positions it drew; they are not an edit.
		const auto = resolveDrawingEdit(a, null, drawn, automaton, remapPositions(drawnPos, map));
		expect(auto).toMatchObject({ machine: a, changed: false, redraw: true, trapRemoved: true });
	});

	it('puts the drawing back when an edge is added out of the trap', () => {
		const next = setEdgeLabel(drawn, 2, 0, { symbols: CharSet.single('1'), epsilon: false });
		const edit = resolveDrawingEdit(a, pos, drawn, next, drawnPos);
		expect(edit).toMatchObject({ machine: a, changed: false, redraw: true, trapRemoved: false });
	});

	it('takes a real edit made with the trap drawn', () => {
		const added = addState(drawn);
		const p: Positions = new Map([...drawnPos, [added.id, { x: 260, y: 0 }]]);
		const edit = resolveDrawingEdit(a, pos, drawn, added.automaton, p);
		expect(edit.machine).not.toBe(a);
		expect(edit.machine.states.map((s) => s.name)).toEqual(['A', 'B', 'C']);
		expect(edit).toMatchObject({ changed: true, redraw: false, trapRemoved: false });
	});

	it('compares positions state by state', () => {
		expect(samePositions(pos, new Map(pos))).toBe(true);
		expect(samePositions(pos, moved(pos, 0, 1))).toBe(false);
		expect(samePositions(null, null)).toBe(true);
		expect(samePositions(pos, null)).toBe(false);
	});
});

describe('trap drawing with other', () => {
	const relop = presetById('08-16')!.value.machine;

	it('labels edges into the trap other, so the table keeps its other column', () => {
		const c = completeForDrawing(relop);
		expect(c.trap).toBe(9);
		expect(tableColumns(c.automaton).map((col) => col.header)).toEqual(['<', '=', '>', 'other']);
		expect(tableColumns(relop).map((col) => col.header)).toEqual(['<', '=', '>', 'other']);
		const moves = formalDefinition(c.automaton).moves.map((m) => `${m.from} ${m.symbol} ${m.to}`);
		expect(moves).toContain('0 other trap');
		expect(moves).toContain('1 other 4');
		expect(moves.some((m) => m.includes('['))).toBe(false);
	});

	it('leaves plain labels on machines without other', () => {
		const c = completeForDrawing(presetById('06-7')!.value.machine);
		expect(c.automaton.transitions.every((t) => !t.display)).toBe(true);
		expect(tableColumns(c.automaton).map((col) => col.header)).toEqual(['0', '1']);
	});

	it('returns a complete machine unchanged', () => {
		const dfa = presetById('06-8')!.value.machine;
		expect(completeForDrawing(dfa)).toEqual({ automaton: dfa, trap: null });
	});
});
