import { describe, expect, it } from 'vitest';
import { ll1Parse, ll1Table, parseGrammar, TREE_DEPTH_TEXT } from '$lib/theory/grammar';
import { BOTTOM_UP } from './presets';
import { DECK_GRAMMAR } from './state';
import {
	TRACE_WINDOW,
	pointerOf,
	rowMessage,
	streamHighlights,
	symbolsText,
	traceWindow,
	treeMarks
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
});
