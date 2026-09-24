/**
 * The determinism strip: DFA, partial DFA (missing transitions go to a trap
 * state, Lexical Analysis III slide 6), or NFA (ε-moves, or several
 * transitions on one symbol; slides 9–11), with the items that decide it.
 */
import type { CharSet } from '$lib/theory/charset';
import { alphabetOf, analyzeDeterminism, sortByName } from '$lib/theory/automata/core';
import type { Automaton, StateId, Transition } from '$lib/theory/automata/types';
import { stateName, stateSetText, symbolsText } from './model';
import type { Seg } from './run';

export type StripItem =
	| { key: string; kind: 'missing'; state: StateId; symbols: CharSet; segs: Seg[] }
	| { key: string; kind: 'epsilon'; transition: Transition; segs: Seg[] }
	| {
			key: string;
			kind: 'conflict';
			state: StateId;
			symbols: CharSet;
			transitions: Transition[];
			segs: Seg[];
	  };

export interface DeterminismSummary {
	kind: 'dfa' | 'partial-dfa' | 'nfa';
	/** "DFA", "Partial DFA", "NFA". */
	title: string;
	detail: string;
	items: StripItem[];
}

export function summarizeDeterminism(a: Automaton): DeterminismSummary {
	const report = analyzeDeterminism(a);
	const sigma = alphabetOf(a);
	const name = (id: StateId): Seg => ({ kind: 'state', text: stateName(a, id) });
	const sym = (set: CharSet): Seg => ({ kind: 'text', text: symbolsText(set, sigma) });
	if (a.states.length === 0)
		return { kind: 'dfa', title: 'Empty', detail: 'Add a state to start.', items: [] };
	if (report.kind === 'dfa')
		return {
			kind: 'dfa',
			title: 'DFA',
			detail: 'Every state has exactly one transition on each symbol of Σ.',
			items: []
		};
	if (report.kind === 'partial-dfa')
		return {
			kind: 'partial-dfa',
			title: 'Partial DFA',
			detail: 'Missing transitions go to a trap state.',
			items: report.missing.map((m) => ({
				key: `m${m.state}`,
				kind: 'missing',
				state: m.state,
				symbols: m.symbols,
				segs: [name(m.state), { kind: 'text', text: ' on ' }, sym(m.symbols)]
			}))
		};
	const items: StripItem[] = [];
	for (const t of report.epsilonMoves)
		items.push({
			key: `e${t.id}`,
			kind: 'epsilon',
			transition: t,
			segs: [name(t.from), { kind: 'arrow', text: 'ε' }, name(t.to)]
		});
	for (const c of report.conflicts) {
		const targets = sortByName(a, new Set(c.transitions.map((t) => t.to)));
		items.push({
			key: `c${c.state}:${c.symbols.key()}`,
			kind: 'conflict',
			state: c.state,
			symbols: c.symbols,
			transitions: c.transitions,
			segs: [
				name(c.state),
				{ kind: 'text', text: ' on ' },
				sym(c.symbols),
				{ kind: 'text', text: ' → ' },
				{ kind: 'set', text: stateSetText(a, targets) }
			]
		});
	}
	const parts = [
		report.epsilonMoves.length > 0 ? 'ε-moves' : '',
		report.conflicts.length > 0 ? 'several transitions on one symbol' : ''
	].filter(Boolean);
	return {
		kind: 'nfa',
		title: 'NFA',
		detail: `It has ${parts.join(' and ')}.`,
		items
	};
}
