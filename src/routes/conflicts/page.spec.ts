/**
 * Server-renders the page as it is prerendered: the default preset (Bottom-up
 * Parsing III, slides 19–21), computed at once, with every panel.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

const { body } = render(Page);

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/gs, '')
		.replace(/<\/?(span|sup|sub)\b[^>]*>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

describe('the prerendered page', () => {
	const t = text(body);

	it('shows the default preset’s grammar, declarations and conflicts', () => {
		expect(body).toContain('E → E + E | E * E | int');
		expect(t).toContain("%left '+' line 1, level 1, lowest");
		expect(t).toContain('4 conflicts: 4 settled by precedence.');
		expect(t).toContain(
			'reduce because precedence of rule E → E * E is higher than that of terminal +.'
		);
	});

	it('parses the token string and shows Parser.output and the grammar classes', () => {
		expect(t).toContain('As resolved Accepted');
		expect(t).toContain("Conflict between rule 1 and token '+' resolved as reduce (%left '+').");
		expect(t).toContain('Grammar classes');
		expect(t).toContain('The dot marks an ambiguous grammar.');
	});

	it('has one heading per panel and no tool links to tools that do not exist', () => {
		const headings = [...body.matchAll(/<h2[^>]*>(.*?)<\/h2>/gs)].map(
			(m) => text(m[1]).trim().split(' ')[0]
		);
		expect(headings).toEqual(['Grammar', 'Conflicts', 'Parse', 'Parser.output', 'Grammar']);
		for (const m of body.matchAll(/href="([^"]+)"/g)) expect(m[1]).not.toMatch(/undefined|null/);
	});
});
