/**
 * The LR parsing algorithm of Bottom-up Parsing II, slide 21, one line at a
 * time: the lookup action[top_state(stack), I[j]], then the case that runs
 * (a shift pushes < I[j++], k >; a reduce pops |α| pairs, then pushes
 * < X, Goto[top_state(stack), X] >), until accept or error. The engine's
 * `lrParse` gives the rows; this file spreads each row over the lines of the
 * pseudocode and works out what the page marks: the table cell, the DFA state
 * and edge, the stack pairs, the input index j, the parse forest and its
 * divider, and the count of DFA transitions of slide 20.
 */
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import type { LrParse, LrStackEntry } from '$lib/theory/grammar/lr-parse';
import { printCompact } from '$lib/theory/grammar/lr-parse';
import type { LrTable } from '$lib/theory/grammar/lr-table';
import { END_MARKER, type ParseNode } from '$lib/theory/grammar/types';
import { symbolText } from '$lib/components/grammar/lr-item';
import { actionEntry, type CellRef } from './table-view';

/** Bottom-up Parsing II, slide 21, line by line. */
export const LR_CODE: readonly string[] = [
	'Let I = w $',
	'Let j = 0',
	'Let DFA state 0 be the start state',
	'Let stack = < dummy, 0 >',
	'  repeat',
	'    case action[top_state(stack), I[j]] of',
	'      shift k : push < I[j++], k >',
	'      reduce X → α :',
	'        pop |α| pairs,',
	'        push < X, Goto[top_state(stack), X] >',
	'      accept: halt normally',
	'      error: halt and report error'
];

export type ParsePhase =
	'init' | 'lookup' | 'shift' | 'pop' | 'goto' | 'accept' | 'error' | 'limit';

export interface ParseFrame {
	phase: ParsePhase;
	/** Lines of LR_CODE that run. */
	lines: number[];
	/** The row of the LrParse, or null for the first frame. */
	row: number | null;
	/** The stack shown, bottom first: < dummy, 0 > … */
	stack: LrStackEntry[];
	/** How many pairs at the top of `stack` are being popped. */
	popping: number;
	/** The top pair was just pushed. */
	pushed: boolean;
	/** The index of the next token, I[j]. */
	j: number;
	/** The table cell looked up. */
	cell: CellRef | null;
	/** The DFA state the parser is in (the top pair's state). */
	state: number;
	/** The DFA edge the push follows: on I[j] for a shift, on X for a Goto. */
	edge: { from: number; symbol: string; to: number } | null;
	/** The stack's subtrees, bottom first. */
	forest: ParseNode[];
	/** Indices in `forest` to mark: popped subtrees, or the subtree just pushed. */
	marked: number[];
	/** What happens, in words. */
	text: string;
	/** DFA transitions so far (slide 20): rerunning the DFA over the stack after each action, and reading the stored state. */
	transitions: { rerun: number; stored: number };
}

const entryText = (e: LrStackEntry) =>
	`< ${e.symbol === null ? 'dummy' : symbolText(e.symbol)}, ${e.state} >`;

/** Frames for every line the run executes. */
export function parseFrames(t: LrTable, p: LrParse): ParseFrame[] {
	const aug = t.augmented;
	const column = new Map(t.terminals.map((x, i) => [x, i]));
	const gotoColumn = new Map(t.nonterminals.map((x, i) => [x, i]));
	const bottom: LrStackEntry = { symbol: null, state: 0 };
	let forest: ParseNode[] = [];
	let rerun = 0;
	let stored = 0;
	const frames: ParseFrame[] = [
		{
			phase: 'init',
			lines: [0, 1, 2, 3],
			row: null,
			stack: [bottom],
			popping: 0,
			pushed: false,
			j: 0,
			cell: null,
			state: 0,
			edge: null,
			forest: [],
			marked: [],
			text: `I = ${printCompact(p.input)}, j = 0, stack = < dummy, 0 >`,
			transitions: { rerun: 0, stored: 0 }
		}
	];
	const push = (stack: readonly LrStackEntry[]) => {
		rerun += stack.length - 1;
		stored += 1;
	};
	p.rows.forEach((row, r) => {
		const top = row.lookup.state;
		const tok = row.lookup.terminal;
		const c = column.get(tok);
		const cell: CellRef | null = c === undefined ? null : { state: top, kind: 'action', column: c };
		const base = {
			row: r,
			stack: row.stack,
			popping: 0,
			pushed: false,
			j: row.j,
			cell,
			state: top,
			edge: null,
			forest,
			marked: [],
			transitions: { rerun, stored }
		};
		const lookup = `action[${top}, ${symbolText(tok)}]`;
		const a = row.action;
		if (row.text.startsWith('stopped')) {
			frames.push({
				...base,
				phase: 'limit',
				lines: [4],
				cell: null,
				text: `The run ${row.text}.`
			});
			return;
		}
		frames.push({
			...base,
			phase: 'lookup',
			lines: [5],
			text:
				a === null
					? `${lookup} is blank`
					: a.kind === 'error'
						? `${lookup} is an error entry`
						: `${lookup} = ${actionEntry(aug, a).words}`
		});
		if (a === null || a.kind === 'error') {
			frames.push({ ...base, phase: 'error', lines: [11], text: 'error: halt and report error' });
			return;
		}
		if (a.kind === 'accept') {
			frames.push({ ...base, phase: 'accept', lines: [10], text: 'accept: halt normally' });
			return;
		}
		if (a.kind === 'shift') {
			const stack = [...row.stack, row.pushed!];
			push(stack);
			forest = row.forest;
			frames.push({
				...base,
				phase: 'shift',
				lines: [6],
				stack,
				pushed: true,
				j: row.j + 1,
				edge: { from: top, symbol: tok, to: a.state },
				state: a.state,
				forest,
				marked: [forest.length - 1],
				text: `shift ${a.state}: push ${entryText(row.pushed!)}, j = ${row.j + 1}`,
				transitions: { rerun, stored }
			});
			return;
		}
		const production = aug.productions[a.production];
		const n = production.rhs.length;
		frames.push({
			...base,
			phase: 'pop',
			lines: [7, 8],
			popping: n,
			marked: Array.from({ length: n }, (_, k) => forest.length - n + k),
			text: `reduce ${symbolText(production.lhs)} → ${printCompact(production.rhs)}: pop ${n} ${n === 1 ? 'pair' : 'pairs'}`
		});
		const below = row.stack.slice(0, row.stack.length - n);
		const under = below[below.length - 1].state;
		const g = gotoColumn.get(production.lhs);
		const gotoCell: CellRef | null =
			g === undefined ? null : { state: under, kind: 'goto', column: g };
		const head = `Goto[${under}, ${symbolText(production.lhs)}]`;
		if (row.goto?.to === null || row.goto === null || !row.pushed) {
			frames.push({
				...base,
				phase: 'error',
				lines: [9],
				stack: below,
				cell: gotoCell,
				state: under,
				text: `${head} is blank: error`
			});
			return;
		}
		const stack = [...below, row.pushed];
		push(stack);
		forest = row.forest;
		frames.push({
			...base,
			phase: 'goto',
			lines: [9],
			stack,
			pushed: true,
			cell: gotoCell,
			state: row.pushed.state,
			edge: { from: under, symbol: production.lhs, to: row.pushed.state },
			forest,
			marked: [forest.length - 1],
			text: `push < ${symbolText(production.lhs)}, ${head} > = ${entryText(row.pushed)}`,
			transitions: { rerun, stored }
		});
	});
	return frames;
}

/** The I-divider configuration of a frame (Bottom-up Parsing II, slide 14): stack symbols, then I[j…]. */
export function frameConfiguration(p: LrParse, f: ParseFrame): { left: string; right: string } {
	const symbols = f.stack.slice(1).map((e) => e.symbol!);
	return {
		left: symbols.length ? printCompact(symbols) : '',
		right: printCompact(p.input.slice(f.j))
	};
}

/** Leaves of a tree, ε leaves counted (the divider stands after this many). */
export function leafCount(node: ParseNode): number {
	if (node.terminal || node.children.length === 0) return 1;
	let n = 0;
	for (const c of node.children) n += leafCount(c);
	return n;
}

/**
 * The partial parse of a frame as a forest over one baseline: the stack's
 * subtrees, then the tokens still to come as bare leaves (without `$`), and
 * where the divider stands among the leaves.
 */
export function frameForest(p: LrParse, f: ParseFrame): { roots: ParseNode[]; marker: number } {
	const rest = p.input
		.slice(f.j)
		.filter((t, i, all) => !(t === END_MARKER && i === all.length - 1))
		.map((symbol): ParseNode => ({ symbol, terminal: true, children: [] }));
	const marker = f.forest.reduce((s, t) => s + leafCount(t), 0);
	return { roots: [...f.forest, ...rest], marker };
}

/**
 * The items behind the entry a frame looks up, by state: for a shift on t the
 * items with •t, for a reduction with X → α the items [X → α•, t], for accept
 * [S → E•, $], for Goto[k, X] the items of state k with •X.
 */
export function entryItems(a: LrAutomaton, t: LrTable, f: ParseFrame): Map<number, number[]> {
	const out = new Map<number, number[]>();
	const cell = f.cell;
	const state = cell ? a.states[cell.state] : undefined;
	if (!cell || !state) return out;
	const aug = a.augmented;
	const after = (k: number) => {
		const item = state.items[k];
		return aug.productions[item.production].rhs[item.dot];
	};
	const complete = (k: number, production: number, tok: string) => {
		const item = state.items[k];
		return (
			item.production === production &&
			item.dot === aug.productions[production].rhs.length &&
			(item.lookahead === null || item.lookahead === tok)
		);
	};
	let picked: number[] = [];
	const all = state.items.map((_, k) => k);
	if (cell.kind === 'goto') {
		const x = t.nonterminals[cell.column];
		picked = all.filter((k) => after(k) === x);
	} else {
		const tok = t.terminals[cell.column];
		const action = t.action[cell.state]?.[cell.column] ?? null;
		if (action?.kind === 'shift') picked = all.filter((k) => after(k) === tok);
		else if (action?.kind === 'reduce')
			picked = all.filter((k) => complete(k, action.production, tok));
		else if (action?.kind === 'accept')
			picked = all.filter((k) => complete(k, aug.production.id, tok));
	}
	if (picked.length > 0) out.set(cell.state, picked);
	return out;
}

/** The distinct DFA states a run passes through. */
export function statesVisited(frames: readonly ParseFrame[]): number[] {
	return [...new Set(frames.map((f) => f.state))].sort((a, b) => a - b);
}
