import { describe, expect, it } from 'vitest';
import {
	compareGrammars,
	ebnfToGrammar,
	leftRecursion,
	parseEbnf,
	parseGrammar,
	printEbnf,
	type EbnfGrammar,
	type Grammar
} from '$lib/theory/grammar';
import {
	MAX_ALTERNATIVES,
	eliminateImmediateLeftRecursion,
	eliminateLeftRecursion,
	leftFactor,
	prefixFindings,
	recursionFindings,
	recursionKinds,
	rewriteGrammar,
	type Transformed
} from './transform';

function grammar(text: string): Grammar {
	const { grammar, diagnostics } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

const lines = (...rules: string[]) => rules.join('\n');

/** The result generates the sentences of the original, up to seven tokens. */
function expectSameLanguage(original: Grammar | EbnfGrammar, rewritten: EbnfGrammar) {
	const a = 'rules' in original ? ebnfToGrammar(original) : original;
	const compared = compareGrammars(a, ebnfToGrammar(rewritten), { maxLength: 7 });
	expect(compared.checkedUpTo).toBe(7);
	expect(compared.onlyA).toEqual([]);
	expect(compared.onlyB).toEqual([]);
}

/** The text is the grammar: it reads back as the same rules. */
function expectReadsBack(t: Transformed) {
	const parsed = parseEbnf(t.text);
	expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	expect(printEbnf(parsed.grammar!)).toBe(t.text);
	expect(printEbnf(t.grammar)).toBe(t.text);
}

const SLIDE_25 = 'S → 1 | S 0';
const SLIDE_38 = lines('E → E + T | T', 'T → T * F | F', 'F → ( E ) | int');
const SLIDE_36 = lines('E → T + E | T', 'T → ( E ) | int | int * T');
const SLIDE_39 = 'A → X op A | X';
const SLIDE_27 = lines('S → A a | d', 'A → S b');

describe('elimination of immediate left recursion (slides 24–26)', () => {
	it('S → 1 | S 0 becomes S → 1 S’ ; S’ → 0 S’ | ε (slide 25)', () => {
		const g = grammar(SLIDE_25);
		const t = eliminateImmediateLeftRecursion(g, { form: 'bnf' });
		expect(t.text).toBe(lines('S → 1 S’', 'S’ → 0 S’ | ε'));
		expect(t.notes).toEqual([]);
		expect(t.changes).toHaveLength(1);
		expect(t.changes[0]).toMatchObject({
			kind: 'left-recursion',
			nonterminal: 'S',
			before: ['S → 1 | S 0'],
			after: ['S → 1 S’', 'S’ → 0 S’ | ε'],
			cite: { deck: '11', slide: [24, 26] }
		});
		expect(t.changes[0].text).toContain('α = 0 and β = 1');
		expect(t.changes[0].note).toContain('Left recursion implies left associativity');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('or S → 1 { 0 } using EBNF (slide 25)', () => {
		const g = grammar(SLIDE_25);
		const t = eliminateImmediateLeftRecursion(g);
		expect(t.text).toBe('S → 1 { 0 }');
		expect(t.changes[0].after).toEqual(['S → 1 { 0 }']);
		expect(t.changes[0].text).toContain('S generates all strings of the form β { α }');
		expect(t.changes[0].note).toContain('{ }');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('removes it from every rule: E → T { + T } ; T → F { * F } (slide 38)', () => {
		const g = grammar(SLIDE_38);
		const t = eliminateImmediateLeftRecursion(g, { form: 'ebnf' });
		expect(t.text).toBe(lines('E → T { + T }', 'T → F { * F }', 'F → ( E ) | int'));
		expect(t.changes.map((c) => c.nonterminal)).toEqual(['E', 'T']);
		expect(leftRecursion(ebnfToGrammar(t.grammar))).toEqual([]);
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('writes the same grammar with primed non-terminals and ε', () => {
		const g = grammar(SLIDE_38);
		const t = eliminateImmediateLeftRecursion(g, { form: 'bnf' });
		expect(t.text).toBe(
			lines('E → T E’', 'E’ → + T E’ | ε', 'T → F T’', 'T’ → * F T’ | ε', 'F → ( E ) | int')
		);
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('follows the general form with several α and β (slide 26)', () => {
		const g = grammar('S → S a | S b | c | d');
		const bnf = eliminateImmediateLeftRecursion(g, { form: 'bnf' });
		expect(bnf.text).toBe(lines('S → c S’ | d S’', 'S’ → a S’ | b S’ | ε'));
		expectSameLanguage(g, bnf.grammar);
		// β { α } would need ( c | d ) { a | b }: parentheses are terminals, so the primed form is used.
		const e = eliminateImmediateLeftRecursion(g, { form: 'ebnf' });
		expect(e.text).toBe(bnf.text);
		expect(e.changes[0].text).toContain('parentheses are terminals');
		expect(e.changes[0].text).toContain('( c | d )');
		expect(bnf.changes[0].text).not.toContain('parentheses');
	});

	it('puts several α inside one pair of braces when there is one β', () => {
		const g = grammar('E → E + T | E - T | T\nT → int');
		const t = eliminateImmediateLeftRecursion(g);
		expect(t.text).toBe(lines('E → T { + T | - T }', 'T → int'));
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('adds primes until the new name is unused', () => {
		const g = grammar('S → S a | S’\nS’ → b');
		const t = eliminateImmediateLeftRecursion(g, { form: 'bnf' });
		expect(t.text).toBe(lines('S → S’ S’’', 'S’’ → a S’’ | ε', 'S’ → b'));
		expectSameLanguage(g, t.grammar);
	});

	it('handles β = ε', () => {
		const g = grammar('S → S a | ε');
		expect(eliminateImmediateLeftRecursion(g).text).toBe('S → { a }');
		const bnf = eliminateImmediateLeftRecursion(g, { form: 'bnf' });
		expect(bnf.text).toBe(lines('S → S’', 'S’ → a S’ | ε'));
		expectSameLanguage(g, bnf.grammar);
		expectSameLanguage(g, eliminateImmediateLeftRecursion(g).grammar);
	});

	it('drops S → S, which adds no string', () => {
		const g = grammar('S → S | a');
		const t = eliminateImmediateLeftRecursion(g);
		expect(t.text).toBe('S → a');
		expect(t.changes[0].kind).toBe('dropped');
		expectSameLanguage(g, t.grammar);
	});

	it('leaves a rule without β alone and says why', () => {
		const g = grammar('V → V a');
		const t = eliminateImmediateLeftRecursion(g);
		expect(t.text).toBe('V → V a');
		expect(t.changes).toEqual([]);
		expect(t.notes).toHaveLength(1);
		expect(t.notes[0].message).toContain('Every alternative of V starts with V');
	});

	it('leaves a grammar without left recursion unchanged', () => {
		const t = eliminateImmediateLeftRecursion(grammar(SLIDE_36));
		expect(t.text).toBe(SLIDE_36);
		expect(t.changes).toEqual([]);
		expect(t.notes).toEqual([]);
	});

	it('names left recursion that goes through another non-terminal', () => {
		const t = eliminateImmediateLeftRecursion(grammar(SLIDE_27));
		expect(t.text).toBe(SLIDE_27);
		expect(t.changes).toEqual([]);
		expect(t.notes.map((n) => n.message)).toEqual([
			'Left recursion remains: S →+ S b a and A →+ A a b. It goes through another non-terminal, so no production has the form S → S α.'
		]);
	});

	it('reads EBNF rules too', () => {
		const e = ebnf('E → E + T | T\nT → F [ * T ]\nF → int');
		const t = eliminateImmediateLeftRecursion(e);
		expect(t.text).toBe(lines('E → T { + T }', 'T → F [ * T ]', 'F → int'));
		expectSameLanguage(e, t.grammar);
	});

	it('quotes braces that are terminals of the grammar', () => {
		const g = grammar('B → B { } | x');
		const t = eliminateImmediateLeftRecursion(g);
		expect(t.text).toBe('B → x { "{" "}" }');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});
});

describe('left recursion through other non-terminals (slide 27)', () => {
	it('reports the chain as a derivation: S →+ S b a', () => {
		const found = recursionFindings(grammar(SLIDE_27));
		expect(found.map((f) => f.summary)).toEqual(['S →+ S b a', 'A →+ A a b']);
		expect(found[0]).toMatchObject({
			nonterminal: 'S',
			immediate: false,
			productions: ['S → A a', 'A → S b'],
			forms: [['S'], ['A', 'a'], ['S', 'b', 'a']],
			steps: [
				{ index: 0, length: 2 },
				{ index: 0, length: 2 }
			]
		});
	});

	it('reports immediate left recursion with its one production', () => {
		expect(recursionFindings(grammar('V → V a | b'))).toEqual([
			{
				nonterminal: 'V',
				immediate: true,
				productions: ['V → V a'],
				forms: [['V'], ['V', 'a']],
				steps: [{ index: 0, length: 2 }],
				summary: 'V →+ V a'
			}
		]);
		expect(recursionFindings(grammar(SLIDE_38)).map((f) => f.summary)).toEqual([
			'E →+ E + T',
			'T →+ T * F'
		]);
		expect(recursionFindings(grammar(SLIDE_36))).toEqual([]);
	});

	it('shows the productions that erase a nullable prefix', () => {
		const found = recursionFindings(grammar('S → N S a | b\nN → ε'));
		expect(found[0].productions).toEqual(['S → N S a', 'N → ε']);
		expect(found[0].forms).toEqual([['S'], ['N', 'S', 'a'], ['S', 'a']]);
		expect(found[0].summary).toBe('S →+ S a');
	});

	it('general algorithm: substitute, then remove the immediate left recursion', () => {
		const g = grammar(SLIDE_27);
		const t = eliminateLeftRecursion(g);
		expect(t.text).toBe(lines('S → A a | d', 'A → d b { a b }'));
		expect(t.changes.map((c) => c.kind)).toEqual(['substitution', 'left-recursion']);
		expect(t.changes[0]).toMatchObject({
			nonterminal: 'A',
			before: ['A → S b'],
			after: ['A → A a b | d b']
		});
		expect(t.changes[0].text).toContain('in the order S, A');
		expect(t.notes).toEqual([]);
		expect(leftRecursion(ebnfToGrammar(t.grammar))).toEqual([]);
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('in the other order S is rewritten: S → d { b a }', () => {
		const g = grammar(SLIDE_27);
		const t = eliminateLeftRecursion(g, { order: 'reversed' });
		// S → A a → S b a, as the slide derives it: S → S b a | d, and A is used nowhere.
		expect(t.text).toBe('S → d { b a }');
		expect(t.changes.map((c) => c.kind)).toEqual(['substitution', 'left-recursion', 'dropped']);
		expect(t.changes[0]).toMatchObject({ before: ['S → A a | d'], after: ['S → S b a | d'] });
		expect(t.changes[0].text).toContain('in the order A, S');
		expect(t.changes[2]).toEqual({
			kind: 'dropped',
			nonterminal: 'A',
			before: ['A → S b'],
			after: [],
			text: 'After the substitution no rule that S reaches uses A, so the rule of A is dropped.'
		});
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
		const bnf = eliminateLeftRecursion(g, { order: 'reversed', form: 'bnf' });
		expect(bnf.text).toBe(lines('S → d S’', 'S’ → b a S’ | ε'));
		expectSameLanguage(g, bnf.grammar);
	});

	it('keeps a rule that was unreachable before the rewrite', () => {
		const g = grammar('S → A a | d\nA → S b\nB → S');
		const t = eliminateLeftRecursion(g, { order: 'reversed' });
		expect(t.text).toBe(lines('S → d { b a }', 'B → S'));
		expect(t.changes.filter((c) => c.kind === 'dropped').map((c) => c.nonterminal)).toEqual(['A']);
	});

	it('handles immediate and indirect left recursion together', () => {
		// The example of the general case in compiler texts.
		const g = grammar('A → B a | A a | c\nB → B b | A b | d');
		const t = eliminateLeftRecursion(g, { form: 'bnf' });
		expect(t.text).toBe(
			lines(
				'A → B a A’ | c A’',
				'A’ → a A’ | ε',
				'B → c A’ b B’ | d B’',
				'B’ → b B’ | a A’ b B’ | ε'
			)
		);
		expect(leftRecursion(ebnfToGrammar(t.grammar))).toEqual([]);
		expectSameLanguage(g, t.grammar);
		const e = eliminateLeftRecursion(g);
		expect(leftRecursion(ebnfToGrammar(e.grammar))).toEqual([]);
		expectSameLanguage(g, e.grammar);
	});

	it('is the immediate rule when nothing is substituted', () => {
		const g = grammar(SLIDE_38);
		expect(eliminateLeftRecursion(g).text).toBe(eliminateImmediateLeftRecursion(g).text);
	});

	it('substitutes only where it removes left recursion', () => {
		const g = grammar('S → A a | d\nA → S b\nB → A c | S');
		const t = eliminateLeftRecursion(g);
		expect(t.text).toBe(lines('S → A a | d', 'A → d b { a b }', 'B → A c | S'));
		expectSameLanguage(g, t.grammar);
	});

	it('removes a cycle on the way', () => {
		const g = grammar('S → A | a\nA → S');
		const t = eliminateLeftRecursion(g);
		expect(t.text).toBe(lines('S → A | a', 'A → a'));
		expect(t.changes.map((c) => c.kind)).toEqual(['substitution', 'dropped']);
		expectSameLanguage(g, t.grammar);
	});

	it('says so when left recursion remains', () => {
		// Hidden behind a non-terminal that derives ε: the algorithm assumes no ε-productions.
		const t = eliminateLeftRecursion(grammar('S → A S a | b\nA → ε'));
		expect(t.text).toBe(lines('S → A S a | b', 'A → ε'));
		expect(t.notes.map((n) => n.message)).toEqual([
			'Left recursion remains: S →+ S a. The general algorithm needs a grammar without ε-productions and without cycles A →+ A.'
		]);
	});

	it('stops when substitution makes too many alternatives', () => {
		const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => prefix + i);
		const g = grammar(
			`A → B x | ${names('t', 15).join(' | ')}\nB → ${names('y', 15)
				.map((y) => `A ${y}`)
				.join(' | ')}`
		);
		const t = eliminateLeftRecursion(g);
		expect(MAX_ALTERNATIVES).toBe(200);
		expect(t.changes).toEqual([]);
		expect(t.notes.map((n) => n.message)).toEqual([
			'Substituting A into B gives more than 200 alternatives. The general algorithm stops here.'
		]);
		expect(t.grammar.rules).toHaveLength(2);
	});
});

describe('left factoring with EBNF (slides 36 and 39)', () => {
	it('A → X op A | X becomes A → X [ op A ] (slide 39)', () => {
		const g = grammar(SLIDE_39);
		const t = leftFactor(g);
		expect(t.text).toBe('A → X [ op A ]');
		expect(t.changes).toHaveLength(1);
		expect(t.changes[0]).toMatchObject({
			kind: 'left-factor',
			nonterminal: 'A',
			before: ['A → X op A | X'],
			after: ['A → X [ op A ]'],
			cite: { deck: '11', slide: [36, 39] }
		});
		expect(t.changes[0].text).toContain('X op A and X share the prefix X');
		expect(t.changes[0].note).toContain('Right recursion implies right associativity');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('E → T + E | T ; T → ( E ) | int | int * T (slide 36)', () => {
		const g = grammar(SLIDE_36);
		const t = leftFactor(g);
		expect(t.text).toBe(lines('E → T [ + E ]', 'T → ( E ) | int [ * T ]'));
		expect(t.changes.map((c) => c.nonterminal)).toEqual(['E', 'T']);
		expect(t.changes[1].text).toContain('int and int * T share the prefix int');
		expect(t.changes[1].text).toContain('[ * T ]');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('takes the longest common prefix', () => {
		const g = grammar('S → if E then S else S | if E then S | other\nE → b');
		const t = leftFactor(g);
		expect(t.text).toBe(lines('S → if E then S [ else S ] | other', 'E → b'));
		expectSameLanguage(g, t.grammar);
	});

	it('puts several rests inside one pair of brackets, factored again', () => {
		const g = grammar('A → x | x y | x y z | x w');
		const t = leftFactor(g);
		expect(t.text).toBe('A → x [ y [ z ] | w ]');
		expectReadsBack(t);
		expectSameLanguage(g, t.grammar);
	});

	it('factors other common prefixes with a primed non-terminal', () => {
		const g = grammar('A → a b | a c | d');
		const t = leftFactor(g);
		expect(t.text).toBe(lines('A → a A’ | d', 'A’ → b | c'));
		expect(t.changes[0].cite).toBeUndefined();
		expect(t.changes[0].note).toBeUndefined();
		expect(t.changes[0].text).toContain('would need parentheses');
		expect(t.changes[0].after).toEqual(['A → a A’ | d', 'A’ → b | c']);
		expectSameLanguage(g, t.grammar);
	});

	it('factors the new rule as well, with more primes', () => {
		const g = grammar('A → a b c | a b d | a e');
		const t = leftFactor(g);
		expect(t.text).toBe(lines('A → a A’', 'A’ → b A’’ | e', 'A’’ → c | d'));
		expectSameLanguage(g, t.grammar);
	});

	it('factors inside brackets', () => {
		const e = ebnf('E → T { + T | + + T }\nT → int');
		const t = leftFactor(e);
		expect(t.text).toBe(lines('E → T { + E’ }', 'E’ → T | + T', 'T → int'));
		expectSameLanguage(e, t.grammar);
	});

	it('leaves a grammar without common prefixes unchanged', () => {
		const t = leftFactor(grammar(SLIDE_38));
		expect(t.text).toBe(SLIDE_38);
		expect(t.changes).toEqual([]);
	});

	it('lists the alternatives that share a prefix', () => {
		expect(prefixFindings(grammar(SLIDE_36))).toEqual([
			{ nonterminal: 'E', prefix: ['T'], productions: ['E → T + E', 'E → T'], optional: true },
			{
				nonterminal: 'T',
				prefix: ['int'],
				productions: ['T → int', 'T → int * T'],
				optional: true
			}
		]);
		expect(prefixFindings(grammar('A → a b c | a b d | e'))).toEqual([
			{
				nonterminal: 'A',
				prefix: ['a', 'b'],
				productions: ['A → a b c', 'A → a b d'],
				optional: false
			}
		]);
		expect(prefixFindings(grammar(SLIDE_38))).toEqual([]);
	});
});

describe('the recipe of slide 41', () => {
	it('removes left recursion with EBNF (slide 38)', () => {
		const g = grammar(SLIDE_38);
		const r = rewriteGrammar(g);
		expect(r.text).toBe(lines('E → T { + T }', 'T → F { * F }', 'F → ( E ) | int'));
		expect(r).toMatchObject({ method: 'immediate', brackets: true, before: SLIDE_38, notes: [] });
		expect(r.changes.map((c) => c.kind)).toEqual(['left-recursion', 'left-recursion']);
		expectSameLanguage(g, r.grammar);
	});

	it('left factors with EBNF (slides 36 and 39)', () => {
		const g = grammar(SLIDE_36);
		const r = rewriteGrammar(g);
		expect(r.text).toBe(lines('E → T [ + E ]', 'T → ( E ) | int [ * T ]'));
		expect(r.method).toBe('none');
		expectSameLanguage(g, r.grammar);
		expect(rewriteGrammar(grammar(SLIDE_39)).text).toBe('A → X [ op A ]');
	});

	it('does both', () => {
		const g = grammar('E → E + T | T\nT → F * T | F\nF → ( E ) | int');
		const r = rewriteGrammar(g);
		expect(r.text).toBe(lines('E → T { + T }', 'T → F [ * T ]', 'F → ( E ) | int'));
		expect(r.changes.map((c) => c.kind)).toEqual(['left-recursion', 'left-factor']);
		expectSameLanguage(g, r.grammar);
	});

	it('keeps the result without brackets when asked for BNF with ε', () => {
		const g = grammar(SLIDE_25);
		const r = rewriteGrammar(g, { form: 'bnf' });
		expect(r.text).toBe(lines('S → 1 S’', 'S’ → 0 S’ | ε'));
		expect(r.brackets).toBe(false);
		expect(rewriteGrammar(g).text).toBe('S → 1 { 0 }');
	});

	it('uses the general algorithm for indirect left recursion', () => {
		const g = grammar(SLIDE_27);
		const r = rewriteGrammar(g);
		expect(r.method).toBe('general');
		expect(r.text).toBe(lines('S → A a | d', 'A → d b { a b }'));
		expectSameLanguage(g, r.grammar);
		const reversed = rewriteGrammar(g, { order: 'reversed' });
		expect(reversed.text).toBe('S → d { b a }');
		expect(reversed.before).toBe(SLIDE_27);
		expectSameLanguage(g, reversed.grammar);
	});

	it('changes nothing when there is nothing to rewrite', () => {
		const r = rewriteGrammar(ebnf('E → T { + T }\nT → int'));
		expect(r).toMatchObject({ method: 'none', changes: [], notes: [], brackets: true });
		expect(r.text).toBe(r.before);
	});

	it('can leave out left factoring', () => {
		expect(rewriteGrammar(grammar(SLIDE_36), { factor: false }).text).toBe(SLIDE_36);
	});

	it('keeps a rule it cannot rewrite, with the reason', () => {
		const r = rewriteGrammar(grammar('V → V a'));
		expect(r.text).toBe('V → V a');
		expect(r.method).toBe('immediate');
		expect(r.notes).toHaveLength(1);
	});

	it('keeps the language of varied grammars in both forms', () => {
		const samples = [
			'E → E + T | E - T | T\nT → T * F | F\nF → ( E ) | int | id',
			'S → S a | S b | c | d',
			'S → a S | a | b S | b',
			'L → L , id | id',
			'S → A a | b\nA → A c | S d | e',
			'E → E + E | int',
			'A → a b c | a b | a | d A'
		];
		for (const text of samples) {
			const g = grammar(text);
			for (const form of ['ebnf', 'bnf'] as const)
				for (const order of ['written', 'reversed'] as const) {
					const r = rewriteGrammar(g, { form, order });
					expectReadsBack(r);
					expectSameLanguage(g, r.grammar);
					expect(leftRecursion(ebnfToGrammar(r.grammar)), `${text} (${form})`).toEqual([]);
					if (form === 'bnf') expect(r.text).not.toMatch(/\{/);
				}
		}
	});
});

describe('what recursion implies (slides 38–39)', () => {
	it('tells left from right recursion', () => {
		expect(recursionKinds(grammar(SLIDE_38))).toEqual([
			{ nonterminal: 'E', left: true, right: false },
			{ nonterminal: 'T', left: true, right: false }
		]);
		expect(recursionKinds(grammar(SLIDE_36))).toEqual([
			{ nonterminal: 'E', left: false, right: true },
			{ nonterminal: 'T', left: false, right: true }
		]);
		expect(recursionKinds(grammar('E → E + E | int'))).toEqual([
			{ nonterminal: 'E', left: true, right: true }
		]);
		expect(recursionKinds(grammar('F → ( E ) | int\nE → F'))).toEqual([]);
	});
});
