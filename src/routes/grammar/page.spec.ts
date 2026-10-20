/**
 * The page as the server renders it, opened on a link (linked-page.ts): when
 * the line that opens the parsing tools shows, and what they open on.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { isGrammarHash, stateFromHash } from '$lib/tools/grammar/state';
import { paragraphs, readText, toolLinks } from '../linked-page';
import Page from './+page.svelte';

const page = vi.hoisted(() => ({ state: null as object | null }));
vi.mock('$lib/url-state', async (real) =>
	(await import('../linked-page')).openingOn(await real(), page)
);

/** The "Open in" line of the page opened on `value` (null: without a hash), or null when it has none. */
function openIn(value: unknown = null) {
	if (value !== null) expect(isGrammarHash(value)).toBe(true);
	page.state = value === null ? null : stateFromHash(value as never);
	const html = render(Page).body;
	const lines = paragraphs(html, 'open-in');
	expect(lines.length).toBeLessThanOrEqual(1);
	return lines.length ? { text: readText(lines[0]), links: toolLinks(lines[0]) } : null;
}

const TOOLS = ['ll1', 'shift-reduce', 'lr1', 'conflicts'];
const TEXT =
	'Open in LL(1) Parsing Table, Shift-Reduce Parsing, LR(1) Parser Builder or Conflicts & Precedence';

describe('the line that opens the parsing tools', () => {
	it('opens them on the grammar and the token string', () => {
		const grammar = 'E → E + T | T\nT → int | ( E )';
		const line = openIn({ grammar, input: 'int + ( int )' })!;
		expect(line.text).toBe(TEXT);
		expect(line.links.map((l) => [l.slug, l.state])).toEqual(
			TOOLS.map((slug) => [slug, { grammar, input: 'int + ( int )' }])
		);
	});

	it('shows on the page as it opens', () => {
		const line = openIn()!;
		expect(line.text).toBe(TEXT);
		expect(line.links.every((l) => (l.state as { input?: string }).input)).toBe(true);
	});

	it('leaves out a token string with errors, or none', () => {
		const grammar = 'S → a S | b';
		// An unknown terminal, a non-terminal, nothing.
		for (const input of ['a c b', 'a S b', '']) {
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
		expect(openIn({ grammar: '', input: '' })).toBeNull();
	});
});
