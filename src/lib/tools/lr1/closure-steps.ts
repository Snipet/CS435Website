/**
 * Closure and Transition (Bottom-up Parsing III, slides 10 and 13) as a
 * sequence of frames for a stepper: each frame says which line of the
 * pseudocode runs, which item [X → α•Yβ, a] is being extended, with which
 * production Y → γ and First(βa), and which item [Y → •γ, b] is added. The
 * engine's `lrClosure` / `lrTransition` give the additions; this file only
 * spreads them over the lines of the pseudocode.
 */
import { formatItem, joinSymbols, symbolText } from '$lib/components/grammar/lr-item';
import {
	lrClosure,
	lrTransition,
	printProduction,
	type Augmented,
	type LrAutomaton,
	type LrClosureOptions,
	type LrItem
} from '$lib/theory/grammar/lr';
import { printSet } from '$lib/theory/grammar/parse';
import { END_MARKER } from '$lib/theory/grammar/types';
import { itemView, readItems, type ItemsReading } from './items';

/** Bottom-up Parsing III, slide 10, line by line. */
export const CLOSURE_CODE: readonly string[] = [
	'Closure(Items) =',
	'  repeat',
	'    for each [X → α•Yβ, a] in Items',
	'      for each production Y → γ',
	'        for each b ∈ First(βa)',
	'          add [Y → •γ, b] to Items',
	'  until Items is unchanged'
];

/** Bottom-up Parsing III, slide 13, line by line. */
export const TRANSITION_CODE: readonly string[] = [
	'Transition (state, y)',
	'  Items ← ∅',
	'  for each [X → α•yβ, b] ∈ state',
	'    add [X → αy•β, b] to Items',
	'  return Closure(Items)'
];

/** Which pseudocode a frame is in and the line that runs (0-based). */
export type ClosureLine = { code: 'closure' | 'transition'; line: number };

export interface ClosureFrame {
	/** The line that runs. While Closure runs inside Transition, `outer` is Transition's line 4. */
	at: ClosureLine;
	outer: ClosureLine | null;
	/**
	 * How many items Items holds: the first `size` of the run's `items` (Closure
	 * keeps the seed first and appends what it adds; Transition's Items are the
	 * moved items, which are Closure's seed).
	 */
	size: number;
	/** Index in `items` of the item [X → α•Yβ, a] being extended; null outside the loop. */
	current: number | null;
	/** The production Y → γ being taken. */
	production: number | null;
	/** First(βa), when it has been worked out for this frame. */
	first: string[] | null;
	/** The item [Y → •γ, b] (or [X → αy•β, b]) of this frame, and whether it was new. */
	add: { item: LrItem; index: number; added: boolean } | null;
	/** Transition: the index in the state of the item [X → α•yβ, b] being moved. */
	moved: number | null;
}

export interface ClosureRun {
	kind: 'closure' | 'transition';
	/** Closure: the items closed. Transition: the state's items. */
	seed: LrItem[];
	/** Transition: the state and the symbol y. */
	state: number | null;
	symbol: string | null;
	frames: ClosureFrame[];
	/** The closed set of items. */
	items: LrItem[];
	/** Additions that found the item already in Items. */
	repeats: number;
}

const frame = (f: Partial<ClosureFrame> & Pick<ClosureFrame, 'at' | 'size'>): ClosureFrame => ({
	outer: null,
	current: null,
	production: null,
	first: null,
	add: null,
	moved: null,
	...f
});

/**
 * The frames of Closure over `seedItems`, starting from Items = seed. Items
 * that already hold their whole closure (no item with • before a
 * non-terminal) give just the first and last frames.
 */
function closureFrames(
	aug: Augmented,
	seedItems: readonly LrItem[],
	opts: LrClosureOptions | undefined,
	outer: ClosureLine | null
): { frames: ClosureFrame[]; items: LrItem[]; repeats: number } {
	const { items, steps } = lrClosure(aug, seedItems, opts);
	const frames: ClosureFrame[] = [];
	const at = (line: number): ClosureLine => ({ code: 'closure', line });
	// Items grow one addition at a time, at the end of the list.
	let size = items.length - steps.filter((s) => s.added).length;
	frames.push(frame({ at: at(0), outer, size }));
	let lastFrom = -1;
	let lastProduction = -1;
	let repeats = 0;
	for (const step of steps) {
		if (step.from !== lastFrom) {
			lastFrom = step.from;
			lastProduction = -1;
			frames.push(frame({ at: at(2), outer, size, current: step.from }));
		}
		if (step.production !== lastProduction) {
			lastProduction = step.production;
			frames.push(
				frame({ at: at(3), outer, size, current: step.from, production: step.production })
			);
			frames.push(
				frame({
					at: at(4),
					outer,
					size,
					current: step.from,
					production: step.production,
					first: step.first
				})
			);
		}
		if (step.added) size = step.index + 1;
		else repeats++;
		frames.push(
			frame({
				at: at(5),
				outer,
				size,
				current: step.from,
				production: step.production,
				first: step.first,
				add: { item: step.item, index: step.index, added: step.added }
			})
		);
	}
	frames.push(frame({ at: at(6), outer, size: items.length }));
	return { frames, items, repeats };
}

/** Closure(Items) step by step (Bottom-up Parsing III, slide 10). */
export function closureRun(
	aug: Augmented,
	seed: readonly LrItem[],
	opts?: LrClosureOptions
): ClosureRun {
	const { frames, items, repeats } = closureFrames(aug, seed, opts, null);
	return { kind: 'closure', seed: [...seed], state: null, symbol: null, frames, items, repeats };
}

/**
 * Transition(state, y) step by step (Bottom-up Parsing III, slide 13):
 * Items ← ∅, one frame per item moved over y, then Closure(Items) with its
 * own frames (Transition's `return Closure(Items)` stays marked as `outer`).
 */
export function transitionRun(
	aug: Augmented,
	state: readonly LrItem[],
	y: string,
	opts?: LrClosureOptions & { state?: number }
): ClosureRun {
	const { moved, items } = lrTransition(aug, state, y, opts);
	const at = (line: number): ClosureLine => ({ code: 'transition', line });
	const frames: ClosureFrame[] = [frame({ at: at(0), size: 0 }), frame({ at: at(1), size: 0 })];
	moved.forEach((m, k) => {
		frames.push(
			frame({
				at: at(3),
				size: k + 1,
				moved: m.from,
				add: { item: m.item, index: k, added: true }
			})
		);
	});
	const inner = closureFrames(
		aug,
		moved.map((m) => m.item),
		opts,
		at(4)
	);
	frames.push(...inner.frames);
	return {
		kind: 'transition',
		seed: [...state],
		state: opts?.state ?? null,
		symbol: y,
		frames,
		items,
		repeats: inner.repeats
	};
}

/** [S → •E, $]: the item Closure starts the parsing DFA from (slides 7 and 11). */
export function startItem(aug: Augmented): LrItem {
	return { production: aug.production.id, dot: 0, lookahead: END_MARKER };
}

// ───────────────────────────── what the stepper runs ─────────────────────────────

export type ClosureSetup =
	| {
			kind: 'closure';
			aug: Augmented;
			/** The items typed (or [S → •E, $] when none are). */
			read: ItemsReading;
			/** The seed is the start item [S → •E, $]. */
			start: boolean;
			run: ClosureRun | null;
	  }
	| {
			kind: 'transition';
			aug: Augmented;
			/** The number of states, and the state the transition leaves. */
			states: number;
			from: number;
			/** The state's transitions, in the order the construction made them. */
			symbols: { symbol: string; to: number }[];
			symbol: string | null;
			/** The state Transition(from, y) is. */
			to: number | null;
			run: ClosureRun | null;
	  };

/**
 * What the Closure stepper runs: Closure of the items typed (of [S → •E, $]
 * when the text is blank), or Transition(state, y) on a state of the LR(1)
 * automaton (y defaults to the state's first transition).
 */
export function closureSetup(opts: {
	mode: 'closure' | 'transition';
	aug: Augmented | null;
	seed: string;
	lr1: LrAutomaton | null;
	from: number;
	symbol: string;
	closureOrder?: readonly number[];
}): ClosureSetup | null {
	const options = { closureOrder: opts.closureOrder };
	if (opts.mode === 'closure') {
		const aug = opts.aug;
		if (!aug) return null;
		const start = opts.seed.trim() === '';
		const read = start ? { items: [startItem(aug)], diagnostics: [] } : readItems(opts.seed, aug);
		const ok = read.items.length > 0 && !read.diagnostics.some((d) => d.severity === 'error');
		return {
			kind: 'closure',
			aug,
			read,
			start,
			run: ok ? closureRun(aug, read.items, options) : null
		};
	}
	const a = opts.lr1;
	if (!a || a.states.length === 0) return null;
	const from = Math.max(0, Math.min(a.states.length - 1, Math.trunc(opts.from)));
	const state = a.states[from];
	const symbols = state.transitions.map((t) => ({ symbol: t.symbol, to: t.to }));
	const chosen = symbols.find((t) => t.symbol === opts.symbol) ?? symbols[0] ?? null;
	return {
		kind: 'transition',
		aug: a.augmented,
		states: a.states.length,
		from,
		symbols,
		symbol: chosen?.symbol ?? null,
		to: chosen?.to ?? null,
		run: chosen
			? transitionRun(a.augmented, state.items, chosen.symbol, { ...options, state: from })
			: null
	};
}

// ───────────────────────────── words ─────────────────────────────

/** An item as the definitions write it: [E → E + ( • E ), +]. */
export const bracketedItem = (aug: Augmented, item: LrItem) =>
	formatItem(itemView(aug, item), 'bracketed');

/** β and a of an item [X → α•Yβ, a]: the symbols after Y, and the lookahead. */
export function betaA(aug: Augmented, item: LrItem): { beta: string[]; a: string | null } {
	return { beta: aug.productions[item.production].rhs.slice(item.dot + 1), a: item.lookahead };
}

const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/** What a frame does, in words. */
export function describeFrame(aug: Augmented, run: ClosureRun, f: ClosureFrame): string {
	const y = symbolText(run.symbol ?? '');
	if (f.at.code === 'transition') {
		if (f.at.line === 0)
			return `Transition(${run.state ?? 'state'}, ${y}): the items of the state with • before ${y} move the dot over it.`;
		if (f.at.line === 1) return 'Items ← ∅';
		return `${bracketedItem(aug, run.seed[f.moved!])} is in the state: add ${bracketedItem(aug, f.add!.item)} to Items.`;
	}
	switch (f.at.line) {
		case 0:
			return f.outer
				? `return Closure(Items): close the ${items(f.size)} moved over ${y}.`
				: `Closure starts from ${items(f.size)}.`;
		case 2: {
			const item = run.items[f.current!];
			const next = aug.productions[item.production].rhs[item.dot];
			return `${bracketedItem(aug, item)} has • before the non-terminal ${symbolText(next)}.`;
		}
		case 3:
			return `A production of ${symbolText(aug.productions[f.production!].lhs)}: ${printProduction(aug.productions[f.production!])}.`;
		case 4: {
			const { beta, a } = betaA(aug, run.items[f.current!]);
			return `βa = ${joinSymbols([...beta, ...(a === null ? [] : [a])])}, so First(βa) = ${printSet(f.first ?? [])}.`;
		}
		case 5:
			return f.add!.added
				? `Add ${bracketedItem(aug, f.add!.item)} to Items.`
				: `${bracketedItem(aug, f.add!.item)} is already in Items.`;
		default: {
			const repeats =
				run.repeats > 0
					? ` ${run.repeats} ${run.repeats === 1 ? 'addition' : 'additions'} found the item already there.`
					: '';
			return `Items is unchanged: another pass adds nothing. The closure has ${items(run.items.length)}.${repeats}`;
		}
	}
}
