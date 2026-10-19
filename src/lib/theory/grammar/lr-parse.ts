/**
 * The LR parsing algorithm of Bottom-up Parsing II, slide 21, and the
 * shift-reduce trace of slides 4–14 that it reproduces.
 *
 *   Let I = w $; let j = 0; let stack = < dummy, 0 >
 *   repeat case action[top_state(stack), I[j]] of
 *     shift k: push < I[j++], k >
 *     reduce X → α: pop |α| pairs, push < X, Goto[top_state(stack), X] >
 *     accept: halt normally
 *     error: halt and report error
 *
 * Each row also carries the parse forest: the subtrees of the symbols on the
 * stack, which share their parts with the rows before.
 */
import type { Diagnostic } from '../diagnostics';
import { DEFAULT_PARSE_STEPS, PARSE_STACK_BUDGET, endInput } from './ll1';
import { printProduction } from './lr';
import type { LrAction, LrTable } from './lr-table';
import { printSymbols } from './parse';
import { END_MARKER, EPSILON, type Grammar, type ParseNode } from './types';

/** The symbol of the bottom pair < dummy, 0 >. */
export const STACK_BOTTOM = 'dummy';

/** A pair < sym, state >; `symbol` is null for the bottom pair < dummy, 0 >. */
export interface LrStackEntry {
	symbol: string | null;
	state: number;
}

export interface LrParseRow {
	/** The stack before the action, bottom first: < dummy, 0 > … */
	stack: LrStackEntry[];
	/** The index of the next token: I[j]. */
	j: number;
	/** The lookup action[top_state(stack), I[j]]. */
	lookup: { state: number; terminal: string };
	/** The entry found; null when it is blank. */
	action: LrAction | null;
	/** reduce: the |α| pairs popped, bottom first. */
	popped: LrStackEntry[];
	/** reduce: the lookup Goto[top_state(stack), X] after the pops; `to` null when it is blank. */
	goto: { state: number; nonterminal: string; to: number | null } | null;
	/** The pair pushed: < I[j], k > or < X, Goto[…] >. */
	pushed: LrStackEntry | null;
	/** The subtrees of the stack's symbols after the action, bottom first. */
	forest: ParseNode[];
	/** "shift 1", "reduce E → int", "accept", "error: action[3, int] is blank". */
	text: string;
}

export interface LrParse {
	grammar: Grammar;
	/** I = w $ */
	input: string[];
	rows: LrParseRow[];
	outcome: 'accept' | 'error' | 'limit';
	/** The parse tree, with token ranges, when the input is accepted. */
	tree: ParseNode | null;
	diagnostics: Diagnostic[];
}

/**
 * Runs the LR parsing algorithm (Bottom-up Parsing II, slide 21) with the
 * table on `tokens` (without or with the closing `$`). A table with
 * conflicts holds the action each conflict was resolved to, so the parser
 * does what bison's would. Stops with outcome 'limit' after `maxSteps` rows
 * (default DEFAULT_PARSE_STEPS) or PARSE_STACK_BUDGET stack entries. A table
 * without conflicts gets there only when it reduces without lookaheads: the
 * LR(0) table of a grammar with a non-terminal that derives nothing
 * (S → A S b ; A → ε) reduces A → ε for ever.
 */
export function lrParse(
	table: LrTable,
	tokens: readonly string[],
	opts?: { maxSteps?: number }
): LrParse {
	const aug = table.augmented;
	const g = aug.grammar;
	const { input, diagnostics } = endInput(g, tokens);
	if (input.length === 0)
		return { grammar: g, input, rows: [], outcome: 'error', tree: null, diagnostics };
	const maxSteps = Math.max(1, Math.floor(opts?.maxSteps ?? DEFAULT_PARSE_STEPS));
	const columnOf = new Map(table.terminals.map((t, i) => [t, i]));
	const gotoColumnOf = new Map(table.nonterminals.map((n, i) => [n, i]));
	// A pair is made once and shared by every row whose stack holds it.
	const stack: { pair: LrStackEntry; tree: ParseNode | null }[] = [
		{ pair: { symbol: null, state: 0 }, tree: null }
	];
	const rows: LrParseRow[] = [];
	const pairs = (): LrStackEntry[] => stack.map((e) => e.pair);
	const forest = (): ParseNode[] => stack.slice(1).map((e) => e.tree!);
	let j = 0;
	let cells = 0;
	for (;;) {
		const top = stack[stack.length - 1].pair.state;
		const t = input[j];
		const lookup = { state: top, terminal: t };
		const before = pairs();
		const at = j;
		const row = (
			action: LrAction | null,
			text: string,
			extra?: Partial<Pick<LrParseRow, 'popped' | 'goto' | 'pushed'>>
		): void => {
			rows.push({
				stack: before,
				j: at,
				lookup,
				action,
				popped: extra?.popped ?? [],
				goto: extra?.goto ?? null,
				pushed: extra?.pushed ?? null,
				forest: forest(),
				text
			});
		};
		cells += stack.length;
		if (rows.length === maxSteps - 1 || cells > PARSE_STACK_BUDGET) {
			row(null, `stopped after ${rows.length} steps`);
			return { grammar: g, input, rows, outcome: 'limit', tree: null, diagnostics };
		}
		const c = columnOf.get(t);
		const action = c === undefined ? null : table.action[top][c];
		if (action === null || action.kind === 'error') {
			row(
				action,
				`error: action[${top}, ${printSymbols([t])}] is ${action ? 'an error entry' : 'blank'}`
			);
			return { grammar: g, input, rows, outcome: 'error', tree: null, diagnostics };
		}
		if (action.kind === 'accept') {
			row(action, 'accept');
			const tree = stack.length === 2 ? stack[1].tree : null;
			return { grammar: g, input, rows, outcome: 'accept', tree, diagnostics };
		}
		if (action.kind === 'shift') {
			const pushed = { symbol: t, state: action.state };
			stack.push({
				pair: pushed,
				tree: { symbol: t, terminal: true, children: [], start: j, end: j + 1 }
			});
			j++;
			row(action, `shift ${action.state}`, { pushed });
			continue;
		}
		const p = aug.productions[action.production];
		const popped = stack.splice(stack.length - p.rhs.length);
		const below = stack[stack.length - 1].pair.state;
		const gc = gotoColumnOf.get(p.lhs);
		const to = gc === undefined ? null : table.goto[below][gc];
		const goto = { state: below, nonterminal: p.lhs, to };
		const poppedPairs = popped.map((e) => e.pair);
		if (to === null) {
			stack.push(...popped);
			row(action, `error: Goto[${below}, ${printSymbols([p.lhs])}] is blank`, {
				popped: poppedPairs,
				goto
			});
			return { grammar: g, input, rows, outcome: 'error', tree: null, diagnostics };
		}
		const children = popped.map((e) => e.tree!);
		const pushed = { symbol: p.lhs, state: to };
		stack.push({
			pair: pushed,
			tree: {
				symbol: p.lhs,
				terminal: false,
				children,
				production: p.id,
				start: children[0]?.start ?? j,
				end: children[children.length - 1]?.end ?? j
			}
		});
		row(action, `reduce ${printProduction(p)}`, { popped: poppedPairs, goto, pushed });
	}
}

/** The stack as slide 20 writes it: `< dummy, 0 > < E, 2 > < +, 3 >`. */
export function printStack(stack: readonly LrStackEntry[]): string {
	return stack
		.map((e) => `< ${e.symbol === null ? STACK_BOTTOM : printSymbols([e.symbol])}, ${e.state} >`)
		.join(' ');
}

// ───────────────────────────── the shift-reduce trace ─────────────────────────────

/** One row of the shift-reduce trace of Bottom-up Parsing II, slides 4–14. */
export interface ShiftReduceRow {
	/** The symbols left of the divider: the stack's symbols. */
	stack: string[];
	/** The tokens right of the divider, ending in `$`. */
	input: string[];
	/** 'limit': the run stopped at its step limit here. */
	action: 'shift' | 'reduce' | 'accept' | 'error' | 'limit';
	/** reduce: the production. */
	production: number | null;
	/** shift: the number of tokens shifted (collapseShifts merges rows); 1 otherwise. */
	count: number;
	/** "shift", "shift 3 times", "red. E → int", "accept", "error", "stopped". */
	text: string;
	/** The rows of the LrParse this row stands for. */
	rows: number[];
}

/**
 * The parse as the shift-reduce trace of Bottom-up Parsing II, slides 4–14:
 * each row is the configuration "stack I input" before its action. Reduce
 * actions are written `red. E → E + (E)` (printCompact).
 */
export function shiftReduceRows(parse: LrParse): ShiftReduceRow[] {
	return parse.rows.map((row, k) => {
		const base = {
			stack: row.stack.slice(1).map((e) => e.symbol!),
			input: parse.input.slice(row.j),
			production: null,
			count: 1,
			rows: [k]
		};
		const a = row.action;
		if (a?.kind === 'shift') return { ...base, action: 'shift', text: 'shift' };
		if (a?.kind === 'accept') return { ...base, action: 'accept', text: 'accept' };
		if (a?.kind === 'reduce' && row.goto?.to !== null) {
			const p = parse.grammar.productions[a.production];
			return {
				...base,
				action: 'reduce',
				production: p.id,
				text: `red. ${printSymbols([p.lhs])} → ${printCompact(p.rhs)}`
			};
		}
		if (parse.outcome === 'limit' && k === parse.rows.length - 1)
			return { ...base, action: 'limit', text: 'stopped' };
		return { ...base, action: 'error', text: 'error' };
	});
}

/** Consecutive shifts as one row, "shift 3 times" (Bottom-up Parsing II, slide 14). */
export function collapseShifts(rows: readonly ShiftReduceRow[]): ShiftReduceRow[] {
	const out: ShiftReduceRow[] = [];
	for (const row of rows) {
		const last = out[out.length - 1];
		if (row.action === 'shift' && last?.action === 'shift') {
			const count = last.count + row.count;
			out[out.length - 1] = {
				...last,
				count,
				text: `shift ${count} times`,
				rows: [...last.rows, ...row.rows]
			};
		} else out.push({ ...row, rows: [...row.rows] });
	}
	return out;
}

/**
 * Symbols the way Bottom-Up Parsing and Bottom-up Parsing II write sentential
 * forms: spaced, but tight inside parentheses and before the end marker:
 * `int + (int) + (int)$`, `E + (E)`. `ε` for the empty string.
 */
export function printCompact(symbols: readonly string[]): string {
	if (symbols.length === 0) return EPSILON;
	let out = printSymbols([symbols[0]]);
	for (let i = 1; i < symbols.length; i++) {
		const tight = symbols[i - 1] === '(' || symbols[i] === ')' || symbols[i] === END_MARKER;
		out += (tight ? '' : ' ') + printSymbols([symbols[i]]);
	}
	return out;
}

/**
 * A configuration "stack I input" (Bottom-up Parsing II, slide 2): the stack's
 * symbols, the divider, the remaining input. `compact` (default true) writes
 * both sides as printCompact does, as on slide 14: `E + (int I ) + (int)$`;
 * otherwise every symbol is spaced. `divider` defaults to `I`, the slides'
 * red bar.
 */
export function printConfiguration(
	stack: readonly string[],
	input: readonly string[],
	opts?: { compact?: boolean; divider?: string }
): string {
	const print = (opts?.compact ?? true) ? printCompact : printSymbols;
	const left = stack.length > 0 ? `${print(stack)} ` : '';
	const right = input.length > 0 ? ` ${print(input)}` : '';
	return `${left}${opts?.divider ?? 'I'}${right}`;
}
