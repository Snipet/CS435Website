/**
 * The action/goto table in the notation of Bottom-up Parsing II, slide 19:
 * terminal columns, then `$` (the action table), a vertical rule, then the
 * non-terminal columns (the goto table). Entries are `sN` (shift, go to state
 * N), `gN` (go to N), `r` with the production as a subscript (`r` E→E+(E)),
 * and `accept`; a blank entry is an error. A cell with a conflict shows every
 * action in it.
 */
import { joinSymbols, symbolText } from '$lib/components/grammar/lr-item';
import type { Augmented } from '$lib/theory/grammar/lr';
import { printProduction } from '$lib/theory/grammar/lr';
import type { LrAction, LrConflict, LrTable } from '$lib/theory/grammar/lr-table';

/** One entry as drawn: `s4`, `g6`, `accept`, or `r` with `sub` E→int as a subscript. */
export interface EntryView {
	code: string;
	sub?: string;
	/** In words, as slide 21 says them: shift 4, reduce E → int, goto 6, accept. */
	words: string;
}

/** `E→E+(E)`: the production under an `r`. */
export function reduceSubscript(aug: Augmented, production: number): string {
	const p = aug.productions[production];
	return `${symbolText(p.lhs)}→${joinSymbols(p.rhs, 'compact')}`;
}

export function actionEntry(aug: Augmented, a: LrAction): EntryView {
	switch (a.kind) {
		case 'shift':
			return { code: `s${a.state}`, words: `shift ${a.state}` };
		case 'reduce':
			return {
				code: 'r',
				sub: reduceSubscript(aug, a.production),
				words: `reduce ${printProduction(aug.productions[a.production])}`
			};
		case 'accept':
			return { code: 'accept', words: 'accept' };
		case 'error':
			return { code: 'error', words: 'error' };
	}
}

export const gotoEntry = (state: number): EntryView => ({
	code: `g${state}`,
	words: `goto ${state}`
});

const sameAction = (x: LrAction, y: LrAction) => JSON.stringify(x) === JSON.stringify(y);

/** The conflicts of each action cell, by `${state} ${column}`. */
export function conflictCells(t: LrTable): Map<string, LrConflict[]> {
	const out = new Map<string, LrConflict[]>();
	const column = new Map(t.terminals.map((x, i) => [x, i]));
	for (const c of t.conflicts) {
		const key = `${c.state} ${column.get(c.terminal)}`;
		const list = out.get(key);
		if (list) list.push(c);
		else out.set(key, [c]);
	}
	return out;
}

export interface ActionCellView {
	entries: EntryView[];
	/** The conflicts in this cell (empty for most cells). */
	conflicts: LrConflict[];
	/** What the table keeps when there is a conflict. */
	kept: EntryView | null;
}

/**
 * action[state, terminal]: its entry, or for a cell with a conflict every
 * action in it (the shift first, then the reductions in grammar order) and
 * the one the table keeps (bison's default without precedence).
 */
export function actionCell(
	t: LrTable,
	state: number,
	column: number,
	conflicts: ReadonlyMap<string, LrConflict[]>
): ActionCellView {
	const aug = t.augmented;
	const here = conflicts.get(`${state} ${column}`) ?? [];
	const entry = t.action[state]?.[column] ?? null;
	if (here.length === 0)
		return { entries: entry ? [actionEntry(aug, entry)] : [], conflicts: [], kept: null };
	const actions: LrAction[] = [];
	for (const c of here)
		for (const a of c.actions) if (!actions.some((b) => sameAction(a, b))) actions.push(a);
	const rank = (a: LrAction) =>
		a.kind === 'shift' ? -2 : a.kind === 'accept' ? -1 : a.kind === 'reduce' ? a.production : 1e9;
	actions.sort((x, y) => rank(x) - rank(y));
	return {
		entries: actions.map((a) => actionEntry(aug, a)),
		conflicts: here,
		kept: entry ? actionEntry(aug, entry) : null
	};
}

/** The accessible name of an action cell: `action[4, int] = shift 5`, `action[2, $] is blank`. */
export function actionCellName(
	t: LrTable,
	state: number,
	column: number,
	cell: ActionCellView
): string {
	const head = `action[${state}, ${symbolText(t.terminals[column])}]`;
	if (cell.conflicts.length > 0)
		return `${head}: conflict, ${cell.entries.map((e) => e.words).join(' or ')}; the table keeps ${
			cell.kept?.words ?? 'a blank'
		}`;
	return cell.entries.length > 0 ? `${head} = ${cell.entries[0].words}` : `${head} is blank`;
}

/** The accessible name of a goto cell: `Goto[4, E] = 6`, `Goto[3, E] is blank`. */
export function gotoCellName(t: LrTable, state: number, column: number): string {
	const head = `Goto[${state}, ${symbolText(t.nonterminals[column])}]`;
	const to = t.goto[state]?.[column] ?? null;
	return to === null ? `${head} is blank` : `${head} = ${to}`;
}

/** A cell of the table: an action cell (terminal column) or a goto cell. */
export type CellRef = { state: number; kind: 'action' | 'goto'; column: number };

/** The cell an edge of the DFA is stored in: a terminal edge in action, a non-terminal edge in goto. */
export function edgeCell(t: LrTable, edge: { from: number; symbol: string }): CellRef | null {
	const a = t.terminals.indexOf(edge.symbol);
	if (a >= 0) return { state: edge.from, kind: 'action', column: a };
	const g = t.nonterminals.indexOf(edge.symbol);
	return g >= 0 ? { state: edge.from, kind: 'goto', column: g } : null;
}
