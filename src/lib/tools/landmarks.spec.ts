/**
 * No page, tool or component uses <aside>. An <aside> directly in the page's
 * main (named or not), or a named one anywhere, is a complementary landmark,
 * and a complementary landmark must not sit inside another landmark (the
 * page's main, a named section). Notes beside a tool's input ("About this
 * example") are named groups (`<div role="group" aria-label>`); a side table
 * of contents is a plain <div> around its <nav>.
 * scripts/contrast-audit.mjs checks the rendered pages' accessibility trees.
 */
import { expect, it } from 'vitest';

const sources = import.meta.glob(['/src/**/*.svelte'], {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

it('no page, tool or component has an <aside>', () => {
	const asides = Object.entries(sources)
		.filter(([, source]) => /<aside\b/.test(source.replace(/<!--[\s\S]*?-->/g, '')))
		.map(([path]) => path);
	expect(asides).toEqual([]);
	expect(Object.keys(sources).some((p) => p.startsWith('/src/routes/'))).toBe(true);
	expect(Object.keys(sources).some((p) => p.startsWith('/src/lib/tools/'))).toBe(true);
	expect(Object.keys(sources).length).toBeGreaterThan(100);
});
