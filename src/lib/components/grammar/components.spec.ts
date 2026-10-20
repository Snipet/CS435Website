/**
 * Server-renders the bottom-up drawing components: the markup must build and
 * carry what the slides show.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { bottomUpSlideTree, bottomUpTree, shiftReduceForest, sumTrees } from './fixtures';
import LrItem from './LrItem.svelte';
import LrState from './LrState.svelte';
import ParseTreeView from './ParseTreeView.svelte';
import { layoutForest, layoutTree } from './tree-layout';
import type { ItemView } from './lr-item';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		// The dot of an item is an element inside the item's text.
		.replace(/<span class="dot[^"]*">([^<]*)<\/span>/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

const ariaLabels = (html: string) =>
	[...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('ParseTreeView', () => {
	it('draws the top-down tree by default', () => {
		const { body } = render(ParseTreeView, { props: { tree: sumTrees.left, ariaLabel: 'Tree' } });
		const layout = layoutTree(sumTrees.left);
		expect(body).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
		expect(body).not.toContain('class="marker');
	});

	it('draws a baseline tree with every leaf on one row', () => {
		const { body } = render(ParseTreeView, {
			props: { tree: bottomUpSlideTree, layout: 'baseline', ariaLabel: 'Bottom-up tree' }
		});
		const layout = layoutTree(bottomUpSlideTree, { layout: 'baseline' });
		expect(body).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
		const ys = [...body.matchAll(/translate\(([\d.]+) ([\d.]+)\)/g)].map((m) => Number(m[2]));
		expect(ys).toHaveLength(layout.nodes.length);
		expect(ys.filter((y) => y === layout.baseline)).toHaveLength(9);
		expect(ariaLabels(body)[0]).toBe(
			'Bottom-up tree: E ( E ( E ( int ) + ( E ( int ) ) ) + ( E ( int ) ) )'
		);
	});

	it('draws a forest with the marker under the divider', () => {
		const { roots, marker } = shiftReduceForest;
		const { body } = render(ParseTreeView, {
			props: { forest: roots, marker, minRows: 4, ariaLabel: 'Partial parse' }
		});
		const layout = layoutForest(roots, { marker, minRows: 4 });
		expect(body).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
		expect(body).toContain('class="marker');
		expect(body).toContain(`M ${layout.marker!.x} ${layout.marker!.y1}`);
		expect(ariaLabels(body)[0]).toBe('Partial parse: E ( int ), +, (, int, ); ↑ between int and )');
	});

	it('marks forest nodes by paths that start with the tree, and names roots by tree', () => {
		const { body } = render(ParseTreeView, {
			props: {
				forest: shiftReduceForest.roots,
				highlight: { current: [[1], [2], [3]] },
				onnodeclick: () => {},
				ariaLabel: 'Partial parse'
			}
		});
		expect(body.match(/class="mark[" ]/g)).toHaveLength(3);
		const names = ariaLabels(body);
		expect(names).toContain('E, tree 1 of 5');
		expect(names).toContain('+, tree 2 of 5, current');
		expect(names).toContain('int, child 1 of 1 of E');
	});

	it('dims a node by its label color, not by the opacity of the node', () => {
		const { body } = render(ParseTreeView, {
			props: { tree: sumTrees.left, highlight: { dim: [[1]] }, ariaLabel: 'Tree' }
		});
		expect(body.match(/class="label dim/g)).toHaveLength(1);
		// Every node is drawn at full opacity (no move is under way).
		const nodes = [...body.matchAll(/<g class="node[^"]*"[^>]*>/g)].map((m) => m[0]);
		expect(nodes).toHaveLength(layoutTree(sumTrees.left).nodes.length);
		for (const g of nodes) expect(g).toContain('opacity="1"');
		// Only the line to the dimmed node fades.
		const lines = [...body.matchAll(/<line [^>]*opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
		expect(lines.filter((o) => o < 1)).toEqual([0.35]);
	});

	it('bounds the height of its box only when asked to', () => {
		const tall = render(ParseTreeView, {
			props: { tree: bottomUpSlideTree, layout: 'baseline', maxHeight: '20rem', reveal: [0] }
		}).body;
		expect(tall).toMatch(/class="parse-tree bounded/);
		expect(tall).toContain('--tree-max-h: 20rem;');
		const free = render(ParseTreeView, { props: { tree: bottomUpSlideTree } }).body;
		expect(free).not.toContain('bounded');
		expect(free).not.toContain('--tree-max-h');
	});

	it('describes where the marker stands at either end', () => {
		const at = (marker: number) =>
			ariaLabels(
				render(ParseTreeView, {
					props: { tree: bottomUpTree, layout: 'baseline', marker, ariaLabel: 'T' }
				}).body
			)[0];
		expect(at(0)).toMatch(/; ↑ before int$/);
		expect(at(5)).toMatch(/; ↑ after \)$/);
	});
});

const items: ItemView[] = [
	{ lhs: 'E', rhs: ['E', '+', '(', 'E', ')'], dot: 3, lookaheads: ['$'] },
	{ lhs: 'E', rhs: ['E', '+', '(', 'E', ')'], dot: 3, lookaheads: ['+'] },
	{ lhs: 'E', rhs: ['E', '+', '(', 'E', ')'], dot: 0, lookaheads: [')', '+'] },
	{ lhs: 'E', rhs: ['int'], dot: 0, lookaheads: [')', '+'] }
];

describe('LrItem', () => {
	it('writes the item with the dot in its own element', () => {
		const { body } = render(LrItem, { props: { item: items[0] } });
		expect(text(body)).toBe('[E → E + ( • E ), $]');
		expect(body).toContain('<span class="dot');
		expect(text(render(LrItem, { props: { item: items[3], style: 'compact' } }).body)).toBe(
			'E → •int, )/+'
		);
	});
});

describe('LrState', () => {
	it('draws state 4 of Bottom-up Parsing III, slide 14', () => {
		const { body } = render(LrState, { props: { number: 4, items } });
		expect(text(body)).toBe('E → E+(•E), $/+ E → •E+(E), )/+ E → •int, )/+ 4');
		expect(ariaLabels(body)).toEqual(['State 4; E → E+(•E), $/+; E → •E+(E), )/+; E → •int, )/+']);
	});

	it('labels reduce and accept states', () => {
		const one = render(LrState, {
			props: { number: 1, items: [{ lhs: 'E', rhs: ['int'], dot: 1, lookaheads: ['$', '+'] }] }
		});
		expect(text(one.body)).toBe('E → int•, $/+ 1 E → int on $, +');
		const two = render(LrState, {
			props: {
				number: 2,
				start: 'S',
				items: [
					{ lhs: 'S', rhs: ['E'], dot: 1, lookaheads: ['$'] },
					{ lhs: 'E', rhs: ['E', '+', '(', 'E', ')'], dot: 1, lookaheads: ['$', '+'] }
				]
			}
		});
		expect(text(two.body)).toBe('S → E•, $ E → E•+(E), $/+ 2 accept on $');
		const given = render(LrState, {
			props: { number: 7, items: [], annotations: [{ kind: 'accept', lookaheads: ['$'] }] }
		});
		expect(text(given.body)).toBe('7 accept on $');
	});

	it('marks lines and keeps the full items when asked', () => {
		const { body } = render(LrState, {
			props: { number: 4, items, merge: false, style: 'bracketed', highlight: [1], current: true }
		});
		expect(body.match(/class="marked/g)).toHaveLength(1);
		expect(body).toContain('current');
		expect(text(body).startsWith('[E → E + ( • E ), $] [E → E + ( • E ), +]')).toBe(true);
	});

	it('names the current state and the marked lines for screen readers', () => {
		const label = (props: Record<string, unknown>) =>
			ariaLabels(render(LrState, { props: { number: 4, items, ...props } }).body)[0];
		expect(label({ current: true, highlight: [1, 2] })).toBe(
			'State 4, current; E → E+(•E), $/+; marked: E → •E+(E), )/+; marked: E → •int, )/+'
		);
		expect(label({ highlight: [0], highlightName: 'new' })).toBe(
			'State 4; new: E → E+(•E), $/+; E → •E+(E), )/+; E → •int, )/+'
		);
		// Indices past the last line mark nothing.
		expect(label({ highlight: [7] })).toBe(
			'State 4; E → E+(•E), $/+; E → •E+(E), )/+; E → •int, )/+'
		);
	});

	it('accepts only on $ for the start symbol', () => {
		const { body } = render(LrState, {
			props: {
				number: 3,
				start: 'S',
				items: [{ lhs: 'S', rhs: ['A'], dot: 1, lookaheads: [')', '$'] }]
			}
		});
		expect(text(body)).toBe('S → A•, )/$ 3 accept on $ S → A on )');
	});
});
