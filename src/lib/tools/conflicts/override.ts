/**
 * The other action of a conflict: the table with a conflict's entry set to
 * the action that did not win, and the parse with that table. Comparing it
 * with the parse as resolved shows the "unexpected parse trees" of Bottom-up
 * Parsing III, slide 22.
 */
import type { LrConflict, LrTable } from '$lib/theory/grammar/lr-table';
import { lrParse, type LrParse } from '$lib/theory/grammar/lr-parse';
import { winnerOf } from './resolution';

/** One of the two actions of a conflict, chosen for its table entry. */
export interface Choice {
	/** Index in the table's conflicts. */
	conflict: number;
	/** Index of the action in the conflict's pair. */
	action: 0 | 1;
}

/** The choices that change an entry: the action chosen is not the one that won. */
export function effectiveChoices(
	conflicts: readonly LrConflict[],
	choices: readonly Choice[]
): Choice[] {
	return choices.filter((c) => {
		const conflict = conflicts[c.conflict];
		return conflict !== undefined && winnerOf(conflict) !== c.action;
	});
}

/**
 * The table with each chosen conflict's entry set to the action chosen; when
 * two choices are for one entry, the later one stands. Rows that do not
 * change are shared with `table`.
 */
export function overrideTable(
	table: LrTable,
	conflicts: readonly LrConflict[],
	choices: readonly Choice[]
): LrTable {
	const action = [...table.action];
	const copied = new Set<number>();
	for (const choice of choices) {
		const conflict = conflicts[choice.conflict];
		if (!conflict) continue;
		const column = table.terminals.indexOf(conflict.terminal);
		if (column < 0) continue;
		if (!copied.has(conflict.state)) {
			action[conflict.state] = [...action[conflict.state]];
			copied.add(conflict.state);
		}
		action[conflict.state][column] = conflict.actions[choice.action];
	}
	return { ...table, action };
}

/** lrParse with the table as `choices` change it. */
export function parseWith(
	table: LrTable,
	conflicts: readonly LrConflict[],
	choices: readonly Choice[],
	tokens: readonly string[]
): LrParse {
	return lrParse(overrideTable(table, conflicts, choices), tokens);
}

/** Whether the parse looks up action[state, terminal] at some step. */
export function looksUp(parse: LrParse, state: number, terminal: string): boolean {
	return parse.rows.some((r) => r.lookup.state === state && r.lookup.terminal === terminal);
}
