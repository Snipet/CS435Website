/**
 * Everything the page shows for one grammar text and one token string: the
 * parsed inputs with their diagnostics, the left recursion of the grammar,
 * the two runs, and the rows that compare them.
 *
 * Both runs are bounded by a step budget, so this is computed on the page for
 * every keystroke.
 */
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	leftRecursion,
	parseGrammar,
	printSymbols,
	recognizes,
	tokenizeInput,
	type Grammar
} from '$lib/theory/grammar';
import { DEFAULT_DEPTH_CAP, backtrack, type BacktrackResult } from './backtrack';
import { generateProgram, runLimited, type LimitedResult, type Program } from './limited';

/** Longest token string that is checked against L(G) for the summary. */
export const MAX_TOKENS_CHECKED = 200;

/** One left-recursive non-terminal V, with the productions of V →+ V α. */
export interface LeftRecursionNote {
	nonterminal: string;
	/** Some production is V → V α. */
	immediate: boolean;
	/** The productions of the derivation, as text: `S → S 0`, or `S → A a` then `A → S b`. */
	productions: string[];
}

export interface Run {
	grammarText: string;
	inputText: string;
	grammar: Grammar;
	tokens: string[];
	leftRecursion: LeftRecursionNote[];
	/** The grammar is left-recursive and was not run. */
	refused: boolean;
	/** The cap both runs used; null when the grammar is not left-recursive. */
	depthCap: number | null;
	backtracking: BacktrackResult | null;
	program: Program;
	limited: LimitedResult | null;
	/** Whether the token string is a sentence of the grammar; null when it was not checked. */
	inLanguage: boolean | null;
}

export interface Analysis {
	grammar: Grammar | null;
	grammarDiagnostics: Diagnostic[];
	tokens: string[];
	inputDiagnostics: Diagnostic[];
	/** Null while the grammar or the token string has an error. */
	run: Run | null;
}

export interface AnalyzeOptions {
	/** Run a left-recursive grammar, with `depthCap`. */
	anyway?: boolean;
	depthCap?: number;
	maxSteps?: number;
}

const productionText = (g: Grammar, id: number): string => {
	const p = g.productions[id];
	return `${printSymbols([p.lhs])} → ${printSymbols(p.rhs)}`;
};

/** The left-recursive non-terminals of `g`, in grammar order (Top-Down Parsing, slides 23 and 27). */
export function leftRecursionNotes(g: Grammar): LeftRecursionNote[] {
	return leftRecursion(g).map((l) => ({
		nonterminal: l.nonterminal,
		immediate: l.immediate,
		productions: l.chain.map((id) => productionText(g, id))
	}));
}

export function analyze(
	grammarText: string,
	inputText: string,
	opts: AnalyzeOptions = {}
): Analysis {
	const parsed = parseGrammar(grammarText);
	const g = parsed.grammar;
	if (!g)
		return {
			grammar: null,
			grammarDiagnostics: parsed.diagnostics,
			tokens: [],
			inputDiagnostics: [],
			run: null
		};
	const input = tokenizeInput(inputText, g.terminals, { nonterminals: g.nonterminals });
	const analysis: Analysis = {
		grammar: g,
		grammarDiagnostics: parsed.diagnostics,
		tokens: input.tokens,
		inputDiagnostics: input.diagnostics,
		run: null
	};
	if (hasErrors(input.diagnostics)) return analysis;

	const notes = leftRecursionNotes(g);
	const refused = notes.length > 0 && !opts.anyway;
	const depthCap = notes.length > 0 ? (opts.depthCap ?? DEFAULT_DEPTH_CAP) : null;
	const program = generateProgram(g);
	const limits = { depthCap, ...(opts.maxSteps === undefined ? {} : { maxSteps: opts.maxSteps }) };
	analysis.run = {
		grammarText,
		inputText,
		grammar: g,
		tokens: input.tokens,
		leftRecursion: notes,
		refused,
		depthCap,
		backtracking: refused ? null : backtrack(g, input.tokens, limits),
		program,
		limited: refused ? null : runLimited(program, input.tokens, limits),
		inLanguage: input.tokens.length <= MAX_TOKENS_CHECKED ? recognizes(g, input.tokens) : null
	};
	return analysis;
}

export type Verdict = 'accept' | 'reject' | 'stopped' | 'not-run';

/** One parser's line of the summary. */
export interface SummaryRow {
	parser: 'backtracking' | 'functions';
	verdict: Verdict;
	/** A few words after the verdict: why it stopped, or that input was left over. */
	note: string | null;
	/** Productions tried; null when the parser did not run. */
	tried: number | null;
	/** Times the parser went back: failures of the backtracking parser, `next = save` of the functions. */
	backtracks: number | null;
}

const stopNote = (stop: { reason: 'depth' | 'steps'; limit: number } | null): string | null =>
	!stop
		? null
		: stop.reason === 'depth'
			? `depth cap of ${stop.limit}`
			: `after ${stop.limit} steps`;

/** Both parsers on the current input: accepted or rejected, productions tried, backtracks. */
export function summarize(run: Run): SummaryRow[] {
	const b = run.backtracking;
	const f = run.limited;
	return [
		{
			parser: 'backtracking',
			verdict: !b ? 'not-run' : b.outcome,
			note: b ? stopNote(b.stop) : null,
			tried: b?.tries ?? null,
			backtracks: b?.backtracks ?? null
		},
		{
			parser: 'functions',
			verdict: !f ? 'not-run' : f.outcome,
			note: !f ? null : f.leftover.length > 0 ? 'input left over' : stopNote(f.stop),
			tried: f?.tried ?? null,
			backtracks: f?.restores ?? null
		}
	];
}

/**
 * True when the bool functions reject a sentence of the grammar: the
 * limitation of slide 33 ("Cannot backtrack once a production is successful").
 */
export function showsLimitation(run: Run): boolean {
	return run.inLanguage === true && run.limited?.outcome === 'reject';
}
