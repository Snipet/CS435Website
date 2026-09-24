import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { announcementFor, summarizeDiagnostics } from './diagnostic-summary';

const error = (message: string, start = 0): Diagnostic => ({
	severity: 'error',
	message,
	span: { start, end: start + 1, source: null }
});
const warning = (message: string): Diagnostic => ({ severity: 'warning', message });
const note = (message: string): Diagnostic => ({ severity: 'info', message });

describe('summarizeDiagnostics', () => {
	it('is empty without errors or warnings', () => {
		expect(summarizeDiagnostics([])).toBe('');
		expect(summarizeDiagnostics([note('Read as a b b')])).toBe('');
	});

	it('states the first error and counts the rest', () => {
		expect(summarizeDiagnostics([error('Unmatched )')])).toBe('Error: Unmatched )');
		expect(
			summarizeDiagnostics([warning('w'), error('Unmatched )'), note('n'), error('Unknown name')])
		).toBe('Error: Unmatched ) (1 more)');
	});

	it('falls back to warnings', () => {
		expect(summarizeDiagnostics([note('n'), warning('Unused definition'), warning('x')])).toBe(
			'Warning: Unused definition (1 more)'
		);
	});

	it('adds a location when given one', () => {
		const where = (d: Diagnostic) => (d.span ? `line ${d.span.start + 1}` : null);
		expect(summarizeDiagnostics([error('Unmatched (', 2)], where)).toBe(
			'Error on line 3: Unmatched ('
		);
		expect(summarizeDiagnostics([warning('w')], where)).toBe('Warning: w');
	});
});

describe('announcementFor', () => {
	it('announces new problems and when they are gone', () => {
		expect(announcementFor('', 'Error: x')).toBe('Error: x');
		expect(announcementFor('Error: x', 'Error: y')).toBe('Error: y');
		expect(announcementFor('Error: x', '')).toBe('No problems');
		expect(announcementFor('', '')).toBe('');
	});
});
