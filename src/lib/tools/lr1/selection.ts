/**
 * What is selected in the drawings of the DFA, and what that marks in the
 * table: a state marks its row, an edge marks the cell it is stored in (an
 * edge on a terminal is a shift entry, one on a non-terminal a goto entry).
 */
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import type { LrTable } from '$lib/theory/grammar/lr-table';
import { edgeCell, type CellRef } from './table-view';

export type DfaSelection = { kind: 'state'; state: number } | { kind: 'edge'; edge: number } | null;

/** The row a selection marks: the state, or the state an edge leaves. */
export function selectedRow(a: LrAutomaton, s: DfaSelection): number | null {
	if (!s) return null;
	if (s.kind === 'state') return s.state < a.states.length ? s.state : null;
	return a.edges[s.edge]?.from ?? null;
}

/** The cell a selected edge is stored in. */
export function selectedCell(a: LrAutomaton, t: LrTable, s: DfaSelection): CellRef | null {
	if (s?.kind !== 'edge') return null;
	const e = a.edges[s.edge];
	return e ? edgeCell(t, e) : null;
}

/** The selection still makes sense for the automaton (states and edges exist). */
export function validSelection(a: LrAutomaton, s: DfaSelection): DfaSelection {
	if (!s) return null;
	if (s.kind === 'state') return s.state < a.states.length ? s : null;
	return s.edge < a.edges.length ? s : null;
}

/** The index of the edge from `from` on `symbol`, or null. */
export function edgeIndex(a: LrAutomaton, from: number, symbol: string): number | null {
	const k = a.edges.findIndex((e) => e.from === from && e.symbol === symbol);
	return k < 0 ? null : k;
}
