import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { enumerate, regexToDfa } from '$lib/theory/automata';
import { formatStringSet } from '$lib/theory/chars';
import {
	bracketForm,
	parseGrammar,
	parseTrees,
	printGrammar,
	tokenizeInput,
	treeFromDerivation,
	type Grammar
} from '$lib/theory/grammar';
import * as fixtures from '$lib/theory/grammar/test-helpers';
import { parseRegex } from '$lib/theory/regex';
import { tool } from '$lib/tools/catalog/grammar';
import { toolLink } from '$lib/tools/links';
import { toolBySlug } from '$lib/tools/registry';
import {
	bothDerivations,
	derivationKind,
	formsOf,
	isSentence,
	kindLabel,
	pairsOf,
	replay
} from './builder';
import {
	ARITHMETIC,
	ARITHMETIC_ID,
	CASCADE,
	COOL,
	DEFAULT_PRESET_ID,
	ENGLISH,
	activePreset,
	applyPreset,
	presetById,
	presets,
	richText,
	type GrammarPreset
} from './presets';
import { randomSentence } from './random';
import { regularNfa } from './regular';
import { blankState, isGrammarHash, stateFromHash, type GrammarToolState } from './state';
import { chomskyOf, tupleOf } from './tuple';
import { computeCheck, computeLanguage } from './views';

function preset(id: string): GrammarPreset {
	const p = presetById(id);
	if (!p) throw new Error(`no preset ${id}`);
	return p;
}

function grammarOf(p: GrammarPreset): Grammar {
	const { grammar } = parseGrammar(p.value.grammar);
	if (!grammar) throw new Error(`preset ${p.id} has grammar errors`);
	return grammar;
}

const load = (id: string) => applyPreset(preset(id), blankState());
const check = (id: string) => {
	const s = load(id);
	return computeCheck({ kind: 'check', grammar: s.grammar, input: s.input, tests: s.tests });
};
const language = (id: string, maxLength: number) =>
	computeLanguage({ kind: 'language', grammar: preset(id).value.grammar, maxLength });
/** L(G) up to a length as the set of strings the slides write. */
const stringSet = (id: string, maxLength: number) => {
	const view = language(id, maxLength);
	return formatStringSet(
		view.sentences.map((s) => s.join('')),
		{ more: view.more }
	);
};
/** The strings of a lecture RE up to a length, sorted. */
function regexStrings(re: string, maxLength: number): string[] {
	const parsed = parseRegex(re);
	if (!parsed.ok) throw new Error(`RE has errors: ${re}`);
	return enumerate(regexToDfa(parsed.regex), { maxLength, limit: 1000 }).strings.slice().sort();
}
const sentenceStrings = (id: string, maxLength: number) =>
	language(id, maxLength)
		.sentences.map((s) => s.join(''))
		.sort();

describe('catalog entry', () => {
	it('registers /grammar in the syntax stage', () => {
		expect(tool).toEqual({
			slug: 'grammar',
			title: 'Context-Free Grammars',
			summary:
				'Write a grammar, derive strings one replacement at a time, and see the parse tree each derivation defines.',
			stage: 'syntax',
			order: 10,
			cites: [{ deck: '09', slide: [11, 31] }],
			keywords: tool.keywords
		});
		expect(tool.cites.map(formatCitation)).toEqual(['Introduction to Parsing · slides 11–31']);
		expect(toolBySlug('grammar')).toBe(tool);
	});

	it('is linked to with the grammar and a token string', () => {
		const href = toolLink('grammar', { grammar: 'S → a', input: 'a' });
		expect(href).toMatch(/\/grammar#v1\./);
	});
});

describe('copy', () => {
	// Pages say what a tool does; they never describe a teaching purpose (docs/ARCHITECTURE.md §1).
	const forbidden =
		/helps? you|\blearn|intuition|explor(e|ing)|discover|common mistake|misconception|understand/i;
	const here = fileURLToPath(new URL('.', import.meta.url));
	const route = fileURLToPath(new URL('../../../routes/grammar/', import.meta.url));
	const catalog = fileURLToPath(new URL('../catalog/grammar.ts', import.meta.url));
	const sources = [
		...readdirSync(here)
			.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
			.map((f) => here + f),
		...readdirSync(route).map((f) => route + f),
		catalog
	];

	it('has no teaching-purpose phrasing', () => {
		expect(sources.length).toBeGreaterThan(12);
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden);
	});

	it('uses → for derivation steps, never ⇒', () => {
		for (const file of sources) expect(readFileSync(file, 'utf8'), file).not.toMatch(/⇒|=>\*/);
	});

	it('cites decks by title and slide, and poses slide questions as questions', () => {
		for (const p of presets) {
			expect(formatCitation(p.cite!), p.id).toMatch(
				/^(Introduction to Parsing|Ambiguity, Precedence, Associativity & Top-Down Parsing) · slides? \d/
			);
			for (const q of p.questions ?? []) expect(q.question, p.id).toContain('?');
		}
	});
});

describe('presets', () => {
	it('have unique ids, a group, a description and a citation', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.group, p.id).toBeTruthy();
			expect(p.description, p.id).toBeTruthy();
			expect(p.cite, p.id).toBeTruthy();
		}
		expect(presets.map((p) => p.id)).toEqual([
			'rewrite-rules',
			'cannot-obtain',
			'four-tuple',
			'arithmetic-id',
			'zero-or-one',
			'one-then-bit',
			'ones-then-zero',
			'balanced',
			'cool',
			'english',
			'cascade'
		]);
		expect(DEFAULT_PRESET_ID).toBe('rewrite-rules');
		expect(presetById(DEFAULT_PRESET_ID)?.cite).toEqual({ deck: '09', slide: 12 });
		expect(presetById(null)).toBeUndefined();
		expect(presetById('nope')).toBeUndefined();
	});

	it('use the grammars of the slides', () => {
		// The same text the engine's own lecture fixtures hold.
		expect(ARITHMETIC).toBe(fixtures.ARITHMETIC);
		expect(ARITHMETIC_ID).toBe(fixtures.ARITHMETIC_ID);
		expect(COOL).toBe(fixtures.COOL);
		expect(ENGLISH).toBe(fixtures.ENGLISH);
		expect(CASCADE).toBe(fixtures.CASCADE);
		// Slides 29–30 write each further alternative on its own line, after |.
		expect(COOL.split('\n').map((line) => line.trim()[0])).toEqual(['E', '|', '|']);
	});

	it.each(presets.map((p) => [p.id, p] as const))('%s loads without problems', (_, p) => {
		const { grammar, diagnostics } = parseGrammar(p.value.grammar);
		expect(diagnostics).toEqual([]);
		expect(grammar).not.toBeNull();
		const g = grammar!;
		const state = applyPreset(p, blankState());

		// The token string and the test strings are strings of terminals.
		for (const text of [state.input, ...state.tests])
			expect(tokenizeInput(text, g.terminals).diagnostics, text).toEqual([]);

		// The saved derivation applies step by step.
		const built = replay(g, state.steps);
		expect(built.dropped).toBe(0);
		expect(built.pairs).toEqual(p.value.steps ?? []);

		// The views compute, and the state is one the page saves and reads back.
		const view = computeCheck({
			kind: 'check',
			grammar: state.grammar,
			input: state.input,
			tests: state.tests
		});
		expect(view.input.verdict).toMatch(/^(member|not-member)$/);
		for (const verdict of view.tests) expect(verdict).toMatch(/^(member|not-member)$/);
		expect(
			computeLanguage({ kind: 'language', grammar: state.grammar, maxLength: 5 })
		).toBeTruthy();
		expect(tupleOf(g).warnings).toEqual([]);
		expect(isGrammarHash(state)).toBe(true);
		expect(stateFromHash(state)).toEqual(state);
		expect(activePreset(state)?.id).toBe(p.id);
		if (state.seed !== null) expect(randomSentence(g, state.seed).ok).toBe(true);
	});

	it('load a complete state and keep the length of the sentence list', () => {
		const state = applyPreset(preset('cascade'), { maxLength: 8 });
		expect(state).toMatchObject({
			grammar: CASCADE,
			input: 'int * int + int',
			order: 'leftmost',
			lm: false,
			rm: false,
			maxLength: 8,
			seed: null,
			preset: 'cascade'
		});
		expect(Object.keys(state).sort()).toEqual(Object.keys(blankState()).sort());
		// The steps are copies: editing the state does not change the preset.
		state.steps.pop();
		expect(preset('cascade').value.steps).toHaveLength(8);
	});

	it('stay active until the grammar is edited', () => {
		const state = load('cannot-obtain');
		const edited: GrammarToolState = { ...state, input: 'int', steps: [[0, 0]] };
		expect(activePreset(edited)?.id).toBe('cannot-obtain');
		expect(activePreset({ ...state, grammar: state.grammar + '\nE → id' })).toBeUndefined();
		expect(activePreset({ ...state, preset: null })).toBeUndefined();
	});
});

describe('Introduction to Parsing: the arithmetic grammar', () => {
	it('preloads the rewrite chain of slide 12', () => {
		const p = preset('rewrite-rules');
		const g = grammarOf(p);
		const { derivation } = replay(g, load('rewrite-rules').steps);
		const forms = formsOf(derivation).map((f) => f.join(' '));
		// E → E * E → ( E ) * E → ( E + E ) * E → … → ( int + int ) * int
		expect(forms.slice(0, 4)).toEqual(['E', 'E * E', '( E ) * E', '( E + E ) * E']);
		expect(forms.at(-1)).toBe('( int + int ) * int');
		expect(forms).toHaveLength(7);
		expect(isSentence(g, derivation.steps.at(-1)!.form)).toBe(true);
		expect(p.description).toContain('E → E * E → ( E ) * E → ( E + E ) * E → …');
		// The three steps the slide leaves out are E → int.
		expect(derivation.steps.slice(3).map((s) => s.production)).toEqual([0, 0, 0]);
		expect(bracketForm(treeFromDerivation(g, derivation))).toBe(
			'E( E( ( E( E(int) + E(int) ) ) ) * E(int) )'
		);
	});

	it('finds the expressions of slide 11 in the language', () => {
		const state = load('rewrite-rules');
		expect(state.tests).toEqual(['int', 'int + int', '( int + int ) * int']);
		const view = check('rewrite-rules');
		expect(view.tests).toEqual(['member', 'member', 'member']);
		expect(view.input).toMatchObject({ verdict: 'member', trees: 1 });
		// The builder's derivation and the one of the token string build the same tree.
		expect(view.input.derivation!.pairs).toEqual(state.steps);
	});

	it('cannot obtain ( int ) ) (slide 13)', () => {
		const state = load('cannot-obtain');
		expect(state.input).toBe('( int ) )');
		expect(state.tests).toContain('( int ) )');
		const view = check('cannot-obtain');
		expect(view.input.verdict).toBe('not-member');
		expect(view.tests).toEqual(['not-member', 'member']);
		expect(preset('cannot-obtain').questions![0].question).toBe(
			'We cannot obtain ( int ) ) by any sequence of replacements. Why?'
		);
		// The answer's claim: only E → ( E ) has parentheses, one of each.
		const g = grammarOf(preset('cannot-obtain'));
		const withParens = g.productions.filter((p) => p.rhs.includes('(') || p.rhs.includes(')'));
		expect(withParens.map((p) => p.rhs.join(' '))).toEqual(['( E )']);
	});

	it('answers N ? T ? S ? with the four-tuple the page shows (slide 15)', () => {
		const p = preset('four-tuple');
		const t = tupleOf(grammarOf(p));
		expect(p.questions).toEqual([
			{
				question: 'N ? T ? S ?',
				answer: `N = ${t.nonterminals}, T = ${t.terminals}, S = ${t.start}`,
				formal: true
			}
		]);
		expect(p.questions![0].answer).toBe('N = { E }, T = { int, +, *, (, ) }, S = E');
		expect(load('four-tuple')).toMatchObject({ input: '', tests: [], steps: [] });
	});

	it('lists the six elements of slide 28 as test strings, all in the language', () => {
		const p = preset('arithmetic-id');
		expect(p.value.grammar).toBe('E → E+E | E ∗ E | (E) | id');
		// Written tight and with ∗, the grammar reads as E → E + E | E * E | ( E ) | id.
		expect(printGrammar(grammarOf(p))).toBe('E → E + E | E * E | ( E ) | id');
		const six = ['id', '(id)', '(id) ∗ id', 'id + id', 'id ∗ id', 'id ∗ (id)'];
		expect(p.value.tests).toEqual(six);
		expect(check('arithmetic-id').tests).toEqual(Array(6).fill('member'));
		expect(p.questions![0]).toMatchObject({
			question: 'Some elements of the language?',
			answer: six.join(', ')
		});
	});
});

describe('Introduction to Parsing: what language, and is there an R.E.?', () => {
	it('S → 0 | 1 generates { "0", "1" } (slide 26)', () => {
		const p = preset('zero-or-one');
		expect(stringSet('zero-or-one', 10)).toBe('{ "0", "1" }');
		expect(p.questions![0]).toMatchObject({
			question: 'What language does this grammar generate?',
			answer: `L(G) = ${stringSet('zero-or-one', 10)}`
		});
		expect(language('zero-or-one', 5).total).toBe(2);
		expect(chomskyOf(grammarOf(p)).type).toBe(3);
		expect(check('zero-or-one').tests).toEqual(['member', 'member', 'not-member']);
	});

	it('S → 1 A, A → 0 | 1 generates a finite, regular language (slide 26)', () => {
		const p = preset('one-then-bit');
		expect(p.value.grammar).toBe('S → 1 A\nA → 0 | 1');
		expect(sentenceStrings('one-then-bit', 10)).toEqual(['10', '11']);
		expect(language('one-then-bit', 5).total).toBe(2);
		const [what, re] = p.questions!;
		expect(what.answer).toBe('L(G) = { "10", "11" }');
		expect(re.question).toBe('R.E.-s for these languages?');
		expect(re.note).toBe('All finite languages are regular!');
		// The R.E.-s of the answer generate the two languages of the slide.
		expect(re.answer).toContain('0 | 1 for S → 0 | 1');
		expect(regexStrings('0 | 1', 6)).toEqual(sentenceStrings('zero-or-one', 6));
		expect(regexStrings(re.re!, 6)).toEqual(sentenceStrings('one-then-bit', 6));
		expect(re.answer).toContain(re.re!);
	});

	it('S → 1 A, A → 0 | 1 A is 11*0 (slide 27)', () => {
		const p = preset('ones-then-zero');
		expect(p.questions).toEqual([{ question: 'R.E.?', answer: '11*0', formal: true, re: '11*0' }]);
		expect(regexStrings('11*0', 9)).toEqual(sentenceStrings('ones-then-zero', 9));
		expect(stringSet('ones-then-zero', 4)).toBe('{ "10", "110", "1110", … }');
		expect(language('ones-then-zero', 5).total).toBeNull();
		// A type 3 grammar: the page offers its NFA, which accepts the same strings.
		expect(chomskyOf(grammarOf(p)).type).toBe(3);
		const nfa = regularNfa(grammarOf(p));
		if (!nfa.ok) throw new Error('no NFA');
		expect(enumerate(nfa.automaton, { maxLength: 9, limit: 1000 }).strings.slice().sort()).toEqual(
			sentenceStrings('ones-then-zero', 9)
		);
		expect(check('ones-then-zero').tests).toEqual(['member', 'member', 'not-member', 'not-member']);
	});

	it('S → ε | ( S ) is the language of balanced parentheses, with no R.E. (slide 27)', () => {
		const p = preset('balanced');
		expect(stringSet('balanced', 6)).toBe('{ "", "()", "(())", "((()))", … }');
		// { (ⁱ )ⁱ | i ≥ 0 }
		expect(sentenceStrings('balanced', 10)).toEqual(
			[0, 1, 2, 3, 4, 5].map((i) => '('.repeat(i) + ')'.repeat(i)).sort()
		);
		const q = p.questions![0];
		expect(q.question).toBe('R.E.?');
		expect(q.answer).toMatch(/^None\./);
		expect(q.re).toBeUndefined();
		expect(richText(q.answer).filter((part) => part.sup)).toEqual([
			{ text: 'i', sup: true },
			{ text: 'i', sup: true }
		]);
		expect(
			richText(q.answer)
				.map((part) => part.text)
				.join('')
		).toContain('{ (i )i | i ≥ 0 }');
		// Not of type 3, so no NFA is offered.
		expect(chomskyOf(grammarOf(p))).toMatchObject({ type: 2, breaking: [2] });
		expect(regularNfa(grammarOf(p)).ok).toBe(false);
		expect(check('balanced').tests).toEqual([
			'member',
			'member',
			'member',
			'not-member',
			'not-member'
		]);
	});
});

describe('Introduction to Parsing: larger grammars', () => {
	it('finds all five COOL strings in the language (slides 29–30)', () => {
		const p = preset('cool');
		expect(p.cite).toEqual({ deck: '09', slide: [29, 30] });
		expect(p.value.tests).toEqual([
			'id',
			'if id then id else id fi',
			'while id loop id pool',
			'if while id loop id pool then id else id fi',
			'if if id then id else id fi then id else id fi'
		]);
		expect(check('cool').tests).toEqual(Array(5).fill('member'));
		expect(p.questions![0].question).toBe('Which are elements of the language?');
		expect(tupleOf(grammarOf(p))).toMatchObject({
			nonterminals: '{ EXPR }',
			terminals: '{ if, then, else, fi, while, loop, pool, id }',
			start: 'EXPR'
		});
	});

	it('draws a sentence of the English grammar that nests phrases (slide 25)', () => {
		const p = preset('english');
		const g = grammarOf(p);
		expect(g.start).toBe('Sentence');
		expect(g.productions).toHaveLength(13);
		const r = randomSentence(g, load('english').seed!);
		if (!r.ok) throw new Error('no sentence');
		expect(r.sentence).toEqual(['the cat', 'saw', 'the mat', 'under', 'the floor']);
		// NounPhrase → Noun PrepositionalPhrase is used: the recursion of the slide.
		expect(r.derivation.steps.map((s) => s.production)).toContain(2);
		expect(check('english').input.verdict).toBe('member');
		expect(check('english').tests).toEqual(['member', 'member', 'not-member']);
	});
});

describe('Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 8', () => {
	it('loads the leftmost derivation of int * int + int', () => {
		const p = preset('cascade');
		expect(p.cite).toEqual({ deck: '10', slide: 8 });
		expect(p.value.grammar).toBe('E → E + T | T\nT → T * F | F\nF → int | ( E )');
		const g = grammarOf(p);
		const state = load('cascade');
		expect(state.order).toBe('leftmost');
		const { derivation } = replay(g, state.steps);
		expect(formsOf(derivation).map((f) => f.join(' '))).toEqual([
			'E',
			'E + T',
			'T + T',
			'T * F + T',
			'F * F + T',
			'int * F + T',
			'int * int + T',
			'int * int + F',
			'int * int + int'
		]);
		expect(derivationKind(g, derivation)).toEqual({ leftmost: true, rightmost: false });
		expect(kindLabel(g, derivation)).toBe('leftmost derivation');

		// It is the leftmost derivation of the string's only parse tree (the tree of slide 10).
		const { trees } = parseTrees(g, ['int', '*', 'int', '+', 'int']);
		expect(trees.map(bracketForm)).toEqual(['E( E( T( T( F(int) ) * F(int) ) ) + T( F(int) ) )']);
		const both = bothDerivations(g, derivation);
		expect(bracketForm(both.tree)).toBe(bracketForm(trees[0]));
		expect(pairsOf(both.leftmost)).toEqual(state.steps);
		expect(check('cascade').input.derivation!.pairs).toEqual(state.steps);
		expect(formsOf(both.rightmost).map((f) => f.join(' '))).toEqual([
			'E',
			'E + T',
			'E + F',
			'E + int',
			'T + int',
			'T * F + int',
			'T * int + int',
			'F * int + int',
			'int * int + int'
		]);
	});

	it('gives every test string one parse tree', () => {
		const g = grammarOf(preset('cascade'));
		for (const text of load('cascade').tests) {
			const { tokens } = tokenizeInput(text, g.terminals);
			expect(parseTrees(g, tokens).trees, text).toHaveLength(1);
		}
	});
});

describe('richText', () => {
	it('splits superscripts out of an answer', () => {
		expect(richText('{ (^{i} )^{i} | i ≥ 0 }')).toEqual([
			{ text: '{ (', sup: false },
			{ text: 'i', sup: true },
			{ text: ' )', sup: false },
			{ text: 'i', sup: true },
			{ text: ' | i ≥ 0 }', sup: false }
		]);
		expect(richText('11*0')).toEqual([{ text: '11*0', sup: false }]);
		expect(richText('a^{2}')).toEqual([
			{ text: 'a', sup: false },
			{ text: '2', sup: true }
		]);
		expect(richText('')).toEqual([]);
		expect(richText('x ^ y')).toEqual([{ text: 'x ^ y', sup: false }]);
	});
});
