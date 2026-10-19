import { describe, expect, it } from 'vitest';
import { firstSets, followSets } from './analyze';
import { bracketForm, treeEquals, yieldOf } from './derive';
import { parseTrees, recognizes } from './earley';
import {
	DEFAULT_PARSE_STEPS,
	MAX_TREE_DEPTH,
	PARSE_STACK_BUDGET,
	TREE_DEPTH_TEXT,
	displayOrder,
	endInput,
	firstFollow,
	firstOfString,
	ll1Cell,
	ll1Parse,
	ll1Table,
	printTight,
	replaceAt,
	sortForDisplay,
	terminalRanks,
	withRanges,
	type FirstFollowStep,
	type LL1Table
} from './ll1';
import { makeGrammar, printSymbols } from './parse';
import {
	BOTTOM_UP,
	CASCADE,
	EBNF_REPETITION,
	LEFT_FACTORED,
	LEFT_RECURSIVE,
	TOP_DOWN,
	bruteForce,
	ebnf,
	grammar,
	input,
	random,
	randomGrammar,
	randomTokens,
	treeDepth
} from './test-helpers';
import { ebnfToGrammar } from './parse';
import { END_MARKER, EPSILON, type Grammar, type ParseNode } from './types';

const g = grammar(LEFT_FACTORED);

/** The table as text rows `A: b=α …` with only the filled entries, each written as its RHS. */
const filled = (table: LL1Table): string[] =>
	table.rows.map(
		(row, r) =>
			`${row}:` +
			table.columns
				.map((col, c) => {
					const ps = table.cells[r][c].productions;
					return ps.length === 0
						? ''
						: ` [${col}]=${ps.map((p) => printSymbols(table.grammar.productions[p].rhs)).join(' / ')}`;
				})
				.join('')
	);

/** The trace as "stack | input | action" lines, the layout of slide 12. */
const trace = (table: LL1Table, text: string, opts?: { maxSteps?: number }): string[] =>
	ll1Parse(table, input(table.grammar, text), opts).rows.map(
		(r) => `${printSymbols(r.stack)} | ${printSymbols(r.input)} | ${r.text}`
	);

describe('displayOrder', () => {
	it('puts $ first, then terminals in grammar order, then ε', () => {
		// Grammar order of T: + ( ) int *
		expect(displayOrder(g, [EPSILON, ')', '+', END_MARKER])).toEqual(['$', '+', ')', 'ε']);
		expect(displayOrder(g, ['int', '('])).toEqual(['(', 'int']);
		expect(displayOrder(g, [])).toEqual([]);
	});

	it('keeps symbols that are not terminals after the terminals, in the order given', () => {
		expect(displayOrder(g, ['Z', '*', 'A', END_MARKER])).toEqual(['$', '*', 'Z', 'A']);
		expect(sortForDisplay(terminalRanks(g), new Set(['*', '+']))).toEqual(['+', '*']);
	});
});

describe('printTight', () => {
	it('writes symbols as slide 25 writes First( *T )', () => {
		expect(printTight(['*', 'T'])).toBe('*T');
		expect(printTight(['int', 'Y'])).toBe('int Y');
		expect(printTight(['T', 'X'])).toBe('T X');
		expect(printTight(['(', 'E', ')'])).toBe('(E)');
		expect(printTight(['+', 'E'])).toBe('+E');
		expect(printTight([])).toBe('ε');
	});

	it('keeps the spaces that keep symbols apart', () => {
		expect(printTight(['E', '-', 'T'])).toBe('E - T');
		expect(printTight(['the cat', 'sat'])).toBe('"the cat" sat');
		expect(printTight(['S’', 'a'])).toBe('S’ a');
	});
});

describe('firstFollow', () => {
	const ff = firstFollow(g);

	it('answers slide 21: First of every symbol of the left-factored grammar', () => {
		expect(Object.fromEntries(ff.first)).toEqual({
			E: ['(', 'int'],
			X: ['+', 'ε'],
			T: ['(', 'int'],
			Y: ['*', 'ε'],
			'+': ['+'],
			'(': ['('],
			')': [')'],
			int: ['int'],
			'*': ['*']
		});
	});

	it('answers slide 23: Follow of every symbol, terminals included', () => {
		expect(Object.fromEntries(ff.follow)).toEqual({
			E: ['$', ')'],
			X: ['$', ')'],
			T: ['$', '+', ')'],
			// slide 25: Follow( Y ) = { $, +, ) }
			Y: ['$', '+', ')'],
			'+': ['(', 'int'],
			'(': ['(', 'int'],
			')': ['$', '+', ')'],
			int: ['$', '+', ')', '*'],
			'*': ['(', 'int']
		});
		expect(new Set(ff.follow.get('int'))).toEqual(new Set(['$', '+', '*', ')']));
	});

	it('applies First(b) = { b } once per terminal, then the production rule pass by pass', () => {
		const pass0 = ff.firstSteps.filter((s) => s.pass === 0);
		expect(pass0.map((s) => s.text)).toEqual([
			'First( + ) = { + }',
			'First( ( ) = { ( }',
			'First( ) ) = { ) }',
			'First( int ) = { int }',
			'First( * ) = { * }'
		]);
		expect(ff.firstSteps.filter((s) => s.pass === 1).map((s) => s.text)).toEqual([
			'Add First( T ) – { ε } to First( E )',
			'Stop: ε ∉ First( T )',
			'Add First( + ) – { ε } to First( X )',
			'Stop: ε ∉ First( + )',
			'Add ε to First( X )',
			'Add First( ( ) – { ε } to First( T )',
			'Stop: ε ∉ First( ( )',
			'Add First( int ) – { ε } to First( T )',
			'Stop: ε ∉ First( int )',
			'Add First( * ) – { ε } to First( Y )',
			'Stop: ε ∉ First( * )',
			'Add ε to First( Y )'
		]);
		// First(T) is still empty when E is visited in pass 1, so E fills up in pass 2.
		const e2 = ff.firstSteps.find(
			(s) => s.pass === 2 && s.target === 'E' && s.rule === 'first-add'
		)!;
		expect(e2).toMatchObject({ production: 0, index: 1, symbol: 'T', added: ['(', 'int'] });
		expect(ff.firstPasses).toBe(3);
	});

	it('applies Add $ to Follow(S), then the production rule to every occurrence', () => {
		expect(ff.followSteps[0]).toEqual({
			rule: 'follow-end',
			pass: 0,
			production: null,
			position: null,
			index: null,
			symbol: null,
			target: 'E',
			added: ['$'],
			text: 'Add $ to Follow( E )'
		});
		expect(ff.followSteps.filter((s) => s.pass === 1).map((s) => s.text)).toEqual([
			'Add First( X ) – { ε } to Follow( T )',
			'Add Follow( E ) to Follow( T )',
			'Add Follow( E ) to Follow( X )',
			'Add First( E ) – { ε } to Follow( + )',
			'Stop: ε ∉ First( E )',
			'Add Follow( X ) to Follow( E )',
			'Add First( E ) – { ε } to Follow( ( )',
			'Stop: ε ∉ First( E )',
			'Add First( ) ) – { ε } to Follow( E )',
			'Stop: ε ∉ First( ) )',
			'Add Follow( T ) to Follow( ) )',
			'Add First( Y ) – { ε } to Follow( int )',
			'Add Follow( T ) to Follow( int )',
			'Add Follow( T ) to Follow( Y )',
			'Add First( T ) – { ε } to Follow( * )',
			'Stop: ε ∉ First( T )',
			'Add Follow( Y ) to Follow( T )'
		]);
		const int = ff.followSteps.find((s) => s.pass === 1 && s.target === 'int')!;
		expect(int).toMatchObject({
			rule: 'follow-add',
			production: 4,
			position: 0,
			index: 1,
			symbol: 'Y'
		});
		const fromT = ff.followSteps.find((s) => s.rule === 'follow-follow' && s.target === 'int')!;
		expect(fromT).toMatchObject({ symbol: 'T', index: null, added: ['$', '+'] });
	});

	it('repeats passes until one changes nothing', () => {
		for (const [steps, passes] of [
			[ff.firstSteps, ff.firstPasses],
			[ff.followSteps, ff.followPasses]
		] as [FirstFollowStep[], number][]) {
			expect(Math.max(...steps.map((s) => s.pass))).toBe(passes);
			for (let pass = 1; pass <= passes; pass++) {
				const grew = steps.some((s) => s.pass === pass && s.added.length > 0);
				expect(grew, `pass ${pass}`).toBe(pass < passes);
			}
		}
	});

	it('ignores an Ai that is X, but still stops when ε ∉ First(X)', () => {
		const left = firstFollow(grammar(LEFT_RECURSIVE));
		const self = left.firstSteps.filter((s) => s.rule === 'first-self');
		expect(self[0]).toMatchObject({
			production: 0,
			index: 1,
			symbol: 'E',
			text: 'Ignore A1: it is E'
		});
		const after = left.firstSteps[left.firstSteps.indexOf(self[0]) + 1];
		expect(after.text).toBe('Stop: ε ∉ First( E )');
		expect(left.first.get('E')).toEqual(['(', 'int']);
		// S → S a | ε: once S derives ε, the a after it counts.
		const nullableSelf = firstFollow(grammar('S → S a | ε'));
		expect(nullableSelf.first.get('S')).toEqual(['a', 'ε']);
		expect(nullableSelf.follow.get('S')).toEqual(['$', 'a']);
	});

	it('agrees with firstSets and followSets', () => {
		const check = (h: Grammar) => {
			const ff = firstFollow(h);
			const first = firstSets(h);
			const follow = followSets(h);
			for (const n of h.nonterminals) {
				expect(new Set(ff.first.get(n)), `First(${n})`).toEqual(first.get(n));
				expect(new Set(ff.follow.get(n)), `Follow(${n})`).toEqual(follow.get(n));
			}
		};
		for (const text of [LEFT_FACTORED, CASCADE, LEFT_RECURSIVE, TOP_DOWN, BOTTOM_UP])
			check(grammar(text));
		check(ebnfToGrammar(ebnf(EBNF_REPETITION)));
		const next = random(12);
		for (let i = 0; i < 300; i++) check(randomGrammar(next));
	});

	it('computes Follow of a terminal as Follow of a non-terminal that derives just that terminal', () => {
		// Replace each terminal t by a new non-terminal ⟨t⟩ → t: Follow(⟨t⟩) must be Follow(t).
		const wrapped = (h: Grammar): Grammar =>
			makeGrammar([
				...h.productions.map((p) => ({
					lhs: p.lhs,
					rhs: p.rhs.map((x) => (h.terminals.includes(x) ? `⟨${x}⟩` : x))
				})),
				...h.terminals.map((t) => ({ lhs: `⟨${t}⟩`, rhs: [t] }))
			]);
		const next = random(5);
		for (let i = 0; i < 200; i++) {
			const h = i === 0 ? g : randomGrammar(next);
			const ff = firstFollow(h);
			const follow = followSets(wrapped(h));
			for (const t of h.terminals)
				expect(new Set(ff.follow.get(t)), `Follow(${t})`).toEqual(follow.get(`⟨${t}⟩`));
		}
	});

	it('warns about symbols named $ or ε', () => {
		expect(firstFollow(grammar('S’ → S $\nS → a')).diagnostics).toEqual([
			{
				severity: 'warning',
				message:
					'The grammar has a symbol named $: in the sets it cannot be told from the end marker $.'
			}
		]);
		expect(firstFollow(g).diagnostics).toEqual([]);
	});

	it('gives First of a string of symbols', () => {
		const ff = firstFollow(g);
		expect(firstOfString(ff, g, ['*', 'T'])).toEqual(['*']);
		expect(firstOfString(ff, g, ['Y', 'X'])).toEqual(['+', '*', 'ε']);
		expect(firstOfString(ff, g, [])).toEqual(['ε']);
	});
});

describe('ll1Table', () => {
	const table = ll1Table(g);

	it('reproduces the table of slides 7–9, 12 and 25', () => {
		expect(table.rows).toEqual(['E', 'X', 'T', 'Y']);
		expect(table.columns).toEqual(['+', '(', ')', 'int', '*', '$']);
		// In the slide's layout: rows T, E, X, Y; columns int * + ( ) $.
		const slide = ['T', 'E', 'X', 'Y'].map((row) =>
			['int', '*', '+', '(', ')', '$']
				.map((col) => {
					const cell = ll1Cell(table, row, col)!;
					return cell.productions.map((p) => printSymbols(g.productions[p].rhs)).join(' / ');
				})
				.join(' | ')
		);
		expect(slide).toEqual([
			'int Y |  |  | ( E ) |  | ',
			'T X |  |  | T X |  | ',
			' |  | + E |  | ε | ε',
			' | * T | ε |  | ε | ε'
		]);
		expect(table.conflicts).toEqual([]);
		expect(table.ll1).toBe(true);
		expect(ll1Cell(table, 'E', '*')!.productions).toEqual([]);
		expect(ll1Cell(table, 'Q', '*')).toBeNull();
	});

	it('says where each production went, in the words of slide 25', () => {
		expect(table.placements.map((p) => [p.production, p.rule, p.text])).toEqual([
			[0, 'first', 'in columns of First( T X ) = { (, int }'],
			[1, 'first', 'in columns of First( +E ) = { + }'],
			[2, 'follow', 'in columns of Follow( X ) = { $, ) }'],
			[3, 'first', 'in columns of First( (E) ) = { ( }'],
			[4, 'first', 'in columns of First( int Y ) = { int }'],
			[5, 'first', 'in columns of First( *T ) = { * }'],
			[6, 'follow', 'in columns of Follow( Y ) = { $, +, ) }']
		]);
		const yPlus = ll1Cell(table, 'Y', '+')!;
		expect(yPlus.placements).toEqual([
			{
				production: 6,
				rule: 'follow',
				set: ['$', '+', ')'],
				columns: ['$', '+', ')'],
				text: 'in columns of Follow( Y ) = { $, +, ) }'
			}
		]);
	});

	it('places a nullable right-hand side by First(α) – { ε } and by Follow(A)', () => {
		const h = grammar('S → A B\nA → a | ε\nB → b | ε');
		const t = ll1Table(h);
		expect(t.placements.filter((p) => p.production === 0).map((p) => p.text)).toEqual([
			'in columns of First( A B ) – { ε } = { a, b }',
			'in columns of Follow( S ) = { $ }'
		]);
		expect(t.placements[0].set).toEqual(['a', 'b', 'ε']);
		expect(filled(t)).toEqual([
			'S: [a]=A B [b]=A B [$]=A B',
			'A: [a]=a [b]=ε [$]=ε',
			'B: [b]=b [$]=ε'
		]);
	});

	it('reports multiply-defined entries: G is not LL(1) (slide 26)', () => {
		const t = ll1Table(grammar('E → T + E | T\nT → int | int * T | ( E )'));
		expect(t.ll1).toBe(false);
		expect(t.conflicts).toEqual([
			{ nonterminal: 'E', terminal: 'int', productions: [0, 1] },
			{ nonterminal: 'E', terminal: '(', productions: [0, 1] },
			{ nonterminal: 'T', terminal: 'int', productions: [2, 3] }
		]);
		// Bottom-Up Parsing, slide 3: "Is it LL(1)?"
		const b = ll1Table(grammar(BOTTOM_UP));
		expect(b.conflicts).toEqual([{ nonterminal: 'E', terminal: 'int', productions: [0, 1] }]);
		expect(ll1Table(grammar(TOP_DOWN)).ll1).toBe(false);
	});

	it('lists a production once in an entry it reaches by both rules', () => {
		// A → a B | ε ; B → ε with Follow(A) ∋ a: A → ε comes into [A, a] by Follow only.
		const h = grammar('S → A a\nA → B | ε\nB → ε');
		const t = ll1Table(h);
		expect(ll1Cell(t, 'A', 'a')!.productions).toEqual([1, 2]);
		expect(t.conflicts).toEqual([{ nonterminal: 'A', terminal: 'a', productions: [1, 2] }]);
		const s = grammar('S → A | a\nA → a | ε');
		expect(ll1Cell(ll1Table(s), 'S', 'a')!.productions).toEqual([0, 1]);
	});

	it('keeps $ as the last column when the grammar uses it as a terminal', () => {
		const t = ll1Table(grammar('S’ → S $\nS → a'));
		expect(t.columns).toEqual(['a', '$']);
		expect(t.diagnostics).toHaveLength(1);
	});
});

describe('ll1Parse', () => {
	const table = ll1Table(g);

	it('reproduces the trace of slide 12 exactly', () => {
		expect(trace(table, 'int * int')).toEqual([
			'E $ | int * int $ | T X',
			'T X $ | int * int $ | int Y',
			'int Y X $ | int * int $ | terminal',
			'Y X $ | * int $ | * T',
			'* T X $ | * int $ | terminal',
			'T X $ | int $ | int Y',
			'int Y X $ | int $ | terminal',
			'Y X $ | $ | ε',
			'X $ | $ | ε',
			'$ | $ | ACCEPT'
		]);
	});

	it('records each action, the entry it used and the tree built so far', () => {
		const run = ll1Parse(table, input(g, 'int * int'));
		expect(run.outcome).toBe('accept');
		expect(run.rows[0].action).toEqual({ kind: 'expand', production: 0 });
		expect(run.rows[0].cell).toEqual({ row: 0, column: 3 });
		expect(run.rows[2].action).toEqual({ kind: 'match', terminal: 'int' });
		expect(run.rows[2].cell).toBeNull();
		expect(run.rows[9].action).toEqual({ kind: 'accept' });
		expect(run.rows.map((r) => bracketForm(r.tree))).toEqual([
			'E',
			'E(T X)',
			'E( T(int Y) X )',
			'E( T(int Y) X )',
			'E( T( int Y(* T) ) X )',
			'E( T( int Y(* T) ) X )',
			'E( T( int Y( * T(int Y) ) ) X )',
			'E( T( int Y( * T(int Y) ) ) X )',
			'E( T( int Y( * T( int Y(ε) ) ) ) X )',
			'E( T( int Y( * T( int Y(ε) ) ) ) X(ε) )'
		]);
		expect(run.rows.map((r) => r.focus)).toEqual([
			[],
			[0],
			[0, 0],
			[0, 1],
			[0, 1, 0],
			[0, 1, 1],
			[0, 1, 1, 0],
			[0, 1, 1, 1],
			[1],
			null
		]);
		expect(run.tree).toMatchObject({ start: 0, end: 3 });
		expect(yieldOf(run.tree!)).toEqual(['int', '*', 'int']);
		expect(run.rows[3].tree.children[0].children[0]).toMatchObject({ start: 0, end: 1 });
		// Rows share the subtrees that did not change.
		expect(run.rows[5].tree.children[1]).toBe(run.rows[4].tree.children[1]);
	});

	it('stops at a blank entry or a mismatched terminal', () => {
		// slide 9: the [E,*] entry is blank
		expect(trace(table, '* int')).toEqual(['E $ | * int $ | [E,*] is blank']);
		expect(trace(table, 'int int').slice(-1)).toEqual(['Y X $ | int $ | [Y,int] is blank']);
		expect(trace(table, '( int').slice(-1)).toEqual([') X $ | $ | Mismatch: $ is not )']);
		expect(trace(table, '').slice(-1)).toEqual(['E $ | $ | [E,$] is blank']);
		const run = ll1Parse(table, input(g, '* int'));
		expect(run.outcome).toBe('error');
		expect(run.tree).toBeNull();
		expect(run.rows[0].action).toEqual({ kind: 'blank', nonterminal: 'E', terminal: '*' });
		expect(run.rows[0].cell).toEqual({ row: 0, column: 4 });
		const mismatch = ll1Parse(table, input(g, '( int')).rows.at(-1)!;
		expect(mismatch.action).toEqual({ kind: 'mismatch', expected: ')', found: '$' });
		// A token the grammar does not have.
		expect(ll1Parse(table, ['int', 'id']).rows.at(-1)!.text).toBe('[Y,id] is blank');
		// Input left over when the stack is down to $.
		const short = ll1Table(grammar('S → a'));
		expect(trace(short, 'a a').slice(-1)).toEqual(['$ | a $ | Mismatch: a is not $']);
	});

	it('takes a closing $ as the end marker and refuses a $ before the end', () => {
		expect(ll1Parse(table, ['int', '$']).outcome).toBe('accept');
		const bad = ll1Parse(table, ['int', '$', 'int']);
		expect(bad.rows).toEqual([]);
		expect(bad.outcome).toBe('error');
		expect(bad.diagnostics[0].severity).toBe('error');
	});

	it('uses the first production of a multiply-defined entry and stops at the step limit', () => {
		const t = ll1Table(grammar(BOTTOM_UP));
		const run = ll1Parse(t, ['int'], { maxSteps: 6 });
		expect(run.outcome).toBe('limit');
		expect(run.rows).toHaveLength(6);
		expect(run.rows.map((r) => r.text)).toEqual([
			'E + ( E )',
			'E + ( E )',
			'E + ( E )',
			'E + ( E )',
			'E + ( E )',
			'stopped after 5 steps'
		]);
		expect(run.diagnostics.map((d) => d.severity)).toEqual(['warning']);
		expect(DEFAULT_PARSE_STEPS).toBe(20_000);
		// Without maxSteps the growing stack stops it.
		const long = ll1Parse(t, ['int']);
		expect(long.outcome).toBe('limit');
		expect(long.rows.length).toBeLessThan(DEFAULT_PARSE_STEPS);
		const stored = long.rows.reduce((sum, r) => sum + r.stack.length, 0);
		expect(stored).toBeLessThanOrEqual(PARSE_STACK_BUDGET + long.rows.at(-1)!.stack.length);
		expect(long.rows.at(-1)!.action).toEqual({ kind: 'limit' });
		expect(long.rows.at(-1)!.text).toBe(TREE_DEPTH_TEXT);
		// The other order of the same grammar reaches a blank entry instead.
		const other = ll1Table(grammar('E → int | E + ( E )'));
		expect(ll1Parse(other, ['int', '+']).outcome).toBe('error');
	});

	it('stops a left-recursive run before its tree is too deep for a structured clone', () => {
		// Table-based Predictive Parsing, slide 26: E → E + T puts E back on top for ever.
		const t = ll1Table(grammar('E → E + T | T\nT → int'));
		expect(t.ll1).toBe(false);
		const run = ll1Parse(t, ['int', '+', 'int']);
		expect(run.outcome).toBe('limit');
		expect(MAX_TREE_DEPTH).toBe(500);
		expect(TREE_DEPTH_TEXT).toBe('stopped: the parse tree would be more than 500 levels deep');
		const last = run.rows.at(-1)!;
		expect(last).toMatchObject({ action: { kind: 'limit' }, text: TREE_DEPTH_TEXT, cell: null });
		expect(treeDepth(last.tree)).toBe(MAX_TREE_DEPTH);
		expect(last.focus).toHaveLength(MAX_TREE_DEPTH - 1);
		expect(Math.max(...run.rows.map((r) => treeDepth(r.tree)))).toBe(MAX_TREE_DEPTH);
		expect(() => structuredClone(run)).not.toThrow();
	});

	it('takes a list up to the tree depth limit, and its results clone', () => {
		const t = ll1Table(grammar('S → id S | ε'));
		expect(t.ll1).toBe(true);
		// S( id S( id … S(ε) ) ): one level per id, and one for S(ε).
		const longest = ll1Parse(t, Array(MAX_TREE_DEPTH - 1).fill('id'));
		expect(longest.outcome).toBe('accept');
		expect(treeDepth(longest.tree!)).toBe(MAX_TREE_DEPTH);
		expect(longest.tree).toMatchObject({ start: 0, end: MAX_TREE_DEPTH - 1 });
		expect(structuredClone(longest).tree).toEqual(longest.tree);
		const over = ll1Parse(t, Array(MAX_TREE_DEPTH).fill('id'));
		expect(over.outcome).toBe('limit');
		expect(over.rows.at(-1)!.text).toBe(TREE_DEPTH_TEXT);
		const long = ll1Parse(t, Array(2000).fill('id'));
		expect(long.outcome).toBe('limit');
		expect(long.rows.every((r) => treeDepth(r.tree) <= MAX_TREE_DEPTH)).toBe(true);
		expect(() => structuredClone(long)).not.toThrow();
		// Nested parentheses: three levels each (E, T, F).
		const nested = ll1Table(grammar('E → T X\nX → + E | ε\nT → F Y\nY → * T | ε\nF → ( E ) | int'));
		const parens = (k: number) => [...Array(k).fill('('), 'int', ...Array(k).fill(')')];
		expect(ll1Parse(nested, parens(165)).outcome).toBe('accept');
		expect(ll1Parse(nested, parens(166)).outcome).toBe('limit');
	});

	it('accepts exactly the sentences of an LL(1) grammar, with their one parse tree', () => {
		const next = random(2026);
		let tried = 0;
		for (let found = 0; found < 60; tried++) {
			const h = randomGrammar(next);
			const t = ll1Table(h);
			if (!t.ll1) continue;
			found++;
			const strings = [...bruteForce(h, 4).slice(0, 20)];
			for (let k = 0; k < 20; k++) strings.push(randomTokens(next, h, 5));
			for (const tokens of strings) {
				const run = ll1Parse(t, tokens);
				const expected = recognizes(h, tokens);
				expect(run.outcome, `${tokens.join(' ')} in ${JSON.stringify(h.productions)}`).toBe(
					expected ? 'accept' : 'error'
				);
				if (!expected) continue;
				const { trees } = parseTrees(h, tokens);
				expect(trees).toHaveLength(1);
				expect(treeEquals(run.tree!, trees[0])).toBe(true);
				expect(run.tree).toEqual(trees[0]);
			}
		}
		expect(tried).toBeLessThan(2000);
	});

	it('returns plain data', () => {
		const run = ll1Parse(table, input(g, 'int * ( int + int )'));
		expect(run.outcome).toBe('accept');
		expect(structuredClone(run)).toEqual(run);
		expect(structuredClone(table)).toEqual(table);
	});
});

describe('endInput', () => {
	it('appends $ once', () => {
		expect(endInput(g, ['int'])).toEqual({ input: ['int', '$'], diagnostics: [] });
		expect(endInput(g, ['int', '$'])).toEqual({ input: ['int', '$'], diagnostics: [] });
		expect(endInput(g, [])).toEqual({ input: ['$'], diagnostics: [] });
	});

	it('keeps a $ that is a terminal of the grammar', () => {
		const h = grammar('S’ → S $\nS → a');
		expect(endInput(h, ['a', '$']).input).toEqual(['a', '$', '$']);
	});
});

describe('replaceAt and withRanges', () => {
	const leaf = (symbol: string, terminal = true): ParseNode => ({ symbol, terminal, children: [] });
	const tree: ParseNode = {
		symbol: 'S',
		terminal: false,
		production: 0,
		children: [leaf('a'), { symbol: 'A', terminal: false, production: 1, children: [leaf('b')] }]
	};

	it('copies the path and shares the rest', () => {
		const changed = replaceAt(tree, [1, 0], (node) => ({ ...node, symbol: 'c' }));
		expect(bracketForm(changed)).toBe('S( a A(c) )');
		expect(bracketForm(tree)).toBe('S( a A(b) )');
		expect(changed.children[0]).toBe(tree.children[0]);
		expect(replaceAt(tree, [], () => leaf('x')).symbol).toBe('x');
	});

	it('numbers every node of a complete tree', () => {
		const eps: ParseNode = { symbol: 'B', terminal: false, production: 2, children: [] };
		const numbered = withRanges({ ...tree, children: [...tree.children, eps] });
		expect(numbered).toMatchObject({ start: 0, end: 2 });
		expect(numbered.children.map((c) => [c.start, c.end])).toEqual([
			[0, 1],
			[1, 2],
			[2, 2]
		]);
		expect(tree.start).toBeUndefined();
	});
});
