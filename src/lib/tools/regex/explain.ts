/**
 * Why a string is not in L(R): walk the minimal DFA as far as the input stays
 * a prefix of some string in L(R), then report where it goes wrong.
 */
import { CharSet } from '$lib/theory/charset';
import { coReachableStates, outgoingIndex, type Automaton } from '$lib/theory/automata';

export type Rejection =
	/** L(R) = { }: no string is in the language. */
	| { kind: 'empty-language' }
	/**
	 * input[0, prefixEnd) is a prefix of some string in L(R), but the symbol at
	 * `at` cannot follow it. `allowed` lists the symbols that can.
	 */
	| {
			kind: 'fails';
			prefixEnd: number;
			at: { start: number; end: number; char: string };
			allowed: CharSet;
	  }
	/**
	 * The whole input is a proper prefix of strings in L(R); `completion` is a
	 * shortest string that finishes it (input + completion ∈ L(R)).
	 */
	| { kind: 'incomplete'; completion: string; allowed: CharSet };

/**
 * Explains why `input` is rejected by the DFA `dfa` (partial or total). Call it
 * only for strings the DFA does not accept.
 */
export function explainRejection(dfa: Automaton, input: string): Rejection {
	const live = coReachableStates(dfa);
	if (!live.has(dfa.start)) return { kind: 'empty-language' };
	const out = outgoingIndex(dfa);
	const next = (s: number, cp: number): number | null => {
		for (const t of out[s]) if (t.label?.has(cp)) return t.to;
		return null;
	};
	const allowedFrom = (s: number) =>
		CharSet.fromRanges(
			out[s].filter((t) => t.label && live.has(t.to)).flatMap((t) => t.label!.ranges)
		);

	let state = dfa.start;
	for (let i = 0; i < input.length;) {
		const cp = input.codePointAt(i)!;
		const char = String.fromCodePoint(cp);
		const to = next(state, cp);
		if (to === null || !live.has(to))
			return {
				kind: 'fails',
				prefixEnd: i,
				at: { start: i, end: i + char.length, char },
				allowed: allowedFrom(state)
			};
		state = to;
		i += char.length;
	}
	return {
		kind: 'incomplete',
		completion: shortestCompletion(dfa, state),
		allowed: allowedFrom(state)
	};
}

/** The shortlex-first shortest string leading from `from` to an accepting state. */
export function shortestCompletion(dfa: Automaton, from: number): string {
	if (dfa.states[from].accepting) return '';
	const out = outgoingIndex(dfa);
	const prev = new Map<number, { from: number; char: string }>();
	const seen = new Set([from]);
	const queue = [from];
	for (let q = 0; q < queue.length; q++) {
		const s = queue[q];
		const edges = out[s]
			.filter((t) => t.label && !t.label.isEmpty)
			.sort((a, b) => a.label!.first()! - b.label!.first()!);
		for (const t of edges) {
			if (seen.has(t.to)) continue;
			seen.add(t.to);
			prev.set(t.to, { from: s, char: t.label!.firstChar()! });
			if (dfa.states[t.to].accepting) {
				let w = '';
				for (let x = t.to; x !== from; x = prev.get(x)!.from) w = prev.get(x)!.char + w;
				return w;
			}
			queue.push(t.to);
		}
	}
	return '';
}
