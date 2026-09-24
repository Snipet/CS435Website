/**
 * Immutable editing operations on automata, used by the AutomatonView editor.
 * Every function returns a new Automaton; inputs are never mutated. After an
 * edit, `states[i].id === i` and transition ids are renumbered 0…n−1 in order.
 */
import { CharSet } from '$lib/theory/charset';
import type {
	Automaton,
	Point,
	Positions,
	State,
	StateId,
	Transition
} from '$lib/theory/automata/types';
import { letterName } from '$lib/theory/automata/core';
import { edgeKey } from './layout';
import type { ParsedLabel } from './label-text';

export { letterName } from '$lib/theory/automata/core';

/** First letter name not used by any state. */
export function nextStateName(a: Automaton): string {
	const used = new Set(a.states.map((s) => s.name));
	for (let i = 0; ; i++) {
		const name = letterName(i);
		if (!used.has(name)) return name;
	}
}

const renumber = (ts: readonly Transition[]): Transition[] =>
	ts.map((t, id) => (t.id === id ? t : { ...t, id }));

/** Adds a state (named with the next free letter unless given) and returns its id. */
export function addState(
	a: Automaton,
	init: Partial<Omit<State, 'id'>> = {}
): { automaton: Automaton; id: StateId } {
	const id = a.states.length;
	const state: State = { name: nextStateName(a), accepting: false, ...init, id };
	return {
		automaton: { ...a, states: [...a.states, state], start: a.states.length === 0 ? id : a.start },
		id
	};
}

/**
 * Removes states and their transitions, renumbering the rest so ids stay equal
 * to indices. `map` sends old ids of kept states to new ids. When the start
 * state goes, the first remaining state becomes the start.
 */
export function removeStates(
	a: Automaton,
	ids: Iterable<StateId>
): { automaton: Automaton; map: Map<StateId, StateId> } {
	const gone = new Set(ids);
	const map = new Map<StateId, StateId>();
	const states: State[] = [];
	for (const s of a.states) {
		if (gone.has(s.id)) continue;
		map.set(s.id, states.length);
		states.push({ ...s, id: states.length });
	}
	const transitions = renumber(
		a.transitions
			.filter((t) => map.has(t.from) && map.has(t.to))
			.map((t) => ({ ...t, from: map.get(t.from)!, to: map.get(t.to)! }))
	);
	const start = map.get(a.start) ?? 0;
	return { automaton: { ...a, states, transitions, start }, map };
}

export function updateState(
	a: Automaton,
	id: StateId,
	patch: Partial<Omit<State, 'id'>>
): Automaton {
	if (!a.states[id]) return a;
	return { ...a, states: a.states.map((s) => (s.id === id ? { ...s, ...patch, id } : s)) };
}

export function setStart(a: Automaton, id: StateId): Automaton {
	return a.states[id] ? { ...a, start: id } : a;
}

/** Transitions drawn as the edge with this key (see `edgeKey`). */
export function edgeTransitions(a: Automaton, key: string): Transition[] {
	return a.transitions.filter((t) => edgeKey(t.from, t.to, t.label === null) === key);
}

export function removeEdge(a: Automaton, key: string): Automaton {
	const transitions = a.transitions.filter((t) => edgeKey(t.from, t.to, t.label === null) !== key);
	return transitions.length === a.transitions.length
		? a
		: { ...a, transitions: renumber(transitions) };
}

/**
 * Sets the label of the edge from → to. `replace` names the edge being edited
 * (its ε-ness); its transitions are replaced by one transition for the symbols
 * and/or one ε-move. Otherwise new symbols join an existing symbol edge between
 * the same states: symbols it already covers are skipped, and the rest merge
 * into a plain transition, never into one with a display override such as
 * `other` (they get a transition of their own, drawn `x,other`). An edit that
 * adds nothing returns the input unchanged.
 */
export function setEdgeLabel(
	a: Automaton,
	from: StateId,
	to: StateId,
	label: ParsedLabel,
	replace?: { epsilon: boolean }
): Automaton {
	if (!a.states[from] || !a.states[to]) return a;
	const editedKey = replace ? edgeKey(from, to, replace.epsilon) : null;
	const out: Transition[] = [];
	let slot = -1;
	for (const t of a.transitions) {
		if (editedKey !== null && edgeKey(t.from, t.to, t.label === null) === editedKey) {
			if (slot < 0) slot = out.length;
			continue;
		}
		out.push(t);
	}
	let changed = out.length !== a.transitions.length;
	const insert = (t: Transition) => {
		changed = true;
		if (slot >= 0) out.splice(slot++, 0, t);
		else out.push(t);
	};
	const between = (t: Transition) => t.from === from && t.to === to;
	if (!label.symbols.isEmpty) {
		let covered = CharSet.EMPTY;
		for (const t of out) if (between(t) && t.label) covered = covered.union(t.label);
		const extra = label.symbols.subtract(covered);
		if (!extra.isEmpty) {
			const i = out.findIndex((t) => between(t) && t.label !== null && !t.display);
			if (i >= 0) {
				out[i] = { ...out[i], label: out[i].label!.union(extra) };
				changed = true;
			} else insert({ id: -1, from, to, label: extra });
		}
	}
	if (label.epsilon && !out.some((t) => between(t) && t.label === null))
		insert({ id: -1, from, to, label: null });
	return changed ? { ...a, transitions: renumber(out) } : a;
}

/** Positions carried through a state renumbering. */
export function remapPositions(p: Positions, map: ReadonlyMap<StateId, StateId>): Positions {
	const out: Positions = new Map();
	for (const [oldId, newId] of map) {
		const q = p.get(oldId);
		if (q) out.set(newId, q);
	}
	return out;
}

/** Label of an edge's transitions as one set (null for an ε edge). */
export function edgeSymbols(ts: readonly Transition[]): CharSet | null {
	if (ts.length === 0 || ts[0].label === null) return null;
	let u = CharSet.EMPTY;
	for (const t of ts) if (t.label) u = u.union(t.label);
	return u;
}

/** A copy of the positions with one state moved. */
export function withPosition(p: ReadonlyMap<StateId, Point>, id: StateId, at: Point): Positions {
	const out: Positions = new Map(p);
	out.set(id, at);
	return out;
}
