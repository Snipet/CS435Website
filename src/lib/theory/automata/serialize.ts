/**
 * Plain-data forms of engine objects, for sending them between a worker and
 * the page (`postMessage` copies with the structured clone algorithm, which
 * keeps own fields only: a CharSet arrives as `{ ranges }` without its
 * methods). Each `…ToPlain` has a `…FromPlain` that rebuilds real engine
 * objects, so code on the other side keeps working on CharSets.
 *
 * Plain forms are also compact: a CharSet is its list of ranges, a subset
 * step names its symbol class by index, and closure events are a flat list
 * of numbers (cloning thousands of small objects is slow).
 */
import { CharSet, type Range } from '../charset';
import type { ClosureEvent } from './closure';
import type { SubsetResult, SubsetTraceStep } from './subset';
import type { Automaton, Transition } from './types';

// ---------------------------------------------------------------------------
// CharSet
// ---------------------------------------------------------------------------

/** A CharSet as its sorted, disjoint, inclusive ranges. */
export type PlainCharSet = [lo: number, hi: number][];

export function charSetToPlain(set: CharSet): PlainCharSet {
	return set.ranges.map(([lo, hi]) => [lo, hi]);
}

/**
 * Makes CharSets from plain ranges and hands out one object per distinct set,
 * so sets that were the same object before cloning (a subset DFA's labels and
 * its symbol classes) are the same object again.
 */
export class CharSetInterner {
	readonly #known = new Map<string, CharSet>();

	/** Sets `get` returns as they are when an equal set is asked for. */
	constructor(seed: Iterable<CharSet> = []) {
		for (const set of seed) this.add(set);
	}

	add(set: CharSet): CharSet {
		const key = set.key();
		const known = this.#known.get(key);
		if (known) return known;
		this.#known.set(key, set);
		return set;
	}

	/** A CharSet for plain ranges, or for a CharSet that went through structured clone. */
	get(plain: PlainCharSet | { readonly ranges: readonly Range[] }): CharSet {
		return this.add(charSetFromPlain(plain));
	}
}

/** A CharSet from plain ranges, or from a CharSet that went through structured clone (`{ ranges }`). */
export function charSetFromPlain(
	plain: PlainCharSet | { readonly ranges: readonly Range[] }
): CharSet {
	if (plain instanceof CharSet) return plain;
	const ranges = Array.isArray(plain) ? plain : plain.ranges;
	return ranges.length === 0 ? CharSet.EMPTY : CharSet.fromRanges(ranges);
}

// ---------------------------------------------------------------------------
// Automaton
// ---------------------------------------------------------------------------

export interface PlainTransition extends Omit<Transition, 'label'> {
	label: PlainCharSet | null;
}

export interface PlainAutomaton extends Omit<Automaton, 'transitions' | 'alphabet'> {
	transitions: PlainTransition[];
	alphabet?: PlainCharSet;
}

export function automatonToPlain(a: Automaton): PlainAutomaton {
	const plain: PlainAutomaton = {
		states: a.states,
		transitions: a.transitions.map((t) => ({
			...t,
			label: t.label ? charSetToPlain(t.label) : null
		})),
		start: a.start
	};
	if (a.alphabet) plain.alphabet = charSetToPlain(a.alphabet);
	return plain;
}

/** The automaton `automatonToPlain` was given; equal labels share one CharSet (through `intern`). */
export function automatonFromPlain(
	plain: PlainAutomaton,
	intern: CharSetInterner = new CharSetInterner()
): Automaton {
	const a: Automaton = {
		states: plain.states,
		transitions: plain.transitions.map((t) => ({
			...t,
			label: t.label ? intern.get(t.label) : null
		})),
		start: plain.start
	};
	if (plain.alphabet) a.alphabet = intern.get(plain.alphabet);
	return a;
}

// ---------------------------------------------------------------------------
// Closure events
// ---------------------------------------------------------------------------

const EVENT_KINDS: readonly ClosureEvent['kind'][] = ['seed', 'follow', 'skip'];

/** Closure events as a flat list: kind (0 seed, 1 follow, 2 skip), state, via (-1 for none). */
export type PlainClosureEvents = number[];

export function closureEventsToPlain(events: readonly ClosureEvent[]): PlainClosureEvents {
	const out: number[] = [];
	for (const e of events) out.push(EVENT_KINDS.indexOf(e.kind), e.state, e.via ?? -1);
	return out;
}

export function closureEventsFromPlain(plain: PlainClosureEvents): ClosureEvent[] {
	const events: ClosureEvent[] = [];
	for (let i = 0; i + 2 < plain.length; i += 3) {
		const e: ClosureEvent = { kind: EVENT_KINDS[plain[i]], state: plain[i + 1] };
		if (plain[i + 2] >= 0) e.via = plain[i + 2];
		events.push(e);
	}
	return events;
}

// ---------------------------------------------------------------------------
// Subset construction
// ---------------------------------------------------------------------------

type Counts = { dfaStates: number; dfaTransitions: number };
/** A step's symbol class: its index in `classes`, or its ranges when it is not one of them. */
type PlainSymbol = number | PlainCharSet;

export type PlainSubsetStep = Counts &
	(
		| { kind: 'start'; dstate: number; closure: { order: number[]; events: PlainClosureEvents } }
		| { kind: 'move'; from: number; symbol: PlainSymbol; targets: number[]; via: number[] }
		| {
				kind: 'closure';
				from: number;
				symbol: PlainSymbol;
				order: number[];
				events: PlainClosureEvents;
		  }
		| {
				kind: 'target';
				from: number;
				symbol: PlainSymbol;
				to: number | null;
				isNew: boolean;
				transition: number | null;
		  }
		| { kind: 'done' }
	);

export interface PlainSubsetResult {
	dfa: PlainAutomaton;
	steps: PlainSubsetStep[];
	classes: PlainCharSet[];
	empty: number | null;
}

export function subsetResultToPlain(r: SubsetResult): PlainSubsetResult {
	const symbol = (c: CharSet): PlainSymbol => {
		const i = r.classes.indexOf(c);
		return i >= 0 ? i : charSetToPlain(c);
	};
	const steps = r.steps.map((s): PlainSubsetStep => {
		switch (s.kind) {
			case 'start':
				return {
					...s,
					closure: { order: s.closure.order, events: closureEventsToPlain(s.closure.events) }
				};
			case 'move':
			case 'target':
				return { ...s, symbol: symbol(s.symbol) };
			case 'closure':
				return { ...s, symbol: symbol(s.symbol), events: closureEventsToPlain(s.events) };
			case 'done':
				return s;
		}
	});
	return {
		dfa: automatonToPlain(r.dfa),
		steps,
		classes: r.classes.map(charSetToPlain),
		empty: r.empty
	};
}

/**
 * The result `subsetResultToPlain` was given. As in `subsetConstruction`, each
 * step's symbol and each DFA label is one of the `classes` objects, so
 * `classes.indexOf(step.symbol)` finds its column.
 */
export function subsetResultFromPlain(p: PlainSubsetResult): SubsetResult {
	const intern = new CharSetInterner();
	const classes = p.classes.map((c) => intern.get(c));
	const symbol = (s: PlainSymbol): CharSet => (typeof s === 'number' ? classes[s] : intern.get(s));
	const steps = p.steps.map((s): SubsetTraceStep => {
		switch (s.kind) {
			case 'start':
				return {
					...s,
					closure: { order: s.closure.order, events: closureEventsFromPlain(s.closure.events) }
				};
			case 'move':
			case 'target':
				return { ...s, symbol: symbol(s.symbol) };
			case 'closure':
				return { ...s, symbol: symbol(s.symbol), events: closureEventsFromPlain(s.events) };
			case 'done':
				return s;
		}
	});
	return { dfa: automatonFromPlain(p.dfa, intern), steps, classes, empty: p.empty };
}
