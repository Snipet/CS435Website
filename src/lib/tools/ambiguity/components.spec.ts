/**
 * Server-renders the page and its two tabs: the markup builds without errors
 * and says what the slides show.
 */
import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import Page from '../../../routes/ambiguity/+page.svelte';
import CascadeBuilder from './CascadeBuilder.svelte';
import CompareCheck from './CompareCheck.svelte';
import { compareTexts, type CompareResult } from './compare';
import DeclarationsTab from './DeclarationsTab.svelte';
import { analyzeDeclarations, analyzeRewrite, leafLabeler, listTrees, readSource } from './model';
import PrecedenceTable from './PrecedenceTable.svelte';
import PresetNote from './PresetNote.svelte';
import { presets, presetState } from './presets';
import RewriteTab from './RewriteTab.svelte';
import type { AmbiguityState } from './state';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<\/?strong[^>]*>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

/** The props the page passes to its tabs. */
function setup(model: AmbiguityState) {
	const source = readSource(model);
	const original = source.ready ? listTrees(source.grammar!, source) : null;
	const rewrite = analyzeRewrite(source, original, model.rewrite);
	return {
		model,
		source,
		original,
		labels: leafLabeler(source.display),
		typed: rewrite,
		rewrite,
		analysis:
			source.grammar && original
				? analyzeDeclarations(source.grammar, source, original, model.decls)
				: null
	};
}

const idle = (result: CompareResult | null): ComponentProps<typeof RewriteTab>['compare'] => ({
	result,
	stale: false,
	status: 'idle',
	error: null
});

const preset = (id: string) => presetState(presets.find((p) => p.id === id)!);

/** Six operands: 42 trees under an ambiguous grammar, of which 20 are listed. */
const SIX = 'int + int + int + int + int + int';
const LEFT_NESTED = '((((int + int) + int) + int) + int) + int';
const RIGHT_NESTED = 'int + (int + (int + (int + (int + int))))';

describe('the page', () => {
	const { body, head } = render(Page);
	const shown = text(body);

	it('first shows int * int + int with its two trees and their values', () => {
		expect(head).toContain('<title>Ambiguity and Precedence · CS435</title>');
		expect(shown).toContain('Ambiguity and Precedence');
		expect(shown).toContain('2 parse trees: the grammar is ambiguous');
		expect(shown).toContain('Tree 1 (int * int) + int');
		expect(shown).toContain('Tree 2 int * (int + int)');
		expect(shown).toContain('E( E( E(int) * E(int) ) + E(int) )');
		expect(shown).toContain('(2 * 3) + 4 = 10');
		expect(shown).toContain('2 * (3 + 4) = 14');
		// Two drawings, neither crossed out, in two colors.
		expect(count(body, /class="parse-tree/g)).toBe(2);
		expect(body).not.toContain('class="cross');
		expect(body).toContain('--tree-fg: var(--tok-4)');
		expect(body).toContain('--tree-fg: var(--tok-3)');
	});

	it('cites the slide and poses its question behind "Show answer"', () => {
		expect(shown).toContain('Ambiguity, Precedence, Associativity & Top-Down Parsing · slide 5');
		expect(shown).toContain('Which one do we want?');
		expect(shown).toContain('Show answer');
		// The answer, the derivation of each of the two trees, the cascade builder and
		// the reference table. Closed: the only open disclosure is the cascade builder.
		expect(count(body, /<details/g)).toBe(5);
		expect(count(body, /<details[^>]* open/g)).toBe(1);
	});

	it('gives each tree a switch for its leftmost derivation, and its value', () => {
		// One per tree, closed; the derivations themselves are not drawn yet.
		expect(count(shown, /Leftmost derivation /g)).toBe(2);
		expect(body).not.toContain('aria-label="Leftmost derivation of tree');
		expect(shown).toContain('All leftmost derivations');
		expect(count(shown, /Values \(2 \* 3\) \+ 4 = 10/g)).toBe(1);
		expect(shown).toContain('Values 2 * (3 + 4) = 14');
		expect(shown).not.toMatch(/Value [(\d]/);
	});

	it('has both tabs, the cascade builder and the reference table', () => {
		expect(shown).toContain('Rewrite the grammar');
		expect(shown).toContain('Declarations');
		expect(shown).toContain('Precedence cascade');
		expect(shown).toContain('Use as the rewritten grammar');
		expect(shown).toContain('C operator precedence: 15 levels');
		expect(shown).toContain('_Alignof');
	});

	it('labels its controls', () => {
		for (const label of [
			'Grammar',
			'Token string',
			'Operand values',
			'Occurrence labels',
			'Rewritten grammar',
			'Operators of level 1',
			'Atoms'
		])
			expect(body).toMatch(new RegExp(`<label[^>]* for="[^"]+">${label}</label>`));
		expect(count(body, /<input[^>]* role="switch"/g)).toBe(2);
		expect(shown).toContain('Abbreviated trees');
		expect(shown).toContain('All leftmost derivations');
		expect(body).toContain('aria-label="Associativity of level 2"');
		expect(body).toContain('aria-label="Move level 2 up (lower precedence)"');
		expect(body).toContain('role="status"');
	});

	it('says what the tool does, not what it is for', () => {
		expect(shown).not.toMatch(
			/helps? you|understand|learn|intuition|explore|discover|common mistake|misconception/i
		);
	});
});

describe('Rewrite the grammar', () => {
	const renderTab = (model: AmbiguityState, result: CompareResult | null = null) => {
		const props = setup(model);
		return render(RewriteTab, {
			props: { ...props, builderOpen: true, compare: idle(result) }
		}).body;
	};

	it('asks for a grammar while there is none', () => {
		const body = renderTab(preset('product-sum'));
		expect(text(body)).toContain('Enter a rewritten grammar');
		expect(body).not.toContain('class="parse-tree');
		expect(text(body)).not.toContain('Same strings?');
	});

	it('shows one tree under the cascade and crosses out the old tree with * at the root (slide 10)', () => {
		const model = preset('cascade');
		const body = renderTab(
			model,
			compareTexts({
				original: model.grammar,
				rewritten: model.rewrite,
				maxLength: model.maxLength
			})
		);
		const shown = text(body);
		expect(shown).toContain('Rewritten grammar');
		expect(shown).toContain('1 parse tree. The string has only one parse tree now.');
		expect(shown).toContain('E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )');
		expect(shown).toContain(
			'1 of the 2 trees is crossed out: no tree of the rewritten grammar has its structure.'
		);
		expect(shown).toContain('Tree 2 int * (int + int) Crossed out');
		expect(shown).toContain('Tree 1 (int * int) + int Kept');
		expect(shown).toContain('Same structure as tree 1 of the rewritten grammar.');
		expect(count(body, /class="parse-tree/g)).toBe(3);
		expect(count(body, /class="cross/g)).toBe(1);
		expect(body).toContain('(crossed out)');
		expect(shown).toContain('Both grammars generate the same strings up to length 7.');
		expect(shown).toContain('This is the rewritten grammar.');
	});

	it('draws the MIF/UIF trees abbreviated and crosses out the else on the outer if (slide 14)', () => {
		const body = renderTab(preset('matched-if'));
		const shown = text(body);
		expect(shown).toContain('Tree 1 if E₁ then (if E₂ then E₃) else E₄ Crossed out');
		expect(shown).toContain('Tree 2 if E₁ then (if E₂ then E₃ else E₄) Kept');
		expect(count(body, /class="cross/g)).toBe(1);
		// Abbreviated: the drawings have if nodes and E₁ … E₄, no then or else.
		expect(body).toContain(
			'aria-label="Tree 1, if E₁ then (if E₂ then E₃ else E₄): if ( E₁ if ( E₂ E₃ E₄ ) )"'
		);
		expect(body).toContain(
			'aria-label="Tree 1, if E₁ then (if E₂ then E₃) else E₄ (crossed out): if ( E₁ if ( E₂ E₃ ) E₄ )"'
		);
	});

	it('draws the full trees with the abbreviation off', () => {
		const body = renderTab({ ...preset('matched-if'), abbreviated: false });
		expect(body).toContain(
			'E ( UIF ( if E ( MIF ( E₁ ) ) then E ( MIF ( if E ( MIF ( E₂ ) ) then MIF ( E₃ ) else MIF ( E₄ ) ) ) ) )'
		);
	});

	it('reports what stands in the way of the trees', () => {
		const errors = text(renderTab({ ...preset('cascade'), rewrite: 'E → ' }));
		expect(errors).toContain('The trees appear once the rewritten grammar has no errors.');
		const unknown = text(renderTab({ ...preset('cascade'), rewrite: 'E → E + T | T\nT → int' }));
		expect(unknown).toContain('Not a terminal of the rewritten grammar: *');
		expect(unknown).toContain('No parse tree: the rewritten grammar does not generate the string');
		const badInput = text(renderTab({ ...preset('cascade'), input: 'int ?' }));
		expect(badInput).toContain('once the grammar and the token string have no errors');
	});

	it('keeps the trees of the last rewritten grammar without errors, marked as such', () => {
		const props = setup(preset('cascade'));
		const typed = analyzeRewrite(props.source, props.original, 'E → E + T |');
		expect(typed.grammar).toBeNull();
		const { body } = render(RewriteTab, {
			props: { ...props, typed, builderOpen: false, compare: idle(null) }
		});
		const shown = text(body);
		expect(shown).toContain('Showing the trees of the last rewritten grammar without errors.');
		expect(shown).toContain('1 parse tree. The string has only one parse tree now.');
		expect(body).toMatch(/class="results stale-data[^"]*" aria-busy="true"/);
		// The editor reports the grammar as typed.
		expect(shown).toContain('Nothing after |');
	});

	it('says when the rewritten grammar is still ambiguous', () => {
		const model = preset('cascade');
		const shown = text(renderTab({ ...model, rewrite: model.grammar }));
		expect(shown).toContain('2 parse trees: the rewritten grammar is ambiguous');
		expect(shown).toContain('All 2 trees have the structure of a tree of the rewritten grammar.');
	});

	it('matches the cascade’s tree with tree 1 of the 42 trees of six operands', () => {
		const body = renderTab({ ...preset('cascade'), input: SIX, values: '' });
		const shown = text(body);
		expect(shown).toContain('1 parse tree. The string has only one parse tree now.');
		expect(shown).toContain(`Tree 1 ${LEFT_NESTED} Kept`);
		expect(shown).toContain('Same structure as tree 1 of the rewritten grammar.');
		expect(shown).toContain(
			'19 of the 20 trees shown are crossed out: no tree of the rewritten grammar has their structure.'
		);
		expect(shown).toContain('… and more: 20 of the 42 parse trees are shown.');
		// The rewritten grammar's tree has a counterpart, and not every tree is crossed out.
		expect(shown).not.toContain('No tree of the original grammar has this structure.');
		expect(shown).not.toContain('20 of the 20');
		expect(count(body, /class="cross/g)).toBe(19);
		expect(count(body, /class="parse-tree/g)).toBe(21);
	});

	it('draws a kept tree from outside the listed ones first, under its number', () => {
		const body = renderTab({
			...preset('cascade'),
			input: SIX,
			values: '',
			rewrite: 'E → T + E | T\nT → int | ( E )'
		});
		const shown = text(body);
		expect(shown).toContain(`Tree 42 ${RIGHT_NESTED} Kept`);
		expect(shown.indexOf('Tree 42 ')).toBeLessThan(shown.indexOf('Tree 1 (((('));
		expect(shown).toContain('A kept tree from outside the listed ones is shown first.');
		expect(shown).not.toContain('No tree of the original grammar has this structure.');
		expect(count(body, /class="cross/g)).toBe(19);
		expect(shown).not.toContain('Tree 20 ');
	});

	it('crosses out nothing when the rewritten grammar groups the string in another way', () => {
		// The tail form: neither the left-nested nor the right-nested tree.
		const body = renderTab({
			...preset('cascade'),
			input: 'int + int + int',
			rewrite: 'E → T X\nX → + T X | ε\nT → int | ( E )'
		});
		const shown = text(body);
		expect(shown).toContain('Tree 1 int (+ int (+ int))');
		expect(shown).toContain('No tree of the original grammar has this structure.');
		expect(shown).toContain(
			'The rewritten grammar groups the string differently from every tree of the original grammar, so the trees are not matched and none is crossed out.'
		);
		expect(body).not.toContain('class="cross');
		expect(shown).not.toContain('Crossed out');
		expect(shown).not.toContain('Kept');
		expect(shown).not.toContain('No tree of the rewritten grammar has this structure.');
	});
});

describe('Same strings?', () => {
	const renderCheck = (props: Partial<ComponentProps<typeof CompareCheck>>) =>
		text(render(CompareCheck, { props: { maxLength: 5, ...idle(null), ...props } }).body);

	it('lists the strings only one grammar generates', () => {
		const result = compareTexts({
			original: 'E → E + E | ( E ) | int',
			rewritten: 'E → E + T | T\nT → int | int int',
			maxLength: 3
		});
		const shown = renderCheck({ result });
		expect(shown).toContain('Different');
		expect(shown).toContain('Only the original grammar generates (1 string) ( int )');
		expect(shown).toContain('Only the rewritten grammar generates (1 string) int int');
	});

	it('says how far the comparison got, and shows a placeholder before the first result', () => {
		const wide = 'E → E + E | E - E | E * E | E / E | ( E ) | int | id';
		const shown = renderCheck({
			maxLength: 9,
			result: compareTexts({ original: wide, rewritten: wide, maxLength: 9 })
		});
		expect(shown).toMatch(/Both grammars generate the same strings up to length [5-8]\./);
		expect(shown).toMatch(/Compared up to length [5-8]: there are too many longer strings/);
		expect(renderCheck({ result: null, stale: true, status: 'working' })).toContain('Comparing…');
		expect(renderCheck({ status: 'timed-out', stale: true })).toContain('takes too long');
		expect(renderCheck({ status: 'error', error: 'boom' })).toContain('boom');
		expect(renderCheck({ result: { status: 'none' } })).toContain('once both are free of errors');
	});
});

describe('Declarations', () => {
	const renderTab = (model: AmbiguityState) =>
		render(DeclarationsTab, { props: setup(model) }).body;

	it('crosses out the right-nested tree for %left + (slide 17)', () => {
		const body = renderTab(preset('left-assoc'));
		const shown = text(body);
		expect(shown).toContain('The declarations keep one of the 2 trees and cross out the rest.');
		expect(shown).toContain('Tree 1 (int + int) + int Selected');
		expect(shown).toContain('Tree 2 int + (int + int) Crossed out');
		expect(shown).toContain(
			'+ is left-associative, so the right operand of + cannot be another +.'
		);
		expect(count(body, /class="cross/g)).toBe(1);
		expect(body).toMatch(/<label[^>]*>Line 1: operators<\/label>/);
		expect(body).toContain('aria-label="Remove line 1"');
	});

	it('crosses out the tree with * at the root for %left + then %left * (slide 18)', () => {
		const body = renderTab(preset('precedence'));
		const shown = text(body);
		expect(shown).toContain('Tree 1 (int + int) * int Crossed out');
		expect(shown).toContain('* binds tighter than +, so + cannot be an operand of *.');
		expect(shown).toContain('Tree 2 int + (int * int) Selected');
		expect(shown).toContain('The declarations allow only this tree.');
		// The two lines as the slide writes them.
		expect(body).toMatch(/<pre[^>]*>%left \+\n%left \*<\/pre>/);
	});

	it('keeps every tree without declarations', () => {
		const body = renderTab(preset('product-sum'));
		const shown = text(body);
		expect(shown).toContain('No declarations.');
		expect(shown).toContain('No declarations: all 2 trees are kept.');
		expect(body).not.toContain('class="cross');
		expect(shown).not.toContain('Crossed out');
	});

	it('says what the declarations leave open, and when nothing is left', () => {
		const model = preset('precedence');
		const partial = text(renderTab({ ...model, decls: [{ assoc: 'left', ops: '+ ?' }] }));
		expect(partial).toContain('The declarations keep all of the 2 trees.');
		expect(partial).toContain('No declaration for * : trees that differ only in how it groups');
		expect(partial).toContain('? on line 1 is not a terminal of the grammar.');
		const none = text(
			renderTab({
				...preset('left-assoc'),
				decls: [{ assoc: 'nonassoc', ops: '+' }]
			})
		);
		expect(none).toContain('cross out all of the 2 trees: with them, the string is a syntax error');
		const ifs = text(renderTab(preset('dangling-else')));
		expect(ifs).toContain('no production of the form A → A op A');
	});

	it('selects tree 1 of the 42 trees of six operands for %left +', () => {
		const body = renderTab({ ...preset('left-assoc'), input: SIX, values: '' });
		const shown = text(body);
		expect(shown).toContain('The declarations keep one of the 42 trees and cross out the rest.');
		expect(shown).toContain(`Tree 1 ${LEFT_NESTED} Selected`);
		expect(shown).toContain('The declarations allow only this tree.');
		expect(shown).toContain('… and more: 20 of the 42 parse trees are shown.');
		// A tree is allowed: the string is not a syntax error.
		expect(shown).not.toContain('syntax error');
		expect(count(body, /class="cross/g)).toBe(19);
		expect(count(shown, /Crossed out/g)).toBe(19);
	});

	it('draws the tree %right + selects first although it is the last of the 42', () => {
		const body = renderTab({
			...preset('left-assoc'),
			input: SIX,
			values: '',
			decls: [{ assoc: 'right', ops: '+' }]
		});
		const shown = text(body);
		expect(shown).toContain(`Tree 42 ${RIGHT_NESTED} Selected`);
		expect(shown.indexOf('Tree 42 ')).toBeLessThan(shown.indexOf('Tree 1 (((('));
		expect(shown).toContain(
			'The declarations keep one of the 42 trees and cross out the rest. A kept tree from outside the listed ones is shown first.'
		);
		expect(shown).not.toContain('syntax error');
		expect(count(body, /class="cross/g)).toBe(19);
	});

	it('says a string is a syntax error when the declarations allow none of its 42 trees', () => {
		const shown = text(
			renderTab({
				...preset('left-assoc'),
				input: SIX,
				decls: [{ assoc: 'nonassoc', ops: '+' }]
			})
		);
		expect(shown).toContain(
			'The declarations cross out all of the 42 trees: with them, the string is a syntax error.'
		);
		expect(count(shown, /Crossed out/g)).toBe(20);
	});

	it('leaves the tree of the cascade grammar alone, whatever is declared', () => {
		const body = renderTab({
			...preset('left-assoc'),
			grammar: 'E → E + T | T\nT → T * F | F\nF → int | ( E )',
			decls: [{ assoc: 'right', ops: '+' }]
		});
		const shown = text(body);
		expect(shown).toContain('no production of the form A → A op A');
		expect(shown).not.toContain('syntax error');
		expect(shown).not.toContain('Crossed out');
		expect(body).not.toContain('class="cross');
		// Nor is the tree marked as kept by declarations that do not apply to it.
		expect(shown).not.toContain('Kept');
		expect(shown).not.toContain('The declarations allow');
	});

	it('takes an operator of several characters as one operator', () => {
		const body = renderTab({
			...preset('left-assoc'),
			grammar: 'E → E "==" E | E + E | int',
			input: 'int "==" int + int',
			decls: [
				{ assoc: 'nonassoc', ops: '==' },
				{ assoc: 'left', ops: '+' }
			]
		});
		const shown = text(body);
		expect(body).toMatch(/<pre[^>]*>%nonassoc "=="\n%left \+<\/pre>/);
		expect(shown).not.toContain('is not a terminal of the grammar');
		expect(shown).toContain('Tree 2 int == (int + int) Selected');
		expect(shown).toContain('+ binds tighter than ==, so == cannot be an operand of +.');
	});
});

describe('the cascade builder, the preset notes and the reference', () => {
	it('shows the generated grammar of slide 8', () => {
		const model = preset('product-sum');
		const { body } = render(CascadeBuilder, {
			props: { levels: model.levels, atoms: model.atoms, current: '', onuse: () => {} }
		});
		expect(body).toContain('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		expect(text(body)).toContain('Generated grammar');
		expect(text(body)).not.toContain('This is the rewritten grammar.');
	});

	it('generates a grammar for operators of several characters typed without quotes', () => {
		const { body } = render(CascadeBuilder, {
			props: {
				levels: [
					{ ops: '&&', assoc: 'left' },
					{ ops: '== !=', assoc: 'left' }
				],
				atoms: 'int',
				current: '',
				onuse: () => {}
			}
		});
		const raw = body.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
		expect(raw).toContain('E → E "&&" T | T\nT → T "==" F | T "!=" F | F\nF → int');
		expect(text(body)).toContain('the operators of a level are separated by spaces');
		// Nothing is reported: == is one operator, not = twice.
		expect(body).not.toContain('class="problems');
	});

	it('renders every preset note with its questions closed', () => {
		for (const p of presets) {
			const { body } = render(PresetNote, { props: { preset: p } });
			const shown = text(body);
			expect(shown).toContain(p.description);
			for (const q of p.questions ?? []) expect(shown).toContain(q.prompt);
			expect(count(body, /<details/g)).toBe(p.questions?.length ?? 0);
			expect(body).not.toMatch(/<details[^>]* open/);
		}
	});

	it('renders the 15 levels of the C table', () => {
		const { body } = render(PrecedenceTable);
		expect(count(body, /<tbody/g)).toBe(15);
		expect(text(body)).toContain('slide 9');
		expect(text(body)).toContain('<<= >>=');
	});
});
