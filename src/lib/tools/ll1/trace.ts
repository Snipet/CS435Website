/**
 * The parse of the LL(1) page, one row of the Stack | Input | Action trace
 * (Table-based Predictive Parsing, slide 12) at a time: the words for the
 * row, the input pointer, the marks on the growing parse tree (slides 14–17:
 * the matched prefix, the current non-terminal and the next token) and the
 * window of rows the trace table shows.
 */
import type { TreeHighlight } from '$lib/components/grammar';
import type { HighlightRange } from '$lib/components/ui';
import {
	END_MARKER,
	printSymbols,
	type Grammar,
	type LL1Parse,
	type LL1Row,
	type LL1Table,
	type ParseNode
} from '$lib/theory/grammar';

/** Rows of the trace table shown at once; earlier rows are left out of a longer run. */
export const TRACE_WINDOW = 200;

/** The rows `[start, end)` the trace table shows when row `index` is current. */
export function traceWindow(
	total: number,
	index: number,
	size = TRACE_WINDOW
): { start: number; end: number } {
	const end = Math.min(total, Math.max(0, index) + 1);
	return { start: Math.max(0, end - size), end };
}

/** A string of symbols as a row writes it: `int Y X $`. */
export const symbolsText = (symbols: readonly string[]): string =>
	symbols.map((s) => (s === END_MARKER ? s : printSymbols([s]))).join(' ');

/** Symbols a Stack or Input cell of the trace shows before it leaves some out. */
export const CELL_SYMBOLS = 12;

/**
 * A stack or input as a trace cell shows it. A long one keeps its first
 * `keep` symbols (the top of the stack, the next tokens) and its last one
 * (`$`), and says how many it leaves out between them: `E + ( E ) … $`.
 */
export function clipSymbols(
	symbols: readonly string[],
	keep = CELL_SYMBOLS
): { head: string; left: number; tail: string } {
	// Leaving out one or two symbols saves no room.
	if (symbols.length <= keep + 3) return { head: symbolsText(symbols), left: 0, tail: '' };
	return {
		head: symbolsText(symbols.slice(0, keep)),
		left: symbols.length - keep - 1,
		tail: symbolsText(symbols.slice(-1))
	};
}

/** Index of the next token: the tokens before it have been matched. */
export const pointerOf = (tokenCount: number, row: LL1Row): number =>
	Math.max(0, tokenCount + 1 - row.input.length);

/** The token stream's marks: the matched prefix β and the next token b. */
export function streamHighlights(tokenCount: number, row: LL1Row): HighlightRange[] {
	const next = pointerOf(tokenCount, row);
	const out: HighlightRange[] = [];
	if (next > 0) out.push({ start: 0, end: next, tone: 'accept', muted: true });
	const tone = row.action.kind === 'blank' || row.action.kind === 'mismatch' ? 'reject' : 'active';
	out.push({ start: next, end: next + 1, tone });
	return out;
}

/** Paths of the terminal leaves of `tree` that have been matched (they have a token range). */
function matchedLeaves(tree: ParseNode): number[][] {
	const out: number[][] = [];
	const open: [ParseNode, number[]][] = [[tree, []]];
	while (open.length > 0) {
		const [node, path] = open.pop()!;
		if (node.terminal) {
			if (node.start !== undefined) out.push(path);
			continue;
		}
		for (let i = node.children.length - 1; i >= 0; i--) open.push([node.children[i], [...path, i]]);
	}
	return out;
}

/** Marks on the tree of row `index`: the node on top of the stack, the children just added, the matched leaves. */
export function treeMarks(parse: LL1Parse, index: number): TreeHighlight {
	const row = parse.rows[index];
	if (!row) return {};
	const previous = parse.rows[index - 1];
	const fresh =
		previous?.action.kind === 'expand' && previous.focus
			? childPaths(row.tree, previous.focus)
			: [];
	return {
		current: row.focus && row.action.kind !== 'accept' ? [row.focus] : [],
		fresh,
		matched: matchedLeaves(row.tree)
	};
}

function childPaths(tree: ParseNode, path: readonly number[]): number[][] {
	let node: ParseNode | undefined = tree;
	for (const i of path) node = node?.children[i];
	return (node?.children ?? []).map((_, i) => [...path, i]);
}

/** What the row does, in words. */
export function rowMessage(g: Grammar, row: LL1Row): string {
	const a = row.action;
	const next = row.input[0] ?? END_MARKER;
	switch (a.kind) {
		case 'expand': {
			const p = g.productions[a.production];
			const top = printSymbols([p.lhs]);
			const entry = `T[${top}, ${printSymbols([next])}] = ${printSymbols(p.rhs)}`;
			return p.rhs.length === 0
				? `${entry}: ${top} is popped.`
				: `${entry}: ${top} is replaced by ${printSymbols(p.rhs)}.`;
		}
		case 'match':
			return `${printSymbols([a.terminal])} on top is the next token: it is popped and the input advances.`;
		case 'accept':
			return 'End of input, and only $ is left on the stack: ACCEPT.';
		case 'blank':
			return `T[${printSymbols([a.nonterminal])}, ${printSymbols([a.terminal])}] is blank: error.`;
		case 'mismatch':
			return `${printSymbols([a.expected])} is on top, but the next token is ${printSymbols([a.found])}: error.`;
		case 'limit':
			return `The run ${row.text}.`;
	}
}

/** The Action column, as slide 12 writes it. */
export const actionText = (row: LL1Row): string => row.text;

/** Whether a row of the run took the first production of a multiply-defined entry. */
export const usesConflict = (table: LL1Table, parse: LL1Parse): boolean =>
	parse.rows.some(
		(r) =>
			r.action.kind === 'expand' &&
			r.cell !== null &&
			table.cells[r.cell.row][r.cell.column].productions.length > 1
	);

/**
 * Whether the run ends in a loop. Since the last match the next token is the
 * same; when a non-terminal is on top again below a node of the same
 * non-terminal it expanded in that time (A →+ A γ, no token matched), the
 * parser takes the same productions from then on, for ever.
 */
export function loops(parse: LL1Parse): boolean {
	const rows = parse.rows;
	const end = rows[rows.length - 1]?.focus;
	if (!end) return false;
	const seen = new Set<string>();
	for (let i = rows.length - 1; i >= 0; i--) {
		const r = rows[i];
		if (i < rows.length - 1 && r.action.kind !== 'expand') break;
		// Only the nodes above the last row's node.
		const path = r.focus;
		if (!path || path.length > end.length || path.some((x, k) => end[k] !== x)) continue;
		if (seen.has(r.stack[0])) return true;
		seen.add(r.stack[0]);
	}
	return false;
}

/**
 * What the run comes to, shown under the trace at its last row. The row's own
 * words are in the step caption, so this says only what follows from them.
 */
export function verdict(
	table: LL1Table,
	parse: LL1Parse
): { tone: 'success' | 'error' | 'warn'; title: string; text: string } {
	switch (parse.outcome) {
		case 'accept':
			return { tone: 'success', title: 'ACCEPT', text: 'The token string is in L(G).' };
		case 'error':
			return {
				tone: 'error',
				title: 'Error',
				text: usesConflict(table, parse)
					? 'The parser took the first production of a multiply-defined entry, so the token string may still be in L(G).'
					: 'The token string is not in L(G).'
			};
		case 'limit':
			return loops(parse)
				? {
						tone: 'warn',
						title: 'The parser loops',
						text: 'It takes the same productions again and again without matching a token: G is left recursive.'
					}
				: {
						tone: 'warn',
						title: 'Not finished',
						text: 'The token string is too long or too deeply nested for the parse to finish.'
					};
	}
}
