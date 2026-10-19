/**
 * What the LR(1) Parser Builder computes from its inputs: the grammar read on
 * the page (for every keystroke), and the automata, tables and the parse
 * built in a worker (`computeBuild`), since a canonical LR(1) automaton can
 * have hundreds of states.
 *
 * The decks build the canonical LR(1) automaton (Bottom-up Parsing III,
 * slides 10–14) and its table (Bottom-up Parsing II, slides 18–19). LALR(1),
 * SLR(1) and LR(0) are only named in the decks (Bottom-up Parsing III,
 * slide 26); the engine builds them the standard way, and the tool offers
 * them for comparison.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import {
	lalr1Automaton,
	lr0Automaton,
	lr1Automaton,
	type LrAutomaton
} from '$lib/theory/grammar/lr';
import { lrParse, type LrParse } from '$lib/theory/grammar/lr-parse';
import { lrTable, type LrTable } from '$lib/theory/grammar/lr-table';
import { parseGrammar, tokenizeInput } from '$lib/theory/grammar/parse';
import { END_MARKER, type Grammar } from '$lib/theory/grammar/types';

/** How the table is built: the decks' LR(1), or one of the methods they only name. */
export type Method = 'lr1' | 'lalr1' | 'slr1' | 'lr0';

/** The order in which Closure adds a non-terminal's productions. */
export type ClosureOrder = 'grammar' | 'reversed';

export const METHODS: readonly Method[] = ['lr1', 'lalr1', 'slr1', 'lr0'];

export const METHOD_NAMES: Record<Method, string> = {
	lr1: 'LR(1)',
	lalr1: 'LALR(1)',
	slr1: 'SLR(1)',
	lr0: 'LR(0)'
};

/** The automaton a method's table is built from. */
export const METHOD_AUTOMATON: Record<Method, 'lr1' | 'lalr1' | 'lr0'> = {
	lr1: 'lr1',
	lalr1: 'lalr1',
	slr1: 'lr0',
	lr0: 'lr0'
};

/**
 * The `closureOrder` option of the engine for an order: 'reversed' lists every
 * production id from the last, so Closure takes each non-terminal's
 * productions last first. Bottom-up Parsing III writes E → int | E + ( E )
 * (slide 4) and lists E → •E + ( E ) before E → •int (slides 11 and 14).
 */
export function closureOrderOf(g: Grammar, order: ClosureOrder): number[] | undefined {
	return order === 'reversed' ? g.productions.map((p) => p.id).reverse() : undefined;
}

/** The grammar as the page reads it: parsed on every keystroke. */
export interface GrammarReading {
	grammar: Grammar | null;
	diagnostics: Diagnostic[];
}

export function readGrammar(text: string): GrammarReading {
	return parseGrammar(text);
}

/** The token string as the page reads it: the tokens, without the closing `$`. */
export interface InputReading {
	tokens: string[] | null;
	diagnostics: Diagnostic[];
}

/**
 * Tokens of the space-separated input. A closing `$` may be written; it is
 * dropped here and added back by the parser (I = w $).
 */
export function readInput(text: string, g: Grammar): InputReading {
	const { tokens, diagnostics } = tokenizeInput(text, [...g.terminals, END_MARKER], {
		nonterminals: g.nonterminals
	});
	const errors = diagnostics.filter((d) => d.severity === 'error');
	if (errors.length > 0) return { tokens: null, diagnostics };
	const words = [...tokens];
	if (!g.terminals.includes(END_MARKER) && words[words.length - 1] === END_MARKER) words.pop();
	if (!g.terminals.includes(END_MARKER) && words.includes(END_MARKER))
		return {
			tokens: null,
			diagnostics: [
				...diagnostics,
				{
					severity: 'error',
					message: '$ marks the end of the input: only the last token can be $.'
				}
			]
		};
	return { tokens: words, diagnostics };
}

export interface BuildRequest {
	grammar: string;
	order: ClosureOrder;
	method: Method;
	input: string;
}

export interface MethodSummary {
	states: number;
	conflicts: number;
	shiftReduce: number;
	reduceReduce: number;
	/** The automaton was cut off at the engine's limit of states. */
	truncated: boolean;
}

export interface BuildResult {
	/** The method the table is built with. */
	method: Method;
	/** The canonical LR(1) automaton (the decks'), without its step trace. */
	lr1: LrAutomaton;
	/** The automaton of the chosen method: `lr1`, its LALR(1) merge, or the LR(0) automaton. */
	automaton: LrAutomaton;
	/** The chosen method's action/goto table, without precedence (bison's defaults settle conflicts). */
	table: LrTable;
	/** States and conflicts of every method, for comparison. */
	summary: Record<Method, MethodSummary>;
	/** The LR parse of the input with `table`; null when the input has errors. */
	parse: LrParse | null;
}

function summarize(a: LrAutomaton, t: LrTable): MethodSummary {
	return {
		states: a.states.length,
		conflicts: t.conflicts.length,
		shiftReduce: t.conflicts.filter((c) => c.kind === 'shift/reduce').length,
		reduceReduce: t.conflicts.filter((c) => c.kind === 'reduce/reduce').length,
		truncated: a.truncated
	};
}

/**
 * Builds the automata and tables of every method and parses the input with
 * the chosen one. Null when the grammar has errors. Pure: the worker runs it,
 * and so does the page while prerendering.
 */
export function computeBuild(request: BuildRequest): BuildResult | null {
	const { grammar: g } = parseGrammar(request.grammar);
	if (!g) return null;
	const closureOrder = closureOrderOf(g, request.order);
	// The construction stepper replays the edges, which are listed in the order they were made:
	// the engine's step trace (every Closure step of every state) is not needed.
	const lr1 = lr1Automaton(g, { closureOrder, trace: false });
	const lalr1 = lalr1Automaton(lr1);
	const lr0 = lr0Automaton(g, { closureOrder, trace: false });
	const tables = {
		lr1: lrTable(lr1),
		lalr1: lrTable(lalr1),
		slr1: lrTable(lr0, { method: 'slr1' }),
		lr0: lrTable(lr0, { method: 'lr0' })
	} satisfies Record<Method, LrTable>;
	const automata: Record<Method, LrAutomaton> = { lr1, lalr1, slr1: lr0, lr0 };
	const summary = Object.fromEntries(
		METHODS.map((m) => [m, summarize(automata[m], tables[m])])
	) as Record<Method, MethodSummary>;
	const table = tables[request.method];
	const input = readInput(request.input, g);
	const parse = input.tokens ? lrParse(table, input.tokens) : null;
	return {
		method: request.method,
		lr1,
		automaton: automata[request.method],
		table,
		summary,
		parse
	};
}
