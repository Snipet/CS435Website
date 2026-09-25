/**
 * Language comparison with a size cap, for checks that run while the user
 * types. Both machines are determinized on the fly (sets of states after
 * ε-closure) and explored together breadth first, one symbol per class of
 * symbols (a printable one where the class has any, see `representative`)
 * in ascending order, so the first difference found is the shortest one (and
 * the first in shortlex order). A DFA for a small NFA can be exponentially
 * larger (Lexical Analysis III, slide 16), so the search gives up after
 * `maxStates` pairs instead of freezing the page.
 */
import { CharSet, partitionCharSets } from '$lib/theory/charset';
import { ClosureIndex } from '$lib/theory/automata/closure';
import type { Automaton, StateId } from '$lib/theory/automata/types';
import type { Regex } from '$lib/theory/regex/ast';

export const MAX_PAIRS = 6000;

const ALNUM = CharSet.range('0', '9').union(CharSet.range('A', 'Z')).union(CharSet.range('a', 'z'));
/** Visible ASCII, then everything above Latin-1 controls except line and paragraph separators. */
const VISIBLE = CharSet.range('!', '~')
	.union(CharSet.range(0xa1, 0x2027))
	.union(CharSet.range(0x202a, 0xd7ff))
	.union(CharSet.range(0xe000, 0x10ffff));

/**
 * The symbol that stands for a class in a counterexample: a digit or letter
 * if the class has one, else another visible character, else a space, else its
 * first code point. A class such as "anything but <, =, >" starts at U+0000,
 * which would make an invisible counterexample.
 */
export function representative(c: CharSet): number | undefined {
	for (const pool of [ALNUM, VISIBLE, CharSet.single(' ')]) {
		const cp = c.intersect(pool).first();
		if (cp !== undefined) return cp;
	}
	return c.first();
}

export type BoundedComparison =
	| { kind: 'same' }
	| {
			kind: 'differ';
			/** Shortest string accepted by A only (null when none was found). */
			onlyA: string | null;
			/** Shortest string accepted by B only. */
			onlyB: string | null;
	  }
	| { kind: 'too-large' };

interface Side {
	a: Automaton;
	index: ClosureIndex | null;
}

function side(a: Automaton): Side {
	return { a, index: a.states[a.start] ? new ClosureIndex(a) : null };
}

const startSet = (s: Side): StateId[] => (s.index ? s.index.closure([s.a.start]) : []);

function stepSet(s: Side, set: StateId[], cp: number): StateId[] {
	if (!s.index || set.length === 0) return [];
	return s.index.closure(s.index.moveWhere(set, (label) => label.has(cp)).targets);
}

const accepts = (s: Side, set: StateId[]) => set.some((id) => s.a.states[id].accepting);
const keyOf = (set: StateId[]) => [...set].sort((x, y) => x - y).join(',');

export function compareBounded(
	a: Automaton,
	b: Automaton,
	opts: { maxStates?: number } = {}
): BoundedComparison {
	const max = opts.maxStates ?? MAX_PAIRS;
	const A = side(a);
	const B = side(b);
	const labels: CharSet[] = [];
	for (const t of [...a.transitions, ...b.transitions])
		if (t.label && !t.label.isEmpty) labels.push(t.label);
	const reps = partitionCharSets(labels)
		.map((c) => representative(c)!)
		.sort((x, y) => x - y);

	interface Node {
		sa: StateId[];
		sb: StateId[];
		parent: number;
		cp: number;
	}
	const nodes: Node[] = [{ sa: startSet(A), sb: startSet(B), parent: -1, cp: 0 }];
	const seen = new Set<string>([`${keyOf(nodes[0].sa)}|${keyOf(nodes[0].sb)}`]);
	let onlyA: string | null = null;
	let onlyB: string | null = null;
	const word = (i: number): string => {
		const cps: number[] = [];
		for (let k = i; nodes[k].parent >= 0; k = nodes[k].parent) cps.push(nodes[k].cp);
		return String.fromCodePoint(...cps.reverse());
	};
	const check = (i: number) => {
		const inA = accepts(A, nodes[i].sa);
		const inB = accepts(B, nodes[i].sb);
		if (inA && !inB && onlyA === null) onlyA = word(i);
		if (inB && !inA && onlyB === null) onlyB = word(i);
	};
	check(0);
	for (let i = 0; i < nodes.length && (onlyA === null || onlyB === null); i++) {
		const { sa, sb } = nodes[i];
		for (const cp of reps) {
			const na = stepSet(A, sa, cp);
			const nb = stepSet(B, sb, cp);
			if (na.length === 0 && nb.length === 0) continue;
			const key = `${keyOf(na)}|${keyOf(nb)}`;
			if (seen.has(key)) continue;
			if (nodes.length >= max) {
				return onlyA === null && onlyB === null
					? { kind: 'too-large' }
					: { kind: 'differ', onlyA, onlyB };
			}
			seen.add(key);
			nodes.push({ sa: na, sb: nb, parent: i, cp });
			check(nodes.length - 1);
		}
	}
	return onlyA === null && onlyB === null ? { kind: 'same' } : { kind: 'differ', onlyA, onlyB };
}

/**
 * About how many states Thompson's construction makes for `r` (references
 * expanded, repetitions multiplied). Stops counting past `limit`.
 */
export function estimateNfaSize(r: Regex, limit = 100_000): number {
	const size = (n: Regex): number => {
		switch (n.kind) {
			case 'empty':
			case 'epsilon':
			case 'chars':
			case 'any':
				return 2;
			case 'concat':
				return n.parts.reduce((s, p) => Math.min(limit, s + size(p)), 0);
			case 'alt':
				return Math.min(
					limit,
					n.options.reduce((s, p) => s + size(p), 2)
				);
			case 'star':
			case 'optional':
				return Math.min(limit, size(n.body) + 4);
			case 'plus':
				return Math.min(limit, 2 * size(n.body) + 2);
			case 'repeat': {
				const b = size(n.body);
				const copies = n.max === null ? n.min + 1 : n.max;
				return Math.min(limit, copies * (b + 4) + 2);
			}
			case 'ref':
				return size(n.body);
		}
	};
	return size(r);
}
