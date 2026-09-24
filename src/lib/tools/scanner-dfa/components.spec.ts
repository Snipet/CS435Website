/**
 * Server-renders the tool's views for every preset: the markup must build
 * without errors and show the first step of each trace.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import TableDrivenTab from './TableDrivenTab.svelte';
import SwitchTab from './SwitchTab.svelte';
import SizesTab from './SizesTab.svelte';
import CodeListing from './CodeListing.svelte';
import { PRESETS } from './presets';
import { buildRuleDfa, compileRules } from './rules';
import { DEFAULT_STATE, loadState, type ScannerDfaState } from './state';
import { highlightC } from './code-highlight';

function setup(model: ScannerDfaState) {
	const compiled = compileRules(model.defs, model.rules);
	const built = compiled.rules ? buildRuleDfa(compiled.rules, { minimal: false }) : null;
	return { compiled, built };
}

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

describe('Table-driven tab', () => {
	it('renders every preset at the first step of the first call', () => {
		for (const p of PRESETS) {
			const model = loadState(DEFAULT_STATE, p.value);
			const { body } = render(TableDrivenTab, {
				props: { model, ...setup(model), preset: p }
			});
			const t = text(body);
			expect(t, p.id).toContain('state = start: state is');
			expect(t, p.id).toContain('call 1 of');
			expect(t, p.id).toContain('accept');
			expect(t, p.id).toContain('retract');
			for (const q of p.questions ?? []) expect(t, p.id).toContain(q.question);
		}
	});

	it('shows the longest-match code in that mode', () => {
		const model = loadState(DEFAULT_STATE, { ...PRESETS[2].value, mode: 'longest' });
		const t = text(
			render(TableDrivenTab, { props: { model, ...setup(model), preset: null } }).body
		);
		expect(t).toContain('lastAccept = none');
		expect(t).toContain('lastAccept none');
	});

	it('reports rules that do not build', () => {
		const model = loadState(DEFAULT_STATE, {
			source: 'rules',
			rules: [{ name: 'R', re: '(0 | 1)* 1 (0 | 1)^9' }],
			input: '1'
		});
		const t = text(
			render(TableDrivenTab, { props: { model, ...setup(model), preset: null } }).body
		);
		expect(t).toContain('too large');
		expect(t).not.toContain('getToken () call');
		const bad = loadState(DEFAULT_STATE, {
			source: 'rules',
			rules: [{ name: '', re: '(' }],
			input: '1'
		});
		const t2 = text(
			render(TableDrivenTab, { props: { model: bad, ...setup(bad), preset: null } }).body
		);
		expect(t2).toContain('Fix the rules');
	});
});

describe('Hand-coded switch tab', () => {
	it('renders the slide code with and without breaks', () => {
		for (const breaks of [false, true]) {
			const model = { ...DEFAULT_STATE, breaks };
			const t = text(render(SwitchTab, { props: { model } }).body);
			const compact = t.replace(/\s/g, '');
			expect(compact).toContain('constintERROR_STATE=9;');
			expect(compact).toContain('elseerror();');
			expect(t).toContain('ERROR_STATE is 9.');
			expect(compact.split('break;(inserted)').length - 1).toBe(breaks ? 3 : 0);
			expect(t).toContain('Every input');
		}
	});
});

describe('Sizes tab', () => {
	it('lists the rules, relop and S, T, U', () => {
		const t = text(
			render(SizesTab, { props: { model: DEFAULT_STATE, ...setup(DEFAULT_STATE) } }).body
		);
		expect(t).toContain('R = Whitespace | Integer | Identifier | Plus');
		expect(t).toContain('9 × 4 = 36');
		expect(t).toContain('relop (slide 16)');
		expect(t).toContain('Hand code [dis]advantages?');
	});
});

describe('CodeListing', () => {
	it('marks the current line', () => {
		const { body } = render(CodeListing, {
			props: { lines: [{ text: 'a' }, { text: 'b', inserted: true }], current: 1, label: 'x' }
		});
		expect(body).toContain('aria-current="step"');
		expect(text(body)).toContain('(inserted)');
	});

	it('colors keywords, comments, characters and numbers', () => {
		expect(highlightC("  if (ch == '<') state = 1; // x")).toEqual([
			{ text: '  ' },
			{ text: 'if', className: 'hl-keyword' },
			{ text: ' (' },
			{ text: 'ch' },
			{ text: ' == ' },
			{ text: "'<'", className: 'hl-string' },
			{ text: ') ' },
			{ text: 'state' },
			{ text: ' = ' },
			{ text: '1', className: 'hl-number' },
			{ text: '; ' },
			{ text: '// x', className: 'hl-comment' }
		]);
	});
});
