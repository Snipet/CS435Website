/**
 * What the LL(1) page computes: the grammar and its diagnostics, the order of
 * the table's rows and columns, the analysis (First and Follow, the table, why
 * the grammar is not LL(1), the rewrite) and the parse of a token string.
 *
 * The analysis and the parse run in workers (analysis.worker.ts,
 * parse.worker.ts): their requests are grammar text and plain data, and their
 * results are plain data (objects, arrays and Maps).
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import { hasErrors } from '$lib/theory/diagnostics';
import {
	END_MARKER,
	EPSILON,
	endInput,
	enumerateLanguage,
	firstOfString,
	leftRecursion,
	ll1Parse,
	ll1Table,
	parseGrammar,
	parseTrees,
	printSet,
	printSymbols,
	printTight,
	scanGrammar,
	tokenizeInput,
	type Grammar,
	type LL1Conflict,
	type LL1Parse,
	type LL1Placement,
	type LL1Table
} from '$lib/theory/grammar';
import { rewriteForLL1, type LL1Rewrite } from './rewrite';

// ───────────────────────────── the grammar ─────────────────────────────

const BRACKETS = new Set(['{', '}', '[', ']']);
const QUOTE_CHARS = `"'“”‘’`;

/**
 * The grammar of the text, with the parser's diagnostics and a warning for
 * each bare `{ } [ ]`: the table is built from BNF, where they are terminals
 * (Table-based Predictive Parsing, slide 5: "Avoid EBNF").
 */
export function readGrammar(text: string): { grammar: Grammar | null; diagnostics: Diagnostic[] } {
	const { grammar, diagnostics } = parseGrammar(text);
	const brackets: Diagnostic[] = scanGrammar(text)
		.filter(
			(t) =>
				(t.kind === 'terminal' || t.kind === 'nonterminal') &&
				BRACKETS.has(t.name ?? '') &&
				!QUOTE_CHARS.includes(text[t.span.start])
		)
		.map((t) => ({
			severity: 'warning',
			message: `${t.name} is a terminal here, not EBNF: the table is built from BNF. Quote it, "${t.name}", to keep it a terminal.`,
			span: t.span
		}));
	return {
		grammar,
		diagnostics: [...diagnostics, ...brackets].sort(
			(a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0)
		)
	};
}

// ───────────────────────────── row and column order ─────────────────────────────

export interface Order {
	/** Every symbol once: the ones written first, in that order, then the rest in grammar order. */
	order: string[];
	/** Symbols written that are not among them, each once. */
	skipped: string[];
}

/**
 * The order of a table's rows (non-terminals) or columns (terminals and `$`)
 * from text such as `T E X Y`; '' keeps the order given.
 */
export function readOrder(text: string, symbols: readonly string[]): Order {
	if (text.trim() === '') return { order: [...symbols], skipped: [] };
	const known = new Set(symbols);
	const { tokens } = tokenizeInput(text, symbols);
	const first: string[] = [];
	const skipped: string[] = [];
	for (const t of tokens) {
		if (!known.has(t)) {
			if (!skipped.includes(t)) skipped.push(t);
		} else if (!first.includes(t)) first.push(t);
	}
	return { order: [...first, ...symbols.filter((s) => !first.includes(s))], skipped };
}

/** The symbols as an order field writes them: `int * + ( ) $`. */
export function orderText(symbols: readonly string[]): string {
	return symbols.map((s) => (s === END_MARKER ? s : printSymbols([s]))).join(' ');
}

/** Indices of `table`'s rows and columns in the order of the two fields. */
export function tableOrder(
	table: Pick<LL1Table, 'rows' | 'columns'>,
	rows: string,
	columns: string
): { rows: number[]; columns: number[]; skipped: { rows: string[]; columns: string[] } } {
	const r = readOrder(rows, table.rows);
	const c = readOrder(columns, table.columns);
	return {
		rows: r.order.map((s) => table.rows.indexOf(s)),
		columns: c.order.map((s) => table.columns.indexOf(s)),
		skipped: { rows: r.skipped, columns: c.skipped }
	};
}

// ───────────────────────────── the token string ─────────────────────────────

/** The tokens of the input field, with the first error; a closing `$` is allowed. */
export function readTokens(g: Grammar, text: string): { tokens: string[]; error: string | null } {
	const { tokens, diagnostics } = tokenizeInput(text, [...g.terminals, END_MARKER], {
		nonterminals: g.nonterminals
	});
	const error = diagnostics.find((d) => d.severity === 'error')?.message ?? null;
	if (error) return { tokens, error };
	const ended = endInput(g, tokens);
	if (hasErrors(ended.diagnostics)) return { tokens, error: ended.diagnostics[0]?.message ?? null };
	// The trailing $ is the driver's; the field may have it or not.
	return { tokens: ended.input.slice(0, -1), error: null };
}

// ───────────────────────────── why G is not LL(1) ─────────────────────────────

/** A left-recursive non-terminal with the derivation that shows it: `E →+ E + ( E )`. */
export interface RecursionCause {
	nonterminal: string;
	derivation: string;
}

/** Alternatives of one non-terminal that start with the same symbol and share an entry. */
export interface PrefixCause {
	nonterminal: string;
	prefix: string[];
	productions: number[];
}

export interface Causes {
	conflicts: LL1Conflict[];
	/** Slide 26: "If G is left recursive". */
	leftRecursion: RecursionCause[];
	/** Slide 26: "If G is not left-factored". */
	prefixes: PrefixCause[];
	/** Slide 26: "If G is ambiguous": a short string with two parse trees, if one was found. */
	ambiguous: { tokens: string[] } | null;
	/** Slide 26: "And in other cases as well": entries none of the above accounts for. */
	other: LL1Conflict[];
}

/** Longest sentence searched for a second parse tree. */
export const AMBIGUITY_LENGTH = 8;
/** Sentences searched, shortest first. */
export const AMBIGUITY_SENTENCES = 400;
/** Work limit of the search, in Earley items. */
const AMBIGUITY_STEPS = 2_000_000;

/** A sentence of at most AMBIGUITY_LENGTH tokens with two parse trees, if the search finds one. */
export function findAmbiguity(g: Grammar): { tokens: string[] } | null {
	const { strings } = enumerateLanguage(g, {
		maxLength: AMBIGUITY_LENGTH,
		limit: AMBIGUITY_SENTENCES,
		maxSteps: AMBIGUITY_STEPS
	});
	for (const tokens of strings)
		if (parseTrees(g, tokens, { limit: 2 }).trees.length > 1) return { tokens };
	return null;
}

/** The causes of slide 26 that the conflicts of `table` show. */
export function causesOf(table: LL1Table, opts: { ambiguity?: boolean } = {}): Causes {
	const g = table.grammar;
	const recursive = leftRecursion(g);
	const leftRec: RecursionCause[] = recursive.map((r) => {
		let form = [r.nonterminal];
		for (const id of r.chain) form = [...g.productions[id].rhs, ...form.slice(1)];
		return {
			nonterminal: r.nonterminal,
			derivation: `${printSymbols([r.nonterminal])} →+ ${printSymbols(form)}`
		};
	});
	const prefixes: PrefixCause[] = [];
	for (const n of g.nonterminals) {
		const byFirst = new Map<string, number[]>();
		for (const p of g.productions)
			if (p.lhs === n && p.rhs.length > 0) {
				const group = byFirst.get(p.rhs[0]);
				if (group) group.push(p.id);
				else byFirst.set(p.rhs[0], [p.id]);
			}
		for (const group of byFirst.values()) {
			if (group.length < 2) continue;
			const shared = table.conflicts.some(
				(c) => c.nonterminal === n && c.productions.filter((p) => group.includes(p)).length > 1
			);
			if (!shared) continue;
			const alts = group.map((id) => g.productions[id].rhs);
			let k = 0;
			while (alts.every((a) => k < a.length && a[k] === alts[0][k])) k++;
			prefixes.push({ nonterminal: n, prefix: alts[0].slice(0, k), productions: group });
		}
	}
	const ambiguous = table.ll1 || opts.ambiguity === false ? null : findAmbiguity(g);
	const isRecursive = new Set(recursive.map((r) => r.nonterminal));
	const other = ambiguous
		? []
		: table.conflicts.filter(
				(c) =>
					!isRecursive.has(c.nonterminal) &&
					!prefixes.some(
						(p) =>
							p.nonterminal === c.nonterminal &&
							c.productions.filter((id) => p.productions.includes(id)).length > 1
					)
			);
	return { conflicts: table.conflicts, leftRecursion: leftRec, prefixes, ambiguous, other };
}

// ───────────────────────────── the analysis ─────────────────────────────

export interface AnalysisRequest {
	/** Grammar text without errors. */
	grammar: string;
	/** Names of the rewrite's new non-terminals (see rewriteForLL1). */
	names: Record<string, string>;
}

export interface Analysis {
	/** The table of the grammar, with its First and Follow sets and their steps. */
	table: LL1Table;
	/** Why the grammar is not LL(1); null when it is. */
	causes: Causes | null;
	/** Left recursion removed and common prefixes factored, with the table of the result. */
	rewrite: { result: LL1Rewrite; table: LL1Table };
}

/** Everything the page shows about a grammar; null when the text has errors. */
export function computeAnalysis(request: AnalysisRequest): Analysis | null {
	const { grammar } = parseGrammar(request.grammar);
	if (!grammar) return null;
	const table = ll1Table(grammar);
	const result = rewriteForLL1(grammar, { names: request.names });
	return {
		table,
		causes: table.ll1 ? null : causesOf(table),
		rewrite: { result, table: result.changes.length > 0 ? ll1Table(result.grammar) : table }
	};
}

/** Requests with the same grammar and names are the same request. */
export const analysisKey = (r: AnalysisRequest): string =>
	JSON.stringify([r.grammar, Object.entries(r.names).sort(([a], [b]) => (a < b ? -1 : 1))]);

// ───────────────────────────── the parse ─────────────────────────────

export interface ParseRequest {
	/** Grammar text without errors. */
	grammar: string;
	/** Terminals of that grammar, without the closing `$`. */
	tokens: string[];
}

export interface ParseResult {
	/** The table the parse used. */
	table: LL1Table;
	parse: LL1Parse;
}

/** ll1Parse of the tokens with the grammar's table; null when the text has errors. */
export function computeParse(request: ParseRequest): ParseResult | null {
	const { grammar } = parseGrammar(request.grammar);
	if (!grammar) return null;
	const table = ll1Table(grammar);
	return { table, parse: ll1Parse(table, request.tokens) };
}

export const sameParse = (a: ParseRequest | null, b: ParseRequest | null): boolean =>
	!!a &&
	!!b &&
	a.grammar === b.grammar &&
	a.tokens.length === b.tokens.length &&
	a.tokens.every((t, i) => t === b.tokens[i]);

// ───────────────────────────── a table entry ─────────────────────────────

/** `Y → * T` */
export const productionText = (g: Grammar, id: number): string =>
	`${printSymbols([g.productions[id].lhs])} → ${printSymbols(g.productions[id].rhs)}`;

/** `[E, int]`, as slides 8–9 name an entry. */
export const entryName = (nonterminal: string, terminal: string): string =>
	`[${printSymbols([nonterminal])}, ${printSymbols([terminal])}]`;

/** A First or Follow set a placement uses, for highlighting. */
export interface SetRef {
	kind: 'first' | 'follow';
	symbol: string;
}

export interface EntryView {
	name: string;
	kind: 'blank' | 'filled' | 'conflict';
	/** Slide 25's words: `Y → * T in columns of First( *T ) = { * }`; for a blank entry, why nothing is there. */
	lines: string[];
	/** The sets the lines use. */
	sets: SetRef[];
}

/** The sets behind a placement: First of α up to its first symbol that does not derive ε, or Follow(A). */
function setsOf(table: LL1Table, placement: LL1Placement): SetRef[] {
	const p = table.grammar.productions[placement.production];
	if (placement.rule === 'follow') return [{ kind: 'follow', symbol: p.lhs }];
	const out: SetRef[] = [];
	for (const x of p.rhs) {
		out.push({ kind: 'first', symbol: x });
		if (!(table.firstFollow.first.get(x) ?? [x]).includes(EPSILON)) break;
	}
	return out;
}

/** Why T[A, b] holds what it holds, in the words of Table-based Predictive Parsing, slide 25. */
export function entryView(table: LL1Table, row: number, column: number): EntryView {
	const g = table.grammar;
	const a = table.rows[row];
	const b = table.columns[column];
	const cell = table.cells[row][column];
	const name = entryName(a, b);
	if (cell.productions.length === 0) {
		const shown = printSymbols([b]);
		const follow = table.firstFollow.follow.get(a) ?? [];
		const lines = g.productions
			.filter((p) => p.lhs === a)
			.map((p) => {
				const first = firstOfString(table.firstFollow, g, p.rhs);
				const parts: string[] = [];
				if (p.rhs.length > 0)
					parts.push(`${shown} ∉ First( ${printTight(p.rhs)} ) = ${printSet(first)}`);
				if (first.includes(EPSILON))
					parts.push(`${shown} ∉ Follow( ${printSymbols([a])} ) = ${printSet(follow)}`);
				return `${productionText(g, p.id)}: ${parts.join(', and ')}`;
			});
		return { name, kind: 'blank', lines, sets: [] };
	}
	return {
		name,
		kind: cell.productions.length > 1 ? 'conflict' : 'filled',
		lines: cell.placements.map((p) => `${productionText(g, p.production)} ${p.text}`),
		sets: cell.placements.flatMap((p) => setsOf(table, p))
	};
}
