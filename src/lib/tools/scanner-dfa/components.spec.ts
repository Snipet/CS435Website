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
import RulesEditor from './RulesEditor.svelte';
import { PRESETS } from './presets';
import {
	buildRuleDfa,
	compileRules,
	minimalRuleDfa,
	nameGroups,
	withTokenNames,
	type RuleDfas
} from './rules';
import { DEFAULT_STATE, loadState, type ScannerDfaState } from './state';
import { highlightC } from './code-highlight';
import { lineNumbers } from './listing';
import { programLines } from './switch';

/** The props the page passes: the compiled rules, both DFAs and the named sets. */
function setup(model: ScannerDfaState) {
	const compiled = compileRules(model.defs, model.rules);
	let built: RuleDfas | null = null;
	if (compiled.rules) {
		const b = buildRuleDfa(compiled.rules);
		const names = compiled.rules.map((r) => r.name);
		built = b.ok
			? {
					ok: true,
					full: b.full,
					minimal: withTokenNames(minimalRuleDfa(b.full, nameGroups(names)), names)
				}
			: b;
	}
	return { compiled, built, names: compiled.names };
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

describe('Rules editor', () => {
	it('names each drop checkbox and control by its rule', () => {
		const model = loadState(DEFAULT_STATE, PRESETS.find((p) => p.id === 'new-foo')!.value);
		const { compiled } = setup(model);
		const { body } = render(RulesEditor, {
			props: { defs: model.defs, rules: model.rules, compiled }
		});
		const t = text(body);
		for (let n = 1; n <= model.rules.length; n++) {
			expect(t).toContain(`drop rule ${n}`);
			for (const action of ['up', 'down', 'remove'])
				expect(body).toMatch(new RegExp(`id="[^"]*-${action}-${n - 1}"`));
		}
		expect(body.match(/type="checkbox"/g)).toHaveLength(model.rules.length);
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
		const { built, names } = setup(DEFAULT_STATE);
		const t = text(render(SizesTab, { props: { model: DEFAULT_STATE, built, names } }).body);
		expect(t).toContain('R = Whitespace | Integer | Identifier | Plus');
		expect(t).toContain('11 × 5 = 55');
		expect(t).toContain('5 × 4 = 20');
		expect(t).toContain('9 × 4 = 36');
		expect(t).toContain('3 × 2 = 6');
		expect(t).toContain('2 × 2 = 4');
		expect(t).toContain('relop (slide 16)');
		expect(t).toContain('Hand code [dis]advantages?');
		// Nothing to merge: A–Z and a–z lead to different states in the DFA as built.
		expect(t).not.toMatch(/merged from \d/);
	});

	it('notes the label classes before merging where columns were merged', () => {
		const model = loadState(DEFAULT_STATE, {
			source: 'rules',
			defs: "lower = 'a' | … | 'z'",
			rules: [
				{ name: 'Word', re: 'lower+' },
				{ name: 'Never', re: "ɸ 'q'" }
			],
			input: 'ab'
		});
		const { built, names } = setup(model);
		const t = text(render(SizesTab, { props: { model, built, names } }).body);
		expect(t).toContain('R = Word | Never');
		expect(t).toContain('3 × 1 = 3');
		expect(t).toContain('1 merged from 2');
		// relop and S, T, U have nothing to merge.
		expect(t.match(/merged from \d/g)).toHaveLength(1);
	});
});

describe('Table T', () => {
	it('shows one column for label classes every state treats alike', () => {
		const model = loadState(DEFAULT_STATE, {
			source: 'rules',
			defs: "lower = 'a' | … | 'z'",
			rules: [
				{ name: 'Word', re: 'lower+' },
				{ name: 'Never', re: "ɸ 'q'" }
			],
			input: 'ab'
		});
		const t = text(
			render(TableDrivenTab, { props: { model, ...setup(model), preset: null } }).body
		);
		expect(t).toContain('Table T 3 × 1');
		expect(t).toContain('lower accept retract');
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

	it('numbers the printed lines only, so inserted lines do not shift them', () => {
		const lines = [{ text: 'a' }, { text: 'b', inserted: true }, { text: 'c' }];
		expect(lineNumbers(lines)).toEqual([1, null, 2]);
		const t = text(render(CodeListing, { props: { lines, label: 'x' } }).body);
		expect(t).toContain('1 a + b (inserted) 2 c');
		const numbered = (breaks: boolean) => {
			const ls = programLines(breaks);
			const ns = lineNumbers(ls);
			return ls.flatMap((l, i) => (l.inserted ? [] : [`${ns[i]} ${l.text}`]));
		};
		expect(numbered(true)).toEqual(numbered(false));
		expect(numbered(false).find((l) => l.endsWith('case 1:'))).toMatch(/^16 /);
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
