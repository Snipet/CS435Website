import type { StateId } from '$lib/theory/automata/types';

/** Outcome fills for states (e.g. the final state of a run). */
export type StateTone = 'accept' | 'reject' | 'info';

export interface AutomatonHighlight {
	/** Current states: filled --active-soft and stroked --active. */
	active?: Iterable<StateId>;
	/** Transition ids just taken: their edges are drawn in --active, thicker. */
	taken?: Iterable<number>;
	/** States drawn faded (their edges fade too). */
	dim?: Iterable<StateId>;
	/** Transition ids drawn faded. */
	dimTransitions?: Iterable<number>;
	/** Outcome fill per state; wins over `active`. */
	tone?: ReadonlyMap<StateId, StateTone> | Readonly<Record<number, StateTone>>;
}

/** A soft outline behind a set of states: a Thompson fragment, a partition block, … */
export interface AutomatonGroup {
	id: string;
	label?: string;
	states: Iterable<StateId>;
	/** Palette index 0–5 (wraps). Defaults to the group's position in the list. */
	tone?: number;
}

export type GraphSelection = { kind: 'state'; id: StateId } | { kind: 'edge'; key: string } | null;

export const GROUP_TONES = 6;
