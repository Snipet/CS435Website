/**
 * The grammar classes of Bottom-up Parsing III, slide 26 for one grammar:
 * whether it is LL(1), LR(0), SLR(1), LALR(1) and LR(1) (grammarClasses
 * tries each table), the conflicts that keep it out of each, whether a token
 * string has two parse trees, and where the grammar falls in the diagram.
 */
import type { GrammarPlace } from '$lib/components/grammar/grammar-classes';
import type { ItemView } from '$lib/components/grammar/lr-item';
import { augment } from '$lib/theory/grammar/lr';
import type { GrammarClasses, LrClass } from '$lib/theory/grammar/lr-classes';
import { printProduction } from '$lib/theory/grammar/lr';
import type { Grammar } from '$lib/theory/grammar/types';
import { itemView } from './context';

/** Conflicts listed per class; the rest are counted. */
export const CLASS_CONFLICTS = 3;

export type ClassId = 'll1' | 'lr0' | 'slr1' | 'lalr1' | 'lr1';

export interface ClassConflict {
	/** LR: the state, the terminal, and the two items. */
	state: number | null;
	terminal: string;
	kind: 'shift/reduce' | 'reduce/reduce' | 'LL(1)';
	items: ItemView[];
	/** LL(1): the entry [A, b] and the productions in it. */
	entry: { nonterminal: string; productions: string[] } | null;
}

export interface ClassRow {
	id: ClassId;
	/** LL(1), LR(0), SLR(1), LALR(1), LR(1). */
	name: string;
	/** null: the automaton was cut off, so it is not known. */
	member: boolean | null;
	/** LR: states of the automaton the table is built from. */
	states: number | null;
	/** How many conflicts the table has, and the first CLASS_CONFLICTS of them. */
	count: number;
	conflicts: ClassConflict[];
}

export interface ClassesView {
	rows: ClassRow[];
	/** Every non-terminal has one production, and the grammar is LL(1). */
	ll0: boolean;
	string: { tokens: string[]; trees: number; ambiguous: boolean } | null;
	ambiguity: GrammarClasses['ambiguity'];
	place: GrammarPlace;
}

const NAMES: Record<ClassId, string> = {
	ll1: 'LL(1)',
	lr0: 'LR(0)',
	slr1: 'SLR(1)',
	lalr1: 'LALR(1)',
	lr1: 'LR(1)'
};

/** The view of grammarClasses(g, …) for the grammar `g`. */
export function classesView(g: Grammar, c: GrammarClasses): ClassesView {
	const aug = augment(g);
	const lrRow = (id: Exclude<ClassId, 'll1'>, cls: LrClass): ClassRow => ({
		id,
		name: NAMES[id],
		member: cls.member,
		states: cls.states,
		count: cls.conflicts.length,
		conflicts: cls.conflicts.slice(0, CLASS_CONFLICTS).map((k) => ({
			state: k.state,
			terminal: k.terminal,
			kind: k.kind,
			items: k.items.map((i) => itemView(aug, i)),
			entry: null
		}))
	});
	const ll1: ClassRow = {
		id: 'll1',
		name: NAMES.ll1,
		member: c.ll1.member,
		states: null,
		count: c.ll1.conflicts.length,
		conflicts: c.ll1.conflicts.slice(0, CLASS_CONFLICTS).map((k) => ({
			state: null,
			terminal: k.terminal,
			kind: 'LL(1)',
			items: [],
			entry: {
				nonterminal: k.nonterminal,
				productions: k.productions.map((p) => printProduction(g.productions[p]))
			}
		}))
	};
	const ll0 =
		c.ll1.member &&
		g.nonterminals.every((n) => g.productions.filter((p) => p.lhs === n).length === 1);
	const lr: GrammarPlace['lr'] = c.lr0.member
		? 'lr0'
		: c.slr1.member
			? 'slr'
			: c.lalr1.member
				? 'lalr1'
				: c.lr1.member
					? 'lr1'
					: null;
	return {
		rows: [
			ll1,
			lrRow('lr0', c.lr0),
			lrRow('slr1', c.slr1),
			lrRow('lalr1', c.lalr1),
			lrRow('lr1', c.lr1)
		],
		ll0,
		string: c.string,
		ambiguity: c.ambiguity,
		place: {
			lr,
			ll: c.ll1.member ? (ll0 ? 'll0' : 'll1') : null,
			ambiguous: c.ambiguity === 'ambiguous'
		}
	};
}
