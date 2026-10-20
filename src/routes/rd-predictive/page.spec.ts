/**
 * The page as the server renders it, opened on a link (linked-page.ts): the
 * line that opens the grammar in other tools, and the Rewrite panel's links
 * that open the result, and when each shows.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { rewriteBnf } from '$lib/tools/rd-predictive/links';
import { readSource } from '$lib/tools/rd-predictive/model';
import { SLIDE_25 } from '$lib/tools/rd-predictive/presets';
import { DEFAULT_GRAMMAR, isPredictiveHash, stateFromHash } from '$lib/tools/rd-predictive/state';
import { paragraphs, readText, toolLinks } from '../linked-page';
import Page from './+page.svelte';

const page = vi.hoisted(() => ({ state: null as object | null }));
vi.mock('$lib/url-state', async (real) =>
	(await import('../linked-page')).openingOn(await real(), page)
);

/** The page opened on `value` (null: without a hash): its "Open in" line and the result's links. */
function open(value: unknown = null) {
	if (value !== null) expect(isPredictiveHash(value)).toBe(true);
	page.state = value === null ? null : stateFromHash(value as never);
	const html = render(Page).body;
	const lines = paragraphs(html, 'open-in');
	expect(lines.length).toBeLessThanOrEqual(1);
	return {
		openIn: lines.length ? { text: readText(lines[0]), links: toolLinks(lines[0]) } : null,
		result: toolLinks(html)
			.filter((l) => l.text.startsWith('Open the result'))
			.map((l) => [l.text, l.slug, l.state])
	};
}

const OPEN_IN =
	'Open in Recursive Descent with Backtracking, Context-Free Grammars or LL(1) Parsing Table';

describe('the line that opens the grammar', () => {
	it('opens it in the three tools, with the token string', () => {
		const { openIn } = open();
		expect(openIn!.text).toBe(OPEN_IN);
		expect(openIn!.links.map((l) => [l.slug, l.state])).toEqual(
			['rd-backtracking', 'grammar', 'll1'].map((slug) => [
				slug,
				{ grammar: DEFAULT_GRAMMAR, input: 'int + int * int' }
			])
		);
	});

	it('leaves out the end marker, and an empty token string', () => {
		const grammar = 'S → a S | b';
		expect(open({ grammar, input: 'a b $' }).openIn!.links.map((l) => l.state)).toEqual(
			Array(3).fill({ grammar, input: 'a b' })
		);
		expect(open({ grammar, input: ' $ ' }).openIn!.links.map((l) => l.state)).toEqual(
			Array(3).fill({ grammar })
		);
	});

	it('is not shown while the grammar has errors, and neither are the result’s links', () => {
		expect(open({ grammar: 'E → E + T |\n→ int', input: 'int' })).toEqual({
			openIn: null,
			result: []
		});
	});
});

describe('the links that open the result', () => {
	it('open a result with brackets in the LL(1) table only, written in BNF', () => {
		const rewrite = readSource(DEFAULT_GRAMMAR, { form: 'ebnf' }).rewrite!;
		expect(rewrite.brackets).toBe(true);
		expect(open().result).toEqual([
			[
				'Open the result in BNF in LL(1) Parsing Table',
				'll1',
				{ grammar: rewriteBnf(rewrite), input: 'int + int * int' }
			]
		]);
	});

	it('open a plain result in the backtracking parser and the LL(1) table', () => {
		const rewrite = readSource(SLIDE_25, { form: 'bnf' }).rewrite!;
		expect(rewrite.brackets).toBe(false);
		const state = { grammar: rewrite.text, input: '1 0 0' };
		expect(open({ grammar: SLIDE_25, input: '1 0 0', form: 'bnf' }).result).toEqual([
			['Open the result in Recursive Descent with Backtracking', 'rd-backtracking', state],
			['Open the result in LL(1) Parsing Table', 'll1', state]
		]);
	});

	it('are not shown when the rewrite changes nothing', () => {
		const { openIn, result } = open({ grammar: 'S → a S | b', input: 'a b' });
		expect(openIn!.text).toBe(OPEN_IN);
		expect(result).toEqual([]);
	});
});
