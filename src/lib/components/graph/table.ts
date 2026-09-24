/**
 * Columns of a transition table (docs/ARCHITECTURE.md §3.7), used by
 * TransitionTable.svelte.
 */
import { CharSet, partitionCharSets } from '$lib/theory/charset';
import { formatLabel, type NamedSet } from '$lib/theory/chars';
import type { Automaton } from '$lib/theory/automata/types';

export interface TableColumn {
	/** Symbols of the column. */
	set: CharSet;
	header: string;
}

/** Up to this many symbols in total, default columns are single symbols (as on the slides). */
export const SPLIT_LIMIT = 16;

/**
 * Display text for classes that only labels with that display override reach:
 * the class lies inside every label shown with that text and outside every
 * plain label. A text that would head several classes heads none.
 */
function displayHeaders(a: Automaton, classes: readonly CharSet[]): Map<CharSet, string> {
	let plain = CharSet.EMPTY;
	const common = new Map<string, CharSet>();
	for (const t of a.transitions) {
		if (!t.label) continue;
		if (!t.display) plain = plain.union(t.label);
		else common.set(t.display, common.get(t.display)?.intersect(t.label) ?? t.label);
	}
	const out = new Map<CharSet, string>();
	for (const [text, set] of common) {
		const hits = classes.filter((c) => !c.overlaps(plain) && c.isSubsetOf(set));
		if (hits.length === 1 && !out.has(hits[0])) out.set(hits[0], text);
	}
	return out;
}

/**
 * The symbol columns of a transition table (the ε column is not included).
 *
 * Given `classes`, those are the columns, in that order. Otherwise the columns
 * are the classes of the declared alphabet and every label in ascending order,
 * split into single symbols when there are at most SPLIT_LIMIT symbols (named
 * sets stay whole), and a class reached only through labels displayed as, say,
 * `other` is headed `other` and comes last.
 */
export function tableColumns(
	a: Automaton,
	opts: { classes?: readonly CharSet[]; names?: readonly NamedSet[] } = {}
): TableColumn[] {
	const column = (set: CharSet, display?: string): TableColumn => ({
		set,
		header: display ?? formatLabel(set, { names: opts.names })
	});
	if (opts.classes) {
		const heads = displayHeaders(a, opts.classes);
		return opts.classes.map((c) => column(c, heads.get(c)));
	}
	const labels = a.transitions.flatMap((t) => (t.label ? [t.label] : []));
	const parts = partitionCharSets(a.alphabet ? [a.alphabet, ...labels] : labels);
	const heads = displayHeaders(a, parts);
	const plain = parts.filter((c) => !heads.has(c));
	const total = plain.reduce((n, c) => n + c.size, 0);
	const named = (c: CharSet) => opts.names?.some((n) => n.set.equals(c)) ?? false;
	const split =
		total <= SPLIT_LIMIT
			? plain.flatMap((c) => (named(c) ? [c] : [...c.codePoints()].map((cp) => CharSet.single(cp))))
			: plain;
	return [
		...split.map((c) => column(c)),
		...parts.filter((c) => heads.has(c)).map((c) => column(c, heads.get(c)))
	];
}
