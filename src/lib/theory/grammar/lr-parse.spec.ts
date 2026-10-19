import { describe, expect, it } from 'vitest';
import { unproductive } from './analyze';
import { bracketForm, treeEquals } from './derive';
import { parseTrees, recognizes } from './earley';
import { DEFAULT_PARSE_STEPS, MAX_TREE_DEPTH, PARSE_STACK_BUDGET, TREE_DEPTH_TEXT } from './ll1';
import { lalr1Automaton, lr0Automaton, lr1Automaton, type LrAutomaton } from './lr';
import {
	STACK_BOTTOM,
	collapseShifts,
	lrParse,
	printCompact,
	printConfiguration,
	printStack,
	shiftReduceRows,
	type LrParse
} from './lr-parse';
import { lrTable, type LrMethod, type LrTable } from './lr-table';
import { printSymbols } from './parse';
import {
	BOTTOM_UP,
	CASCADE,
	ID_SEQUENCE_FIXED,
	LEFT_FACTORED,
	bruteForce,
	grammar,
	input,
	random,
	randomGrammar,
	randomTokens,
	treeDepth
} from './test-helpers';
import type { Grammar } from './types';

const g = grammar(BOTTOM_UP);
const table = lrTable(lr1Automaton(g));
const run = (t: LrTable, text: string): LrParse => lrParse(t, input(t.augmented.grammar, text));

describe('lrParse', () => {
	const parse = run(table, 'int + (int) + (int)');

	it('reproduces the shift-reduce trace of Bottom-up Parsing II, slide 14', () => {
		expect(parse.outcome).toBe('accept');
		expect(
			collapseShifts(shiftReduceRows(parse)).map(
				(r) => `${printConfiguration(r.stack, r.input)}  ${r.text}`
			)
		).toEqual([
			'I int + (int) + (int)$  shift',
			'int I + (int) + (int)$  red. E → int',
			'E I + (int) + (int)$  shift 3 times',
			'E + (int I ) + (int)$  red. E → int',
			'E + (E I ) + (int)$  shift',
			'E + (E) I + (int)$  red. E → E + (E)',
			'E I + (int)$  shift 3 times',
			'E + (int I )$  red. E → int',
			'E + (E I )$  shift',
			'E + (E) I $  red. E → E + (E)',
			'E I $  accept'
		]);
	});

	it('runs the algorithm of slide 21: lookups, pops, Goto and the stack of pairs', () => {
		expect(parse.input).toEqual(['int', '+', '(', 'int', ')', '+', '(', 'int', ')', '$']);
		expect(parse.rows.map((r) => `${printStack(r.stack)} | ${r.text}`)).toEqual([
			'< dummy, 0 > | shift 1',
			'< dummy, 0 > < int, 1 > | reduce E → int',
			'< dummy, 0 > < E, 2 > | shift 3',
			'< dummy, 0 > < E, 2 > < +, 3 > | shift 4',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > | shift 5',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < int, 5 > | reduce E → int',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < E, 6 > | shift 7',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < E, 6 > < ), 7 > | reduce E → E + ( E )',
			'< dummy, 0 > < E, 2 > | shift 3',
			'< dummy, 0 > < E, 2 > < +, 3 > | shift 4',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > | shift 5',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < int, 5 > | reduce E → int',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < E, 6 > | shift 7',
			'< dummy, 0 > < E, 2 > < +, 3 > < (, 4 > < E, 6 > < ), 7 > | reduce E → E + ( E )',
			'< dummy, 0 > < E, 2 > | accept'
		]);
		expect(parse.rows[1]).toMatchObject({
			j: 1,
			lookup: { state: 1, terminal: '+' },
			action: { kind: 'reduce', production: 1 },
			popped: [{ symbol: 'int', state: 1 }],
			goto: { state: 0, nonterminal: 'E', to: 2 },
			pushed: { symbol: 'E', state: 2 }
		});
		expect(parse.rows[7].popped).toHaveLength(5);
		expect(parse.rows[7].goto).toEqual({ state: 0, nonterminal: 'E', to: 2 });
		expect(parse.rows[0]).toMatchObject({
			j: 0,
			lookup: { state: 0, terminal: 'int' },
			pushed: { symbol: 'int', state: 1 },
			goto: null
		});
		expect(parse.rows.at(-1)!).toMatchObject({ j: 9, lookup: { state: 2, terminal: '$' } });
		expect(STACK_BOTTOM).toBe('dummy');
	});

	it('keeps the parse forest after each step', () => {
		expect(parse.rows.map((r) => r.forest.map(bracketForm).join(' '))).toEqual([
			'int',
			'E(int)',
			'E(int) +',
			'E(int) + (',
			'E(int) + ( int',
			'E(int) + ( E(int)',
			'E(int) + ( E(int) )',
			'E( E(int) + ( E(int) ) )',
			'E( E(int) + ( E(int) ) ) +',
			'E( E(int) + ( E(int) ) ) + (',
			'E( E(int) + ( E(int) ) ) + ( int',
			'E( E(int) + ( E(int) ) ) + ( E(int)',
			'E( E(int) + ( E(int) ) ) + ( E(int) )',
			'E( E( E(int) + ( E(int) ) ) + ( E(int) ) )',
			'E( E( E(int) + ( E(int) ) ) + ( E(int) ) )'
		]);
		expect(bracketForm(parse.tree!)).toBe('E( E( E(int) + ( E(int) ) ) + ( E(int) ) )');
		expect(parse.tree).toMatchObject({ start: 0, end: 9, production: 0 });
		expect(parse.tree!.children[0]).toMatchObject({ start: 0, end: 5 });
		// Subtrees are shared from row to row.
		expect(parse.rows[8].forest[0]).toBe(parse.rows[7].forest[0]);
	});

	it('parses nested parentheses up to the tree depth limit, sharing stack pairs between rows', () => {
		const h = grammar(CASCADE);
		const t = lrTable(lr1Automaton(h));
		const parens = (k: number) => [...Array(k).fill('('), 'int', ...Array(k).fill(')')];
		// Three levels per pair of parentheses (E, T, F), four for E(T(F(int))).
		const deep = lrParse(t, parens(165));
		expect(deep.outcome).toBe('accept');
		expect(deep.tree).toMatchObject({ start: 0, end: 331 });
		expect(treeDepth(deep.tree!)).toBe(3 * 165 + 4);
		expect(deep.rows[2].stack[0]).toBe(deep.rows[1].stack[0]);
		expect(deep.rows[5].stack[3]).toBe(deep.rows[4].stack[3]);
		expect(structuredClone(deep).tree).toEqual(deep.tree);
		const over = lrParse(t, parens(1000));
		expect(over.outcome).toBe('limit');
		expect(over.tree).toBeNull();
		expect(over.rows.at(-1)).toMatchObject({ action: null, text: TREE_DEPTH_TEXT });
		expect(shiftReduceRows(over).at(-1)).toMatchObject({ action: 'limit', text: 'stopped' });
		expect(over.rows.every((r) => r.forest.every((f) => treeDepth(f) <= MAX_TREE_DEPTH))).toBe(
			true
		);
		expect(() => structuredClone(over)).not.toThrow();
	});

	it('takes a list up to the tree depth limit, and its results clone', () => {
		// S → id S | ε shifts every id before it reduces: the tree grows only at the end.
		const t = lrTable(lr1Automaton(grammar(ID_SEQUENCE_FIXED)));
		const longest = lrParse(t, Array(MAX_TREE_DEPTH - 1).fill('id'));
		expect(longest.outcome).toBe('accept');
		expect(treeDepth(longest.tree!)).toBe(MAX_TREE_DEPTH);
		expect(structuredClone(longest).tree).toEqual(longest.tree);
		const long = lrParse(t, Array(2000).fill('id'));
		expect(long.outcome).toBe('limit');
		expect(long.rows.at(-1)!.text).toBe(TREE_DEPTH_TEXT);
		// 2000 shifts, then reductions until the tree would have 501 levels.
		expect(long.rows).toHaveLength(2000 + MAX_TREE_DEPTH + 1);
		expect(() => structuredClone(long)).not.toThrow();
		// A left-recursive list keeps the stack short; the tree still grows a level per item.
		const left = lrTable(lr1Automaton(grammar('S → S id | ε')));
		expect(lrParse(left, Array(MAX_TREE_DEPTH - 1).fill('id')).outcome).toBe('accept');
		expect(lrParse(left, Array(MAX_TREE_DEPTH).fill('id')).outcome).toBe('limit');
	});

	it('visits states 8–11 on nested parentheses', () => {
		const nested = run(table, 'int + (int + (int))');
		expect(nested.outcome).toBe('accept');
		const states = new Set(nested.rows.flatMap((r) => r.stack.map((e) => e.state)));
		for (const s of [8, 9, 10, 11]) expect(states.has(s)).toBe(true);
	});

	it('halts and reports an error at a blank entry', () => {
		const bad = run(table, 'int +');
		expect(bad.outcome).toBe('error');
		expect(bad.tree).toBeNull();
		expect(bad.rows.at(-1)!).toMatchObject({
			action: null,
			lookup: { state: 3, terminal: '$' },
			text: 'error: action[3, $] is blank'
		});
		expect(shiftReduceRows(bad).at(-1)!.text).toBe('error');
		expect(lrParse(table, ['int', 'id']).rows.at(-1)!.text).toBe('error: action[1, id] is blank');
		const early = lrParse(table, ['int', '$', 'int']);
		expect(early.rows).toEqual([]);
		expect(early.diagnostics.map((d) => d.severity)).toEqual(['error']);
		expect(lrParse(table, ['int', '$']).outcome).toBe('accept');
	});

	it('reduces an ε-production by popping nothing', () => {
		const t = lrTable(lr1Automaton(grammar(ID_SEQUENCE_FIXED)));
		const empty = lrParse(t, []);
		expect(empty.rows.map((r) => r.text)).toEqual(['reduce S → ε', 'accept']);
		expect(empty.rows[0].popped).toEqual([]);
		expect(empty.tree).toEqual({
			symbol: 'S',
			terminal: false,
			children: [],
			production: 0,
			start: 0,
			end: 0
		});
		expect(shiftReduceRows(empty)[0].text).toBe('red. S → ε');
		const two = run(t, 'id id');
		expect(bracketForm(two.tree!)).toBe('S( id S( id S(ε) ) )');
		expect(two.tree!.children[1].children[1]).toMatchObject({ start: 2, end: 2 });
	});

	it('stops at the step limit', () => {
		const limited = lrParse(table, input(g, 'int + (int)'), { maxSteps: 3 });
		expect(limited.outcome).toBe('limit');
		expect(limited.rows.map((r) => r.text)).toEqual([
			'shift 1',
			'reduce E → int',
			'stopped after 2 steps'
		]);
	});

	it('stops a run whose stack keeps growing before its rows fill memory', () => {
		// S derives nothing, so A → ε is reduced on every terminal and never shifted past.
		const t = lrTable(lr0Automaton(grammar('S → A S b\nA → ε')));
		expect(t.conflicts).toEqual([]);
		const loop = lrParse(t, ['b']);
		expect(loop.outcome).toBe('limit');
		const stored = loop.rows.reduce((sum, r) => sum + r.stack.length, 0);
		expect(stored).toBeLessThanOrEqual(PARSE_STACK_BUDGET + loop.rows.at(-1)!.stack.length);
		expect(loop.rows.length).toBeLessThan(DEFAULT_PARSE_STEPS);
		expect(loop.rows.at(-1)!.text).toBe(`stopped after ${loop.rows.length - 1} steps`);
		expect(shiftReduceRows(loop).at(-1)).toMatchObject({ action: 'limit', text: 'stopped' });
		// The LR(1) table has no lookahead for A → ε here: the input is refused at once.
		expect(lrParse(lrTable(lr1Automaton(grammar('S → A S b\nA → ε'))), ['b']).rows).toHaveLength(1);
	});

	it('reports a blank Goto entry', () => {
		// A hand-made table whose goto column is empty.
		const broken: LrTable = { ...table, goto: table.goto.map((row) => row.map(() => null)) };
		const r = lrParse(broken, ['int']);
		expect(r.outcome).toBe('error');
		expect(r.rows.at(-1)!.text).toBe('error: Goto[0, E] is blank');
		expect(shiftReduceRows(r).at(-1)!.action).toBe('error');
	});

	it('accepts exactly the sentences, with their one tree, whenever a table has no conflicts', () => {
		const next = random(435);
		const found: Record<LrMethod | 'lalr1', number> = { lr0: 0, slr1: 0, lalr1: 0, lr1: 0 };
		for (let i = 0; i < 400; i++) {
			const h = randomGrammar(next);
			const lr1 = lr1Automaton(h, { trace: false });
			const lr0 = lr0Automaton(h, { trace: false });
			const tables: [keyof typeof found, LrAutomaton, LrMethod][] = [
				['lr0', lr0, 'lr0'],
				['slr1', lr0, 'slr1'],
				['lalr1', lalr1Automaton(lr1), 'lr1'],
				['lr1', lr1, 'lr1']
			];
			const strings = [...bruteForce(h, 4).slice(0, 12)];
			for (let k = 0; k < 12; k++) strings.push(randomTokens(next, h, 5));
			for (const [name, a, method] of tables) {
				const t = lrTable(a, { method });
				if (t.conflicts.length > 0) continue;
				found[name]++;
				for (const tokens of strings) {
					const p = lrParse(t, tokens);
					const expected = recognizes(h, tokens);
					const where = `${name}: ${printSymbols(tokens)} in ${JSON.stringify(h.productions.map((q) => [q.lhs, q.rhs]))}`;
					if (p.outcome === 'limit') {
						// Reducing without lookaheads, LR(0) can loop where a non-terminal derives nothing.
						expect(name, where).toBe('lr0');
						expect(unproductive(h), where).not.toEqual([]);
						expect(expected, where).toBe(false);
						continue;
					}
					expect(p.outcome, where).toBe(expected ? 'accept' : 'error');
					if (!expected) continue;
					const { trees } = parseTrees(h, tokens);
					expect(trees, where).toHaveLength(1);
					expect(treeEquals(p.tree!, trees[0]), where).toBe(true);
					expect(p.tree, where).toEqual(trees[0]);
				}
			}
		}
		for (const n of Object.values(found)) expect(n).toBeGreaterThan(20);
	});

	it('returns plain data', () => {
		expect(structuredClone(parse)).toEqual(parse);
		const t = lrTable(lr1Automaton(grammar(LEFT_FACTORED)));
		const p = run(t, 'int * ( int + int )');
		expect(p.outcome).toBe('accept');
		expect(structuredClone(p)).toEqual(p);
	});
});

describe('shiftReduceRows and collapseShifts', () => {
	it('lists each configuration with its action and the parse rows it stands for', () => {
		const rows = shiftReduceRows(run(table, 'int + (int)'));
		expect(rows[0]).toEqual({
			stack: [],
			input: ['int', '+', '(', 'int', ')', '$'],
			action: 'shift',
			production: null,
			count: 1,
			text: 'shift',
			rows: [0]
		});
		expect(rows[1]).toMatchObject({ action: 'reduce', production: 1, text: 'red. E → int' });
		const collapsed = collapseShifts(rows);
		expect(collapsed[2]).toMatchObject({ action: 'shift', count: 3, rows: [2, 3, 4] });
		expect(collapsed.map((r) => r.text)).toEqual([
			'shift',
			'red. E → int',
			'shift 3 times',
			'red. E → int',
			'shift',
			'red. E → E + (E)',
			'accept'
		]);
		expect(collapseShifts([])).toEqual([]);
	});
});

describe('printing', () => {
	it('writes forms compactly, as Bottom-Up Parsing and Bottom-up Parsing II do', () => {
		expect(printCompact(['int', '+', '(', 'int', ')', '+', '(', 'int', ')'])).toBe(
			'int + (int) + (int)'
		);
		expect(printCompact(['E', '+', '(', 'E', ')', '$'])).toBe('E + (E)$');
		expect(printCompact([])).toBe('ε');
		expect(printCompact(['"x"', 'a'])).toBe('\'"x"\' a');
	});

	it('writes configurations with the divider', () => {
		expect(printConfiguration([], ['int', '$'])).toBe('I int$');
		expect(printConfiguration(['E'], ['$'])).toBe('E I $');
		expect(printConfiguration(['E', '+', '(', 'int'], [')', '$'], { compact: false })).toBe(
			'E + ( int I ) $'
		);
		expect(printConfiguration(['E'], [], { divider: '|' })).toBe('E |');
	});

	it('writes the stack of pairs', () => {
		expect(
			printStack([
				{ symbol: null, state: 0 },
				{ symbol: 'E', state: 2 }
			])
		).toBe('< dummy, 0 > < E, 2 >');
	});
});

describe('grammars of the decks', () => {
	it('parses the LL(1) grammar of Table-based Predictive Parsing bottom-up too', () => {
		const h: Grammar = grammar(LEFT_FACTORED);
		const t = lrTable(lr1Automaton(h));
		expect(t.conflicts).toEqual([]);
		expect(bracketForm(run(t, 'int * int').tree!)).toBe('E( T( int Y( * T( int Y(ε) ) ) ) X(ε) )');
	});
});
