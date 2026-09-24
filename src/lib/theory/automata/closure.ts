/**
 * ε-closure and move (Lexical Analysis IV).
 *
 * Order matters because subset-construction state names are built from it:
 * the closure lists the seeds first (in the given order), then the states
 * added by a depth-first walk (preorder) that follows ε-transitions in
 * creation order. `move` scans its states in name order and follows matching
 * transitions in creation order.
 */
import { CharSet } from '../charset';
import { isLabeled, outgoingIndex, sortByName } from './core';
import type { Automaton, StateId, Transition } from './types';

export interface ClosureEvent {
	/** 'seed': given state; 'follow': new state reached via ε; 'skip': ε to a state already in the closure. */
	kind: 'seed' | 'follow' | 'skip';
	state: StateId;
	/** The ε-transition id ('follow' and 'skip'). */
	via?: number;
}

export interface MoveResult {
	/** Targets in the order they were reached, without duplicates. */
	targets: StateId[];
	/** Every transition taken, in the order it was followed. */
	via: number[];
}

/** Lookup tables for repeated closure/move calls on one automaton. */
export class ClosureIndex {
	readonly epsilon: Transition[][];
	readonly labeled: (Transition & { label: CharSet })[][];
	/** rank[id] = position of the state in name order. */
	readonly rank: number[];
	readonly automaton: Automaton;

	constructor(automaton: Automaton) {
		this.automaton = automaton;
		const out = outgoingIndex(automaton);
		this.epsilon = out.map((ts) => ts.filter((t) => t.label === null));
		this.labeled = out.map((ts) => ts.filter(isLabeled));
		this.rank = [];
		sortByName(
			automaton,
			automaton.states.map((s) => s.id)
		).forEach((id, i) => (this.rank[id] = i));
	}

	closureTrace(seeds: Iterable<StateId>): { order: StateId[]; events: ClosureEvent[] } {
		const order: StateId[] = [];
		const events: ClosureEvent[] = [];
		const seen = new Set<StateId>();
		for (const s of seeds) {
			if (seen.has(s)) continue;
			seen.add(s);
			order.push(s);
			events.push({ kind: 'seed', state: s });
		}
		for (const seed of order.slice()) {
			const stack: { state: StateId; next: number }[] = [{ state: seed, next: 0 }];
			while (stack.length > 0) {
				const top = stack[stack.length - 1];
				const list = this.epsilon[top.state];
				if (top.next >= list.length) {
					stack.pop();
					continue;
				}
				const t = list[top.next++];
				if (seen.has(t.to)) {
					events.push({ kind: 'skip', state: t.to, via: t.id });
					continue;
				}
				seen.add(t.to);
				order.push(t.to);
				events.push({ kind: 'follow', state: t.to, via: t.id });
				stack.push({ state: t.to, next: 0 });
			}
		}
		return { order, events };
	}

	closure(seeds: Iterable<StateId>): StateId[] {
		return this.closureTrace(seeds).order;
	}

	/** Moves on the transitions whose label satisfies `matches`. */
	moveWhere(states: Iterable<StateId>, matches: (label: CharSet) => boolean): MoveResult {
		const scan = [...new Set(states)].sort((a, b) => this.rank[a] - this.rank[b]);
		const targets: StateId[] = [];
		const via: number[] = [];
		const seen = new Set<StateId>();
		for (const s of scan) {
			for (const t of this.labeled[s]) {
				if (!matches(t.label)) continue;
				via.push(t.id);
				if (!seen.has(t.to)) {
					seen.add(t.to);
					targets.push(t.to);
				}
			}
		}
		return { targets, via };
	}

	/**
	 * move(T, a). A string names one symbol; a CharSet should be a symbol class
	 * (a transition matches when its label contains the whole set).
	 */
	move(states: Iterable<StateId>, symbol: CharSet | string): MoveResult {
		const set = typeof symbol === 'string' ? CharSet.single(symbol) : symbol;
		if (set.isEmpty) return { targets: [], via: [] };
		if (set.isSingleton) {
			const cp = set.first()!;
			return this.moveWhere(states, (label) => label.has(cp));
		}
		return this.moveWhere(states, (label) => set.isSubsetOf(label));
	}
}

/** ε-closure of `seeds`, ordered: seeds, then DFS preorder over ε-transitions in creation order. */
export function epsilonClosure(a: Automaton, seeds: Iterable<StateId>): StateId[] {
	return new ClosureIndex(a).closure(seeds);
}

/** ε-closure with every seed, followed edge, and skipped edge recorded. */
export function epsilonClosureTrace(
	a: Automaton,
	seeds: Iterable<StateId>
): { order: StateId[]; events: ClosureEvent[] } {
	return new ClosureIndex(a).closureTrace(seeds);
}

/** States reachable from `states` on one symbol (no ε-closure). */
export function move(
	a: Automaton,
	states: Iterable<StateId>,
	symbol: CharSet | string
): MoveResult {
	return new ClosureIndex(a).move(states, symbol);
}
