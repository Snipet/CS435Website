/**
 * Drawing a partial DFA with its trap state (Lexical Analysis III, slide 6).
 *
 * The trap is drawn by passing `complete(machine)` to the editor. Edits made
 * on that drawing come back with the trap in them; `stripTrap` removes it again
 * (an edge into the trap is the same as a missing transition) and carries the
 * positions and the selection over to the machine without the trap.
 */
import { edgeKey } from '$lib/components/graph/layout';
import { remapPositions, removeStates } from '$lib/components/graph/edit';
import type { GraphSelection } from '$lib/components/graph/types';
import type { Automaton, Point, Positions, StateId } from '$lib/theory/automata/types';

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
