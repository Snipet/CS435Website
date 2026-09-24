/** Helpers for the automata specs. */
import { formatLabel } from '../chars';
import type { Automaton, StateId } from './types';

/** Transitions as "A-ε->B", "C-1->E", in creation order. */
export function edgeList(a: Automaton): string[] {
	return a.transitions.map(
		(t) =>
			`${a.states[t.from].name}-${t.label ? formatLabel(t.label) : 'ε'}->${a.states[t.to].name}`
	);
}

export function names(a: Automaton, ids: Iterable<StateId>): string[] {
	return [...ids].map((id) => a.states[id].name);
}

export function id(a: Automaton, name: string): StateId {
	const s = a.states.find((st) => st.name === name);
	if (!s) throw new Error(`no state named ${name}`);
	return s.id;
}
