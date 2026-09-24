/**
 * Table sizes: rows (DFA states) × columns (symbol classes) = cells of T.
 */
import type { NamedSet } from '$lib/theory/chars';
import { minimize, type Automaton } from '$lib/theory/automata';
import { driverTable } from './table';

/** Columns of T when it is indexed by character code, as on slide 15 ([state, char]) over ASCII. */
export const ASCII_COLUMNS = 128;

export interface TableSize {
	states: number;
	/** Columns of T: the symbol classes (with `other`). */
	classes: number;
	cells: number;
	/** Cells with one column per ASCII character. */
	asciiCells: number;
}

export function tableSize(dfa: Automaton, names?: readonly NamedSet[]): TableSize {
	const states = dfa.states.length;
	const classes = driverTable(dfa, { names }).columns.length;
	return { states, classes, cells: states * classes, asciiCells: states * ASCII_COLUMNS };
}

/**
 * Sizes of a DFA as given and minimized (different tokens kept apart). A
 * machine whose states retract (relop) is minimized on its tokens only.
 */
export function sizesOf(
	dfa: Automaton,
	names?: readonly NamedSet[],
	minimal?: Automaton
): { built: TableSize; minimal: TableSize } {
	const min = minimal ?? minimize(dfa, { splitByToken: true }).dfa;
	return { built: tableSize(dfa, names), minimal: tableSize(min, names) };
}
