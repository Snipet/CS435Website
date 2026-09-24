/**
 * Helpers shared by the automata modules; not part of the public API.
 */
import { CharSet, type Range } from '../charset';
import { children, type Regex } from '../regex/ast';
import { isLabeled, outgoingIndex } from './core';
import type { Automaton } from './types';

/** Union of every symbol set in the expression (definition references expanded). */
export function regexSymbols(r: Regex): CharSet {
	const ranges: Range[] = [];
	const stack: Regex[] = [r];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (n.kind === 'chars') ranges.push(...n.set.ranges);
		stack.push(...children(n));
	}
	return CharSet.fromRanges(ranges);
}

/** True when the expression uses Σ. */
export function regexHasAny(r: Regex): boolean {
	const stack: Regex[] = [r];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (n.kind === 'any') return true;
		stack.push(...children(n));
	}
	return false;
}

/**
 * A deterministic machine in compact form. `edges[s]` holds the labeled
 * transitions of state s in creation order; a missing symbol means the dead
 * state (-1).
 */
export interface Machine {
	start: number;
	accepting: boolean[];
	edges: { label: CharSet; to: number; id: number }[][];
}

export function compile(a: Automaton): Machine {
	const out = outgoingIndex(a);
	return {
		start: a.start,
		accepting: a.states.map((s) => s.accepting),
		edges: out.map((ts) =>
			ts.filter(isLabeled).map((t) => ({ label: t.label, to: t.to, id: t.id }))
		)
	};
}

/** The first transition of `s` on code point `cp`, or undefined. */
export function edgeOn(m: Machine, s: number, cp: number) {
	if (s < 0) return undefined;
	for (const e of m.edges[s]) if (e.label.has(cp)) return e;
	return undefined;
}

export function step(m: Machine, s: number, cp: number): number {
	return edgeOn(m, s, cp)?.to ?? -1;
}

/** Code points of a string with the code-unit index just after each one. */
export function codePoints(input: string, from = 0): { cp: number; end: number }[] {
	const out: { cp: number; end: number }[] = [];
	let i = from;
	while (i < input.length) {
		const cp = input.codePointAt(i)!;
		i += cp > 0xffff ? 2 : 1;
		out.push({ cp, end: i });
	}
	return out;
}
