import { describe, expect, it } from 'vitest';
import { ll1Table, parseGrammar, printSymbols, type Grammar } from '$lib/theory/grammar';
import {
	causesOf,
	computeAnalysis,
	computeParse,
	entryName,
	entryView,
	findAmbiguity,
	orderText,
	readGrammar,
	readOrder,
	readTokens,
	sameParse,
	skippedSymbols,
	tableOrder
} from './model';
import { AMBIGUOUS, BOTTOM_UP, NULLABLE, OTHER, SLIDE_5 } from './presets';
import { DECK_COLUMNS, DECK_GRAMMAR, DECK_ROWS } from './state';

const grammar = (text: string): Grammar => {
	const { grammar, diagnostics } = parseGrammar(text);
	if (!grammar) throw new Error(JSON.stringify(diagnostics));
	return grammar;
};
const deck = grammar(DECK_GRAMMAR);
const deckTable = ll1Table(deck);
const at = (table: ReturnType<typeof ll1Table>, a: string, b: string) =>
	entryView(table, table.rows.indexOf(a), table.columns.indexOf(b));

describe('readGrammar', () => {
	it('warns about { } [ ] written bare: the table is built from BNF', () => {
		const { grammar, diagnostics } = readGrammar('E → T { + T }\nT → int');
		expect(grammar?.terminals).toEqual(['{', '+', '}', 'int']);
		expect(diagnostics.map((d) => [d.severity, d.span?.start])).toEqual([
			['warning', 6],
			['warning', 12]
		]);
		expect(diagnostics[0].message).toBe(
			'{ is a terminal here, not EBNF: the table is built from BNF. Quote it, "{", to keep it a terminal.'
		);
	});

	it('takes quoted brackets as terminals, and keeps the parser’s diagnostics', () => {
		expect(readGrammar('S → "[" S "]" | ε').diagnostics).toEqual([]);
		expect(readGrammar('S → ').grammar).toBeNull();
		expect(readGrammar(DECK_GRAMMAR).diagnostics).toEqual([]);
	});
});

describe('order of rows and columns', () => {
	it('reproduces the slides’ order T, E, X, Y and int * + ( ) $', () => {
		expect(deckTable.rows).toEqual(['E', 'X', 'T', 'Y']);
		expect(deckTable.columns).toEqual(['+', '(', ')', 'int', '*', '$']);
		const order = tableOrder(deckTable, DECK_ROWS, DECK_COLUMNS);
		expect(order.rows.map((r) => deckTable.rows[r])).toEqual(['T', 'E', 'X', 'Y']);
		expect(order.columns.map((c) => deckTable.columns[c])).toEqual([
			'int',
			'*',
			'+',
			'(',
			')',
			'$'
		]);
		expect(order.skipped).toEqual({ rows: [], columns: [] });
	});

	it('puts the symbols left out after the ones written, and skips the unknown ones', () => {
		expect(readOrder('', ['E', 'X'])).toEqual({ order: ['E', 'X'], skipped: [] });
		expect(readOrder('Y T T Q', ['E', 'X', 'T', 'Y'])).toEqual({
			order: ['Y', 'T', 'E', 'X'],
			skipped: ['Q']
		});
		expect(readOrder('"a b" $', ['$', 'a b'])).toEqual({ order: ['a b', '$'], skipped: [] });
		expect(orderText(['int', '$', 'a b'])).toBe('int $ "a b"');
	});

	it('does not skip the new non-terminals of the rewrite (slides 5–6)', () => {
		const before = ll1Table(grammar(SLIDE_5));
		const after = computeAnalysis({ grammar: SLIDE_5, names: { 'E’': 'X', 'T’': 'Y' } })!.rewrite
			.table;
		expect(tableOrder(before, DECK_ROWS, DECK_COLUMNS).skipped.rows).toEqual(['X', 'Y']);
		expect(skippedSymbols(DECK_ROWS, DECK_COLUMNS, [before, after])).toEqual([]);
		expect(skippedSymbols(`${DECK_ROWS} Q Q`, `${DECK_COLUMNS} E`, [before, after])).toEqual([
			'Q',
			'E'
		]);
		expect(skippedSymbols('T E Q', '', [deckTable])).toEqual(['Q']);
		expect(skippedSymbols('Q', '', [])).toEqual([]);
	});
});

describe('readTokens', () => {
	it('reads terminals, with or without the closing $', () => {
		expect(readTokens(deck, 'int * int')).toEqual({ tokens: ['int', '*', 'int'], error: null });
		expect(readTokens(deck, 'int * int $')).toEqual({ tokens: ['int', '*', 'int'], error: null });
		expect(readTokens(deck, '')).toEqual({ tokens: [], error: null });
	});

	it('reports symbols that are not terminals and a $ before the end', () => {
		expect(readTokens(deck, 'int - int').error).toBe('- is not a terminal of the grammar.');
		expect(readTokens(deck, 'int E').error).toBe(
			'E is a non-terminal. The input is a string of terminals.'
		);
		expect(readTokens(deck, 'int $ int').error).toBe(
			'$ marks the end of the input: only the last token can be $.'
		);
	});
});

describe('entryView', () => {
	it('says where a production went in the words of slide 25', () => {
		expect(at(deckTable, 'Y', '*')).toEqual({
			name: '[Y, *]',
			kind: 'filled',
			lines: ['Y → * T in columns of First( *T ) = { * }'],
			sets: [{ kind: 'first', symbol: '*' }]
		});
		expect(at(deckTable, 'Y', '+')).toEqual({
			name: '[Y, +]',
			kind: 'filled',
			lines: ['Y → ε in columns of Follow( Y ) = { $, +, ) }'],
			sets: [{ kind: 'follow', symbol: 'Y' }]
		});
		expect(at(deckTable, 'E', 'int')).toMatchObject({
			name: '[E, int]',
			lines: ['E → T X in columns of First( T X ) = { (, int }'],
			sets: [{ kind: 'first', symbol: 'T' }]
		});
	});

	it('says why an entry is blank', () => {
		expect(at(deckTable, 'E', '*')).toEqual({
			name: '[E, *]',
			kind: 'blank',
			lines: ['E → T X: * ∉ First( T X ) = { (, int }'],
			sets: []
		});
		expect(at(deckTable, 'X', 'int').lines).toEqual([
			'X → + E: int ∉ First( +E ) = { + }',
			'X → ε: int ∉ Follow( X ) = { $, ) }'
		]);
		const nullable = ll1Table(grammar(NULLABLE));
		expect(at(nullable, 'S', 'c').kind).toBe('filled');
		expect(at(nullable, 'A', '$').lines).toEqual([
			'A → a: $ ∉ First( a ) = { a }',
			'A → ε: $ ∉ Follow( A ) = { c, b }'
		]);
	});

	it('lists both productions of a multiply-defined entry', () => {
		const table = ll1Table(grammar(SLIDE_5));
		expect(at(table, 'E', 'int')).toEqual({
			name: '[E, int]',
			kind: 'conflict',
			lines: [
				'E → T + E in columns of First( T+E ) = { int, ( }',
				'E → T in columns of First( T ) = { int, ( }'
			],
			sets: [
				{ kind: 'first', symbol: 'T' },
				{ kind: 'first', symbol: 'T' }
			]
		});
		expect(entryName('E', '$')).toBe('[E, $]');
	});
});

describe('causesOf', () => {
	it('finds the common prefixes of slide 5', () => {
		const table = ll1Table(grammar(SLIDE_5));
		const causes = causesOf(table);
		expect(causes.conflicts.map((c) => entryName(c.nonterminal, c.terminal))).toEqual([
			'[E, int]',
			'[E, (]',
			'[T, int]'
		]);
		expect(causes.prefixes).toEqual([
			{ nonterminal: 'E', prefix: ['T'], productions: [0, 1] },
			{ nonterminal: 'T', prefix: ['int'], productions: [2, 3] }
		]);
		expect(causes.leftRecursion).toEqual([]);
		expect(causes.ambiguous).toBeNull();
		expect(causes.other).toEqual([]);
	});

	it('finds the left recursion of Bottom-Up Parsing, slide 3', () => {
		const causes = causesOf(ll1Table(grammar(BOTTOM_UP)));
		expect(causes.leftRecursion).toEqual([{ nonterminal: 'E', derivation: 'E →+ E + ( E )' }]);
		expect(causes.conflicts).toEqual([{ nonterminal: 'E', terminal: 'int', productions: [0, 1] }]);
		expect(causes.ambiguous).toBeNull();
		expect(causes.other).toEqual([]);
	});

	it('finds a string with two parse trees in an ambiguous grammar', () => {
		const causes = causesOf(ll1Table(grammar(AMBIGUOUS)));
		expect(causes.ambiguous).toEqual({ tokens: ['int', '+', 'int', '+', 'int'] });
		expect(causes.leftRecursion.map((r) => r.derivation)).toEqual(['E →+ E + E']);
		expect(findAmbiguity(grammar(SLIDE_5))).toBeNull();
	});

	it('names the other cases of slide 26', () => {
		const causes = causesOf(ll1Table(grammar(OTHER)));
		expect(causes.leftRecursion).toEqual([]);
		expect(causes.prefixes).toEqual([]);
		expect(causes.ambiguous).toBeNull();
		expect(causes.other).toEqual([{ nonterminal: 'A', terminal: 'a', productions: [2, 3] }]);
	});

	it('shows left recursion through a nullable prefix', () => {
		const causes = causesOf(ll1Table(grammar('S → N S b | a\nN → ε | c')));
		expect(causes.leftRecursion).toEqual([{ nonterminal: 'S', derivation: 'S →+ S b' }]);
	});
});

describe('computeAnalysis and computeParse', () => {
	it('computes the table, the causes and the rewrite of a grammar', () => {
		const analysis = computeAnalysis({ grammar: SLIDE_5, names: { 'E’': 'X', 'T’': 'Y' } })!;
		expect(analysis.table.ll1).toBe(false);
		expect(analysis.causes?.prefixes).toHaveLength(2);
		expect(analysis.rewrite.result.text).toBe(
			'E → T X\nX → + E | ε\nT → int Y | ( E )\nY → * T | ε'
		);
		expect(analysis.rewrite.table.ll1).toBe(true);
		const ll1 = computeAnalysis({ grammar: DECK_GRAMMAR, names: {} })!;
		expect(ll1.causes).toBeNull();
		expect(ll1.rewrite.result.changes).toEqual([]);
		expect(ll1.rewrite.table).toBe(ll1.table);
		expect(computeAnalysis({ grammar: 'S →', names: {} })).toBeNull();
		// Plain data: it survives the copy to and from a worker.
		expect(structuredClone(analysis)).toEqual(analysis);
	});

	it('parses with the table of the grammar, and says when two requests are the same', () => {
		const result = computeParse({ grammar: DECK_GRAMMAR, tokens: ['int', '*', 'int'] })!;
		expect(result.parse.outcome).toBe('accept');
		expect(result.parse.rows).toHaveLength(10);
		expect(result.table.rows).toEqual(['E', 'X', 'T', 'Y']);
		expect(computeParse({ grammar: '→', tokens: [] })).toBeNull();
		expect(structuredClone(result)).toEqual(result);
		const a = { grammar: 'S → a', tokens: ['a'] };
		expect(sameParse(a, { grammar: 'S → a', tokens: ['a'] })).toBe(true);
		expect(sameParse(a, { grammar: 'S → a', tokens: [] })).toBe(false);
		expect(sameParse(a, null)).toBe(false);
	});

	it('writes symbols as the grammar writes them', () => {
		expect(printSymbols(['a b'])).toBe('"a b"');
		expect(entryName('S', 'a b')).toBe('[S, "a b"]');
	});
});
