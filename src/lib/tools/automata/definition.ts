/**
 * The formal definition of a machine (Lexical Analysis III, slides 3 and 12):
 * a DFA as M = (Σ, S, s0, F, T) with transitions s →a t, an NFA with states Q
 * and Δ : Q × (Σ ∪ { ε }) → P(Q).
 *
 * Symbols are the transition-table columns (one per symbol for small
 * alphabets, `other` for a class reached only through labels shown that way).
 */
import { tableColumns } from '$lib/components/graph/table';
import { alphabetOf, analyzeDeterminism, sortByName } from '$lib/theory/automata/core';
import type { Automaton } from '$lib/theory/automata/types';
import { alphabetText, stateName, symbolsText } from './model';

export interface Definition {
	kind: 'dfa' | 'nfa';
	/** Σ in set notation. */
	sigma: string;
	states: string[];
	start: string;
	finals: string[];
	/** DFA transitions s →a t, by state then column. */
	moves: { from: string; symbol: string; to: string }[];
	/** DFA: symbols of Σ a state has no transition on. */
	missing: { state: string; symbols: string }[];
	/** NFA: the non-empty values Δ(q, a), by state then column (ε last). */
	deltas: { state: string; symbol: string; targets: string[] }[];
}

export function formalDefinition(a: Automaton): Definition {
	const report = analyzeDeterminism(a);
	const sigma = alphabetOf(a);
	const columns = tableColumns(a);
	const name = (id: number) => stateName(a, id);
	const def: Definition = {
		kind: report.kind === 'nfa' ? 'nfa' : 'dfa',
		sigma: alphabetText(sigma),
		states: a.states.map((s) => name(s.id)),
		start: a.states[a.start] ? name(a.start) : '',
		finals: a.states.filter((s) => s.accepting).map((s) => name(s.id)),
		moves: [],
		missing: [],
		deltas: []
	};
	const out = a.states.map(() => [] as { symbol: string; targets: number[] }[]);
	for (const s of a.states) {
		const ts = a.transitions.filter((t) => t.from === s.id);
		for (const c of columns) {
			const targets = sortByName(
				a,
				new Set(ts.filter((t) => t.label !== null && t.label.overlaps(c.set)).map((t) => t.to))
			);
			if (targets.length > 0) out[s.id].push({ symbol: c.header, targets });
		}
		const eps = sortByName(a, new Set(ts.filter((t) => t.label === null).map((t) => t.to)));
		if (eps.length > 0) out[s.id].push({ symbol: 'ε', targets: eps });
	}
	if (def.kind === 'dfa') {
		for (const s of a.states)
			for (const cell of out[s.id])
				def.moves.push({ from: name(s.id), symbol: cell.symbol, to: name(cell.targets[0]) });
		def.missing = report.missing.map((m) => ({
			state: name(m.state),
			symbols: symbolsText(m.symbols, sigma)
		}));
	} else {
		for (const s of a.states)
			for (const cell of out[s.id])
				def.deltas.push({
					state: name(s.id),
					symbol: cell.symbol,
					targets: cell.targets.map(name)
				});
	}
	return def;
}
