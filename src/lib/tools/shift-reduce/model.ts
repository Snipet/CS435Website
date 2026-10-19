/**
 * What the Shift-Reduce Parsing page computes: the grammar and token string
 * read on the page (every keystroke), and the parse itself (the canonical
 * LR(1) automaton and table, the LR parse, its handles and the rightmost
 * derivation), which runs in a worker (parse.worker.ts).
 *
 * Requests and results are plain data: they are copied between threads. A
 * result carries its own grammar, so a result for an earlier grammar can be
 * drawn as it is while a newer one is computed.
 */
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	DEFAULT_MAX_STATES,
	END_MARKER,
	derivationFromTree,
	endInput,
	handlesFromParse,
	lr1Automaton,
	lrParse,
	lrTable,
	parseGrammar,
	printAction,
	tokenizeInput,
	type Derivation,
	type Grammar,
	type HandleStep,
	type LrAction,
	type LrAutomaton,
	type LrItem,
	type LrParse,
	type LrTable
} from '$lib/theory/grammar';
import type { ItemView } from '$lib/components/grammar/lr-item';

/** Longest token string that is parsed. */
export const MAX_TOKENS = 1000;
/** Longest token string whose handles and rightmost derivation are listed. */
export const MAX_HANDLE_TOKENS = 200;
/** States of the LR(1) automaton beyond which the construction stops. */
export const MAX_STATES = DEFAULT_MAX_STATES;

// ───────────────────────────── on the page ─────────────────────────────

export interface GrammarReading {
	grammar: Grammar | null;
	diagnostics: Diagnostic[];
}

/** The grammar text, read as the editor shows it. */
export function readGrammar(text: string): GrammarReading {
	return parseGrammar(text);
}

export interface InputReading {
	tokens: string[];
	/** The first error, for the field. */
	error: string | null;
}

/**
 * The token string, with an optional closing `$`. Errors: a symbol that is
 * not a terminal, a `$` before the end, more than MAX_TOKENS tokens.
 */
export function readInput(text: string, g: Grammar): InputReading {
	const read = tokenizeInput(text, [...g.terminals, END_MARKER], {
		nonterminals: g.nonterminals
	});
	const first = read.diagnostics.find((d) => d.severity === 'error');
	if (first) return { tokens: read.tokens, error: first.message };
	const ended = endInput(g, read.tokens);
	if (hasErrors(ended.diagnostics))
		return { tokens: read.tokens, error: ended.diagnostics[0].message };
	const tokens = ended.input.slice(0, -1);
	if (tokens.length > MAX_TOKENS)
		return {
			tokens,
			error: `The token string has ${tokens.length} tokens; at most ${MAX_TOKENS} are parsed.`
		};
	return { tokens, error: null };
}

// ───────────────────────────── in the worker ─────────────────────────────

export interface ParseRequest {
	/** Grammar text without errors. */
	grammar: string;
	/** Token string without errors. */
	input: string;
}

/** A conflict of the LR(1) table and how the table settles it. */
export interface ConflictView {
	state: number;
	terminal: string;
	kind: 'shift/reduce' | 'reduce/reduce';
	/** [X → α•aβ, b] and [Y → γ•, a]; or [X → α•, a] and [Y → β•, a]. */
	items: [ItemView, ItemView];
	/** The action the table holds for it: "shift 4", "reduce E → E + E". */
	chosen: string;
	/** What the action is: "shift", "reduce". */
	chosenKind: LrAction['kind'];
}

/**
 * Why the parser does what it does on a row (Bottom-up Parsing II, slide 16):
 * the state X the DFA is in on the stack, the token tok after the divider,
 * whether X has a transition on tok, and the labels "A → β on …" of X that
 * list tok.
 */
export interface RowDecision {
	state: number;
	token: string;
	/** The state X goes to on tok; null when X has no transition on tok. */
	shift: number | null;
	/** The reductions X is labeled with on tok, in item order. */
	reduces: { production: number; lookaheads: string[] }[];
	/** X is labeled "accept on $" and tok is `$`. */
	accept: boolean;
}

export interface ParseView {
	kind: 'parse';
	grammar: Grammar;
	/** The augmented start symbol: S, or S’ when S is taken. */
	start: string;
	states: number;
	conflicts: ConflictView[];
	/** Conflicts that no declaration settles (all of them: the tool declares no precedence). */
	unresolved: number;
	parse: LrParse;
	/** One per row of `parse`. */
	decisions: RowDecision[];
	/** Null when the parse is not accepted or the input is longer than MAX_HANDLE_TOKENS. */
	handles: HandleStep[] | null;
	/** The rightmost derivation of the parse tree, under the same conditions. */
	derivation: Derivation | null;
	/** The parse was accepted, but the input is too long for the handles to be listed. */
	handlesSkipped: boolean;
}

/** Why there is no parse: an automaton cut off at MAX_STATES, or input the page should not have sent. */
export interface ParseProblem {
	kind: 'problem';
	message: string;
}

export type ParseOutcome = ParseView | ParseProblem;

const itemView = (a: LrAutomaton, item: LrItem): ItemView => {
	const p = a.augmented.productions[item.production];
	return {
		lhs: p.lhs,
		rhs: p.rhs,
		dot: item.dot,
		lookaheads: item.lookahead === null ? [] : [item.lookahead]
	};
};

function conflictViews(a: LrAutomaton, t: LrTable): ConflictView[] {
	return t.conflicts.map((c) => ({
		state: c.state,
		terminal: c.terminal,
		kind: c.kind,
		items: [itemView(a, c.items[0]), itemView(a, c.items[1])],
		chosen: printAction(a.augmented, c.resolution.action, { style: 'long' }),
		chosenKind: c.resolution.action.kind
	}));
}

/** The decision of every row of the parse, read off the automaton. */
function decisionsOf(a: LrAutomaton, parse: LrParse): RowDecision[] {
	return parse.rows.map((row) => {
		const { state, terminal } = row.lookup;
		const s = a.states[state];
		const edge = s?.transitions.find((e) => e.symbol === terminal);
		const reduces = (s?.reduces ?? [])
			.filter((r) => r.lookaheads?.includes(terminal))
			.map((r) => ({ production: r.production, lookaheads: r.lookaheads ?? [] }));
		return {
			state,
			token: terminal,
			shift: edge ? edge.to : null,
			reduces,
			accept: !!s?.accept && terminal === END_MARKER
		};
	});
}

/**
 * Builds the canonical LR(1) automaton and table of the grammar and runs the
 * LR parsing algorithm (Bottom-up Parsing II, slide 21) on the token string.
 * A table with conflicts holds bison's default for each (shift for a
 * shift/reduce conflict, the earlier rule for a reduce/reduce conflict), and
 * the parse follows it.
 */
export function computeParse(request: ParseRequest): ParseOutcome {
	const { grammar: g } = parseGrammar(request.grammar);
	if (!g) return { kind: 'problem', message: 'The grammar has errors.' };
	const input = readInput(request.input, g);
	if (input.error) return { kind: 'problem', message: input.error };
	const a = lr1Automaton(g, { trace: false, maxStates: MAX_STATES });
	if (a.truncated)
		return {
			kind: 'problem',
			message: `The LR(1) automaton of this grammar has more than ${MAX_STATES} states; it is not built.`
		};
	const table = lrTable(a);
	const parse = lrParse(table, input.tokens);
	const accepted = parse.outcome === 'accept' && parse.tree !== null;
	const listed = accepted && input.tokens.length <= MAX_HANDLE_TOKENS;
	return {
		kind: 'parse',
		grammar: g,
		start: a.augmented.start,
		states: a.states.length,
		conflicts: conflictViews(a, table),
		unresolved: table.unresolved,
		parse,
		decisions: decisionsOf(a, parse),
		handles: listed ? handlesFromParse(parse) : null,
		derivation: listed ? derivationFromTree(g, parse.tree!, 'rightmost') : null,
		handlesSkipped: accepted && !listed
	};
}

/** Requests are equal when they would give the same result. */
export function sameRequest(a: ParseRequest | null, b: ParseRequest | null): boolean {
	return !!a && !!b && a.grammar === b.grammar && a.input === b.input;
}
