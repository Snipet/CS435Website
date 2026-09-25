/**
 * Builds the automata behind the language views (Thompson NFA, subset DFA,
 * minimal DFA) with size and work limits, so a large expression such as
 * `(0|1)* 1 (0|1)^15` reports its size instead of freezing the page.
 */
import { partitionCharSets, type CharSet } from '$lib/theory/charset';
import {
	ClosureIndex,
	coReachableStates,
	minimize,
	outgoingIndex,
	restrictStates,
	subsetConstruction,
	symbolClasses,
	thompson,
	type Automaton,
	type StateId,
	type Transition
} from '$lib/theory/automata';
import type { Regex } from '$lib/theory/regex';

/** Most Thompson NFA states built for one expression. */
export const MAX_NFA_STATES = 1500;
/**
 * Most subset-construction DFA states built for one expression (the minimal
 * DFA of `(0|1)* 1 (0|1)^7` has 256; minimizing takes time quadratic in this).
 */
export const MAX_DFA_STATES = 300;
/**
 * Most pairs of states of two minimal DFAs for a comparison (the product
 * construction lists its examples in time quadratic in this).
 */
export const MAX_PRODUCT = 2000;

/**
 * Number of states Thompson's construction (lecture variant, ARCHITECTURE §3.9)
 * creates for `r`, capped at `cap + 1` so huge repetitions stay cheap to count.
 */
export function thompsonStateCount(r: Regex, cap = MAX_NFA_STATES): number {
	const memo = new Map<Regex, number>();
	const limit = cap + 1;
	const clamp = (n: number) => Math.min(limit, n);
	const go = (node: Regex): number => {
		const known = memo.get(node);
		if (known !== undefined) return known;
		let n: number;
		switch (node.kind) {
			case 'empty':
			case 'epsilon':
			case 'chars':
			case 'any':
				n = 2;
				break;
			case 'concat':
				n = node.parts.reduce((sum, p) => clamp(sum + go(p)), 0);
				break;
			case 'alt':
				// The options are folded two at a time, (A | B) | C, and each fold adds a new start and final.
				n = node.options.reduce((sum, o) => clamp(sum + go(o)), 2 * (node.options.length - 1));
				break;
			case 'star':
				n = go(node.body) + 2;
				break;
			case 'plus':
				n = 2 * go(node.body) + 2;
				break;
			case 'optional':
				n = go(node.body) + 4;
				break;
			case 'repeat': {
				const b = go(node.body);
				const copies = node.min * b;
				const extra = node.max === null ? b + 2 : (node.max - node.min) * (b + 4);
				n = Math.max(2, copies + extra);
				break;
			}
			case 'ref':
				n = go(node.body);
				break;
		}
		n = clamp(n);
		memo.set(node, n);
		return n;
	};
	return go(r);
}

/**
 * Most work for the subset construction of one expression: NFA states scanned
 * by move plus NFA states in the closures, summed over every DFA state and
 * symbol class. Large state sets (e.g. `digit^{1,30}` with ten-option digits)
 * make each step slow even when the DFA itself is small.
 */
export const MAX_SUBSET_WORK = 40_000;

export type SubsetSize =
	{ ok: true; states: number; work: number } | { ok: false; reason: 'states' | 'work' };

/**
 * Size of the subset construction of `nfa` (the same state sets as
 * `subsetConstruction`), stopping once it would have more than `maxStates`
 * DFA states or take more than `maxWork` steps.
 */
export function subsetSize(
	nfa: Automaton,
	opts: { maxStates?: number; maxWork?: number } = {}
): SubsetSize {
	const maxStates = opts.maxStates ?? MAX_DFA_STATES;
	const maxWork = opts.maxWork ?? MAX_SUBSET_WORK;
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const seen = new Set<string>();
	const queue: StateId[][] = [];
	let work = 0;
	const add = (order: StateId[]) => {
		work += order.length;
		if (order.length === 0) return;
		const key = [...order].sort((a, b) => a - b).join(',');
		if (seen.has(key)) return;
		seen.add(key);
		queue.push(order);
	};
	add(index.closure([nfa.start]));
	for (let q = 0; q < queue.length; q++) {
		for (const c of classes) {
			if (seen.size > maxStates) return { ok: false, reason: 'states' };
			if (work > maxWork) return { ok: false, reason: 'work' };
			work += queue[q].length;
			const moved = index.moveWhere(queue[q], (label) => label.overlaps(c));
			add(index.closure(moved.targets));
		}
	}
	if (seen.size > maxStates) return { ok: false, reason: 'states' };
	if (work > maxWork) return { ok: false, reason: 'work' };
	return { ok: true, states: seen.size, work };
}

export type LanguageBuild =
	| {
			ok: true;
			nfa: Automaton;
			/** Subset construction of `nfa` (partial: missing transitions lead to the trap). */
			dfa: Automaton;
			/** Minimal DFA (missing transitions lead to the trap; a dead state is flagged `trap`). */
			min: Automaton;
	  }
	| {
			ok: false;
			/**
			 * What would be too large: the Thompson NFA or the subset DFA (more
			 * than `limit` states), or the work of the subset construction.
			 */
			stage: 'nfa' | 'dfa' | 'work';
			limit: number;
	  };

/** Thompson NFA, subset DFA and minimal DFA for `r`, unless one would exceed its limit. */
export function buildLanguage(
	r: Regex,
	opts: { alphabet?: CharSet; maxNfa?: number; maxDfa?: number; maxWork?: number } = {}
): LanguageBuild {
	const maxNfa = opts.maxNfa ?? MAX_NFA_STATES;
	const maxDfa = opts.maxDfa ?? MAX_DFA_STATES;
	const maxWork = opts.maxWork ?? MAX_SUBSET_WORK;
	if (thompsonStateCount(r, maxNfa) > maxNfa) return { ok: false, stage: 'nfa', limit: maxNfa };
	const nfa = thompson(r, { alphabet: opts.alphabet }).nfa;
	const size = subsetSize(nfa, { maxStates: maxDfa, maxWork });
	if (!size.ok)
		return size.reason === 'states'
			? { ok: false, stage: 'dfa', limit: maxDfa }
			: { ok: false, stage: 'work', limit: maxWork };
	const dfa = subsetConstruction(nfa).dfa;
	return { ok: true, nfa, dfa, min: minimize(dfa).dfa };
}

/**
 * Number of pairs of states of the DFAs `a` and `b` (partial or total) that the
 * product construction reaches, as `compareLanguages` builds it: a missing
 * transition leads to a dead state on that side, and a pair dead on both sides
 * is not a state. Stops once it exceeds `cap` (the result is then `cap + 1`).
 */
export function productSize(a: Automaton, b: Automaton, cap = MAX_PRODUCT): number {
	const [outA, outB] = [outgoingIndex(a), outgoingIndex(b)];
	const labels = [...a.transitions, ...b.transitions].flatMap((t) =>
		t.label && !t.label.isEmpty ? [t.label] : []
	);
	const classes = partitionCharSets(labels).map((c) => c.first()!);
	const step = (out: Transition[][], s: number, cp: number) => {
		if (s < 0) return -1;
		for (const t of out[s]) if (t.label?.has(cp)) return t.to;
		return -1;
	};
	const seen = new Set([`${a.start},${b.start}`]);
	const queue: [number, number][] = [[a.start, b.start]];
	for (let i = 0; i < queue.length && seen.size <= cap; i++) {
		const [x, y] = queue[i];
		for (const cp of classes) {
			const [x2, y2] = [step(outA, x, cp), step(outB, y, cp)];
			if (x2 < 0 && y2 < 0) continue;
			const key = `${x2},${y2}`;
			if (seen.has(key)) continue;
			seen.add(key);
			queue.push([x2, y2]);
		}
	}
	return Math.min(seen.size, cap + 1);
}

/**
 * The machine without its trap state, as the lectures draw DFAs: a missing
 * transition leads to the trap (Lexical Analysis III, slide 6). A trap that is
 * the start state (L = { }) is kept.
 */
export function withoutTrap(dfa: Automaton): Automaton {
	const live = coReachableStates(dfa);
	const keep = new Set(dfa.states.filter((s) => live.has(s.id)).map((s) => s.id));
	keep.add(dfa.start);
	if (keep.size === dfa.states.length) return dfa;
	return restrictStates(dfa, keep).automaton;
}
