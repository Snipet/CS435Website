import { describe, expect, it } from 'vitest';
import { clampPointer, describeTokens, layoutTokens, pointerText } from './token-stream';

// Top-Down Parsing, slides 5–16: the token stream ( int ).
const tokens = ['(', 'int', ')'];
const pointed = (cells: ReturnType<typeof layoutTokens>) =>
	cells.filter((c) => c.pointer).map((c) => `${c.kind}:${c.index}:${c.text}`);

describe('layoutTokens', () => {
	it('makes one cell per token, with no pointer by default', () => {
		const cells = layoutTokens(tokens);
		expect(cells.map((c) => [c.index, c.text, c.kind])).toEqual([
			[0, '(', 'token'],
			[1, 'int', 'token'],
			[2, ')', 'token']
		]);
		expect(cells.some((c) => c.pointer || c.consumed)).toBe(false);
	});

	it('puts the pointer under the next token and mutes the tokens before it', () => {
		expect(pointed(layoutTokens(tokens, { pointer: 0 }))).toEqual(['token:0:(']);
		const cells = layoutTokens(tokens, { pointer: 1 });
		expect(pointed(cells)).toEqual(['token:1:int']);
		expect(cells.map((c) => c.consumed)).toEqual([true, false, false]);
		expect(pointed(layoutTokens(tokens, { pointer: 2 }))).toEqual(['token:2:)']);
	});

	it('puts the pointer after the last token at the end of the input', () => {
		const cells = layoutTokens(tokens, { pointer: 3 });
		expect(cells).toHaveLength(4);
		expect(pointed(cells)).toEqual(['end:3:']);
		expect(cells.map((c) => c.consumed)).toEqual([true, true, true, false]);
	});

	it('adds no end cell while the pointer is on a token', () => {
		expect(layoutTokens(tokens, { pointer: 2 })).toHaveLength(3);
		expect(layoutTokens(tokens, { pointer: null })).toHaveLength(3);
	});

	it('ends the stream with $ and points at it at the end of the input', () => {
		const cells = layoutTokens(['int', '*', 'int'], { endMarker: true, pointer: 3 });
		expect(cells.map((c) => c.text)).toEqual(['int', '*', 'int', '$']);
		expect(cells[3].kind).toBe('marker');
		expect(pointed(cells)).toEqual(['marker:3:$']);
		expect(layoutTokens(['int'], { endMarker: true }).map((c) => c.pointer)).toEqual([
			false,
			false
		]);
	});

	it('clamps the pointer to the stream', () => {
		expect(pointed(layoutTokens(tokens, { pointer: 99 }))).toEqual(['end:3:']);
		expect(pointed(layoutTokens(tokens, { pointer: -2 }))).toEqual(['token:0:(']);
		expect(pointed(layoutTokens(tokens, { pointer: 1.7 }))).toEqual(['token:1:int']);
	});

	it('handles an empty stream', () => {
		expect(layoutTokens([])).toEqual([]);
		expect(pointed(layoutTokens([], { pointer: 0 }))).toEqual(['end:0:']);
		expect(pointed(layoutTokens([], { pointer: 0, endMarker: true }))).toEqual(['marker:0:$']);
	});

	it('colors highlight ranges and marks their ends', () => {
		const cells = layoutTokens(['int', '*', 'int', '+', 'int'], {
			highlights: [
				{ start: 0, end: 3, tone: 2 },
				{ start: 3, end: 4, tone: 'active', muted: true }
			]
		});
		expect(cells.map((c) => c.tone)).toEqual([2, 2, 2, 'active', null]);
		expect(cells.map((c) => [c.edgeStart, c.edgeEnd])).toEqual([
			[true, false],
			[false, false],
			[false, true],
			[true, true],
			[false, false]
		]);
		expect(cells.map((c) => c.muted)).toEqual([false, false, false, true, false]);
	});

	it('keeps adjacent ranges of one tone apart and lets the later range win', () => {
		const cells = layoutTokens(['a', 'b', 'c', 'd'], {
			highlights: [
				{ start: 0, end: 2, tone: 1 },
				{ start: 2, end: 4, tone: 1 },
				{ start: 1, end: 2, tone: 'reject' }
			]
		});
		expect(cells.map((c) => c.tone)).toEqual([1, 'reject', 1, 1]);
		expect(cells.map((c) => c.edgeStart)).toEqual([true, true, true, false]);
		expect(cells.map((c) => c.edgeEnd)).toEqual([true, true, false, true]);
	});

	it('lets a range cover the end marker but not the empty end cell', () => {
		const marked = layoutTokens(['a'], {
			endMarker: true,
			highlights: [{ start: 0, end: 9, tone: 0 }]
		});
		expect(marked.map((c) => c.tone)).toEqual([0, 0]);
		const end = layoutTokens(['a'], { pointer: 1, highlights: [{ start: -4, end: 9, tone: 0 }] });
		expect(end.map((c) => c.tone)).toEqual([0, null]);
		expect(end[0].edgeEnd).toBe(true);
	});
});

describe('pointerText', () => {
	it('names the next token and its position', () => {
		expect(pointerText(tokens, 0)).toBe('next token: ( (1 of 3)');
		expect(pointerText(tokens, 1)).toBe('next token: int (2 of 3)');
		expect(pointerText(tokens, 2)).toBe('next token: ) (3 of 3)');
	});

	it('says when the input has ended', () => {
		expect(pointerText(tokens, 3)).toBe('end of input');
		expect(pointerText(tokens, 3, true)).toBe('next token: $ (end of input)');
		expect(pointerText([], 0)).toBe('end of input');
	});

	it('is empty without a pointer', () => {
		expect(pointerText(tokens, null)).toBe('');
		expect(pointerText(tokens, undefined)).toBe('');
	});
});

describe('clampPointer', () => {
	it('keeps the pointer inside 0 … count', () => {
		expect(clampPointer(2, 3)).toBe(2);
		expect(clampPointer(7, 3)).toBe(3);
		expect(clampPointer(-1, 3)).toBe(0);
		expect(clampPointer(null, 3)).toBeNull();
		expect(clampPointer(Number.NaN, 3)).toBeNull();
	});
});

describe('describeTokens', () => {
	it('joins the tokens with spaces', () => {
		expect(describeTokens(tokens)).toBe('( int )');
		expect(describeTokens(['int', '*', 'int'], true)).toBe('int * int $');
		expect(describeTokens([])).toBe('no tokens');
		expect(describeTokens([], true)).toBe('$');
	});
});
