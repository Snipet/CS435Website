/**
 * The NFA of a regular grammar. A grammar of type 3 (Introduction to Parsing,
 * slide 23) has only productions V → w and V → w U with w a string of
 * terminals, and its recognizer is an NFA or DFA: one state per non-terminal
 * plus one accepting state, with V → w U read as a path from V to U over the
 * terminals of w, and V → w as a path from V to the accepting state. An empty
 * w is an ε-move.
 *
 * Automata read characters, so the machine is built only when every terminal
 * is one character.
 */
import { CharSet } from '$lib/theory/charset';
import { formatAutomatonText } from '$lib/theory/automata/core';
import type { Automaton, State, Transition } from '$lib/theory/automata/types';
import { chomskyType, type Grammar } from '$lib/theory/grammar';

export type RegularNfa =
	| {
			ok: true;
			automaton: Automaton;
			/** The machine in the automaton text format, for a link to Finite Automata. */
			text: string;
	  }
	| { ok: false; reason: 'not-regular' }
	/** `terminals`: the terminals of more than one character. */
	| { ok: false; reason: 'long-terminals'; terminals: string[] };

/** Name of the accepting state, unless a non-terminal has it. */
export const ACCEPT_NAME = 'F';

const isOneCharacter = (terminal: string) => [...terminal].length === 1;

export function regularNfa(g: Grammar): RegularNfa {
	if (chomskyType(g).type !== 3) return { ok: false, reason: 'not-regular' };
	const long = g.terminals.filter((t) => !isOneCharacter(t));
	if (long.length > 0) return { ok: false, reason: 'long-terminals', terminals: long };

	const taken = new Set(g.nonterminals);
	/** `base`, or `base` with the first number from 2 that makes the name unused. */
	const fresh = (base: string, from = 2): string => {
		let name = base;
		for (let k = from; taken.has(name); k++) name = `${base}${k}`;
		taken.add(name);
		return name;
	};
	const states: State[] = [];
	const add = (name: string, accepting = false): number => {
		states.push({ id: states.length, name, accepting });
		return states.length - 1;
	};
	const stateOf = new Map(g.nonterminals.map((n) => [n, add(n)]));
	const accept = add(fresh(ACCEPT_NAME), true);

	const transitions: Transition[] = [];
	const move = (from: number, to: number, symbol: string | null): void => {
		transitions.push({
			id: transitions.length,
			from,
			to,
			label: symbol === null ? null : CharSet.single(symbol)
		});
	};
	for (const p of g.productions) {
		const last = p.rhs[p.rhs.length - 1];
		const target = last !== undefined ? stateOf.get(last) : undefined;
		const w = target === undefined ? p.rhs : p.rhs.slice(0, -1);
		const end = target ?? accept;
		let at = stateOf.get(p.lhs)!;
		if (w.length === 0) {
			move(at, end, null);
			continue;
		}
		w.forEach((symbol, i) => {
			// States inside the path of a long w are named after its non-terminal: S1, S2, …
			const to = i === w.length - 1 ? end : add(fresh(p.lhs, 1));
			move(at, to, symbol);
			at = to;
		});
	}
	const automaton: Automaton = { states, transitions, start: stateOf.get(g.start)! };
	return { ok: true, automaton, text: formatAutomatonText(automaton) };
}
