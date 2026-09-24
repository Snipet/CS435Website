/**
 * Finite-automaton model shared by every tool.
 *
 * One representation covers DFAs, partial DFAs (missing transitions mean the
 * trap state, Lexical Analysis III slide 6) and NFAs (ε-moves and several
 * transitions on one symbol). Whether a machine is deterministic is a derived
 * property, never a separate type.
 *
 * Formal notation on the slides:
 *   DFA M = (Σ, S, s0, F, T) with T: S × Σ → S          (Lexical Analysis III, slide 3)
 *   NFA   Δ : Q × (Σ ∪ { ε }) → P(Q)                     (Lexical Analysis III, slide 12)
 */
import type { CharSet } from '../charset';

export type StateId = number;

/** Token information attached to accepting states of scanner automata. */
export interface AcceptInfo {
	/** Rule index in priority order (0 = listed first); lower wins ties (min(j, k)). */
	rule: number;
	/** Token name reported for this state, e.g. `Identifier` or `LE`. */
	token: string;
}

export interface State {
	/** Always equal to the state's index in `Automaton.states`. */
	id: StateId;
	/** Display name: 'A', 'ABCDHI', 'S', '4', … May be '' for unlabeled lecture-style states. */
	name: string;
	accepting: boolean;
	/** For scanner automata: the token this accepting state reports. */
	accept?: AcceptInfo;
	/** Subset construction: NFA states contained, in naming (discovery) order. */
	subset?: StateId[];
	/**
	 * Minimization: ids of the states of the DFA given to `minimize` that were
	 * merged into this state, ascending. A trap added during minimization is not
	 * listed (the state is flagged `trap` instead).
	 */
	merged?: StateId[];
	/** Hand-coded scanners: push back one character on reaching this state (drawn with *). */
	retract?: boolean;
	/** Short annotation drawn near the state, e.g. 'return LE'. */
	note?: string;
	/** True for an explicit trap (dead) state added to make a DFA total. */
	trap?: boolean;
}

export interface Transition {
	/** Unique id; also the creation order, which some algorithms rely on. */
	id: number;
	from: StateId;
	to: StateId;
	/** Input symbols that take this transition, or null for an ε-move. */
	label: CharSet | null;
	/** Display override for the label, e.g. 'other' or 'digit'. */
	display?: string;
}

export interface Automaton {
	/** `states[i].id === i` */
	states: State[];
	/** In creation order. */
	transitions: Transition[];
	start: StateId;
	/**
	 * Declared input alphabet Σ. When absent, Σ is the union of all transition
	 * labels (see `alphabetOf`).
	 */
	alphabet?: CharSet;
}

/** 2-D position in layout units (SVG user space). */
export interface Point {
	x: number;
	y: number;
}

/** Optional pinned positions keyed by state id. */
export type Positions = Map<StateId, Point>;
