/**
 * Server-renders the notation page and checks the LL(1) and bottom-up
 * markings that color alone would carry: the item dots are red bullets, and
 * the handle, the tokens to shift and the divider are spoken as well.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { ITEM_DOT } from '$lib/components/grammar';
import Page from './+page.svelte';
import { handleRows, shiftReduceTrace } from './parsing-notation';

const { body } = render(Page);

const decode = (text: string) =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&amp;/g, '&');

/** What a screen reader reads: aria-hidden spans dropped, visually hidden text kept. */
const spoken = (html: string) =>
	decode(
		html
			.replace(/<!--.*?-->/gs, '')
			.replace(/<span aria-hidden="true">[^<]*<\/span>/g, '')
			.replace(/<[^>]+>/g, '')
	)
		.replace(/\s+/g, ' ')
		.trim();

/** The inner HTML of every element that opens with `open` (a tag prefix) and is closed by `close`. */
const blocks = (open: RegExp, close: string) =>
	[...body.matchAll(new RegExp(`${open.source}[^>]*>(.*?)${close}`, 'gs'))].map((m) => m[1]);

describe('item dots', () => {
	it('draws every dot of an item on the page as the red bullet', () => {
		// Accessible names are spoken, not drawn.
		const drawn = body.replace(/ aria-label="[^"]*"/g, '');
		const red = new RegExp(`<span class="(?:item-dot|dot)[ "][^>]*>${ITEM_DOT}</span>`, 'g');
		expect(drawn.match(red)?.length).toBeGreaterThan(40);
		expect(drawn.replace(red, '')).not.toContain(ITEM_DOT);
	});

	it('draws the dots of the Closure and Transition pseudocode red', () => {
		const code = blocks(/<pre class="code/, '</pre>').filter((c) =>
			/Closure\(Items\) =|Transition \(state, y\)/.test(c)
		);
		expect(code).toHaveLength(2);
		for (const c of code) {
			expect(c).toMatch(new RegExp(`<span class="item-dot[^"]*">${ITEM_DOT}</span>`));
			expect(c.replace(new RegExp(`<span[^>]*>${ITEM_DOT}</span>`, 'g'), '')).not.toContain(
				ITEM_DOT
			);
		}
		expect(spoken(code[0])).toContain('for each [X → α•Yβ, a] in Items');
		expect(spoken(code[1])).toContain('add [X → αy•β, b] to Items');
		expect(spoken(body).includes('Closure({ S → •E, $ })')).toBe(true);
	});
});

describe('marks spoken as well as colored', () => {
	it('names the handle of each form in the handles list', () => {
		const [list] = blocks(/<ol class="forms/, '</ol>');
		const rows = blocks(/<li class="f/, '</li>').filter((row) => list.includes(row));
		expect(rows.map(spoken)).toEqual([
			'handle: int, end of handle + (int)',
			'E + (handle: int, end of handle)',
			'handle: E + (E), end of handle',
			'E'
		]);
		expect(rows).toHaveLength(handleRows.length);
	});

	it('speaks the divider as a word and hides the I glyph', () => {
		const opened = body.match(/<span class="divider[ "]/g) ?? [];
		const dividers = body.match(
			/<span class="divider[^"]*"><span aria-hidden="true">I<\/span><span class="visually-hidden">divider<\/span><\/span>/g
		);
		expect(opened.length).toBeGreaterThan(shiftReduceTrace.length);
		expect(dividers).toHaveLength(opened.length);
		expect(body).not.toContain('title="divider"');
	});

	it('names the handle before a reduce and the tokens before a shift in the trace', () => {
		const [table] = blocks(/<table class="ref sr-trace/, '</table>');
		const rows = blocks(/<td class="f config/, '</td>')
			.filter((cell) => table.includes(cell))
			.map(spoken);
		expect(rows).toHaveLength(shiftReduceTrace.length);
		expect(rows.slice(0, 3)).toEqual([
			'divider to shift: int, end of shift + (int) + (int)$',
			'handle: int, end of handle divider + (int) + (int)$',
			'E divider to shift: + (int, end of shift) + (int)$'
		]);
		expect(rows[5]).toBe('handle: E + (E), end of handle divider + (int)$');
		expect(rows[rows.length - 1]).toBe('E divider $');
		rows.forEach((row, i) => {
			const action = shiftReduceTrace[i].action;
			expect(row.includes('handle:'), row).toBe(action.startsWith('red.'));
			expect(row.includes('to shift:'), row).toBe(action.startsWith('shift'));
		});
	});

	it('names the handle and its replacement in the reduce example', () => {
		const text = spoken(body);
		const example =
			'E + ( handle: E + ( E ), end of handle divider ) ⇒ E + ( handle reduced to E divider )';
		const at = text.indexOf('E + ( handle: E + ( E )');
		expect(at).toBeGreaterThan(0);
		// Sliced, so that a failure does not print the whole page.
		expect(text.slice(at, at + example.length)).toBe(example);
	});
});
