/**
 * Server-renders the tool's panels: the markup must build for every preset and
 * show what the slides show.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { parseGrammar, sentenceLengths, tokenizeInput, type Grammar } from '$lib/theory/grammar';
import { chainOf, symbolText } from './builder';
import ChomskyStrip from './ChomskyStrip.svelte';
import DerivationBuilder from './DerivationBuilder.svelte';
import FourTuple from './FourTuple.svelte';
import LanguagePanel from './LanguagePanel.svelte';
import MembershipPanel from './MembershipPanel.svelte';
import { applyPreset, presetById, presets, type GrammarPreset } from './presets';
import { randomSentence } from './random';
import SlideNotes from './SlideNotes.svelte';
import { blankState, type GrammarToolState } from './state';
import TestStrings from './TestStrings.svelte';
import { chomskyOf, tupleOf } from './tuple';
import { computeCheck, computeLanguage, membership, testRows, type CheckRequest } from './views';

const text = (html: string) =>
	html
		.replace(/<!--.*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#123;/g, '{')
		.replace(/&#125;/g, '}')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

function grammar(source: string): Grammar {
	const { grammar } = parseGrammar(source);
	if (!grammar) throw new Error(`grammar has errors: ${source}`);
	return grammar;
}

function preset(id: string): GrammarPreset {
	const p = presetById(id);
	if (!p) throw new Error(`no preset ${id}`);
	return p;
}

const load = (id: string): GrammarToolState => applyPreset(preset(id), blankState());

function builder(state: GrammarToolState, show = { lm: false, rm: false }) {
	return text(
		render(DerivationBuilder, {
			props: { grammar: grammar(state.grammar), steps: state.steps, order: state.order, ...show }
		}).body
	);
}

function membershipPanel(source: string, input: string, extra: Record<string, unknown> = {}) {
	const g = grammar(source);
	return render(MembershipPanel, {
		props: {
			input,
			diagnostics: tokenizeInput(input, g.terminals, { nonterminals: g.nonterminals }).diagnostics,
			result: membership(g, input),
			stale: false,
			start: symbolText(g.start),
			onload: () => {},
			...extra
		}
	}).body;
}

function languagePanel(source: string, maxLength: number, seed: number | null = null) {
	const g = grammar(source);
	const range = sentenceLengths(g);
	const random = seed === null ? null : randomSentence(g, seed);
	return text(
		render(LanguagePanel, {
			props: {
				size: range === null ? 'empty' : range.max === Infinity ? 'infinite' : 'finite',
				listing: computeLanguage({ kind: 'language', grammar: source, maxLength }),
				stale: false,
				maxLength,
				characters: g.terminals.every((t) => [...t].length === 1),
				random,
				randomChain: random?.ok ? chainOf(g, random.derivation) : null,
				onrandom: () => {},
				onparse: () => {}
			}
		}).body
	);
}

describe('every preset', () => {
	it.each(presets.map((p) => [p.id, p] as const))('%s renders all panels', (_, p) => {
		const state = applyPreset(p, blankState());
		const g = grammar(state.grammar);
		const tuple = text(render(FourTuple, { props: { tuple: tupleOf(g), mark: true } }).body);
		expect(tuple).toContain(`= ${tupleOf(g).nonterminals}`);
		expect(tuple).toContain(`${g.productions.length} production`);

		expect(builder(state)).toContain(
			state.steps.length === 1 ? '1 step' : `${state.steps.length} steps`
		);
		expect(membershipPanel(state.grammar, state.input)).toMatch(/[∈∉] L\(G\)/);
		expect(languagePanel(state.grammar, state.maxLength, state.seed)).toContain('L(G)');

		const request: CheckRequest = {
			kind: 'check',
			grammar: state.grammar,
			input: state.input,
			tests: state.tests
		};
		const rows = testRows(state.tests, state.grammar, {
			input: request,
			output: computeCheck(request)
		});
		const tests = render(TestStrings, {
			props: { tests: state.tests, rows, errors: state.tests.map(() => null), onparse: () => {} }
		}).body;
		expect(tests.match(/[∈∉] L\(G\)/g) ?? []).toHaveLength(state.tests.length);

		const notes = text(render(SlideNotes, { props: { preset: p, regexHref: () => null } }).body);
		expect(notes).toContain('From the slides');
		for (const q of p.questions ?? []) expect(notes).toContain(q.question);
	});
});

describe('four-tuple and Chomsky strip', () => {
	it('shows N, T, S and P of the arithmetic grammar and marks the productions that break type 3', () => {
		const g = grammar(load('four-tuple').grammar);
		const html = render(FourTuple, { props: { tuple: tupleOf(g), mark: true } }).body;
		const shown = text(html);
		expect(shown).toContain('N non-terminals = { E }');
		expect(shown).toContain('T terminals = { int, +, *, (, ) }');
		expect(shown).toContain('S start symbol = E');
		expect(shown).toContain('1. E → int');
		expect(shown).toContain('4. E → ( E )');
		// Productions 2, 3 and 4, plus the legend.
		expect(html.match(/class="dot/g)).toHaveLength(4);
		expect(render(FourTuple, { props: { tuple: tupleOf(g) } }).body).not.toContain('class="dot');
	});

	it('warns about symbols that are not reached', () => {
		const html = render(FourTuple, { props: { tuple: tupleOf(grammar('S → a\nA → b')) } }).body;
		expect(text(html)).toContain('A is not reachable from the start symbol S.');
	});

	it('names the type, its form and its recognizer, with the table of slide 23', () => {
		const regular = text(
			render(ChomskyStrip, {
				props: { chomsky: chomskyOf(grammar('S → 1 A\nA → 0 | 1 A')), nfaHref: '/automata#v1.x' }
			}).body
		);
		expect(regular).toContain(
			'Type 3 (regular) every production has the form V → w | wU — recognizer: NFA or DFA'
		);
		expect(regular).toContain('Open as an NFA in Finite Automata');
		expect(regular).toContain('Linear Bounded Automaton (ND)');
		expect(regular).toContain('Introduction to Parsing · slide 23');

		const free = text(
			render(ChomskyStrip, { props: { chomsky: chomskyOf(grammar('S → ε | ( S )')) } }).body
		);
		expect(free).toContain('Type 2 (context free) V → α — recognizer: push-down automaton (ND)');
		expect(free).toContain('Production 2 does not have the type 3 form V → w | wU.');
		expect(free).not.toContain('Open as an NFA');
	});

	it('says why a regular grammar has no NFA link', () => {
		const html = render(ChomskyStrip, {
			props: { chomsky: chomskyOf(grammar('S → int S | id')), nfaNote: 'Terminals are too long.' }
		}).body;
		expect(text(html)).toContain('Terminals are too long.');
		expect(html).not.toContain('<a ');
	});
});

describe('derivation builder', () => {
	it('shows the chain of slide 12, the sentence note and the tree', () => {
		const shown = builder(load('rewrite-rules'));
		expect(shown).toContain('6 steps');
		expect(shown).toContain('E → E * E → ( E ) * E → ( E + E ) * E →');
		expect(shown).toContain('( int + int ) * int is a sentence');
		expect(shown).toContain(
			'Step 6: production 1, E → int, replaces symbol 7 of ( int + int ) * E.'
		);
		expect(shown).not.toContain('Both derivations define the same parse tree.');
	});

	it('shows the leftmost and the rightmost derivation side by side', () => {
		const shown = builder(load('rewrite-rules'), { lm: true, rm: true });
		expect(shown).toContain('Leftmost derivation E → E * E → ( E ) * E');
		expect(shown).toContain('Rightmost derivation E → E * E → E * int → ( E ) * int');
		expect(shown).toContain('Both derivations define the same parse tree.');
		expect(builder(load('rewrite-rules'), { lm: true, rm: false })).not.toContain(
			'Both derivations define the same parse tree.'
		);
	});

	it('offers the productions of the start symbol before the first step', () => {
		const html = render(DerivationBuilder, {
			props: {
				grammar: grammar(load('four-tuple').grammar),
				steps: [],
				order: 'any',
				lm: true,
				rm: true
			}
		}).body;
		const shown = text(html);
		expect(shown).toContain('0 steps');
		expect(shown).toContain('Start: the start symbol E.');
		expect(html.match(/class="production /g)).toHaveLength(4);
		expect(shown).toContain('Available once the sentential form has only terminals.');
		expect(shown).not.toContain('is a sentence');
	});

	it('enables only the allowed non-terminal in leftmost and rightmost order', () => {
		// E → E + E: two non-terminals.
		const g = grammar(load('four-tuple').grammar);
		const buttons = (order: 'any' | 'leftmost' | 'rightmost') =>
			[
				...render(DerivationBuilder, {
					props: { grammar: g, steps: [[0, 1]], order, lm: false, rm: false }
				}).body.matchAll(/<button[^>]*class="symbol nt[^"]*"[^>]*>/g)
			].map((m) => /\sdisabled/.test(m[0]));
		expect(buttons('any')).toEqual([false, false]);
		expect(buttons('leftmost')).toEqual([false, true]);
		expect(buttons('rightmost')).toEqual([true, false]);
	});

	it('says how many saved steps no longer apply', () => {
		const shown = builder({ ...load('rewrite-rules'), grammar: 'E → int\nE → E + E\nE → ( E )' });
		expect(shown).toContain('5 saved steps do not apply to this grammar and are left out.');
	});
});

describe('membership panel', () => {
	it('shows a member with its tree, derivation and the button that loads it', () => {
		const shown = text(membershipPanel(load('cascade').grammar, 'int * int + int'));
		expect(shown).toContain('∈ L(G)');
		expect(shown).toContain('It has one parse tree.');
		expect(shown).toContain('Leftmost derivation E → E + T → T + T → T * F + T');
		expect(shown).toContain('Load into the derivation builder');
	});

	it('says how many trees an ambiguous string has and links to the ambiguity tool', () => {
		const source = load('rewrite-rules').grammar;
		const html = membershipPanel(source, 'int + int * int', { ambiguityHref: '/ambiguity#v1.x' });
		expect(text(html)).toContain('It has 2 parse trees; the first is drawn.');
		expect(html).toContain('href="/ambiguity#v1.x"');
		expect(text(html)).toContain('Open in Ambiguity');
		// No link when the tool is not part of the site, and none for a single tree.
		expect(membershipPanel(source, 'int + int * int')).not.toContain('<a ');
		expect(membershipPanel(source, 'int', { ambiguityHref: '/ambiguity#v1.x' })).not.toContain(
			'<a '
		);
	});

	it('shows ∉ L(G) for ( int ) )', () => {
		const shown = text(membershipPanel(load('cannot-obtain').grammar, '( int ) )'));
		expect(shown).toContain('∉ L(G)');
		expect(shown).toContain('No sequence of replacements that starts from E gives this string.');
		expect(shown).not.toContain('Load into the derivation builder');
	});

	it('shows the problems of a string that is not made of terminals, and no verdict', () => {
		const shown = text(membershipPanel(load('rewrite-rules').grammar, 'int + E'));
		expect(shown).toContain('E is a non-terminal. The input is a string of terminals.');
		expect(shown).not.toMatch(/[∈∉] L\(G\)/);
	});

	it('shows ε for the empty string', () => {
		const html = membershipPanel(load('balanced').grammar, '');
		expect(html).toContain('aria-label="The empty string"');
		expect(text(html)).toContain('∈ L(G)');
	});
});

describe('test strings', () => {
	it('shows each verdict, and the problem of a row that is not a string of terminals', () => {
		const tests = ['int', '( int ) )', 'int x'];
		const request: CheckRequest = {
			kind: 'check',
			grammar: load('rewrite-rules').grammar,
			input: '',
			tests
		};
		const rows = testRows(tests, request.grammar, {
			input: request,
			output: computeCheck(request)
		});
		const html = render(TestStrings, {
			props: {
				tests,
				rows,
				errors: [null, null, 'x is not a terminal of the grammar.'],
				onparse: () => {}
			}
		}).body;
		const shown = text(html);
		expect(shown.match(/[∈∉] L\(G\)/g)).toEqual(['∈ L(G)', '∉ L(G)']);
		expect(shown).toContain('x is not a terminal of the grammar.');
		expect(shown).toContain('not terminals');
	});

	it('shows no verdict for a row without a result', () => {
		const html = render(TestStrings, {
			props: {
				tests: ['int'],
				rows: [{ verdict: null, stale: false }],
				errors: [null],
				onparse: () => {}
			}
		}).body;
		expect(text(html)).not.toMatch(/[∈∉] L\(G\)/);
		expect(
			text(
				render(TestStrings, { props: { tests: [], rows: [], errors: [], onparse: () => {} } }).body
			)
		).toContain('No test strings.');
	});
});

describe('language panel', () => {
	it('writes L(G) = { "0", "1" } and counts a finite language (slide 26)', () => {
		const shown = languagePanel('S → 0 | 1', 5);
		expect(shown).toContain('finite: 2 sentences');
		expect(shown).toContain('L(G) = { "0", "1" }');
		expect(shown).toContain('1 token 0 1');
	});

	it('lists an infinite language by length and shows ε', () => {
		const shown = languagePanel('S → ε | ( S )', 4);
		expect(shown).toContain('infinite');
		expect(shown).toContain('L(G) = { "", "()", "(())", … }');
		expect(shown).toContain('0 tokens ε');
		expect(shown).toContain('4 tokens ( ( ) )');
	});

	it('says that a language is empty', () => {
		const shown = languagePanel('S → S a', 4);
		expect(shown).toContain('empty');
		expect(shown).toContain('No string of terminals can be derived from the start symbol.');
	});

	it('lists token strings without the set notation when terminals are words', () => {
		const shown = languagePanel(load('rewrite-rules').grammar, 3);
		expect(shown).toContain('3 tokens int + int int * int ( int )');
		expect(shown).not.toContain('{ "int"');
	});

	it('shows the random sentence of the English preset with its derivation', () => {
		const state = load('english');
		const shown = languagePanel(state.grammar, 2, state.seed);
		expect(shown).toContain(
			'Sentence → NounPhrase VerbPhrase → Noun VerbPhrase → "the cat" VerbPhrase'
		);
		expect(shown).toContain('"the cat" saw "the mat" under "the floor"');
		expect(languagePanel(state.grammar, 2)).toContain('No sentence drawn yet.');
	});
});

describe('slide notes', () => {
	it('poses the question and keeps the answer in a disclosure', () => {
		const html = render(SlideNotes, {
			props: { preset: preset('ones-then-zero'), regexHref: (q) => (q.re ? '/regex#v1.x' : null) }
		}).body;
		expect(html).toContain('<details');
		expect(html).not.toContain('<details open');
		const shown = text(html);
		expect(shown).toContain('Introduction to Parsing · slide 27');
		expect(shown).toContain('R.E.?');
		expect(shown).toContain('Show answer');
		expect(shown).toContain('Open 11*0 in Regular Expressions');
		expect(html).toContain('href="/regex#v1.x"');
	});

	it('writes the superscripts of the balanced-parentheses answer and the note of slide 26', () => {
		const balanced = render(SlideNotes, {
			props: { preset: preset('balanced'), regexHref: () => null }
		}).body;
		const plain = balanced.replace(/<!--.*?-->/g, '').replace(/ class="[^"]*"/g, '');
		expect(plain).toContain('{ (<sup>i</sup> )<sup>i</sup> | i ≥ 0 }');
		expect(balanced).not.toContain('<a ');
		const bits = text(
			render(SlideNotes, { props: { preset: preset('one-then-bit'), regexHref: () => null } }).body
		);
		expect(bits).toContain('R.E.-s for these languages?');
		expect(bits).toContain('All finite languages are regular!');
	});
});
