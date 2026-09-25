/**
 * Server-renders the Compare view: a note in place of the comparison is
 * marked stale while it is for an earlier R, and the placeholder shown while
 * the first comparison is computed is read by screen readers.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CompareView from './CompareView.svelte';
import { computeViews, type CompareSummary } from './views';

const base = {
	value: 'a*',
	result: null as CompareSummary | null,
	diagnostics: [],
	blocked: null as string | null,
	symbols: [],
	aliases: false as const,
	placeholder: ''
};

/** The opening tag of the paragraph that holds `text`. */
function paragraphOf(body: string, text: string): string {
	const at = body.indexOf(text);
	expect(at).toBeGreaterThan(-1);
	const start = body.lastIndexOf('<p', at);
	return body.slice(start, body.indexOf('>', start) + 1);
}

describe('CompareView', () => {
	const note = 'The DFA for R has more than 300 states, so its language is not computed.';

	it('shows why R cannot be compared as current by default', () => {
		const { body } = render(CompareView, { props: { ...base, blocked: note } });
		const tag = paragraphOf(body, note);
		expect(tag).not.toContain('stale-data');
		expect(tag).not.toContain('aria-busy="true"');
	});

	it('marks that note stale while a newer R is computed', () => {
		const { body } = render(CompareView, {
			props: { ...base, blocked: note, blockedStale: true }
		});
		const tag = paragraphOf(body, note);
		expect(tag).toContain('stale-data');
		expect(tag).toContain('aria-busy="true"');
	});

	it('reads "Comparing…" as a status while the first comparison is computed', () => {
		const { body } = render(CompareView, { props: base });
		expect(body).toContain('Comparing…');
		expect(body).toMatch(/role="status"[^>]*>(<[^>]*>)*Comparing…/);
	});

	it('shows a comparison, dimmed while stale', () => {
		const result = computeViews({
			re: 'a*',
			defs: '',
			dialect: 'lecture',
			alphabet: '',
			compare: 'a a*',
			tests: [],
			maxLength: 6,
			node: []
		}).compare;
		const fresh = render(CompareView, { props: { ...base, result } }).body;
		expect(fresh).toContain('L(R) ≠ L(R₂)');
		expect(fresh).not.toContain('stale-data');
		const stale = render(CompareView, { props: { ...base, result, stale: true } }).body;
		expect(stale).toMatch(/class="result[^"]*stale-data[^"]*"[^>]*aria-busy="true"/);
	});
});
