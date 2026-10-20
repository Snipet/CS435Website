/**
 * The page as the server renders it, opened on a link (linked-page.ts): the
 * links under the trees, to Context-Free Grammars and to Conflicts &
 * Precedence, and when each shows.
 */
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { AMBIGUOUS, presets, SUM_PRODUCT } from '$lib/tools/ambiguity/presets';
import { isAmbiguityHash, stateFromHash } from '$lib/tools/ambiguity/state';
import { paragraphs, toolLinks } from '../linked-page';
import Page from './+page.svelte';

const page = vi.hoisted(() => ({ state: null as object | null }));
vi.mock('$lib/url-state', async (real) =>
	(await import('../linked-page')).openingOn(await real(), page)
);

/** The links under the trees of the page opened on `value` (null: without a hash). */
function links(value: unknown = null) {
	if (value !== null) expect(isAmbiguityHash(value)).toBe(true);
	page.state = value === null ? null : stateFromHash(value as never);
	const lines = paragraphs(render(Page).body, 'links');
	expect(lines.length).toBeLessThanOrEqual(1);
	return lines.length ? toolLinks(lines[0]) : [];
}

const conflictsLink = (value: unknown) => links(value).find((l) => l.slug === 'conflicts');

describe('the link to Conflicts & Precedence', () => {
	it('opens the grammar and the string of the page as it opens', () => {
		expect(links().map((l) => [l.text, l.state])).toEqual([
			[
				'Open the grammar in Context-Free Grammars',
				{ grammar: AMBIGUOUS, input: 'int * int + int' }
			],
			[
				'Open the grammar in Conflicts & Precedence',
				{ grammar: AMBIGUOUS, input: 'int * int + int' }
			]
		]);
	});

	it('adds the declarations, as bison writes them, and says so', () => {
		const preset = presets.find((p) => p.id === 'precedence')!;
		const found = conflictsLink(preset.value)!;
		expect(found.text).toBe('Open the grammar and the declarations in Conflicts & Precedence');
		expect(found.state).toEqual({
			grammar: SUM_PRODUCT,
			input: 'int + int * int',
			precedence: "%left '+'\n%left '*'"
		});
	});

	it('leaves out a declaration without operators', () => {
		const found = conflictsLink({
			grammar: SUM_PRODUCT,
			input: 'int + int',
			decls: [{ assoc: 'left', ops: '' }]
		})!;
		expect(found.text).toBe('Open the grammar in Conflicts & Precedence');
		expect(found.state).toEqual({ grammar: SUM_PRODUCT, input: 'int + int' });
	});

	it('leaves out a string with errors', () => {
		for (const input of ['int + x', 'int + E', '']) {
			expect(conflictsLink({ grammar: SUM_PRODUCT, input })!.state, input).toEqual({
				grammar: SUM_PRODUCT
			});
		}
	});

	it('is not shown while the grammar has errors', () => {
		expect(links({ grammar: 'E → E + E |\n→ int', input: 'int' })).toEqual([]);
	});
});
