/**
 * Columns of a transition table (docs/ARCHITECTURE.md §3.7), used by
 * TransitionTable.svelte.
 */
import { CharSet, partitionCharSets } from '$lib/theory/charset';
import { formatLabel, type NamedSet } from '$lib/theory/chars';
import { mergeEquivalentClasses } from '$lib/theory/automata/core';
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
 * are the classes of the declared alphabet and every label, with classes that
 * every state treats alike merged into one (`mergeEquivalentClasses`, so
 * `[A-Z]` and `[a-z]` can share a column), in ascending order. Named sets keep
 * their names whatever the number of symbols: classes merge into an unnamed
 * union only apart from the named sets they make up (`digit` and `_` stay two
 * columns unless their union is named). When there are at most SPLIT_LIMIT
 * symbols the columns are split into single symbols (named sets stay whole).
 * A class reached only through labels displayed as, say, `other` is headed
 * `other`, is never merged, and comes last.
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
	const merged = mergeEquivalentClasses(
		a,
		parts.filter((c) => !heads.has(c)),
		{ names: opts.names }
	);
	const total = merged.reduce((n, c) => n + c.size, 0);
	const named = (c: CharSet) => opts.names?.some((n) => n.set.equals(c)) ?? false;
	// One column per symbol, as on the slides, except for named sets.
	const plain =
		total <= SPLIT_LIMIT
			? merged
					.flatMap((c) => (named(c) ? [c] : [...c.codePoints()].map((cp) => CharSet.single(cp))))
					.sort((x, y) => x.first()! - y.first()!)
			: merged;
	return [
		...plain.map((c) => column(c)),
		...parts.filter((c) => heads.has(c)).map((c) => column(c, heads.get(c)))
	];
}
