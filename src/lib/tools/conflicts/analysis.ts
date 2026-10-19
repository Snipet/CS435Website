/**
 * Everything the page shows that takes a parsing table: the LR(1) automaton
 * and table of Bottom-up Parsing III with the precedence declarations, its
 * conflicts and how each is settled, the parse of the token string as
 * resolved and with other actions chosen, bison's report for the LALR(1)
 * automaton, and the grammar's classes. The C- grammar has a few hundred
 * LR(1) states, so the page runs this in a Web Worker (WorkerTask); the
 * request and the result are plain data.
 */
import type { ItemView } from '$lib/components/grammar/lr-item';
import { unproductive, unreachable } from '$lib/theory/grammar/analyze';
import { treeEquals } from '$lib/theory/grammar/derive';
import { lalr1Automaton, lr1Automaton, DEFAULT_MAX_STATES } from '$lib/theory/grammar/lr';
import { grammarClasses } from '$lib/theory/grammar/lr-classes';
import { lrParse, type LrParse } from '$lib/theory/grammar/lr-parse';
import { lrTable, readPrecedence } from '$lib/theory/grammar/lr-table';
import { parseGrammar, tokenizeInput } from '$lib/theory/grammar/parse';
import { END_MARKER, type ParseNode } from '$lib/theory/grammar/types';
import { bisonReport, type BisonReport } from './bison-report';
import { classesView, type ClassesView } from './classes';
import {
	conflictContext,
	itemView,
	moveOf,
	shortestPaths,
	type ConflictContext,
	type Move
} from './context';
import { effectiveChoices, looksUp, overrideTable, type Choice } from './override';
import { readPrecedenceText } from './precedence';
import { explain, type Explanation } from './resolution';

/** Conflicts described in full; a grammar with more lists them by number only. */
export const MAX_CONFLICTS = 200;

export interface AnalysisRequest {
	/** Grammar text in lecture notation. */
	grammar: string;
	/** Precedence declarations, one per line (precedence.ts). */
	precedence: string;
	/** Token string to parse; '' for none. */
	input: string;
	/** [conflict, action]: the alternative parse puts that action of that conflict in its entry. */
	choices: [number, 0 | 1][];
}

export interface ConflictView {
	/** Index in the table's conflicts (and in `choices`). */
	index: number;
	state: number;
	terminal: string;
	kind: 'shift/reduce' | 'reduce/reduce';
	/** [X → α•aβ, b] and [Y → γ•, a]; or [X → α•, a] and [Y → β•, a]. */
	items: [ItemView, ItemView];
	/** What each of the two actions does from the conflict's stack. */
	moves: [Move, Move];
	explanation: Explanation;
	context: ConflictContext;
	/** Its state in Parser.output (bison's LALR(1) numbering). */
	bisonState: number;
	/** The parse of the input looks its entry up: as resolved, and with the choices (null: no choices). */
	used: boolean | null;
	usedAlternative: boolean | null;
}

export interface ParseView {
	outcome: LrParse['outcome'];
	tree: ParseNode | null;
	/** Rows of the LR parse. */
	steps: number;
	/** The last row: "accept", "error: action[3, $] is blank", "stopped after 20000 steps". */
	text: string;
	/** Index (into the input with its $) of the token the parse stopped at; null when accepted. */
	at: number | null;
}

export type AnalysisResult =
	/** The grammar has errors. */
	| { status: 'none' }
	| { status: 'too-large'; message: string }
	| {
			status: 'done';
			/** The augmented start symbol: S, or S’ when S is taken. */
			start: string;
			states: number;
			lalrStates: number;
			conflicts: ConflictView[];
			/** All of the table's conflicts, also those beyond MAX_CONFLICTS. */
			conflictCount: number;
			/** bison's summary of the LR(1) table: "State 5 conflicts: 2 shift/reduce". */
			summary: string[];
			/** Conflicts no declaration settles, as bison counts them, and those precedence settles. */
			unresolved: { sr: number; rr: number };
			resolved: number;
			/** The input's tokens (no $); null when there is no input or it does not read. */
			tokens: string[] | null;
			parse: ParseView | null;
			/** The parse with `choices`; null when no choice changes an entry. */
			alternative: ParseView | null;
			/**
			 * How the other parse compares: `same` both accept with one tree;
			 * `lookedUp` it looks up an entry the choices change.
			 */
			comparison: { same: boolean; lookedUp: boolean } | null;
			/** The choices that change an entry. */
			choices: [number, 0 | 1][];
			report: BisonReport;
			classes: ClassesView;
			/** Non-terminals that bison would remove before building its parser. */
			useless: string[];
	  };

function parseView(p: LrParse): ParseView {
	const last = p.rows[p.rows.length - 1];
	return {
		outcome: p.outcome,
		tree: p.tree,
		steps: p.rows.length,
		text: last?.text ?? 'error: the input does not read',
		at: p.outcome === 'accept' ? null : (last?.j ?? null)
	};
}

const countBy = (lines: { kind: string }[]) => ({
	sr: lines.filter((c) => c.kind === 'shift/reduce').length,
	rr: lines.filter((c) => c.kind === 'reduce/reduce').length
});

/** The analysis of a request; see the module comment. */
export function analyze(request: AnalysisRequest): AnalysisResult {
	const g = parseGrammar(request.grammar).grammar;
	if (!g) return { status: 'none' };
	const { declarations } = readPrecedenceText(request.precedence, g);
	const lr1 = lr1Automaton(g, { trace: false, maxStates: DEFAULT_MAX_STATES });
	if (lr1.truncated)
		return {
			status: 'too-large',
			message: `The LR(1) automaton has more than ${DEFAULT_MAX_STATES} states; this page stops there.`
		};
	const aug = lr1.augmented;
	const table = lrTable(lr1, { precedence: declarations });
	const lalr = lalr1Automaton(lr1);
	const report = bisonReport(lalr, declarations);
	const lalrOf: number[] = [];
	for (const s of lalr.states) for (const m of s.merged ?? [s.id]) lalrOf[m] = s.id;
	const { terminals } = readPrecedence(g, declarations);
	const paths = shortestPaths(lr1);

	// The token string, without a closing $ (lrParse adds it; the Earley parser must not see it).
	let tokens: string[] | null = null;
	if (request.input.trim() !== '') {
		const read = tokenizeInput(request.input, [...g.terminals, END_MARKER], {
			nonterminals: g.nonterminals
		});
		if (!read.diagnostics.some((d) => d.severity === 'error')) {
			tokens = read.tokens;
			if (tokens[tokens.length - 1] === END_MARKER && !g.terminals.includes(END_MARKER))
				tokens = tokens.slice(0, -1);
		}
	}

	const choices: Choice[] = effectiveChoices(
		table.conflicts,
		request.choices.map(([conflict, action]) => ({ conflict, action }))
	);
	const parse = tokens ? lrParse(table, tokens) : null;
	const alternative =
		tokens && choices.length > 0
			? lrParse(overrideTable(table, table.conflicts, choices), tokens)
			: null;

	const conflicts: ConflictView[] = table.conflicts.slice(0, MAX_CONFLICTS).map((c, index) => {
		const context = conflictContext(lr1, c, paths[c.state]);
		return {
			index,
			state: c.state,
			terminal: c.terminal,
			kind: c.kind,
			items: [itemView(aug, c.items[0]), itemView(aug, c.items[1])],
			moves: [
				moveOf(aug, context.stack, c.terminal, c.actions[0]),
				moveOf(aug, context.stack, c.terminal, c.actions[1])
			],
			explanation: explain(aug, c, terminals),
			context,
			bisonState: report.numberOf[lalrOf[c.state]],
			used: parse ? looksUp(parse, c.state, c.terminal) : null,
			usedAlternative: alternative ? looksUp(alternative, c.state, c.terminal) : null
		};
	});

	// bison's summary: the conflicts no declaration settles, per state.
	const summary: string[] = [];
	const unsettled = table.conflicts.filter((c) => c.resolution.by === 'default');
	for (const state of [...new Set(unsettled.map((c) => c.state))].sort((a, b) => a - b)) {
		const { sr, rr } = countBy(unsettled.filter((c) => c.state === state));
		summary.push(
			`State ${state} conflicts: ${[sr ? `${sr} shift/reduce` : '', rr ? `${rr} reduce/reduce` : '']
				.filter(Boolean)
				.join(', ')}`
		);
	}

	const classes = classesView(g, grammarClasses(g, { tokens: tokens ?? undefined }));
	return {
		status: 'done',
		start: aug.start,
		states: lr1.states.length,
		lalrStates: lalr.states.length,
		conflicts,
		conflictCount: table.conflicts.length,
		summary,
		unresolved: countBy(unsettled),
		resolved: table.conflicts.length - unsettled.length,
		tokens,
		parse: parse ? parseView(parse) : null,
		alternative: alternative ? parseView(alternative) : null,
		comparison:
			parse && alternative
				? {
						same: !!parse.tree && !!alternative.tree && treeEquals(parse.tree, alternative.tree),
						lookedUp: choices.some((c) => {
							const conflict = table.conflicts[c.conflict];
							return looksUp(alternative, conflict.state, conflict.terminal);
						})
					}
				: null,
		choices: choices.map((c) => [c.conflict, c.action]),
		report,
		classes,
		useless: [...new Set([...unreachable(g), ...unproductive(g)])]
	};
}

/** Two requests are the same request. */
export const sameRequest = (a: AnalysisRequest | null, b: AnalysisRequest | null): boolean =>
	a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
