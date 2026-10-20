/**
 * The page as the server renders it, opened on a link (linked-page.ts): the
 * Language and Syntax tree tabs open the BNF of C- in the grammar tools.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { grammarLinks } from '$lib/tools/cminus/grammar-links';
import { defaultState, isCminusHash, stateFromHash } from '$lib/tools/cminus/state';
import { decode } from '$lib/url-state';
import { readText, toolLinks } from '../linked-page';
import Page from './+page.svelte';

const page = vi.hoisted(() => ({ state: null as object | null }));
vi.mock('$lib/url-state', async (real) =>
	(await import('../linked-page')).openingOn(await real(), page)
);

/** The page opened on its default program with `tab` shown. */
function tab(name: 'language' | 'syntax') {
	const value = { source: defaultState().source, tab: name };
	expect(isCminusHash(value)).toBe(true);
	page.state = stateFromHash(value);
	return render(Page).body;
}

describe('the links that open the BNF', () => {
	it.each(['language', 'syntax'] as const)('%s: opens it in the three grammar tools', (name) => {
		const html = tab(name);
		// Tags become spaces when read, also before the comma that follows a link.
		expect(readText(html).replace(/ ,/g, ',')).toContain(
			'Open the BNF in Context-Free Grammars, LR(1) Parser Builder or Conflicts & Precedence'
		);
		const expected = grammarLinks().map((l) => [l.slug, decode(l.href.split('#')[1])]);
		const shown = toolLinks(html)
			.filter((l) => expected.some(([slug]) => slug === l.slug))
			.map((l) => [l.slug, l.state]);
		expect(shown).toEqual(expected);
	});
});
