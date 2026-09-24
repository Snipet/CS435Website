/**
 * Questions about the language of a regular expression or automaton:
 * conversion, listing strings in shortlex order, emptiness, finiteness,
 * counting by length, and comparing two languages.
 *
 * Shortlex order: shorter strings first, then by code point, e.g.
 * "", "0", "1", "00", "01", …
 */
import { CharSet, partitionCharSets } from '../charset';
import type { Regex } from '../regex/ast';
import { analyzeDeterminism, reachableStates } from './core';
import { compile, step, type Machine } from './internal';
import { minimize } from './minimize';
import { subsetConstruction } from './subset';
import { thompson } from './thompson';
import type { Automaton } from './types';

export function regexToNfa(r: Regex, opts: { alphabet?: CharSet } = {}): Automaton {
	return thompson(r, opts).nfa;
}

/** Thompson + subset construction, optionally minimized. */
export function regexToDfa(
	r: Regex,
	opts: { alphabet?: CharSet; minimal?: boolean } = {}
): Automaton {
	const dfa = subsetConstruction(regexToNfa(r, { alphabet: opts.alphabet })).dfa;
	return opts.minimal ? minimize(dfa).dfa : dfa;
}

/** The machine itself when it is already a (partial) DFA; otherwise its subset construction. */
export function toDfa(a: Automaton): Automaton {
	return analyzeDeterminism(a).kind === 'nfa' ? subsetConstruction(a).dfa : a;
}

/** Deterministic machine with one edge per (state, target), so labels of a state are disjoint. */
function machineOf(a: Automaton): Machine {
	const m = compile(toDfa(a));
	return {
		...m,
		edges: m.edges.map((es) => {
			const byTarget = new Map<number, { label: CharSet; to: number; id: number }>();
			for (const e of es) {
				const prev = byTarget.get(e.to);
				if (prev) prev.label = prev.label.union(e.label);
				else byTarget.set(e.to, { ...e });
			}
			return [...byTarget.values()];
		})
	};
}

/** can[r][s]: some accepted string of length exactly r starts at s. */
function lengthTable(m: Machine, maxLength: number): boolean[][] {
	const can: boolean[][] = [m.accepting.slice()];
	for (let r = 1; r <= maxLength; r++) {
		const prev = can[r - 1];
		can.push(m.edges.map((es) => es.some((e) => prev[e.to])));
	}
	return can;
}

/** True when some accepted string is longer than `maxLength`. */
function acceptsLonger(m: Machine, maxLength: number, can: boolean[][]): boolean {
	// If such a string exists, one exists with length at most maxLength + |states|.
	let row = can[maxLength];
	for (let r = maxLength + 1; r <= maxLength + m.accepting.length; r++) {
		const prev = row;
		row = m.edges.map((es) => es.some((e) => prev[e.to]));
		if (row[m.start]) return true;
	}
	return false;
}

function enumerateMachine(
	m: Machine,
	maxLength: number,
	limit: number
): { strings: string[]; truncated: boolean } {
	const max = Math.max(0, Math.floor(maxLength));
	const can = lengthTable(m, max);
	const strings: string[] = [];
	let more = false;
	const good = new Map<string, CharSet>();
	const goodSymbols = (s: number, r: number): CharSet => {
		const key = `${s},${r}`;
		let set = good.get(key);
		if (!set) {
			set = CharSet.fromRanges(
				m.edges[s].filter((e) => can[r - 1][e.to]).flatMap((e) => e.label.ranges)
			);
			good.set(key, set);
		}
		return set;
	};
	// Lexicographic walk over strings of length exactly r; every branch taken yields a string.
	const walk = (s: number, r: number, prefix: string): boolean => {
		if (r === 0) {
			if (strings.length >= limit) {
				more = true;
				return false;
			}
			strings.push(prefix);
			return true;
		}
		for (const cp of goodSymbols(s, r).codePoints()) {
			if (!walk(step(m, s, cp), r - 1, prefix + String.fromCodePoint(cp))) return false;
		}
		return true;
	};
	for (let len = 0; len <= max; len++) {
		if (can[len][m.start] && !walk(m.start, len, '')) break;
	}
	return { strings, truncated: more || acceptsLonger(m, max, can) };
}

/**
 * Accepted strings in shortlex order, up to `maxLength` symbols and at most
 * `limit` strings. `truncated` is true when the language has strings that are
 * not listed (over the limit or longer than `maxLength`).
 */
export function enumerate(
	a: Automaton,
	opts: { maxLength: number; limit: number }
): { strings: string[]; truncated: boolean } {
	return enumerateMachine(machineOf(a), opts.maxLength, opts.limit);
}

/** L(M) = { }: no accepting state can be reached. */
export function isEmptyLanguage(a: Automaton): boolean {
	const reach = reachableStates(a);
	return !a.states.some((s) => s.accepting && reach.has(s.id));
}

function isFiniteMachine(m: Machine): boolean {
	const n = m.accepting.length;
	const reach = new Set([m.start]);
	const stack = [m.start];
	while (stack.length > 0)
		for (const e of m.edges[stack.pop()!])
			if (!reach.has(e.to)) {
				reach.add(e.to);
				stack.push(e.to);
			}
	const into: number[][] = Array.from({ length: n }, () => []);
	m.edges.forEach((es, s) => es.forEach((e) => into[e.to].push(s)));
	const co = new Set(m.accepting.flatMap((acc, s) => (acc ? [s] : [])));
	const back = [...co];
	while (back.length > 0)
		for (const p of into[back.pop()!])
			if (!co.has(p)) {
				co.add(p);
				back.push(p);
			}
	const useful = (s: number) => reach.has(s) && co.has(s);
	// Cycle search restricted to useful states (0 = new, 1 = on stack, 2 = done).
	const color = new Array<number>(n).fill(0);
	for (let root = 0; root < n; root++) {
		if (!useful(root) || color[root] !== 0) continue;
		const stackFrames: { s: number; i: number }[] = [{ s: root, i: 0 }];
		color[root] = 1;
		while (stackFrames.length > 0) {
			const top = stackFrames[stackFrames.length - 1];
			const es = m.edges[top.s];
			if (top.i >= es.length) {
				color[top.s] = 2;
				stackFrames.pop();
				continue;
			}
			const t = es[top.i++].to;
			if (!useful(t)) continue;
			if (color[t] === 1) return false;
			if (color[t] === 0) {
				color[t] = 1;
				stackFrames.push({ s: t, i: 0 });
			}
		}
	}
	return true;
}

/** True when L(M) is finite: no cycle lies on a path from the start to an accepting state. */
export function isFiniteLanguage(a: Automaton): boolean {
	return isFiniteMachine(machineOf(a));
}

/** counts[k] = number of accepted strings of length k, for k = 0 … maxLength. */
export function countByLength(a: Automaton, maxLength: number): bigint[] {
	const m = machineOf(a);
	const n = m.accepting.length;
	let vec = new Array<bigint>(n).fill(0n);
	vec[m.start] = 1n;
	const total = (v: bigint[]) => v.reduce((sum, x, s) => (m.accepting[s] ? sum + x : sum), 0n);
	const counts = [total(vec)];
	for (let k = 1; k <= maxLength; k++) {
		const next = new Array<bigint>(n).fill(0n);
		vec.forEach((x, s) => {
			if (x === 0n) return;
			for (const e of m.edges[s]) next[e.to] += x * BigInt(e.label.size);
		});
		vec = next;
		counts.push(total(vec));
	}
	return counts;
}

/** Shortlex-first accepted string, by breadth-first search on symbol classes. */
function shortestMachine(m: Machine): string | null {
	if (m.accepting[m.start]) return '';
	const seen = new Set([m.start]);
	const queue: { s: number; w: string }[] = [{ s: m.start, w: '' }];
	for (let i = 0; i < queue.length; i++) {
		const { s, w } = queue[i];
		const es = [...m.edges[s]].sort((x, y) => x.label.first()! - y.label.first()!);
		for (const e of es) {
			if (seen.has(e.to)) continue;
			seen.add(e.to);
			const w2 = w + e.label.firstChar()!;
			if (m.accepting[e.to]) return w2;
			queue.push({ s: e.to, w: w2 });
		}
	}
	return null;
}

/** The shortest accepted string (shortlex-first among the shortest), or null when L(M) = { }. */
export function shortestAccepted(a: Automaton): string | null {
	return shortestMachine(machineOf(a));
}

export interface Comparison {
	equivalent: boolean;
	/** Shortest string in L(A) but not L(B) (shortlex-first), or null. */
	onlyA: string | null;
	/** Shortest string in L(B) but not L(A) (shortlex-first), or null. */
	onlyB: string | null;
	/** Strings in shortlex order, up to `maxLength` symbols and `exampleLimit` per list. */
	examples: { onlyA: string[]; onlyB: string[]; both: string[] };
}

/** Product of two deterministic machines over their joint symbol classes; -1 is the dead state. */
function product(ma: Machine, mb: Machine) {
	const classes = partitionCharSets([
		...ma.edges.flat().map((e) => e.label),
		...mb.edges.flat().map((e) => e.label)
	]);
	const pairs: [number, number][] = [[ma.start, mb.start]];
	const index = new Map<string, number>([[`${ma.start},${mb.start}`, 0]]);
	const edges: Machine['edges'] = [];
	for (let i = 0; i < pairs.length; i++) {
		const [x, y] = pairs[i];
		const out: Machine['edges'][number] = [];
		for (const c of classes) {
			const cp = c.first()!;
			const x2 = x < 0 ? -1 : step(ma, x, cp);
			const y2 = y < 0 ? -1 : step(mb, y, cp);
			if (x2 < 0 && y2 < 0) continue;
			const key = `${x2},${y2}`;
			let to = index.get(key);
			if (to === undefined) {
				to = pairs.length;
				pairs.push([x2, y2]);
				index.set(key, to);
			}
			out.push({ label: c, to, id: out.length });
		}
		edges.push(out);
	}
	const accA = pairs.map(([x]) => x >= 0 && ma.accepting[x]);
	const accB = pairs.map(([, y]) => y >= 0 && mb.accepting[y]);
	const view = (accepting: boolean[]): Machine => ({ start: 0, accepting, edges });
	return {
		onlyA: view(accA.map((a, i) => a && !accB[i])),
		onlyB: view(accB.map((b, i) => b && !accA[i])),
		both: view(accA.map((a, i) => a && accB[i]))
	};
}

/**
 * Compares L(A) and L(B) with the product construction. The witnesses are the
 * shortest strings in each difference; examples list a few strings of each
 * kind (defaults: 5 per list, up to 8 symbols).
 */
export function compareLanguages(
	a: Automaton,
	b: Automaton,
	opts: { exampleLimit?: number; maxLength?: number } = {}
): Comparison {
	const limit = opts.exampleLimit ?? 5;
	const maxLength = opts.maxLength ?? 8;
	const p = product(machineOf(a), machineOf(b));
	const onlyA = shortestMachine(p.onlyA);
	const onlyB = shortestMachine(p.onlyB);
	const list = (m: Machine) => enumerateMachine(m, maxLength, limit).strings;
	return {
		equivalent: onlyA === null && onlyB === null,
		onlyA,
		onlyB,
		examples: { onlyA: list(p.onlyA), onlyB: list(p.onlyB), both: list(p.both) }
	};
}
