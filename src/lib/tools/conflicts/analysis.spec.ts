/**
 * The analysis against Bottom-up Parsing III, slides 17–25: the conflict
 * items, the ⇒ views, the stack and the two moves, the resolution in the
 * deck's words, and the parse as resolved and with the other action.
 */
import { describe, expect, it } from 'vitest';
import { formatItem, type ItemView } from '$lib/components/grammar/lr-item';
import { nodeAtPath } from '$lib/components/grammar/tree-layout';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import { bracketForm } from '$lib/theory/grammar/derive';
import { lr1Automaton } from '$lib/theory/grammar/lr';
import { lrTable } from '$lib/theory/grammar/lr-table';
import { lrParse } from '$lib/theory/grammar/lr-parse';
import { parseGrammar } from '$lib/theory/grammar/parse';
import type { ParseNode } from '$lib/theory/grammar/types';
import { analyze, sameRequest, type AnalysisRequest, type AnalysisResult } from './analysis';
import { conflictContext, moveOf, shortestPaths } from './context';
import { summaryText } from './view';
import { effectiveChoices, looksUp, overrideTable, parseWith } from './override';
import { SHIFT_IF, explain, winnerOf } from './resolution';
import { readPrecedenceText } from './precedence';

const E = 'E → E + E | E * E | int';
const DECLARED = "%left '+'\n%left '*'";

function done(request: Partial<AnalysisRequest> & { grammar: string }) {
	const result = analyze({ precedence: '', input: '', choices: [], ...request });
	if (result.status !== 'done') throw new Error(`not done: ${result.status}`);
	return result;
}

type Done = Extract<AnalysisResult, { status: 'done' }>;
const conflictOn = (r: Done, state: number, terminal: string) =>
	r.conflicts.find((c) => c.state === state && c.terminal === terminal)!;
const items = (list: readonly ItemView[]) => list.map((i) => formatItem(i));
const rows = (r: Done, state: number, terminal: string) =>
	conflictOn(r, state, terminal).context.rows.map((row) => [
		row.left ? formatItem(row.left) : null,
		formatItem(row.right)
	]);

describe('shift/reduce conflicts of E → E + E | E * E | int', () => {
	const plain = done({ grammar: E, input: 'int * int + int' });

	it('has two in each of states 5 and 6, all settled by bison’s default', () => {
		expect(plain.conflicts.map((c) => [c.state, c.terminal, c.kind])).toEqual([
			[5, '+', 'shift/reduce'],
			[5, '*', 'shift/reduce'],
			[6, '+', 'shift/reduce'],
			[6, '*', 'shift/reduce']
		]);
		// Numbered as LR(1) states, each with its state in Parser.output.
		expect(plain.summary).toEqual([
			{ state: 5, bisonState: 6, sr: 2, rr: 0 },
			{ state: 6, bisonState: 7, sr: 2, rr: 0 }
		]);
		expect(plain.summary.map(summaryText)).toEqual([
			'LR(1) state 5 conflicts: 2 shift/reduce',
			'LR(1) state 6 conflicts: 2 shift/reduce'
		]);
		expect(plain.report.head[0].lines).toEqual([
			'State 6 conflicts: 2 shift/reduce',
			'State 7 conflicts: 2 shift/reduce'
		]);
		expect(plain.unresolved).toEqual({ sr: 4, rr: 0 });
		expect(plain.resolved).toBe(0);
		expect(plain.conflicts.every((c) => c.explanation.by === 'default')).toBe(true);
	});

	it('shows slide 18: [E → E * • E, +] [E → • E + E, +] ⇒E [E → E * E •, +] [E → E • + E, +]', () => {
		const c = conflictOn(plain, 6, '+');
		expect(c.context.from).toEqual({ state: 4, symbol: 'E' });
		expect(rows(plain, 6, '+')).toEqual([
			['[E → E * • E, +]', '[E → E * E •, +]'],
			['[E → • E + E, +]', '[E → E • + E, +]']
		]);
		// The deck's template: [X → α•aβ, b] and [Y → γ•, a].
		expect(items(c.items)).toEqual(['[E → E • + E, +]', '[E → E * E •, +]']);
	});

	it('shows slide 21: [E → E + • E, +] [E → • E + E, +] ⇒E [E → E + E •, +] [E → E • + E, +]', () => {
		expect(conflictOn(plain, 5, '+').context.from).toEqual({ state: 3, symbol: 'E' });
		expect(rows(plain, 5, '+')).toEqual([
			['[E → E + • E, +]', '[E → E + E •, +]'],
			['[E → • E + E, +]', '[E → E • + E, +]']
		]);
	});

	it('shows the stack E * E with + next, and where shift and reduce lead', () => {
		const c = conflictOn(plain, 6, '+');
		expect(c.context.stack).toEqual(['E', '*', 'E']);
		expect(c.context.states).toEqual([0, 2, 4, 6]);
		expect(c.moves).toEqual([
			{ kind: 'shift', production: null, text: 'shift', stack: ['E', '*', 'E', '+'], next: null },
			{
				kind: 'reduce',
				production: 1,
				text: 'red. E → E * E',
				stack: ['E'],
				next: '+'
			}
		]);
	});

	it('shifts by default, so int * int + int parses as int * (int + int)', () => {
		const c = conflictOn(plain, 6, '+');
		expect(c.explanation.shiftIf).toEqual([true, false, false]);
		expect(c.explanation.winner).toBe(0);
		expect(c.explanation.text).toBe(
			'shift because no precedence is declared for rule E → E * E or for terminal +'
		);
		expect(plain.parse!.outcome).toBe('accept');
		expect(bracketForm(plain.parse!.tree!)).toBe('E( E(int) * E( E(int) + E(int) ) )');
		expect(c.used).toBe(true);
		expect(conflictOn(plain, 5, '+').used).toBe(false);
	});

	it('takes the other action on request: reduce E → E * E gives (int * int) + int', () => {
		const index = conflictOn(plain, 6, '+').index;
		const other = done({ grammar: E, input: 'int * int + int', choices: [[index, 1]] });
		expect(other.choices).toEqual([[index, 1]]);
		expect(bracketForm(other.alternative!.tree!)).toBe('E( E( E(int) * E(int) ) + E(int) )');
		// The parse as resolved stays as it was.
		expect(bracketForm(other.parse!.tree!)).toBe('E( E(int) * E( E(int) + E(int) ) )');
		expect(conflictOn(other, 6, '+').usedAlternative).toBe(true);
		expect(other.comparison).toEqual({ same: false, lookedUp: true });
		// An entry the parse never looks up leaves the tree as it is.
		const unused = done({ grammar: E, input: 'int + int', choices: [[index, 1]] });
		expect(unused.comparison).toEqual({ same: true, lookedUp: false });
		// Choosing the action that won anyway changes nothing.
		const same = done({ grammar: E, input: 'int * int + int', choices: [[index, 0]] });
		expect(same.choices).toEqual([]);
		expect(same.alternative).toBeNull();
	});
});

describe('precedence declarations (slides 19–21)', () => {
	const declared = done({ grammar: E, precedence: DECLARED, input: 'int + int * int' });

	it('settles all four conflicts, so bison reports none', () => {
		expect(declared.summary).toEqual([]);
		expect(declared.unresolved).toEqual({ sr: 0, rr: 0 });
		expect(declared.resolved).toBe(4);
		expect(declared.conflicts.every((c) => c.explanation.by === 'precedence')).toBe(true);
	});

	it('gives slide 20’s answer for [E → E * E •, +]', () => {
		const c = conflictOn(declared, 6, '+');
		expect(c.explanation.text).toBe(
			'reduce because precedence of rule E → E * E is higher than that of terminal +'
		);
		expect(c.explanation.shiftIf).toEqual([false, false, false]);
		expect(c.explanation.winner).toBe(1);
		expect(c.explanation.rule).toEqual({
			production: 1,
			text: 'E → E * E',
			last: '*',
			precedence: { level: 2, assoc: 'left' }
		});
		expect(c.explanation.token).toEqual({
			terminal: '+',
			precedence: { level: 1, assoc: 'left' }
		});
	});

	it('reduces for slide 21’s [E → E + E •, +]: the same precedence and left associative', () => {
		const c = conflictOn(declared, 5, '+');
		expect(c.explanation.text).toBe(
			'reduce because the precedences of rule E → E + E and terminal + are the same and left associative'
		);
		expect(c.explanation.shiftIf).toEqual([false, false, false]);
	});

	it('shifts * after E + E: the input terminal has higher precedence than the rule', () => {
		const c = conflictOn(declared, 5, '*');
		expect(c.explanation.shiftIf).toEqual([false, true, false]);
		expect(c.explanation.text).toBe(
			'shift because terminal * has higher precedence than rule E → E + E'
		);
		expect(SHIFT_IF[1]).toBe('input terminal has higher precedence than the rule');
	});

	it('parses int + int * int as int + (int * int)', () => {
		expect(bracketForm(declared.parse!.tree!)).toBe('E( E(int) + E( E(int) * E(int) ) )');
	});

	it('shifts on equal precedence with %right, and makes an error entry with %nonassoc', () => {
		const right = done({
			grammar: 'E → E + E | E ^ E | int',
			precedence: "%left '+'\n%right '^'",
			input: 'int ^ int ^ int + int'
		});
		const c = conflictOn(right, 6, '^');
		expect(c.explanation.shiftIf).toEqual([false, false, true]);
		expect(c.explanation.text).toBe(
			'shift because the precedences of rule E → E ^ E and terminal ^ are the same and right associative'
		);
		expect(bracketForm(right.parse!.tree!)).toBe(
			'E( E( E(int) ^ E( E(int) ^ E(int) ) ) + E(int) )'
		);
		const nonassoc = done({
			grammar: 'E → E < E | E + E | int',
			precedence: "%nonassoc '<'\n%left '+'",
			input: 'int < int < int'
		});
		const n = conflictOn(nonassoc, 5, '<');
		expect(n.explanation.winner).toBe('error');
		expect(n.explanation.text).toBe(
			'error because the precedences of rule E → E < E and terminal < are the same and non-associative'
		);
		expect(nonassoc.parse).toMatchObject({
			outcome: 'error',
			text: 'error: action[5, <] is an error entry',
			at: 3
		});
	});

	it('names a rule without a declared last terminal, or without any terminal', () => {
		const half = done({ grammar: E, precedence: "%left '+'", input: '' });
		expect(conflictOn(half, 6, '+').explanation.text).toBe(
			'shift because no precedence is declared for rule E → E * E (its last terminal * has none)'
		);
		expect(conflictOn(half, 5, '*').explanation.text).toBe(
			'shift because no precedence is declared for terminal *'
		);
		const g = parseGrammar('S → S S | x').grammar!;
		const a = lr1Automaton(g);
		const terminals = new Map([['x', { level: 1, assoc: 'left' as const }]]);
		const table = lrTable(a, { precedence: [{ assoc: 'left', terminals: ['x'] }] });
		const texts = table.conflicts.map((c) => explain(a.augmented, c, terminals).text);
		expect(texts).toContain(
			'shift because no precedence is declared for rule S → S S (it has no terminal)'
		);
	});
});

describe('the dangling else (slides 17 and 22)', () => {
	const grammar = 'S → if E then S | if E then S else S | OTHER';
	const input = 'if E then if E then OTHER else OTHER';

	it('has one shift/reduce conflict on else, settled by the default shift', () => {
		const r = done({ grammar, input });
		expect(r.conflicts).toHaveLength(1);
		const c = r.conflicts[0];
		expect([c.terminal, c.kind]).toEqual(['else', 'shift/reduce']);
		// Slide 17 writes the shift item's lookahead as x.
		expect(items(c.items)).toEqual([
			'[S → if E then S • else S, else]',
			'[S → if E then S •, else]'
		]);
		expect(c.context.stack).toEqual(['if', 'E', 'then', 'if', 'E', 'then', 'S']);
		expect(c.moves.map((m) => [m.text, m.stack.join(' '), m.next])).toEqual([
			['shift', 'if E then if E then S else', null],
			['red. S → if E then S', 'if E then S', 'else']
		]);
		expect(c.explanation.text).toBe(
			'shift because no precedence is declared for rule S → if E then S or for terminal else'
		);
		// The else attaches to the nearest if.
		expect(bracketForm(r.parse!.tree!)).toBe(
			'S( if E then S( if E then S(OTHER) else S(OTHER) ) )'
		);
		const other = done({ grammar, input, choices: [[0, 1]] });
		expect(bracketForm(other.alternative!.tree!)).toBe(
			'S( if E then S( if E then S(OTHER) ) else S(OTHER) )'
		);
	});

	it('is settled by precedence when else is declared above then', () => {
		const r = done({ grammar, input, precedence: '%left then\n%left else' });
		expect(r.unresolved).toEqual({ sr: 0, rr: 0 });
		expect(r.conflicts[0].explanation.text).toBe(
			'shift because terminal else has higher precedence than rule S → if E then S'
		);
		expect(bracketForm(r.parse!.tree!)).toBe(
			'S( if E then S( if E then S(OTHER) else S(OTHER) ) )'
		);
	});
});

describe('reduce/reduce conflicts (slides 24–25)', () => {
	it('shows slide 25’s states for S → ε | id | id S', () => {
		const r = done({ grammar: 'S → ε | id | id S', input: 'id' });
		expect(r.start).toBe('S’');
		expect(r.conflicts).toHaveLength(1);
		const c = r.conflicts[0];
		expect([c.state, c.terminal, c.kind]).toEqual([1, '$', 'reduce/reduce']);
		expect(c.context.from).toEqual({ state: 0, symbol: 'id' });
		expect(items(c.context.fromItems)).toEqual([
			'[S’ → • S, $]',
			'[S → •, $]',
			'[S → • id, $]',
			'[S → • id S, $]'
		]);
		expect(items(c.context.toItems)).toEqual([
			'[S → id •, $]',
			'[S → id • S, $]',
			'[S → •, $]',
			'[S → • id, $]',
			'[S → • id S, $]'
		]);
		// The deck's template: [X → α•, a] and [Y → β•, a], the earlier rule first.
		expect(items(c.items)).toEqual(['[S → •, $]', '[S → id •, $]']);
		expect(c.context.toMarked).toEqual([2, 0]);
		expect(c.context.fromMarked).toEqual([2]);
		expect(rows(r, 1, '$')).toEqual([
			['[S → • id, $]', '[S → id •, $]'],
			[null, '[S → •, $]']
		]);
		expect(c.moves.map((m) => [m.text, m.stack.join(' ')])).toEqual([
			['red. S → ε', 'id S'],
			['red. S → id', 'S']
		]);
		expect(c.explanation).toMatchObject({
			by: 'default',
			winner: 0,
			shiftIf: null,
			text: 'reduce by S → ε because it is the earlier rule'
		});
		expect(r.summary.map(summaryText)).toEqual(['LR(1) state 1 conflicts: 1 reduce/reduce']);
		expect(bracketForm(r.parse!.tree!)).toBe('S( id S(ε) )');
		const other = done({ grammar: 'S → ε | id | id S', input: 'id', choices: [[0, 1]] });
		expect(bracketForm(other.alternative!.tree!)).toBe('S(id)');
	});

	it('has none after the rewrite S → ε | id S', () => {
		const r = done({ grammar: 'S → ε | id S', input: 'id id' });
		expect(r.conflicts).toEqual([]);
		expect(r.summary).toEqual([]);
		expect(bracketForm(r.parse!.tree!)).toBe('S( id S( id S(ε) ) )');
	});
});

describe('the C- grammar', () => {
	it('has 372 LR(1) states and one conflict, the dangling else', () => {
		const r = done({
			grammar: CMINUS_BNF,
			input: 'void ID ( void ) { if ( ID ) if ( ID ) ID = NUM ; else ID = NUM ; }'
		});
		expect(r.states).toBe(372);
		expect(r.lalrStates).toBe(115);
		expect(r.conflicts).toHaveLength(1);
		expect(r.conflicts[0].terminal).toBe('else');
		expect(r.conflicts[0].context.from?.symbol).toBe('statement');
		expect(r.parse!.outcome).toBe('accept');
		expect(r.conflicts[0].used).toBe(true);
		expect(r.report.states[r.conflicts[0].bisonState].sr).toBe(1);
	});

	it('marks the inner if, which takes the else the default shift moves', () => {
		const r = done({
			grammar: CMINUS_BNF,
			input: 'void ID ( void ) { if ( ID ) if ( ID ) ; else ; }'
		});
		const c = r.conflicts[0];
		expect(r.parse!.marks).toEqual([
			{ path: expect.any(Array), state: c.state, terminal: 'else', action: 'shift' }
		]);
		const node = nodeAtPath(r.parse!.tree!, r.parse!.marks[0].path)!;
		expect(node.children.map((k) => k.symbol)).toEqual([
			'if',
			'(',
			'expression',
			')',
			'statement',
			'else',
			'statement'
		]);
		// It is the inner if: a statement of the outer one.
		const outer = nodeAtPath(r.parse!.tree!, r.parse!.marks[0].path.slice(0, -2))!;
		expect(outer.children.map((k) => k.symbol)).toEqual([
			'if',
			'(',
			'expression',
			')',
			'statement'
		]);
	});
});

describe('marks in the trees', () => {
	const marked = (tree: ParseNode, path: number[]) => bracketForm(nodeAtPath(tree, path)!);

	it('mark the node of the action taken at a conflict entry, in either parse', () => {
		const r = done({
			grammar: 'S → if E then S | if E then S else S | OTHER',
			input: 'if E then if E then OTHER else OTHER',
			choices: [[0, 1]]
		});
		expect(r.parse!.marks.map((m) => [m.terminal, m.action])).toEqual([['else', 'shift']]);
		expect(marked(r.parse!.tree!, r.parse!.marks[0].path)).toBe(
			'S( if E then S(OTHER) else S(OTHER) )'
		);
		expect(r.alternative!.marks.map((m) => [m.terminal, m.action])).toEqual([
			['else', 'red. S → if E then S']
		]);
		expect(marked(r.alternative!.tree!, r.alternative!.marks[0].path)).toBe(
			'S( if E then S(OTHER) )'
		);
	});

	it('mark E + E after a shift of +, E * E after the other action reduces it (slide 18)', () => {
		const r = done({ grammar: E, input: 'int * int + int', choices: [[2, 1]] });
		expect(r.parse!.marks.map((m) => marked(r.parse!.tree!, m.path))).toEqual([
			'E( E(int) + E(int) )'
		]);
		expect(r.alternative!.marks.map((m) => marked(r.alternative!.tree!, m.path))).toEqual([
			'E( E(int) * E(int) )'
		]);
	});

	it('are none without conflicts or without a tree', () => {
		expect(done({ grammar: 'S → ε | id S', input: 'id id' }).parse!.marks).toEqual([]);
		const rejected = done({
			grammar: 'E → E < E | int',
			precedence: "%nonassoc '<'",
			input: 'int < int < int'
		});
		expect(rejected.parse!.tree).toBeNull();
		expect(rejected.parse!.marks).toEqual([]);
	});
});

describe('requests', () => {
	it('reports a grammar with errors and an input that does not read', () => {
		expect(analyze({ grammar: 'E → ', precedence: '', input: '', choices: [] })).toEqual({
			status: 'none'
		});
		const r = done({ grammar: E, input: 'int + x' });
		expect(r.tokens).toBeNull();
		expect(r.parse).toBeNull();
		expect(r.classes.string).toBeNull();
		expect(r.conflicts.every((c) => c.used === null)).toBe(true);
	});

	it('takes a closing $ and leaves it out of the tokens', () => {
		const r = done({ grammar: E, input: 'int + int $' });
		expect(r.tokens).toEqual(['int', '+', 'int']);
		expect(r.parse!.outcome).toBe('accept');
		expect(r.classes.string?.tokens).toEqual(['int', '+', 'int']);
	});

	it('ignores choices for conflicts that do not exist', () => {
		const r = done({ grammar: E, input: 'int', choices: [[40, 1]] });
		expect(r.choices).toEqual([]);
		expect(r.alternative).toBeNull();
	});

	it('compares requests by value', () => {
		const a: AnalysisRequest = { grammar: E, precedence: '', input: '', choices: [] };
		expect(sameRequest(a, { ...a })).toBe(true);
		expect(sameRequest(a, { ...a, choices: [[0, 1]] })).toBe(false);
		expect(sameRequest(null, a)).toBe(false);
	});
});

describe('context, resolution and override helpers', () => {
	const g = parseGrammar(E).grammar!;
	const a = lr1Automaton(g);
	const table = lrTable(a, { precedence: readPrecedenceText(DECLARED).declarations });

	it('finds a shortest way to every state', () => {
		const paths = shortestPaths(a);
		expect(paths[0]).toEqual({ symbols: [], states: [0] });
		expect(paths[6]).toEqual({ symbols: ['E', '*', 'E'], states: [0, 2, 4, 6] });
		for (const [s, path] of paths.entries()) {
			let at = 0;
			path.symbols.forEach((y) => (at = a.states[at].transitions.find((t) => t.symbol === y)!.to));
			expect(at).toBe(s);
		}
	});

	it('has no state before state 0', () => {
		const g0 = parseGrammar('S → A | B\nA → ε\nB → ε').grammar!;
		const a0 = lr1Automaton(g0);
		const t0 = lrTable(a0);
		const c = t0.conflicts[0];
		expect(c.state).toBe(0);
		const context = conflictContext(a0, c, shortestPaths(a0)[0]);
		expect(context.from).toBeNull();
		expect(context.fromItems).toEqual([]);
		expect(context.rows.every((r) => r.left === null)).toBe(true);
		expect(moveOf(a0.augmented, [], '$', { kind: 'accept' })).toEqual({
			kind: 'accept',
			production: null,
			text: 'accept',
			stack: [],
			next: '$'
		});
	});

	it('names the winner of each conflict', () => {
		expect(table.conflicts.map(winnerOf)).toEqual([1, 0, 1, 1]);
	});

	it('overrides entries and leaves the table alone', () => {
		const choices = [{ conflict: 2, action: 0 as const }];
		const changed = overrideTable(table, table.conflicts, choices);
		const plus = table.terminals.indexOf('+');
		expect(changed.action[6][plus]).toEqual({ kind: 'shift', state: 3 });
		expect(table.action[6][plus]).toEqual({ kind: 'reduce', production: 1 });
		expect(changed.action[5]).toBe(table.action[5]);
		expect(effectiveChoices(table.conflicts, [...choices, { conflict: 0, action: 1 }])).toEqual(
			choices
		);
		const tokens = ['int', '*', 'int', '+', 'int'];
		const p = parseWith(table, table.conflicts, choices, tokens);
		expect(bracketForm(p.tree!)).toBe('E( E(int) * E( E(int) + E(int) ) )');
		expect(looksUp(p, 6, '+')).toBe(true);
		expect(looksUp(lrParse(table, ['int']), 6, '+')).toBe(false);
	});
});
