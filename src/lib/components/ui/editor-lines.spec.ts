import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { layoutLines, lineCol, lineIndexAt, lineStarts, maxSeverity } from './editor-lines';

const span = (start: number, end: number) => ({ start, end, source: null });
const texts = (line: { segments: { text: string }[] }) => line.segments.map((s) => s.text);

describe('lineStarts / lineCol', () => {
	it('finds line starts, including a trailing empty line', () => {
		expect(lineStarts('')).toEqual([0]);
		expect(lineStarts('ab\ncd\n')).toEqual([0, 3, 6]);
	});

	it('maps offsets to 1-based line and column', () => {
		const text = 'digit = 0\nnumber = digit+';
		expect(lineCol(text, 0)).toEqual({ line: 1, col: 1 });
		expect(lineCol(text, 9)).toEqual({ line: 1, col: 10 });
		expect(lineCol(text, 10)).toEqual({ line: 2, col: 1 });
		expect(lineCol(text, 999)).toEqual({ line: 2, col: 16 });
		expect(lineIndexAt(lineStarts(text), 10)).toBe(1);
	});

	it('orders severities', () => {
		expect(maxSeverity('info', 'error')).toBe('error');
		expect(maxSeverity(null, 'warning')).toBe('warning');
		expect(maxSeverity('warning', null)).toBe('warning');
	});
});

describe('layoutLines', () => {
	it('returns one plain segment per non-empty line', () => {
		const lines = layoutLines('ab\n\ncd');
		expect(lines.map((l) => l.number)).toEqual([1, 2, 3]);
		expect(lines.map(texts)).toEqual([['ab'], [], ['cd']]);
		expect(lines.map((l) => [l.start, l.end])).toEqual([
			[0, 2],
			[3, 3],
			[4, 6]
		]);
	});

	it('applies highlight tokens, later tokens winning on overlap', () => {
		const lines = layoutLines("('a' | b)*", [
			{ from: 1, to: 4, className: 'hl-literal' },
			{ from: 5, to: 6, className: 'hl-operator' },
			{ from: 9, to: 10, className: 'hl-operator' },
			{ from: 2, to: 3, className: 'hl-escape' }
		]);
		expect(lines[0].segments).toEqual([
			{ text: '(' },
			{ text: "'", className: 'hl-literal' },
			{ text: 'a', className: 'hl-escape' },
			{ text: "'", className: 'hl-literal' },
			{ text: ' ' },
			{ text: '|', className: 'hl-operator' },
			{ text: ' b)' },
			{ text: '*', className: 'hl-operator' }
		]);
	});

	it('splits tokens that span lines and ignores out-of-range tokens', () => {
		const lines = layoutLines('ab\ncd', [
			{ from: 1, to: 4, className: 'hl-string' },
			{ from: 10, to: 12, className: 'hl-name' },
			{ from: 3, to: 3, className: 'hl-name' }
		]);
		expect(lines[0].segments).toEqual([{ text: 'a' }, { text: 'b', className: 'hl-string' }]);
		expect(lines[1].segments).toEqual([{ text: 'c', className: 'hl-string' }, { text: 'd' }]);
	});

	it('marks diagnostic spans and their lines', () => {
		const diags: Diagnostic[] = [
			{ severity: 'warning', message: 'w', span: span(0, 3) },
			{ severity: 'error', message: 'e', span: span(2, 5) },
			{ severity: 'info', message: 'no span' }
		];
		const lines = layoutLines('abcd\nef', [], diags);
		expect(lines[0].segments).toEqual([
			{ text: 'ab', severity: 'warning' },
			{ text: 'cd', severity: 'error' }
		]);
		expect(lines[0].severity).toBe('error');
		expect(lines[0].messages).toEqual(['w', 'e']);
		// The error span ends on the newline, so line 2 is untouched.
		expect(lines[1].severity).toBeNull();
		expect(lines[1].messages).toEqual([]);
	});

	it('marks every line a multi-line span touches', () => {
		const lines = layoutLines(
			'ab\ncd\nef',
			[],
			[{ severity: 'error', message: 'x', span: span(1, 7) }]
		);
		expect(lines.map((l) => l.severity)).toEqual(['error', 'error', 'error']);
		expect(lines[1].segments).toEqual([{ text: 'cd', severity: 'error' }]);
		expect(lines[2].segments).toEqual([{ text: 'e', severity: 'error' }, { text: 'f' }]);
	});

	it('renders zero-width diagnostics as point markers', () => {
		const text = 'ab\n';
		const lines = layoutLines(
			text,
			[],
			[
				{ severity: 'error', message: 'end', span: span(3, 3) },
				{ severity: 'warning', message: 'mid', span: span(1, 1) },
				{ severity: 'info', message: 'eol', span: span(2, 2) }
			]
		);
		expect(lines[0].segments).toEqual([
			{ text: 'a' },
			{ text: '', point: true, severity: 'warning' },
			{ text: 'b' },
			{ text: '', point: true, severity: 'info' }
		]);
		expect(lines[1].segments).toEqual([{ text: '', point: true, severity: 'error' }]);
		expect(lines[1].messages).toEqual(['end']);
	});

	it('clamps spans past the end of the text', () => {
		const lines = layoutLines('ab', [], [{ severity: 'error', message: 'x', span: span(1, 50) }]);
		expect(lines[0].segments).toEqual([{ text: 'a' }, { text: 'b', severity: 'error' }]);
	});
});
