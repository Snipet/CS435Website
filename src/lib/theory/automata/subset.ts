/**
 * Subset construction (Lexical Analysis IV): NFA → DFA.
 *
 * The start state is ε-closure({ s0 }). A FIFO worklist takes each new DFA
 * state D and, for every symbol class a in ascending order, computes
 * ε-closure(move(D, a)). An existing DFA state is reused when it holds the
 * same set of NFA states. Every stage is recorded as a step.
 */
import type { CharSet } from '../charset';
import { sortByName, symbolClasses } from './core';
import { ClosureIndex, type ClosureEvent } from './closure';
import type { AcceptInfo, Automaton, State, StateId, Transition } from './types';

/**
 * - 'discovery': NFA names concatenated in closure order (ABCDHI); set notation
 *   {AA, B} when an NFA name is not a single character.
 * - 'sorted-set': {A, B, C} in name order.
 * - 'numbered': D0, D1, … in creation order.
 */
export type SubsetNaming = 'discovery' | 'sorted-set' | 'numbered';

export type SubsetStep =
	| { kind: 'start'; dstate: StateId; closure: { order: StateId[]; events: ClosureEvent[] } }
	| { kind: 'move'; from: StateId; symbol: CharSet; targets: StateId[]; via: number[] }
	| { kind: 'closure'; from: StateId; symbol: CharSet; order: StateId[]; events: ClosureEvent[] }
	| {
			kind: 'target';
			from: StateId;
			symbol: CharSet;
			/** null when the move is empty and the ∅ state is not shown. */
			to: StateId | null;
			isNew: boolean;
			transition: number | null;
	  }
	| { kind: 'done' };

/** A step plus the DFA size so far; the first `dfaStates` states and `dfaTransitions` transitions exist. */
export type SubsetTraceStep = SubsetStep & { dfaStates: number; dfaTransitions: number };

export interface SubsetResult {
	dfa: Automaton;
	steps: SubsetTraceStep[];
	/** Symbol classes (columns), ascending. */
	classes: CharSet[];
	/** The ∅ state when `includeEmpty` added one. */
	empty: StateId | null;
}

/** The empty set of NFA states, as a DFA state name. */
export const EMPTY_SUBSET_NAME = '∅';

/** Display text for an NFA state inside a subset name. */
const label = (s: State) => (s.name === '' ? String(s.id) : s.name);

/** Among accepting NFA states with token info, the lowest rule index wins. */
export function subsetAccept(nfa: Automaton, subset: Iterable<StateId>): AcceptInfo | undefined {
	let best: AcceptInfo | undefined;
	for (const id of subset) {
		const a = nfa.states[id].accept;
		if (nfa.states[id].accepting && a && (!best || a.rule < best.rule)) best = a;
	}
	return best;
}

export function subsetConstruction(
	nfa: Automaton,
	opts: { naming?: SubsetNaming; includeEmpty?: boolean } = {}
): SubsetResult {
	const naming = opts.naming ?? 'discovery';
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const singleChar = nfa.states.every((s) => [...label(s)].length === 1);
	let counter = 0;

	const nameOf = (order: StateId[]): string => {
		if (order.length === 0) return EMPTY_SUBSET_NAME;
		const names = (ids: StateId[]) => ids.map((id) => label(nfa.states[id]));
		switch (naming) {
			case 'numbered':
				return `D${counter++}`;
			case 'sorted-set':
				return `{${names(sortByName(nfa, order)).join(', ')}}`;
			case 'discovery':
				return singleChar ? names(order).join('') : `{${names(order).join(', ')}}`;
		}
	};

	const states: State[] = [];
	const transitions: Transition[] = [];
	const steps: SubsetTraceStep[] = [];
	const byKey = new Map<string, StateId>();
	const queue: StateId[] = [];
	let empty: StateId | null = null;

	const keyOf = (order: StateId[]) => [...order].sort((a, b) => a - b).join(',');
	const record = (step: SubsetStep) =>
		steps.push({ ...step, dfaStates: states.length, dfaTransitions: transitions.length });
	const create = (order: StateId[]): StateId => {
		const id = states.length;
		const state: State = {
			id,
			name: nameOf(order),
			accepting: order.some((s) => nfa.states[s].accepting),
			subset: order
		};
		const accept = subsetAccept(nfa, order);
		if (accept) state.accept = accept;
		states.push(state);
		byKey.set(keyOf(order), id);
		queue.push(id);
		if (order.length === 0) empty = id;
		return id;
	};

	const first = index.closureTrace([nfa.start]);
	record({ kind: 'start', dstate: create(first.order), closure: first });

	// Classes refine every label, so a label either contains a class or misses it.
	const coverage = new Map<CharSet, Set<number>>();
	const covers = (lbl: CharSet, k: number) => {
		let set = coverage.get(lbl);
		if (!set) {
			set = new Set(classes.flatMap((c, i) => (lbl.overlaps(c) ? [i] : [])));
			coverage.set(lbl, set);
		}
		return set.has(k);
	};

	for (let q = 0; q < queue.length; q++) {
		const from = queue[q];
		const subset = states[from].subset!;
		for (const [k, symbol] of classes.entries()) {
			const moved = index.moveWhere(subset, (lbl) => covers(lbl, k));
			record({ kind: 'move', from, symbol, targets: moved.targets, via: moved.via });
			const closed = index.closureTrace(moved.targets);
			record({ kind: 'closure', from, symbol, order: closed.order, events: closed.events });
			let to: StateId | null = null;
			let isNew = false;
			if (closed.order.length > 0 || opts.includeEmpty) {
				const existing = byKey.get(keyOf(closed.order));
				isNew = existing === undefined;
				to = existing ?? create(closed.order);
			}
			let transition: number | null = null;
			if (to !== null) {
				transition = transitions.length;
				transitions.push({ id: transition, from, to, label: symbol });
			}
			record({ kind: 'target', from, symbol, to, isNew, transition });
		}
	}
	record({ kind: 'done' });

	const dfa: Automaton = { states, transitions, start: 0 };
	if (nfa.alphabet) dfa.alphabet = nfa.alphabet;
	return { dfa, steps, classes, empty };
}
