/**
 * Where a conflict arises, as Bottom-up Parsing III, slides 18, 20, 21 and 25
 * show it: the stack when the parser reaches the conflict's state (`E * E`
 * with `+` next), part of the state before the last symbol and part of the
 * conflict's state joined by ⇒ with that symbol as a superscript, and the two
 * moves the parser could make (`E * E I + … ⇒ E * E + I …` or `⇒ E I + …`).
 */
import { productionText, type ItemView } from '$lib/components/grammar/lr-item';
import type { Augmented, LrAutomaton, LrItem } from '$lib/theory/grammar/lr';
import type { LrAction, LrConflict } from '$lib/theory/grammar/lr-table';

/** An engine item as the decks write it ([E → E * • E, +]). */
export function itemView(aug: Augmented, item: LrItem): ItemView {
	const p = aug.productions[item.production];
	return {
		lhs: p.lhs,
		rhs: [...p.rhs],
		dot: item.dot,
		lookaheads: item.lookahead === null ? [] : [item.lookahead]
	};
}

/**
 * For every state, a shortest way to it from state 0: the symbols read and
 * the states passed (breadth first, edges in the order they were made, so
 * the path is the one the construction found first).
 */
export function shortestPaths(a: LrAutomaton): { symbols: string[]; states: number[] }[] {
	const parent: ({ from: number; symbol: string } | null)[] = a.states.map(() => null);
	const seen = new Set<number>([0]);
	const queue = [0];
	for (let q = 0; q < queue.length; q++) {
		const s = queue[q];
		for (const t of a.states[s].transitions) {
			if (seen.has(t.to)) continue;
			seen.add(t.to);
			parent[t.to] = { from: s, symbol: t.symbol };
			queue.push(t.to);
		}
	}
	return a.states.map((state) => {
		const symbols: string[] = [];
		const states = [state.id];
		for (let at = state.id; parent[at]; at = parent[at]!.from) {
			symbols.push(parent[at]!.symbol);
			states.push(parent[at]!.from);
		}
		return { symbols: symbols.reverse(), states: states.reverse() };
	});
}

/** One row of the partial view: an item of the state before and the conflict item it moves to. */
export interface TransitionRow {
	/** null: the conflict item was added by Closure, no item moved to it. */
	left: ItemView | null;
	right: ItemView;
}

export interface ConflictContext {
	/** The symbols on the stack when the parser is in the conflict's state (a shortest way there). */
	stack: string[];
	/** The states passed, from 0 to the conflict's state. */
	states: number[];
	/** The state before the last symbol and that symbol; null for a conflict in state 0. */
	from: { state: number; symbol: string } | null;
	/** Slides 18–21: the two conflict items, each with the item it moved from. */
	rows: TransitionRow[];
	/** Slide 25: the whole states. */
	fromItems: ItemView[];
	toItems: ItemView[];
	/** Indices of the conflict items in toItems, and of the items they moved from in fromItems. */
	toMarked: number[];
	fromMarked: number[];
}

const sameItem = (x: LrItem, y: LrItem) =>
	x.production === y.production && x.dot === y.dot && x.lookahead === y.lookahead;

/** The stack, the states and the ⇒ view of a conflict. */
export function conflictContext(
	a: LrAutomaton,
	conflict: LrConflict,
	path: { symbols: string[]; states: number[] }
): ConflictContext {
	const aug = a.augmented;
	const state = a.states[conflict.state];
	const fromState = path.states.length > 1 ? a.states[path.states[path.states.length - 2]] : null;
	const symbol = path.symbols[path.symbols.length - 1] ?? null;
	const toMarked = conflict.items.map((item) => state.items.findIndex((i) => sameItem(i, item)));
	const sources = conflict.items.map((item) => {
		if (!fromState || item.dot === 0) return -1;
		const source = { ...item, dot: item.dot - 1 };
		if (aug.productions[item.production].rhs[source.dot] !== symbol) return -1;
		return fromState.items.findIndex((i) => sameItem(i, source));
	});
	// Rows in the order of the items they move from (the kernel first, as on slides 18 and 21);
	// items added by Closure last, in the state's order.
	const order = conflict.items
		.map((item, k) => ({ item, k }))
		.sort((x, y) => {
			const sx = sources[x.k] < 0 ? Infinity : sources[x.k];
			const sy = sources[y.k] < 0 ? Infinity : sources[y.k];
			return sx - sy || toMarked[x.k] - toMarked[y.k];
		});
	return {
		stack: [...path.symbols],
		states: [...path.states],
		from: fromState && symbol !== null ? { state: fromState.id, symbol } : null,
		rows: order.map(({ item, k }) => ({
			left: sources[k] < 0 ? null : itemView(aug, fromState!.items[sources[k]]),
			right: itemView(aug, item)
		})),
		fromItems: fromState ? fromState.items.map((i) => itemView(aug, i)) : [],
		toItems: state.items.map((i) => itemView(aug, i)),
		toMarked: toMarked.filter((i) => i >= 0),
		fromMarked: sources.filter((i) => i >= 0)
	};
}

/** One of the two moves of a conflict, and the configuration it leads to. */
export interface Move {
	kind: LrAction['kind'];
	/** reduce: the production. */
	production: number | null;
	/** `shift`, `red. E → E * E`, `accept`, `error` (the words of a shift-reduce trace, §3.10). */
	text: string;
	/** The stack after the move. */
	stack: string[];
	/** The terminal still next after the move; null once it is shifted. */
	next: string | null;
}

/**
 * The configuration after an action on the conflict's stack: a shift moves the
 * terminal onto the stack; a reduce X → α replaces the α on top with X.
 */
export function moveOf(
	aug: Augmented,
	stack: readonly string[],
	terminal: string,
	action: LrAction
): Move {
	switch (action.kind) {
		case 'shift':
			return {
				kind: 'shift',
				production: null,
				text: 'shift',
				stack: [...stack, terminal],
				next: null
			};
		case 'reduce': {
			const p = aug.productions[action.production];
			return {
				kind: 'reduce',
				production: p.id,
				text: `red. ${productionText(p.lhs, p.rhs, 'hug')}`,
				stack: [...stack.slice(0, stack.length - p.rhs.length), p.lhs],
				next: terminal
			};
		}
		default:
			return {
				kind: action.kind,
				production: null,
				text: action.kind,
				stack: [...stack],
				next: terminal
			};
	}
}
