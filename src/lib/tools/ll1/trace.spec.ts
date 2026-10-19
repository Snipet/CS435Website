import { describe, expect, it } from 'vitest';
import { ll1Parse, ll1Table, parseGrammar, TREE_DEPTH_TEXT } from '$lib/theory/grammar';
import { AMBIGUOUS, BOTTOM_UP, OTHER } from './presets';
import { DECK_GRAMMAR } from './state';
import {
	CELL_SYMBOLS,
	TRACE_WINDOW,
	clipSymbols,
	loops,
	pointerOf,
	rowMessage,
	streamHighlights,
	symbolsText,
	traceWindow,
	treeMarks,
	usesConflict,
	verdict
} from './trace';

const g = parseGrammar(DECK_GRAMMAR).grammar!;
const table = ll1Table(g);
const parse = ll1Parse(table, ['int', '*', 'int']);

describe('the trace of slide 12', () => {
	it('has the ten rows of the slide, word for word', () => {
		expect(
			parse.rows.map((r) => `${symbolsText(r.stack)} | ${symbolsText(r.input)} | ${r.text}`)
		).toEqual([
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

	it('words each row', () => {
		expect(parse.rows.map((r) => rowMessage(g, r))).toEqual([
			'T[E, int] = T X: E is replaced by T X.',
			'T[T, int] = int Y: T is replaced by int Y.',
			'int on top is the next token: it is popped and the input advances.',
			'T[Y, *] = * T: Y is replaced by * T.',
			'* on top is the next token: it is popped and the input advances.',
			'T[T, int] = int Y: T is replaced by int Y.',
			'int on top is the next token: it is popped and the input advances.',
			'T[Y, $] = ε: Y is popped.',
			'T[X, $] = ε: X is popped.',
			'End of input, and only $ is left on the stack: ACCEPT.'
		]);
		const blank = ll1Parse(table, ['int', '+', '*', 'int']);
		expect(blank.outcome).toBe('error');
		expect(blank.rows[blank.rows.length - 1].text).toBe('[E,*] is blank');
		expect(rowMessage(g, blank.rows[blank.rows.length - 1])).toBe('T[E, *] is blank: error.');
		const mismatch = ll1Parse(table, ['(', 'int']);
		expect(rowMessage(g, mismatch.rows[mismatch.rows.length - 1])).toBe(
			') is on top, but the next token is $: error.'
		);
	});

	it('says where the input pointer is and marks the next token', () => {
		expect(parse.rows.map((r) => pointerOf(3, r))).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
		expect(streamHighlights(3, parse.rows[3])).toEqual([
			{ start: 0, end: 1, tone: 'accept', muted: true },
			{ start: 1, end: 2, tone: 'active' }
		]);
		expect(streamHighlights(3, parse.rows[0])).toEqual([{ start: 0, end: 1, tone: 'active' }]);
	});

	it('marks the node on top of the stack, the children just pushed and the matched leaves', () => {
		expect(treeMarks(parse, 0)).toEqual({ current: [[]], fresh: [], matched: [] });
		expect(treeMarks(parse, 1)).toEqual({ current: [[0]], fresh: [[0], [1]], matched: [] });
		expect(treeMarks(parse, 3)).toEqual({
			current: [[0, 1]],
			fresh: [],
			matched: [[0, 0]]
		});
		expect(treeMarks(parse, 9)).toEqual({
			current: [],
			fresh: [],
			matched: [
				[0, 0],
				[0, 1, 0],
				[0, 1, 1, 0]
			]
		});
		expect(treeMarks(parse, 99)).toEqual({});
	});
});

describe('long runs', () => {
	it('shows a window of rows that ends at the current one', () => {
		expect(TRACE_WINDOW).toBe(200);
		expect(traceWindow(10, 3)).toEqual({ start: 0, end: 4 });
		expect(traceWindow(1000, 999)).toEqual({ start: 800, end: 1000 });
		expect(traceWindow(0, 0)).toEqual({ start: 0, end: 0 });
	});

	it('words a run that stops', () => {
		const left = ll1Parse(ll1Table(parseGrammar(BOTTOM_UP).grammar!), [
			'int',
			'+',
			'(',
			'int',
			')'
		]);
		expect(left.outcome).toBe('limit');
		const last = left.rows[left.rows.length - 1];
		expect(last.text).toBe(TREE_DEPTH_TEXT);
		expect(rowMessage(parseGrammar(BOTTOM_UP).grammar!, last)).toBe(
			'The run stopped: the parse tree would be more than 500 levels deep.'
		);
		const short = ll1Parse(table, ['int', '*', 'int'], { maxSteps: 3 });
		expect(rowMessage(g, short.rows[short.rows.length - 1])).toBe('The run stopped after 2 steps.');
	});

	it('keeps the top of a long stack and its $ in a trace cell', () => {
		const left = ll1Parse(ll1Table(parseGrammar(BOTTOM_UP).grammar!), [
			'int',
			'+',
			'(',
			'int',
			')'
		]);
		const last = left.rows[left.rows.length - 1].stack;
		expect(last.length).toBeGreaterThan(1000);
		expect(CELL_SYMBOLS).toBe(12);
		expect(clipSymbols(last)).toEqual({
			head: 'E + ( E ) + ( E ) + ( E',
			left: last.length - 13,
			tail: '$'
		});
		// Short stacks and inputs, such as all of slide 12's, are shown whole.
		for (const r of parse.rows)
			for (const symbols of [r.stack, r.input])
				expect(clipSymbols(symbols)).toEqual({ head: symbolsText(symbols), left: 0, tail: '' });
		const fifteen = Array.from({ length: 14 }, () => 'int').concat('$');
		expect(clipSymbols(fifteen).left).toBe(0);
		expect(clipSymbols([...fifteen, '$'])).toMatchObject({ left: 3, tail: '$' });
		expect(clipSymbols(['a', 'b', 'c', 'd', '$'], 2).left).toBe(0);
		expect(clipSymbols(['a', 'b', 'c', 'd', 'e', '$'], 2)).toEqual({
			head: 'a b',
			left: 3,
			tail: '$'
		});
	});
});

describe('the end of a run', () => {
	const run = (grammar: string, tokens: string[], opts?: { maxSteps?: number }) => {
		const t = ll1Table(parseGrammar(grammar).grammar!);
		return { t, p: ll1Parse(t, tokens, opts) };
	};

	it('says what the run comes to, without the last row’s own words', () => {
		expect(verdict(table, parse)).toEqual({
			tone: 'success',
			title: 'ACCEPT',
			text: 'The token string is in L(G).'
		});
		const blank = run(DECK_GRAMMAR, ['int', '+', '*', 'int']);
		expect(usesConflict(blank.t, blank.p)).toBe(false);
		expect(verdict(blank.t, blank.p)).toEqual({
			tone: 'error',
			title: 'Error',
			text: 'The token string is not in L(G).'
		});
		for (const v of [verdict(table, parse), verdict(blank.t, blank.p)]) {
			expect(v.text).not.toContain('End of input');
			expect(v.text).not.toContain('blank');
		}
	});

	it('does not reject a string for good after a multiply-defined entry', () => {
		// S → A a | b ; A → a | ε: a is in L(G), but the parser takes A → a from [A, a].
		const { t, p } = run(OTHER, ['a']);
		expect(p.outcome).toBe('error');
		expect(usesConflict(t, p)).toBe(true);
		expect(verdict(t, p).text).toBe(
			'The parser took the first production of a multiply-defined entry, so the token string may still be in L(G).'
		);
	});

	it('tells a loop from a run that is only long', () => {
		for (const [grammar, tokens] of [
			[BOTTOM_UP, ['int', '+', '(', 'int', ')']],
			[AMBIGUOUS, ['int', '+', 'int', '*', 'int']],
			// Left recursion through a non-terminal that derives ε.
			['S → A S b | c\nA → ε', ['c', 'b']]
		] as const) {
			const { t, p } = run(grammar, [...tokens]);
			expect(p.outcome, grammar).toBe('limit');
			expect(loops(p), grammar).toBe(true);
			expect(verdict(t, p)).toEqual({
				tone: 'warn',
				title: 'The parser loops',
				text: 'It takes the same productions again and again without matching a token: G is left recursive.'
			});
		}
		const long = run(DECK_GRAMMAR, ['int', '*', 'int'], { maxSteps: 3 });
		expect(long.p.outcome).toBe('limit');
		expect(loops(long.p)).toBe(false);
		expect(verdict(long.t, long.p)).toEqual({
			tone: 'warn',
			title: 'Not finished',
			text: 'The token string is too long or too deeply nested for the parse to finish.'
		});
		// Deep nesting: every level matches a token, so it is no loop.
		const deep = run(DECK_GRAMMAR, [...Array(300).fill('('), 'int', ...Array(300).fill(')')]);
		expect(deep.p.outcome).toBe('limit');
		expect(loops(deep.p)).toBe(false);
		// Many ε-expansions in a row, of siblings, are no loop either.
		const flat = run('S → A A A A A c\nA → a | ε', ['c']);
		expect(flat.p.outcome).toBe('accept');
		expect(loops(flat.p)).toBe(false);
	});
});
