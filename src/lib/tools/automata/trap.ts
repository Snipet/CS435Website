/**
 * Drawing a partial DFA with its trap state (Lexical Analysis III, slide 6).
 *
 * The trap is drawn by passing `completeForDrawing(machine)` to the editor.
 * Edits made on that drawing come back with the trap in them; `stripTrap`
 * removes it again (an edge into the trap is the same as a missing transition)
 * and carries the positions and the selection over to the machine without the
 * trap. `resolveDrawingEdit` puts the two together for the page.
 */
import { edgeKey, layoutKey } from '$lib/components/graph/layout';
import { remapPositions, removeStates } from '$lib/components/graph/edit';
import type { GraphSelection } from '$lib/components/graph/types';
import { complete } from '$lib/theory/automata/core';
import type { Automaton, Point, Positions, StateId } from '$lib/theory/automata/types';
import { machineKey } from './codec';

/** The label for "any symbol not on another edge" (Lexical Analysis IV, slide 16). */
export const OTHER = 'other';

/**
 * `complete(a)`, for drawing and tables. In a machine that labels edges
 * `other`, the edges into the trap are labeled `other` too: each carries
 * exactly the symbols on no other edge of its state, and the table keeps its
 * `other` column.
 */
export function completeForDrawing(a: Automaton): { automaton: Automaton; trap: StateId | null } {
	const c = complete(a);
	const trap = c.trap;
	if (trap === null || !a.transitions.some((t) => t.display === OTHER)) return c;
	return {
		trap,
		automaton: {
			...c.automaton,
			transitions: c.automaton.transitions.map((t) =>
				t.to === trap && t.label && !t.display ? { ...t, display: OTHER } : t
			)
		}
	};
}

/** Whether two sets of pinned positions put every state in the same place. */
export function samePositions(p: Positions | null, q: Positions | null): boolean {
	if (p === q) return true;
	if (!p || !q || p.size !== q.size) return false;
	for (const [id, a] of p) {
		const b = q.get(id);
		if (!b || b.x !== a.x || b.y !== a.y) return false;
	}
	return true;
}

const TRAP_OFFSET = 110;

/**
 * Where the trap goes when it has no position yet: below and to the right of
 * the drawing, so edges come in from the upper left, clear of its loop.
 */
export function defaultTrapPosition(p: Positions): Point {
	const pts = [...p.values()];
	if (pts.length === 0) return { x: 0, y: 120 };
	return {
		x: Math.max(...pts.map((q) => q.x)) + TRAP_OFFSET,
		y: Math.max(...pts.map((q) => q.y)) + TRAP_OFFSET
	};
}

/** Positions for the completed machine: the machine's own plus the trap's. */
export function positionsWithTrap(
	p: Positions | null,
	trap: StateId,
	trapAt: Point | null
): Positions | null {
	if (!p) return null;
	const out: Positions = new Map(p);
	out.set(trap, trapAt ?? defaultTrapPosition(p));
	return out;
}

const EDGE_KEY = /^(\d+)>(\d+)(ε?)$/;

/** A selection with state ids renumbered by `map`; null when its state is gone. */
export function remapSelection(
	sel: GraphSelection,
	map: ReadonlyMap<StateId, StateId>
): GraphSelection {
	if (!sel) return null;
	if (sel.kind === 'state') {
		const id = map.get(sel.id);
		return id === undefined ? null : { kind: 'state', id };
	}
	const m = EDGE_KEY.exec(sel.key);
	if (!m) return null;
	const from = map.get(Number(m[1]));
	const to = map.get(Number(m[2]));
	if (from === undefined || to === undefined) return null;
	return { kind: 'edge', key: edgeKey(from, to, m[3] === 'ε') };
}

export interface Stripped {
	machine: Automaton;
	positions: Positions;
	/** Where the trap was drawn, if the edit kept it. */
	trapAt: Point | null;
	/**
	 * Ids in the edited drawing → ids in the machine without the trap; a trap
	 * maps to the id the trap gets when it is drawn again (after every state).
	 */
	map: Map<StateId, StateId>;
}

/** Removes trap states (and their edges) from an edited drawing. */
export function stripTrap(a: Automaton, p: Positions): Stripped {
	const traps = a.states.filter((s) => s.trap).map((s) => s.id);
	if (traps.length === 0)
		return {
			machine: a,
			positions: p,
			trapAt: null,
			map: new Map(a.states.map((s) => [s.id, s.id]))
		};
	const { automaton, map } = removeStates(a, traps);
	const positions = remapPositions(p, map);
	for (const t of traps) map.set(t, automaton.states.length);
	return { machine: automaton, positions, trapAt: p.get(traps[0]) ?? null, map };
}

export interface DrawingEdit {
	/** The machine after the edit: the previous machine itself when the edit left it as it was. */
	machine: Automaton;
	positions: Positions;
	/** Where the trap was drawn, if the edit kept it. */
	trapAt: Point | null;
	/** Ids in the edited drawing → ids in `machine`, when the trap was drawn. */
	map: Map<StateId, StateId> | null;
	/** The machine or its positions changed. */
	changed: boolean;
	/**
	 * The edit changed only the trap (deleted it, added an edge out of it, …),
	 * which is not part of the machine: the drawing has to be put back.
	 */
	redraw: boolean;
	/** The edit deleted the trap state. */
	trapRemoved: boolean;
}

/**
 * Reads an edit the editor reports. `drawn` is what it was showing: the
 * machine, or the machine with its trap. When the machine is unchanged (a
 * state was dragged) the result keeps the same object, so nothing computed
 * from it (a run and its current step) starts over.
 */
export function resolveDrawingEdit(
	machine: Automaton,
	positions: Positions | null,
	drawn: Automaton,
	next: Automaton,
	pos: Positions
): DrawingEdit {
	const hadTrap = drawn.states.some((s) => s.trap);
	const stripped = hadTrap ? stripTrap(next, pos) : null;
	const edited = stripped ? stripped.machine : next;
	const m = edited === machine || machineKey(edited) === machineKey(machine) ? machine : edited;
	const p = stripped ? stripped.positions : pos;
	const redraw = hadTrap && m === machine && layoutKey(next) !== layoutKey(drawn);
	return {
		machine: m,
		positions: p,
		trapAt: stripped?.trapAt ?? null,
		map: stripped?.map ?? null,
		// An edit on the trap alone moves nothing; the positions it reports are
		// only where the drawing had the states (auto layout included).
		changed: !redraw && (m !== machine || !samePositions(p, positions)),
		redraw,
		trapRemoved: hadTrap && !next.states.some((s) => s.trap)
	};
}
