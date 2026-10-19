/**
 * Where a grammar sits in the Venn diagram of Bottom-up Parsing III,
 * slide 26: LL(1), and LR(0) ⊂ SLR(1) ⊂ LALR(1) ⊂ LR(1), unambiguous or
 * ambiguous. Each class is decided by attempting its table and looking for
 * conflicts.
 *
 * Only the LL(1) table (Table-based Predictive Parsing, slide 24) and the
 * LR(1) table (Bottom-up Parsing II and III) are constructed in the decks.
 * LR(0), SLR(1) and LALR(1) are only named on slide 26; they are built the
 * standard way here: LR(0) reduces a completed item on every terminal, SLR(1)
 * on Follow of its left-hand side (both on the LR(0) automaton), LALR(1) on
 * the item lookaheads after merging the LR(1) states with the same core.
 *
 * The inclusions of the diagram hold for grammars whose non-terminals are all
 * reachable and productive. With a non-terminal that derives nothing, an
 * LL(1) table can be free of conflicts because its rows are empty while the
 * LR(1) table is not.
 */
import type { Diagnostic } from '../diagnostics';
import { parseTrees } from './earley';
import { ll1Table, type LL1Conflict } from './ll1';
import { lalr1Automaton, lr0Automaton, lr1Automaton } from './lr';
import { lrTable, type LrConflict } from './lr-table';
import type { Grammar } from './types';

export interface LrClass {
	/** No conflicts; null when the automaton was cut off at maxStates, so it is not known. */
	member: boolean | null;
	conflicts: LrConflict[];
	states: number;
}

export interface GrammarClasses {
	ll1: { member: boolean; conflicts: LL1Conflict[] };
	lr0: LrClass;
	slr1: LrClass;
	lalr1: LrClass;
	lr1: LrClass;
	/** With `tokens`: whether that string has two or more parse trees (parseTrees). */
	string: { tokens: string[]; trees: number; ambiguous: boolean } | null;
	/**
	 * 'unambiguous' when the grammar is LL(1) or LR(1) (neither kind is ever
	 * ambiguous); 'ambiguous' when `tokens` has two parse trees; otherwise
	 * 'unknown' (ambiguity cannot be decided in general).
	 */
	ambiguity: 'unambiguous' | 'ambiguous' | 'unknown';
	diagnostics: Diagnostic[];
}

/**
 * Decides LL(1), LR(0), SLR(1), LALR(1) and LR(1) for `g` by building each
 * table without precedence declarations, and reports each one's conflicts.
 * `tokens`, when given, is checked for a second parse tree. `maxStates`
 * bounds the LR automata (default DEFAULT_MAX_STATES).
 */
export function grammarClasses(
	g: Grammar,
	opts?: { tokens?: readonly string[]; maxStates?: number }
): GrammarClasses {
	const ll1 = ll1Table(g);
	const lr0 = lr0Automaton(g, { trace: false, maxStates: opts?.maxStates });
	const lr1 = lr1Automaton(g, { trace: false, maxStates: opts?.maxStates });
	const lalr1 = lalr1Automaton(lr1);
	const decide = (a: typeof lr0, method: 'lr0' | 'slr1' | 'lr1'): LrClass => {
		const table = lrTable(a, { method });
		return {
			member: a.truncated ? null : table.conflicts.length === 0,
			conflicts: table.conflicts,
			states: a.states.length
		};
	};
	const lr1Class = decide(lr1, 'lr1');
	let string: GrammarClasses['string'] = null;
	if (opts?.tokens) {
		const trees = parseTrees(g, opts.tokens, { limit: 2 }).trees.length;
		string = { tokens: [...opts.tokens], trees, ambiguous: trees > 1 };
	}
	const diagnostics = [...ll1.diagnostics];
	for (const d of [...lr0.diagnostics, ...lr1.diagnostics])
		if (!diagnostics.some((e) => e.message === d.message)) diagnostics.push(d);
	return {
		ll1: { member: ll1.ll1, conflicts: ll1.conflicts },
		lr0: decide(lr0, 'lr0'),
		slr1: decide(lr0, 'slr1'),
		lalr1: decide(lalr1, 'lr1'),
		lr1: lr1Class,
		string,
		ambiguity:
			ll1.ll1 || lr1Class.member ? 'unambiguous' : string?.ambiguous ? 'ambiguous' : 'unknown',
		diagnostics
	};
}
