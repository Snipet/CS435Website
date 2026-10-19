/**
 * The parsing DFA as the tool draws it: which states are drawn (all of them,
 * or a window of a large automaton), the labels beside each state (Bottom-up
 * Parsing III, slide 12: "reduce with X → α on b", and "accept on $"), the
 * sizes the item-set layout starts from before the page measures the boxes,
 * and the circle drawing of Bottom-up Parsing II, slide 17 as an `Automaton`
 * for `AutomatonView`.
 */
import {
	annotationText,
	formatItem,
	stateAnnotations,
	symbolText,
	type ItemView,
	type StateAnnotation
} from '$lib/components/grammar/lr-item';
import { CharSet } from '$lib/theory/charset';
import type { Automaton, State, Transition } from '$lib/theory/automata/types';
import { followSets } from '$lib/theory/grammar/analyze';
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import { END_MARKER } from '$lib/theory/grammar/types';
import type { Method } from './build';
import { itemLines, itemView, type ItemForm } from './items';

/** Automata up to this many states are drawn whole; larger ones a window at a time. */
export const DRAW_ALL = 30;
/** States in a window of a larger automaton. */
export const WINDOW = 16;

/** The states drawn and tabled: [first, last], both included. */
export type StateRange = readonly [number, number];

/**
 * The range shown: the whole automaton when it is small, else the window the
 * state asks for (clamped), or the first window.
 */
export function shownRange(states: number, range: StateRange | null): StateRange {
	if (states <= 0) return [0, -1];
	if (states <= DRAW_ALL && range === null) return [0, states - 1];
	if (range === null) return [0, Math.min(states, WINDOW) - 1];
	const first = Math.max(0, Math.min(states - 1, Math.trunc(range[0])));
	const last = Math.max(first, Math.min(states - 1, Math.trunc(range[1])));
	return [first, last];
}

/** The window of `size` states that holds `state`, aligned to multiples of `size`. */
export function windowAround(state: number, states: number, size = WINDOW): StateRange {
	const first = Math.floor(state / size) * size;
	return [first, Math.min(states, first + size) - 1];
}

export const inRange = (range: StateRange, state: number) => state >= range[0] && state <= range[1];

/**
 * The labels beside each state. LR(1) and LALR(1) states reduce on the
 * lookaheads of their items, an LR(0) state on every token (no "on"), and an
 * SLR(1) state on Follow(X) of the left side X. The augmented start item reads
 * "accept on $" ("accept" for LR(0)).
 */
export function stateNotes(a: LrAutomaton, method: Method): StateAnnotation[][] {
	const aug = a.augmented;
	if (method !== 'slr1')
		return a.states.map((s) =>
			stateAnnotations(
				s.items.map((item) => itemView(aug, item)),
				{ start: aug.start }
			)
		);
	const follow = followSets(aug.grammar);
	const rank = new Map(aug.grammar.terminals.map((t, i) => [t, i]));
	const ordered = (set: ReadonlySet<string>) =>
		[...set].sort((x, y) =>
			x === END_MARKER ? -1 : y === END_MARKER ? 1 : (rank.get(x) ?? 0) - (rank.get(y) ?? 0)
		);
	return a.states.map((s) =>
		s.reduces
			.map((r): StateAnnotation => ({
				kind: 'reduce',
				lhs: aug.productions[r.production].lhs,
				rhs: aug.productions[r.production].rhs,
				lookaheads: ordered(follow.get(aug.productions[r.production].lhs) ?? new Set())
			}))
			.concat(s.accept ? [{ kind: 'accept', lookaheads: [END_MARKER] }] : [])
	);
}

/** Estimated width in px of `chars` characters of the monospace font at `size` px. */
export const monoWidth = (chars: number, size = 14) => Math.ceil(chars * size * 0.6);

const LINE = 22.4;

/**
 * The size of a state box before the page measures it: the item box (one
 * line per item, LrState's padding and border) with the number box beside
 * it, and the labels beside that.
 */
export function estimateBox(
	lines: readonly ItemView[],
	notes: readonly string[]
): { width: number; height: number; note: { width: number; height: number } | null } {
	const longest = Math.max(1, ...lines.map((v) => [...formatItem(v, 'compact')].length));
	const items = monoWidth(longest) + 2 * 10 + 3 + 3;
	const height = Math.max(31, lines.length * LINE + 12 + 3);
	const noteWidth = Math.max(0, ...notes.map((t) => monoWidth([...t].length)));
	return {
		width: items + 8 + 31,
		height: Math.ceil(height),
		note: notes.length ? { width: noteWidth, height: Math.ceil(notes.length * 21) } : null
	};
}

/** The item views of a state's box: one line per item, or per core with merged lookaheads. */
export function boxLines(a: LrAutomaton, state: number, form: ItemForm): ItemView[] {
	return itemLines(a.augmented, a.states[state].items, form).map((l) => l.view);
}

/** One private-use code point per grammar symbol, so `AutomatonView` can tell edge labels apart. */
const SYMBOL_BASE = 0xe000;

export interface CircleDrawing {
	automaton: Automaton;
	/** Automaton state id → LR state number. */
	states: number[];
	/** Automaton transition id → index in `LrAutomaton.edges`. */
	edges: number[];
}

/**
 * The states in `range` as numbered circles (Bottom-up Parsing II, slide 17):
 * no double circles, the start arrow into state 0 when it is drawn, edges
 * labeled with their grammar symbol, and each state's labels as its note.
 * Edges to states outside the range are left out.
 */
export function circleDrawing(
	a: LrAutomaton,
	notes: readonly StateAnnotation[][],
	range: StateRange,
	made: { states: number; edges: number } = { states: a.states.length, edges: a.edges.length }
): CircleDrawing {
	const last = Math.min(range[1], made.states - 1);
	const ids: number[] = [];
	for (let s = range[0]; s <= last; s++) ids.push(s);
	const idOf = new Map(ids.map((s, k) => [s, k]));
	const symbols = [
		...a.augmented.grammar.terminals,
		END_MARKER,
		...a.augmented.grammar.nonterminals
	];
	const symbolIndex = new Map(symbols.map((s, i) => [s, i]));
	const states: State[] = ids.map((s, k) => {
		const text = notes[s]?.map(annotationText).join('; ') ?? '';
		return { id: k, name: String(s), accepting: false, ...(text ? { note: text } : {}) };
	});
	const transitions: Transition[] = [];
	const edges: number[] = [];
	a.edges.slice(0, made.edges).forEach((e, k) => {
		const from = idOf.get(e.from);
		const to = idOf.get(e.to);
		if (from === undefined || to === undefined) return;
		const code = SYMBOL_BASE + (symbolIndex.get(e.symbol) ?? symbols.length);
		transitions.push({
			id: transitions.length,
			from,
			to,
			label: CharSet.single(code),
			display: symbolText(e.symbol)
		});
		edges.push(k);
	});
	// No start arrow unless state 0 is drawn (an id that is no state draws none).
	const start = idOf.get(0) ?? -1;
	return { automaton: { states, transitions, start }, states: ids, edges };
}
