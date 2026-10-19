/**
 * What the LL(1) page computes on the main thread for every keystroke never
 * runs the Earley parser (the search for an ambiguous string runs in the
 * analysis worker): every Earley function throws here, and the page's own
 * calls still succeed, also on a large grammar.
 */
import { describe, expect, it, vi } from 'vitest';
import { ll1Table } from '$lib/theory/grammar';
import { entryView, readGrammar, readTokens, tableOrder } from './model';
import { passSummaries, setSteps, setsAt } from './sets';

vi.mock('$lib/theory/grammar/earley', () => {
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		DEFAULT_MAX_STEPS: 10_000_000,
		recognizes: off('recognizes'),
		parseTrees: off('parseTrees'),
		enumerateLanguage: off('enumerateLanguage'),
		compareGrammars: off('compareGrammars')
	};
});

/** A chain of 200 non-terminals, each with an ε-production: A0 → a0 A1 | ε … */
const LARGE = Array.from(
	{ length: 200 },
	(_, i) => `A${i} → a${i} ${i < 199 ? `A${i + 1}` : 'z'} | ε`
).join('\n');

describe('the main thread', () => {
	it('reads the grammar and the tokens, orders the table and explains an entry', () => {
		const { grammar, diagnostics } = readGrammar(LARGE);
		expect(diagnostics).toEqual([]);
		// The table comes from the worker; it is built here to have one.
		const table = ll1Table(grammar!);
		expect(table.ll1).toBe(true);
		expect(readTokens(grammar!, 'a0 a1 a2').error).toBeNull();
		const order = tableOrder(table, 'A5 A3', '$ z');
		expect(order.rows.slice(0, 2).map((r) => table.rows[r])).toEqual(['A5', 'A3']);
		expect(order.columns.slice(0, 2).map((c) => table.columns[c])).toEqual(['$', 'z']);
		expect(entryView(table, 0, 0).lines).toEqual([
			'A0 → a0 A1 in columns of First( a0 A1 ) = { a0 }'
		]);
		const steps = setSteps(table.firstFollow);
		expect(passSummaries(steps).length).toBeGreaterThan(3);
		expect(setsAt(grammar!, table.firstFollow, steps, steps.length - 1).follow).toEqual(
			table.firstFollow.follow
		);
	});
});
