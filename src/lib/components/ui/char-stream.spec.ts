import { describe, expect, it } from 'vitest';
import { describeText, glyphFor, layoutStream, type StreamItem } from './char-stream';

const glyphs = (items: StreamItem[]) =>
	items.map((it) =>
		it.kind === 'break'
			? '|'
			: it.kind === 'cell'
				? it.cell.glyph
				: `[${it.cells.map((c) => c.glyph).join('')}:${it.label}]`
	);

describe('glyphFor', () => {
	it('makes whitespace visible', () => {
		expect(glyphFor(' ')).toEqual({ glyph: '·', kind: 'space' });
		expect(glyphFor('\t')).toEqual({ glyph: '⇥', kind: 'tab' });
		expect(glyphFor('\n')).toEqual({ glyph: '↵', kind: 'newline' });
		expect(glyphFor('\r')).toEqual({ glyph: '␍', kind: 'cr' });
		expect(glyphFor('\x01')).toEqual({ glyph: '\\x01', kind: 'control' });
		expect(glyphFor('a')).toEqual({ glyph: 'a', kind: 'char' });
	});
});

describe('layoutStream', () => {
	it('emits one cell per code point and a break after each newline', () => {
		const items = layoutStream('a b\n😀');
		expect(glyphs(items)).toEqual(['a', '·', 'b', '↵', '|', '😀']);
		const last = items[items.length - 1];
		expect(last.kind === 'cell' && [last.cell.index, last.cell.end]).toEqual([4, 6]);
	});

	it('groups labelled ranges into runs and colors unlabelled ones', () => {
		const items = layoutStream('f+3', {
			highlights: [
				{ start: 0, end: 1, tone: 0, label: 'Identifier' },
				{ start: 1, end: 2, tone: 'active' }
			]
		});
		expect(glyphs(items)).toEqual(['[f:Identifier]', '+', '3']);
		const plus = items[1];
		expect(plus.kind === 'cell' && plus.cell.tone).toBe('active');
	});

	it('marks range edges so adjacent same-tone ranges stay distinct', () => {
		const items = layoutStream('abcd', {
			highlights: [
				{ start: 0, end: 2, tone: 1 },
				{ start: 2, end: 4, tone: 1 }
			]
		});
		const cells = items.flatMap((it) => (it.kind === 'cell' ? [it.cell] : []));
		expect(cells.map((c) => [c.edgeStart, c.edgeEnd])).toEqual([
			[true, false],
			[false, true],
			[true, false],
			[false, true]
		]);
	});

	it('splits a run at newlines and labels only the first piece', () => {
		const items = layoutStream('x\n y', {
			highlights: [{ start: 1, end: 3, tone: 2, label: 'Whitespace' }]
		});
		expect(glyphs(items)).toEqual(['x', '[↵:Whitespace]', '|', '[·:]', 'y']);
		const second = items[3];
		expect(second.kind === 'run' && second.continued).toBe(true);
	});

	it('places the cursor, lookahead and end cell', () => {
		const items = layoutStream('ab', { cursor: 2, lookahead: { start: 1, end: 3 } });
		const cells = items.flatMap((it) => (it.kind === 'cell' ? [it.cell] : []));
		expect(cells.map((c) => c.kind)).toEqual(['char', 'char', 'end']);
		expect(cells.map((c) => c.cursor)).toEqual([false, false, true]);
		expect(cells.map((c) => c.lookahead)).toEqual([false, true, false]);
		expect(layoutStream('ab', { cursor: 1 }).length).toBe(2);
		expect(layoutStream('', { showEnd: true }).length).toBe(1);
	});

	it('carries the muted flag of the highlight that colors a cell', () => {
		const items = layoutStream('abc', {
			highlights: [
				{ start: 0, end: 2, tone: 1, label: 'ID', muted: true },
				{ start: 1, end: 2, tone: 'active' }
			]
		});
		const cells = items.flatMap((it) =>
			it.kind === 'cell' ? [it.cell] : it.kind === 'run' ? it.cells : []
		);
		expect(cells.map((c) => [c.tone, c.muted])).toEqual([
			[1, true],
			['active', false],
			[null, false]
		]);
	});

	it('ignores highlights outside the text', () => {
		const items = layoutStream('ab', { highlights: [{ start: 5, end: 9, tone: 'reject' }] });
		expect(items.every((it) => it.kind === 'cell' && it.cell.tone === null)).toBe(true);
	});
});

describe('describeText', () => {
	it('quotes the text with escapes and counts characters', () => {
		expect(describeText('if x')).toBe('"if x" (4 characters)');
		expect(describeText('\n')).toBe('"\\n" (1 character)');
	});
});
