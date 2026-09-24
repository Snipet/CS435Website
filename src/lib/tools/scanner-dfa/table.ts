/**
 * The arrays of the table-driven scanner (Lexical Analysis IV, slide 15):
 * T[state, char] over symbol classes, accept[state], retract[state],
 * tokenFor(state) and error(state).
 */
import { CharSet, partitionCharSets } from '$lib/theory/charset';
import { formatLabel, type NamedSet } from '$lib/theory/chars';
import { coReachableStates, isLabeled } from '$lib/theory/automata';
import type { Automaton, StateId } from '$lib/theory/automata/types';
import { tableColumns } from '$lib/components/graph/table';

/** `state` after T has no entry: the error state. */
export const ERROR_STATE = -1;

/** A character read by getChar (), or null for EOF. */
export type Ch = string | null;
export const EOF = null;

export interface TableColumn {
	set: CharSet;
	header: string;
	/** The column for every character not in an earlier column (and for EOF). */
	other: boolean;
}

export interface DriverTable {
	dfa: Automaton;
	/** Display name of each state. */
	names: string[];
	columns: TableColumn[];
	/** T[state][column]: the next state, or ERROR_STATE. */
	T: StateId[][];
	/** The transition behind T[state][column], or -1. */
	via: number[][];
	accept: boolean[];
	retract: boolean[];
	/** tokenFor (state): the token the state reports, or null when it names none. */
	token: (string | null)[];
	/** Rule index of each state's token (for colors), or null. */
	rule: (number | null)[];
	/** error (state): no accepting state can be reached from it. */
	dead: boolean[];
	/** The column EOF is looked up in (the `other` column), or null when there is none. */
	eofColumn: number | null;
}

/**
 * Columns are the symbol classes of the transition labels, ascending (with
 * complements such as [^0-9] after the rest), headed like the transition
 * table (named sets such as `digit`, or `other` when the machine labels that
 * class `other`); an `other` column for the remaining characters comes last
 * when the labels do not cover every character.
 */
export function driverTable(
	dfa: Automaton,
	opts: { names?: readonly NamedSet[] } = {}
): DriverTable {
	const labels = dfa.transitions.filter(isLabeled).map((t) => t.label);
	const parts = partitionCharSets(labels);
	const heads = tableColumns(dfa, { classes: parts, names: opts.names });
	const cols = parts.map((set, i) => {
		const plain = formatLabel(set, { names: opts.names });
		return { set, header: heads[i].header, other: heads[i].header !== plain };
	});
	// Complements such as [^0-9] start at the first code point; list them after the plain classes.
	const huge = (c: TableColumn) => c.set.size > 0x10000;
	const columns: TableColumn[] = [
		...cols.filter((c) => !c.other && !huge(c)),
		...cols.filter((c) => !c.other && huge(c)),
		...cols.filter((c) => c.other)
	];
	const covered = CharSet.fromRanges(parts.flatMap((p) => [...p.ranges]));
	if (!columns.some((c) => c.other)) {
		const rest = covered.complement();
		if (!rest.isEmpty) columns.push({ set: rest, header: 'other', other: true });
	}

	const n = dfa.states.length;
	const T = dfa.states.map(() => columns.map(() => ERROR_STATE));
	const via = dfa.states.map(() => columns.map(() => -1));
	for (const t of dfa.transitions) {
		if (!isLabeled(t) || t.from >= n) continue;
		columns.forEach((c, k) => {
			if (T[t.from][k] === ERROR_STATE && t.label.overlaps(c.set)) {
				T[t.from][k] = t.to;
				via[t.from][k] = t.id;
			}
		});
	}
	const live = coReachableStates(dfa);
	const eof = columns.findIndex((c) => c.other);
	return {
		dfa,
		names: dfa.states.map((s) => s.name || String(s.id)),
		columns,
		T,
		via,
		accept: dfa.states.map((s) => s.accepting),
		retract: dfa.states.map((s) => s.retract ?? false),
		token: dfa.states.map((s) => (s.accepting ? (s.accept?.token ?? null) : null)),
		rule: dfa.states.map((s) => (s.accepting ? (s.accept?.rule ?? null) : null)),
		dead: dfa.states.map((s) => !live.has(s.id)),
		eofColumn: eof < 0 ? null : eof
	};
}

/** The column `ch` is looked up in, or null (no column: the error state). */
export function columnOf(table: DriverTable, ch: Ch): number | null {
	if (ch === EOF) return table.eofColumn;
	const cp = ch.codePointAt(0)!;
	const i = table.columns.findIndex((c) => c.set.has(cp));
	return i < 0 ? null : i;
}

export interface Lookup {
	from: StateId;
	ch: Ch;
	column: number | null;
	to: StateId;
	/** Transition taken, or null. */
	transition: number | null;
}

/** T[from, ch]. */
export function lookup(table: DriverTable, from: StateId, ch: Ch): Lookup {
	const column = columnOf(table, ch);
	if (column === null || from < 0) return { from, ch, column, to: ERROR_STATE, transition: null };
	const to = table.T[from][column];
	const via = table.via[from][column];
	return { from, ch, column, to, transition: via < 0 ? null : via };
}

/** Display name of a state value, including the error state. */
export function stateName(table: DriverTable, s: StateId): string {
	return s === ERROR_STATE ? 'error' : (table.names[s] ?? String(s));
}
