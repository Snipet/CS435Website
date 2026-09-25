/**
 * Shared helpers for the Finite Automata tool: size limits, state names in
 * text, set notation, and the machines behind "New".
 */
import { CharSet } from '$lib/theory/charset';
import { formatLabel, showChar } from '$lib/theory/chars';
import { sortByName } from '$lib/theory/automata/core';
import type { Automaton, Positions, StateId } from '$lib/theory/automata/types';

/** Largest machine the editor accepts (from text or a link). */
export const MAX_STATES = 200;
export const MAX_TRANSITIONS = 2000;
/** Longest input the step-by-step run shows. */
export const MAX_RUN_LENGTH = 400;

/** A state's display name; unnamed states show their number, as in the diagram. */
export function stateName(a: Automaton, id: StateId): string {
	const s = a.states[id];
	if (!s) return '?';
	return s.name || `#${s.id}`;
}

/** Lecture set notation with spaces inside the braces: `{ A, C }`, `{ }`. */
export function setText(names: readonly string[]): string {
	return names.length === 0 ? '{ }' : `{ ${names.join(', ')} }`;
}

/** A set of states in name order, as `{ A, C }`. */
export function stateSetText(a: Automaton, ids: readonly StateId[]): string {
	return setText(sortByName(a, ids).map((id) => stateName(a, id)));
}

/** One symbol as it appears in quotes in running text: `'1'`, `' '`, `'\n'`. */
export function quoteSymbol(ch: string): string {
	return `'${showChar(ch, 'quoted')}'`;
}

/**
 * Symbols for running text: `0, 1` for a few, "every symbol" when `set` is all
 * of `sigma`, "every symbol except <, =, >" for a large set missing a few, and
 * a compact label otherwise.
 */
export function symbolsText(set: CharSet, sigma?: CharSet): string {
	if (sigma && set.equals(sigma) && set.size > 1) return 'every symbol';
	const few = (s: CharSet) => s.size <= 8 && s.ranges.every(([lo, hi]) => hi - lo < 2);
	const list = (s: CharSet) =>
		s
			.chars()
			.map((c) => showChar(c, 'label'))
			.join(', ');
	if (few(set)) return list(set);
	const rest = (sigma ?? CharSet.ANY).subtract(set);
	if (set.size > 64 && !rest.isEmpty && rest.size <= 8) return `every symbol except ${list(rest)}`;
	return formatLabel(set, { separator: ', ' });
}

/** Σ in set notation: `{ 0, 1 }`, or a description for very large alphabets. */
export function alphabetText(sigma: CharSet): string {
	if (sigma.isEmpty) return '{ }';
	if (sigma.equals(CharSet.ANY)) return '{ every character }';
	if (sigma.size <= 24) return setText(sigma.chars().map((c) => showChar(c, 'label')));
	return `{ ${formatLabel(sigma, { separator: ', ' })} }`;
}

/** The machine "New" starts from: one start state A. */
export function newMachine(): { machine: Automaton; positions: Positions } {
	return {
		machine: { states: [{ id: 0, name: 'A', accepting: false }], transitions: [], start: 0 },
		positions: new Map([[0, { x: 0, y: 0 }]])
	};
}

/** True when the machine has at least one state (every run needs a start state). */
export const hasStates = (a: Automaton): boolean => a.states.length > 0 && !!a.states[a.start];
