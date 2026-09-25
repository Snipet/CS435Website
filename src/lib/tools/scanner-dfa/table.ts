/**
 * The arrays of the table-driven scanner (Lexical Analysis IV, slide 15):
 * T[state, char] over symbol classes, accept[state], retract[state],
 * tokenFor(state) and error(state).
 */
import { partitionCharSets, type CharSet } from '$lib/theory/charset';
import { formatLabel, type NamedSet } from '$lib/theory/chars';
import { coReachableStates, isLabeled, mergeEquivalentClasses } from '$lib/theory/automata';
import type { Automaton, StateId, Transition } from '$lib/theory/automata/types';
import { tableColumns } from '$lib/components/graph/table';

/** `state` after T has no entry: the error state. */
export const ERROR_STATE = -1;

/** A character read by getChar (), or null for EOF. */
export type Ch = string | null;
export const EOF = null;

export interface TableColumn {
	set: CharSet;
	header: string;
	/** The machine's `other` class: every character without an edge of its own (and EOF). */
	other: boolean;
}

export interface DriverTable {
	dfa: Automaton;
	/** Display name of each state. */
	names: string[];
	columns: TableColumn[];
	/** T[state][column]: the next state, or ERROR_STATE. */
	T: StateId[][];
	/**
	 * The transition behind T[state][column], or -1. A merged column can have
	 * several (e.g. one on [A-Z], one on [a-z]); this is the first.
	 */
	via: number[][];
	/** Labeled transitions out of each state, in the machine's order (`lookup` finds the one taken). */
	out: (Transition & { label: CharSet })[][];
	accept: boolean[];
	retract: boolean[];
	/** tokenFor (state): the token the state reports, or null when it names none. */
	token: (string | null)[];
	/** Rule index of each state's token (for colors), or null. */
	rule: (number | null)[];
	/** error (state): no accepting state can be reached from it. */
	dead: boolean[];
	/** The column EOF is looked up in (the `other` column), or null when there is none (EOF has no entry). */
	eofColumn: number | null;
}

/** The symbol classes of a machine's transition labels, ascending, before any are merged. */
export function labelClasses(dfa: Automaton): CharSet[] {
	const labels = new Map<string, CharSet>();
	for (const label of new Set(dfa.transitions.filter(isLabeled).map((t) => t.label)))
		labels.set(label.key(), label);
	return partitionCharSets(labels.values());
}

/**
 * Columns are the symbol classes of the transition labels, with classes that
 * every state treats alike merged into one column (`mergeEquivalentClasses`:
 * [A-Z] and [a-z] make one `letter` column when every state has the same next
 * state on both; distinct but equivalent next states keep them apart; a named
 * set such as `digit` never merges into an unnamed union), in ascending order
 * (with complements such as [^0-9] after the rest), headed like the
 * transition table (named sets such as `digit`, or `other` when the machine
 * labels that class `other`, as relop does; `other` is never merged).
 * A character in no column, and EOF when there is no `other` column, has no
 * entry in T: it leads to the error state.
 */
export function driverTable(
	dfa: Automaton,
	opts: { names?: readonly NamedSet[] } = {}
): DriverTable {
	const parts = labelClasses(dfa);
	const heads = tableColumns(dfa, { classes: parts, names: opts.names });
	const header = (set: CharSet) => formatLabel(set, { names: opts.names });
	const others: TableColumn[] = [];
	const plain: CharSet[] = [];
	parts.forEach((set, i) => {
		if (heads[i].header === header(set)) plain.push(set);
		else others.push({ set, header: heads[i].header, other: true });
	});
	const cols = mergeEquivalentClasses(dfa, plain, { names: opts.names }).map(
		(set): TableColumn => ({
			set,
			header: header(set),
			other: false
		})
	);
	// Complements such as [^0-9] start at the first code point; list them after the plain classes.
	const huge = (c: TableColumn) => c.set.size > 0x10000;
	const columns: TableColumn[] = [
		...cols.filter((c) => !huge(c)),
		...cols.filter((c) => huge(c)),
		...others
	];

	const n = dfa.states.length;
	const T = dfa.states.map(() => columns.map(() => ERROR_STATE));
	const via = dfa.states.map(() => columns.map(() => -1));
	const out: DriverTable['out'] = dfa.states.map(() => []);
	// Many transitions share a label object (a subset DFA labels them with its symbol classes).
	const covered = new Map<CharSet, number[]>();
	const columnsOf = (label: CharSet) => {
		let ks = covered.get(label);
		if (!ks) {
			ks = columns.flatMap((c, k) => (label.overlaps(c.set) ? [k] : []));
			covered.set(label, ks);
		}
		return ks;
	};
	for (const t of dfa.transitions) {
		if (!isLabeled(t) || t.from >= n) continue;
		out[t.from].push(t);
		for (const k of columnsOf(t.label)) {
			if (T[t.from][k] === ERROR_STATE) {
				T[t.from][k] = t.to;
				via[t.from][k] = t.id;
			}
		}
	}
	const live = coReachableStates(dfa);
	const eof = columns.findIndex((c) => c.other);
	return {
		dfa,
		names: dfa.states.map((s) => s.name || String(s.id)),
		columns,
		T,
		via,
		out,
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

/** T[from, ch]; `transition` is the one whose label holds `ch` (EOF: the one behind the cell). */
export function lookup(table: DriverTable, from: StateId, ch: Ch): Lookup {
	const column = columnOf(table, ch);
	if (column === null || from < 0) return { from, ch, column, to: ERROR_STATE, transition: null };
	const to = table.T[from][column];
	const via = table.via[from][column];
	if (via < 0) return { from, ch, column, to, transition: null };
	const cp = ch === EOF ? null : ch.codePointAt(0)!;
	const taken = cp === null ? undefined : table.out[from]?.find((t) => t.label.has(cp));
	return { from, ch, column, to, transition: taken?.id ?? via };
}

/** Display name of a state value, including the error state. */
export function stateName(table: DriverTable, s: StateId): string {
	return s === ERROR_STATE ? 'error' : (table.names[s] ?? String(s));
}
