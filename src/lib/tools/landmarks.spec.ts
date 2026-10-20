/**
 * Notes beside a tool's input ("About this example") are named groups
 * (`<div role="group" aria-label>`), not asides: a named <aside> is a
 * complementary landmark, and a complementary landmark must not sit inside
 * another landmark (the page's main, a named section).
 */
import { expect, it } from 'vitest';

const sources = import.meta.glob(['/src/lib/tools/**/*.svelte', '/src/routes/**/*.svelte'], {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

it('no tool or page names an <aside>', () => {
	const named = Object.entries(sources)
		.filter(([, source]) => /<aside\b[^>]*\baria-label(ledby)?=/.test(source))
		.map(([path]) => path);
	expect(named).toEqual([]);
	expect(Object.keys(sources).length).toBeGreaterThan(100);
});
