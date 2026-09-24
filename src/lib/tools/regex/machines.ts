/**
 * Builds the automata behind the language views (Thompson NFA, subset DFA,
 * minimal DFA) with size limits, so a large expression such as
 * `(0|1)* 1 (0|1)^15` reports its size instead of freezing the page.
 */
import type { CharSet } from '$lib/theory/charset';
import {
	ClosureIndex,
	coReachableStates,
	minimize,
	restrictStates,
	subsetConstruction,
	symbolClasses,
	thompson,
	type Automaton,
	type StateId
} from '$lib/theory/automata';
import type { Regex } from '$lib/theory/regex';

/** Most Thompson NFA states built for one expression. */
export const MAX_NFA_STATES = 1500;
/** Most subset-construction DFA states built for one expression. */
export const MAX_DFA_STATES = 400;

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
				n = node.options.reduce((sum, o) => clamp(sum + go(o)), 2);
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
 * Number of states the subset construction reaches from `nfa`, stopping once
 * it exceeds `cap` (the result is then `cap + 1`).
 */
export function subsetStateCount(nfa: Automaton, cap = MAX_DFA_STATES): number {
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const seen = new Set<string>();
	const queue: StateId[][] = [];
	const add = (order: StateId[]) => {
		if (order.length === 0) return;
		const key = [...order].sort((a, b) => a - b).join(',');
		if (seen.has(key)) return;
		seen.add(key);
		queue.push(order);
	};
	add(index.closure([nfa.start]));
	for (let q = 0; q < queue.length; q++) {
		if (seen.size > cap) return cap + 1;
		for (const c of classes) {
			const moved = index.moveWhere(queue[q], (label) => label.overlaps(c));
			add(index.closure(moved.targets));
		}
	}
	return Math.min(seen.size, cap + 1);
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
			/** Which machine would be too large. */
			stage: 'nfa' | 'dfa';
			limit: number;
	  };

/** Thompson NFA, subset DFA and minimal DFA for `r`, unless one would exceed its limit. */
export function buildLanguage(
	r: Regex,
	opts: { alphabet?: CharSet; maxNfa?: number; maxDfa?: number } = {}
): LanguageBuild {
	const maxNfa = opts.maxNfa ?? MAX_NFA_STATES;
	const maxDfa = opts.maxDfa ?? MAX_DFA_STATES;
	if (thompsonStateCount(r, maxNfa) > maxNfa) return { ok: false, stage: 'nfa', limit: maxNfa };
	const nfa = thompson(r, { alphabet: opts.alphabet }).nfa;
	if (subsetStateCount(nfa, maxDfa) > maxDfa) return { ok: false, stage: 'dfa', limit: maxDfa };
	const dfa = subsetConstruction(nfa).dfa;
	return { ok: true, nfa, dfa, min: minimize(dfa).dfa };
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
