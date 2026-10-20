/**
 * The page as the server renders it, opened on a link (linked-page.ts): the
 * line that opens the grammar in other tools, and when it shows.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, isRdHash, stateFromHash } from '$lib/tools/rd-backtracking/state';
import { paragraphs, readText, toolLinks } from '../linked-page';
import Page from './+page.svelte';

const page = vi.hoisted(() => ({ state: null as object | null }));
vi.mock('$lib/url-state', async (real) =>
	(await import('../linked-page')).openingOn(await real(), page)
);

/** The "Open this grammar in" line of the page opened on `value` (null: without a hash), or null. */
function openIn(value: unknown = null) {
	if (value !== null) expect(isRdHash(value)).toBe(true);
	page.state = value === null ? null : stateFromHash(value as never);
	const lines = paragraphs(render(Page).body, 'open-in');
	expect(lines.length).toBeLessThanOrEqual(1);
	return lines.length ? { text: readText(lines[0]), links: toolLinks(lines[0]) } : null;
}

const TOOLS = ['grammar', 'rd-predictive', 'll1'];
const TEXT =
	'Open this grammar in Context-Free Grammars, Predictive Recursive Descent or LL(1) Parsing Table';

describe('the line that opens the grammar', () => {
	it('opens it in the three tools, with the token stream', () => {
		const line = openIn()!;
		expect(line.text).toBe(TEXT);
		expect(line.links.map((l) => [l.slug, l.state])).toEqual(
			TOOLS.map((slug) => [slug, { grammar: DEFAULT_STATE.grammar, input: '( int )' }])
		);
	});

	it('leaves out a token stream with errors', () => {
		const grammar = 'S → a S | b';
		for (const input of ['a c', 'a S b']) {
			const line = openIn({ grammar, input })!;
			expect(line.text, input).toBe(TEXT);
			expect(
				line.links.map((l) => l.state),
				input
			).toEqual(TOOLS.map(() => ({ grammar })));
		}
	});

	it('is not shown while the grammar has errors', () => {
		expect(openIn({ grammar: 'S → a S |\n→ b', input: 'a b' })).toBeNull();
	});
});
