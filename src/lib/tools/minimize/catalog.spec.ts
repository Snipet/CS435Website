import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { tool } from '$lib/tools/catalog/minimize';
import { presets } from './presets';

describe('catalog entry', () => {
	it('registers /minimize in the lexical stage', () => {
		expect(tool).toMatchObject({
			slug: 'minimize',
			title: 'DFA Minimization',
			summary:
				'Merge equivalent DFA states by partition refinement and find strings that tell two states apart.',
			stage: 'lexical',
			order: 50
		});
		expect(tool.cites.map(formatCitation)).toEqual(['Lexical Analysis IV · slide 11']);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/minimize/', import.meta.url));
	const sources = [
		...readdirSync(here)
			.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
			.map((f) => here + f),
		...readdirSync(route).map((f) => route + f)
	];

	it('has no teaching-purpose phrasing', () => {
		expect(sources.length).toBeGreaterThan(5);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
	});

	it('cites decks in presets by citation, and poses slide questions as questions', () => {
		for (const p of presets) {
			if (p.cite) expect(formatCitation(p.cite)).toMatch(/^Lexical Analysis/);
			if (p.question) expect(p.question.prompt).toContain('?');
		}
	});
});
