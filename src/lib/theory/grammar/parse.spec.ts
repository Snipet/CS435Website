import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../diagnostics';
import { compareGrammars, enumerateLanguage } from './earley';
import {
	ebnfToGrammar,
	makeGrammar,
	parseEbnf,
	parseGrammar,
	printEbnf,
	printGrammar,
	printSymbols,
	scanGrammar,
	tokenizeInput
} from './parse';
import {
	AMBIGUOUS,
	ARITHMETIC,
	ARITHMETIC_ID,
	CASCADE,
	COOL,
	DANGLING_ELSE,
	EBNF_OPTION,
	EBNF_REPETITION,
	ENGLISH,
	LEFT_RECURSIVE,
	MATCHED_IF,
	TOP_DOWN,
	TOP_DOWN_2,
	ebnf,
	grammar,
	random
} from './test-helpers';
import type { Ebnf, EbnfGrammar, Grammar } from './types';

/** Productions as text, one per production. */
const rules = (g: Grammar): string[] =>
	g.productions.map((p) => `${p.lhs} → ${printSymbols(p.rhs)}`);

/** A grammar without the spans of its productions. */
const bare = (g: Grammar): Grammar => ({
	...g,
	productions: g.productions.map(({ id, lhs, rhs }) => ({ id, lhs, rhs }))
});
const bareEbnf = (g: EbnfGrammar): EbnfGrammar => ({
	...g,
	rules: g.rules.map(({ lhs, body }) => ({ lhs, body }))
});

/** [severity, message, marked text] of each diagnostic. */
const report = (text: string, diagnostics: Diagnostic[]): [string, string, string][] =>
	diagnostics.map((d) => [d.severity, d.message, text.slice(d.span!.start, d.span!.end)]);
const problems = (text: string) => report(text, parseGrammar(text).diagnostics);
const ebnfProblems = (text: string) => report(text, parseEbnf(text).diagnostics);

const sym = (name: string): Ebnf => ({ kind: 'sym', name });
const seq = (...items: Ebnf[]): Ebnf => ({ kind: 'seq', items });
const alt = (...options: Ebnf[]): Ebnf => ({ kind: 'alt', options });
const opt = (body: Ebnf): Ebnf => ({ kind: 'opt', body });
const rep = (body: Ebnf): Ebnf => ({ kind: 'rep', body });
const eps: Ebnf = { kind: 'eps' };

describe('parseGrammar: notation', () => {
	it('reads the arithmetic grammar of Introduction to Parsing, slides 12–15', () => {
		const g = grammar(ARITHMETIC);
		expect(g.nonterminals).toEqual(['E']);
		expect(g.terminals).toEqual(['int', '+', '*', '(', ')']);
		expect(g.start).toBe('E');
		expect(rules(g)).toEqual(['E → int', 'E → E + E', 'E → E * E', 'E → ( E )']);
		expect(g.productions.map((p) => p.id)).toEqual([0, 1, 2, 3]);
	});

	it('reads S → 0 | 1 as the two productions S → 0 and S → 1 (slide 26)', () => {
		expect(bare(grammar('S → 0 | 1'))).toEqual(bare(grammar('S → 0\nS → 1')));
		expect(rules(grammar('S → 0 | 1'))).toEqual(['S → 0', 'S → 1']);
	});

	it('reads continuation lines that start with | (slides 29–30)', () => {
		const g = grammar(COOL);
		expect(g.nonterminals).toEqual(['EXPR']);
		expect(g.terminals).toEqual(['if', 'then', 'else', 'fi', 'while', 'loop', 'pool', 'id']);
		expect(rules(g)).toEqual([
			'EXPR → if EXPR then EXPR else EXPR fi',
			'EXPR → while EXPR loop EXPR pool',
			'EXPR → id'
		]);
	});

	it('makes exactly the left-hand sides non-terminals: OTHER is a terminal', () => {
		const g = grammar(DANGLING_ELSE);
		expect(g.nonterminals).toEqual(['E']);
		expect(g.terminals).toEqual(['if', 'then', 'else', 'OTHER']);
	});

	it('reads the MIF/UIF grammar with its comments and blank lines (slide 13)', () => {
		const g = grammar(MATCHED_IF);
		expect(g.nonterminals).toEqual(['E', 'MIF', 'UIF']);
		expect(g.terminals).toEqual(['if', 'then', 'else', 'OTHER']);
		expect(rules(g)).toEqual([
			'E → MIF',
			'E → UIF',
			'MIF → if E then MIF else MIF',
			'MIF → OTHER',
			'UIF → if E then E',
			'UIF → if E then MIF else UIF'
		]);
	});

	it('takes the first left-hand side as the start symbol and lists N in order of definition', () => {
		const g = grammar('B → A | b\nA → a\nB → c');
		expect(g.start).toBe('B');
		expect(g.nonterminals).toEqual(['B', 'A']);
		expect(g.terminals).toEqual(['b', 'a', 'c']);
	});

	it('accepts -> and ⟶ for the arrow, also without spaces', () => {
		const expected = bare(grammar('E → T | T + E'));
		expect(bare(grammar('E -> T | T + E'))).toEqual(expected);
		expect(bare(grammar('E ⟶ T | T + E'))).toEqual(expected);
		expect(bare(grammar('E->T|T+E'))).toEqual(expected);
	});

	it('reads ε, ϵ and epsilon as the empty right-hand side', () => {
		for (const text of [
			'S → ε | ( S )',
			'S → epsilon | ( S )',
			'S → ϵ | ( S )',
			'S → ε ε | ( S )'
		]) {
			const g = grammar(text);
			expect(g.productions.map((p) => p.rhs)).toEqual([[], ['(', 'S', ')']]);
			expect(g.terminals).toEqual(['(', ')']);
		}
	});

	it('splits punctuation into one-character symbols and reads ∗ as * (slide 28)', () => {
		const g = grammar(ARITHMETIC_ID);
		expect(rules(g)).toEqual(['E → E + E', 'E → E * E', 'E → ( E )', 'E → id']);
		expect(g.terminals).toEqual(['+', '*', '(', ')', 'id']);
		expect(bare(g)).toEqual(bare(grammar('E → E + E | E * E | ( E ) | id')));
	});

	it('reads digits and other characters one at a time', () => {
		expect(rules(grammar('S → 10 A\nA → 0 | 1'))[0]).toBe('S → 1 0 A');
		const g = grammar('S → A α | δ\nA → S β');
		expect(g.terminals).toEqual(['α', 'δ', 'β']);
		expect(grammar('S → αβ<=').productions[0].rhs).toEqual(['α', 'β', '<', '=']);
	});

	it('reads names with digits, underscores and inner hyphens', () => {
		const g = grammar('var-declaration → type_specifier ID2 ; | _x');
		expect(g.start).toBe('var-declaration');
		expect(g.productions.map((p) => p.rhs)).toEqual([['type_specifier', 'ID2', ';'], ['_x']]);
		expect(grammar('E → a-b - c --d e- 2x').productions[0].rhs).toEqual([
			'a-b',
			'-',
			'c',
			'-',
			'-',
			'd',
			'e',
			'-',
			'2',
			'x'
		]);
	});

	it("normalizes primes: S' and S′ are S’", () => {
		const expected = bare(grammar('S → 1 S’\nS’ → 0 S’ | ε'));
		expect(expected.nonterminals).toEqual(['S', 'S’']);
		expect(bare(grammar("S → 1 S'\nS' → 0 S' | ε"))).toEqual(expected);
		expect(bare(grammar('S → 1 S′\nS′ → 0 S′ | ε'))).toEqual(expected);
		expect(grammar("A → A'' a | A’' | b").productions.map((p) => p.rhs)).toEqual([
			['A’’', 'a'],
			['A’’'],
			['b']
		]);
	});

	it('reads the quoted terminals of the English grammar (slide 25)', () => {
		const g = grammar(ENGLISH);
		expect(g.start).toBe('Sentence');
		expect(g.nonterminals).toEqual([
			'Sentence',
			'NounPhrase',
			'VerbPhrase',
			'PrepositionalPhrase',
			'Noun',
			'Verb',
			'Preposition'
		]);
		expect(g.terminals).toEqual(['the cat', 'the mat', 'the floor', 'sat', 'saw', 'on', 'under']);
		expect(g.productions).toHaveLength(13);
	});

	it('accepts double, single and curly quotes; the quotes are not part of the name', () => {
		const g = grammar(`A → '==' “the dog” ‘x y’ "say \\"hi\\"" "a\\\\b" 'it\\'s' "c\\d"`);
		expect(g.productions[0].rhs).toEqual([
			'==',
			'the dog',
			'x y',
			'say "hi"',
			'a\\b',
			"it's",
			'c\\d'
		]);
		expect(bare(grammar('E → "E" "+" E | "int"'))).toEqual(bare(grammar('E → E + E | int')));
	});

	it('accepts ”x” for “x”', () => {
		const g = grammar('S → “a” S | ”the b”');
		expect(g.terminals).toEqual(['a', 'the b']);
		expect(problems('S → a ”')).toEqual([['error', 'Quoted symbol is not closed. Add ”', '”']]);
	});

	it('takes quoted notation characters as terminals', () => {
		const g = grammar('A → "|" "→" "ε" "epsilon" "->" "//" B\nB → "/*" | \'"\'');
		expect(g.productions[0].rhs).toEqual(['|', '→', 'ε', 'epsilon', '->', '//', 'B']);
		expect(g.terminals).toEqual(['|', '→', 'ε', 'epsilon', '->', '//', '/*', '"']);
	});

	it('keeps { } [ ] as ordinary terminals', () => {
		const g = grammar('B → { B } | [ B ] | x');
		expect(g.terminals).toEqual(['{', '}', '[', ']', 'x']);
	});

	it('ignores // and /* */ comments, blank lines and CRLF line ends', () => {
		const text = [
			'// a header',
			'E → a // trailing',
			'',
			'/* block */ E → b /* inline */ c',
			'  // between a production and its | lines',
			'  | d',
			''
		].join('\r\n');
		expect(rules(grammar(text))).toEqual(['E → a', 'E → b c', 'E → d']);
	});

	it('ends the line at a comment that spans lines', () => {
		expect(rules(grammar('E → a F /* one\ntwo */ F → b'))).toEqual(['E → a F', 'F → b']);
		expect(rules(grammar('/* one\ntwo */ E → a'))).toEqual(['E → a']);
	});

	it('gives every production the span of its alternative', () => {
		const text = 'E → T | T + E\nT → int\n  | ε // empty\n  | "a b"  c';
		const g = grammar(text);
		expect(g.productions.map((p) => text.slice(p.span!.start, p.span!.end))).toEqual([
			'T',
			'T + E',
			'int',
			'ε',
			'"a b"  c'
		]);
		expect(g.productions.every((p) => p.span!.source === null)).toBe(true);
	});
});

describe('parseGrammar: diagnostics', () => {
	it('reports an empty grammar', () => {
		for (const text of ['', '  \n\t\n', '// only a comment\n/* and another */']) {
			const { grammar: g, diagnostics } = parseGrammar(text);
			expect(g).toBeNull();
			expect(diagnostics).toEqual([
				{
					severity: 'error',
					message: 'Enter a grammar, e.g. E → E + E | int',
					span: { start: 0, end: text.length, source: null }
				}
			]);
		}
	});

	it('reports a line without an arrow', () => {
		const text = 'E → a\n  T b c  \nT → d';
		expect(parseGrammar(text).grammar).toBeNull();
		expect(problems(text)).toEqual([
			['error', 'Missing →. Write a production as A → α (-> also works).', 'T b c']
		]);
		expect(problems('E = a')[0][2]).toBe('E = a');
	});

	it('reports a left-hand side that is not a single symbol', () => {
		expect(problems('E T → a')).toEqual([
			['error', 'The left-hand side must be a single symbol.', 'E T']
		]);
		expect(problems('ε → a')).toEqual([
			['error', 'The left-hand side must be a single symbol.', 'ε']
		]);
		expect(problems('→ a')).toEqual([
			['error', 'Nothing before →. The left-hand side is one non-terminal.', '→']
		]);
		expect(parseGrammar('E T → a').grammar).toBeNull();
	});

	it('reports | with nothing before or after it', () => {
		const before = 'Nothing before |. Write ε for an empty alternative.';
		const after = 'Nothing after |. Write ε for an empty alternative.';
		expect(problems('E → | a')).toEqual([['error', before, '|']]);
		expect(problems('E → a |')).toEqual([['error', after, '|']]);
		expect(problems('E → a\n  |')).toEqual([['error', after, '|']]);
		expect(problems('E → a\n  | | b')).toEqual([['error', before, '|']]);
		const middle = parseGrammar('E → a | | b').diagnostics;
		expect(middle).toHaveLength(1);
		expect(middle[0]).toMatchObject({ message: before, span: { start: 8, end: 9 } });
		expect(parseGrammar('E → a |').grammar).toBeNull();
	});

	it('says how to continue a line that ends in |, without a second error for the next line', () => {
		const toContinue = 'Nothing after |. To continue on the next line, start that line with |.';
		expect(problems('E → T |\n    T + E')).toEqual([['error', toContinue, '|']]);
		expect(problems('E → T |\n    T + E |\n    F\nT → x')).toEqual([
			['error', toContinue, '|'],
			['error', toContinue, '|']
		]);
		expect(problems('E → a\n  | b |\n  c')).toEqual([['error', toContinue, '|']]);
		// The next line is a production or a | line of its own: the alternative is simply missing.
		const missing = 'Nothing after |. Write ε for an empty alternative.';
		expect(problems('E → a |\nT → b')).toEqual([['error', missing, '|']]);
		expect(problems('E → a |\n  | b')).toEqual([['error', missing, '|']]);
		// A line without an arrow is still reported when nothing announced it.
		expect(problems('E → T\n    T + E').map((p) => p[1])).toEqual([
			'Missing →. Write a production as A → α (-> also works).'
		]);
	});

	it('reports an arrow with nothing after it', () => {
		expect(problems('E →')).toEqual([
			['error', 'Nothing after →. Write ε for an empty right-hand side.', '→']
		]);
		expect(problems('E ->\n  | a')[0][2]).toBe('->');
	});

	it('reports a | line with no production above it, once', () => {
		expect(problems('| a\nE → b')).toEqual([
			[
				'error',
				'A line that starts with | continues the production above it, and there is none.',
				'|'
			]
		]);
		// The line above is already in error: its continuation is not reported again.
		expect(problems('E T → a\n  | b')).toHaveLength(1);
		expect(problems('E a\n  | b')).toHaveLength(1);
	});

	it('reports a second arrow', () => {
		expect(problems('E → a → b')).toEqual([
			['error', 'A production has one →. Start the next production on a new line.', '→']
		]);
		expect(problems('E → a\n | b -> c')).toEqual([
			[
				'error',
				'A line that starts with | cannot contain →. Start the production on a new line.',
				'->'
			]
		]);
	});

	it('reports unclosed and empty quotes and unclosed comments', () => {
		expect(problems('E → "abc')).toEqual([['error', 'Quoted symbol is not closed. Add "', '"abc']]);
		expect(problems("E → a 'b c\nE → d")[0]).toEqual([
			'error',
			"Quoted symbol is not closed. Add '",
			"'b c"
		]);
		expect(problems('E → “abc"')[0][1]).toBe('Quoted symbol is not closed. Add ”');
		expect(problems('E → a ""')).toEqual([
			['error', 'A quoted symbol cannot be empty. Write ε for the empty string.', '""']
		]);
		expect(problems('E → a /* never closed\nE → b')).toEqual([
			['error', 'Comment is not closed. Add */', '/*']
		]);
		expect(parseGrammar('E → a /* never closed').grammar).toBeNull();
	});

	it('warns about a duplicate production and lists it once', () => {
		const text = 'E → a | b | a\nE → b';
		expect(problems(text)).toEqual([
			['warning', 'Duplicate production E → a', 'a'],
			['warning', 'Duplicate production E → b', 'b']
		]);
		expect(parseGrammar(text).diagnostics[0].span).toMatchObject({ start: 12, end: 13 });
		expect(rules(grammar(text))).toEqual(['E → a', 'E → b']);
		expect(problems('S → ε | epsilon')[0][1]).toBe('Duplicate production S → ε');
	});

	it('warns about a non-terminal that cannot be reached', () => {
		const text = 'S → a T\nT → b\nA → B\nB → c | A';
		expect(problems(text)).toEqual([
			['warning', 'A cannot be reached from the start symbol S.', 'A'],
			['warning', 'B cannot be reached from the start symbol S.', 'B']
		]);
		expect(parseGrammar(text).diagnostics[0].span).toMatchObject({ start: 14, end: 15 });
		expect(parseGrammar(text).grammar).not.toBeNull();
	});

	it('warns about a non-terminal that derives no terminal string', () => {
		expect(problems('S → a | A\nA → A b')).toEqual([
			['warning', 'A derives no string of terminals.', 'A']
		]);
		expect(problems('S → S a | B\nB → S')).toEqual([
			['warning', 'S derives no string of terminals: L(G) = { }', 'S'],
			['warning', 'B derives no string of terminals.', 'B']
		]);
	});

	it('notes left-hand sides that do not start with a capital letter, in one note', () => {
		expect(problems('expr → term | expr + term\nterm → id')).toEqual([
			['info', 'By convention, non-terminals start with a capital letter: expr, term', 'expr']
		]);
		expect(problems('a → b\nb → c\nc → d\nd → e\ne → x')).toEqual([
			['info', 'By convention, non-terminals start with a capital letter: a, b, c and 2 more', 'a']
		]);
		expect(problems('E → e T\nT → t | _u\nNounPhrase → x | E')).toEqual([
			['warning', 'NounPhrase cannot be reached from the start symbol E.', 'NounPhrase']
		]);
	});

	it('warns about ε next to other symbols and drops it', () => {
		const text = 'E → ε a | b epsilon';
		expect(problems(text)).toEqual([
			['warning', 'ε has no effect next to other symbols.', 'ε'],
			['warning', 'ε has no effect next to other symbols.', 'epsilon']
		]);
		expect(rules(grammar(text))).toEqual(['E → a', 'E → b']);
	});

	it('notes a hyphenated terminal made of non-terminals', () => {
		expect(problems('E → E-T | T\nT → id')).toEqual([
			['info', 'E-T is one symbol. Write E - T with spaces for 3 symbols.', 'E-T']
		]);
		expect(problems('S → If-stmt | a-b | "S-S"\nIf-stmt → x')).toEqual([]);
	});

	it('returns a grammar with warnings and notes, and null with any error', () => {
		const withNotes = parseGrammar('s → a | a\nt → s');
		expect(withNotes.grammar).not.toBeNull();
		expect(withNotes.diagnostics.map((d) => d.severity).sort()).toEqual([
			'info',
			'warning',
			'warning'
		]);
		const withError = parseGrammar('s → a | a\nt → s\nu');
		expect(withError.grammar).toBeNull();
		// Notes about a grammar that did not parse would be about half of it.
		expect(withError.diagnostics.map((d) => d.severity)).toEqual(['warning', 'error']);
	});

	it('lists diagnostics in text order', () => {
		const text = 's → A | b\nA → A c\nB → d';
		expect(problems(text)).toEqual([
			['info', 'By convention, non-terminals start with a capital letter: s', 's'],
			['warning', 'A derives no string of terminals.', 'A'],
			['warning', 'B cannot be reached from the start symbol s.', 'B']
		]);
		expect(parseGrammar(text).diagnostics.map((d) => d.span!.start)).toEqual([0, 10, 18]);
	});
});

describe('parseEbnf', () => {
	it('reads { α } as repetition and [ α ] as option (Top-Down Parsing, slides 36 and 38)', () => {
		const repetition = ebnf(EBNF_REPETITION);
		expect(repetition.start).toBe('E');
		expect(repetition.nonterminals).toEqual(['E', 'T', 'F']);
		expect(repetition.terminals).toEqual(['+', '*', '(', ')', 'int']);
		expect(repetition.rules.map((r) => [r.lhs, r.body])).toEqual([
			['E', seq(sym('T'), rep(seq(sym('+'), sym('T'))))],
			['T', seq(sym('F'), rep(seq(sym('*'), sym('F'))))],
			['F', alt(seq(sym('('), sym('E'), sym(')')), sym('int'))]
		]);
		const option = ebnf(EBNF_OPTION);
		expect(option.nonterminals).toEqual(['E', 'T']);
		expect(option.terminals).toEqual(['+', '(', ')', 'int', '*']);
		expect(option.rules.map((r) => [r.lhs, r.body])).toEqual([
			['E', seq(sym('T'), opt(seq(sym('+'), sym('E'))))],
			['T', alt(seq(sym('('), sym('E'), sym(')')), seq(sym('int'), opt(seq(sym('*'), sym('T')))))]
		]);
	});

	it('prints the lecture EBNF grammars back identically', () => {
		for (const text of [EBNF_OPTION, EBNF_REPETITION, 'S → 1 { 0 }', 'A → X [ op A ]'])
			expect(printEbnf(ebnf(text))).toBe(text);
	});

	it('reads tight spacing, -> and ε like parseGrammar', () => {
		expect(bareEbnf(ebnf('E->T{+T}\nT -> (E)|int[∗T] | epsilon'))).toEqual(
			bareEbnf(ebnf('E → T { + T }\nT → ( E ) | int [ * T ] | ε'))
		);
	});

	it('keeps single items unwrapped', () => {
		expect(ebnf('S → 1 { 0 }').rules[0].body).toEqual(seq(sym('1'), rep(sym('0'))));
		expect(ebnf('S → { a }').rules[0].body).toEqual(rep(sym('a')));
		expect(ebnf('S → a').rules[0].body).toEqual(sym('a'));
		expect(ebnf('S → ε').rules[0].body).toEqual(eps);
	});

	it('allows alternation inside brackets, nesting and ε', () => {
		expect(ebnf('A → { a | b [ c ] } d').rules[0].body).toEqual(
			seq(rep(alt(sym('a'), seq(sym('b'), opt(sym('c'))))), sym('d'))
		);
		expect(ebnf('A → [ a ] | ε').rules[0].body).toEqual(alt(opt(sym('a')), eps));
		expect(ebnf('A → x [ { [ y ] } ]').rules[0].body).toEqual(
			seq(sym('x'), opt(rep(opt(sym('y')))))
		);
		expect(ebnf('A → { ε | a }').rules[0].body).toEqual(rep(alt(eps, sym('a'))));
	});

	it('keeps parentheses as ordinary terminals', () => {
		const g = ebnf('F → ( E ) | int\nE → F { + F }');
		expect(g.terminals).toEqual(['(', ')', 'int', '+']);
	});

	it('takes quoted brackets as terminals and quotes them when printing', () => {
		const g = ebnf(`A → "{" A "}" | '[' | x`);
		expect(g.terminals).toEqual(['{', '}', '[', 'x']);
		expect(printEbnf(g)).toBe('A → "{" A "}" | "[" | x');
	});

	it('merges several lines for one non-terminal into an alternation', () => {
		const merged = bareEbnf(ebnf('E → T | T + E\nT → x'));
		expect(merged.rules[0].body).toEqual(alt(sym('T'), seq(sym('T'), sym('+'), sym('E'))));
		expect(bareEbnf(ebnf('E → T\nE → T + E\nT → x'))).toEqual(merged);
		expect(bareEbnf(ebnf('E → T\n  | T + E\nT → x'))).toEqual(merged);
		// Lines that are apart merge too; T lists terminals rule by rule, as the printed grammar does.
		expect(bareEbnf(ebnf('E → T\nT → x\nE → T + E'))).toEqual(merged);
		expect(merged.terminals).toEqual(['+', 'x']);
		expect(printEbnf(ebnf('E → T\nT → x\nE → T + E'))).toBe('E → T | T + E\nT → x');
	});

	it('gives each rule the span of its first line and that line’s | lines', () => {
		const text = 'E → T { + T }\n  | x\nT → y\nE → z';
		const g = ebnf(text);
		expect(g.rules.map((r) => text.slice(r.span!.start, r.span!.end))).toEqual([
			'E → T { + T }\n  | x',
			'T → y'
		]);
	});

	it('reports unbalanced brackets', () => {
		expect(ebnfProblems('A → a { b')).toEqual([['error', '{ is not closed. Add }', '{']]);
		expect(ebnfProblems('A → [ b\n  | c ]')[0]).toEqual(['error', '[ is not closed. Add ]', '[']);
		expect(ebnfProblems('A → a } b')).toEqual([['error', '} has no matching {', '}']]);
		expect(ebnfProblems('A → a ]')).toEqual([['error', '] has no matching [', ']']]);
		expect(ebnfProblems('A → { a ] b')).toEqual([['error', 'Expected } to close {, found ]', ']']]);
		expect(ebnfProblems('A → [ { a ] }')[0]).toEqual([
			'error',
			'Expected } to close {, found ]',
			']'
		]);
		for (const text of ['A → a { b', 'A → a } b', 'A → { a ] b'])
			expect(parseEbnf(text).grammar).toBeNull();
	});

	it('reports empty brackets and empty alternatives inside them', () => {
		expect(ebnfProblems('A → a { } b')).toEqual([
			['error', 'Empty { }. Put at least one symbol inside.', '{ }']
		]);
		expect(ebnfProblems('A → []')).toEqual([
			['error', 'Empty [ ]. Put at least one symbol inside.', '[]']
		]);
		expect(ebnfProblems('A → { a | }')).toEqual([
			['error', 'Nothing after |. Write ε for an empty alternative.', '|']
		]);
		expect(ebnfProblems('A → [ | a ]')).toEqual([
			['error', 'Nothing before |. Write ε for an empty alternative.', '|']
		]);
	});

	it('reports brackets nested too deeply, once', () => {
		const text = `A → ${'{ '.repeat(60)}a${' }'.repeat(60)}`;
		expect(ebnfProblems(text)).toEqual([
			['error', 'Brackets are nested too deeply (more than 50 levels).', '{']
		]);
		const fine = `A → ${'[ '.repeat(50)}a${' ]'.repeat(50)}`;
		expect(printEbnf(ebnf(fine))).toBe(fine);
	});

	it('reports the same problems as parseGrammar', () => {
		expect(ebnfProblems('')).toEqual([['error', 'Enter a grammar, e.g. E → E + E | int', '']]);
		expect(ebnfProblems('A { a }')[0][1]).toMatch(/^Missing →/);
		expect(ebnfProblems('{ A } → a')).toEqual([
			['error', 'The left-hand side must be a single symbol.', '{ A }']
		]);
		expect(ebnfProblems('A → { a } |')[0][1]).toMatch(/^Nothing after \|/);
		expect(ebnfProblems('A → { a }\nB → b')).toEqual([
			['warning', 'B cannot be reached from the start symbol A.', 'B']
		]);
		expect(ebnfProblems('A → { B } a\nB → B b')).toEqual([
			['warning', 'B derives no string of terminals.', 'B']
		]);
		expect(ebnfProblems('a → { b }')).toEqual([
			['info', 'By convention, non-terminals start with a capital letter: a', 'a']
		]);
		expect(ebnfProblems('A → { a } | b | { a }')).toEqual([
			['warning', 'Duplicate alternative A → { a }', '{ a }']
		]);
		expect(printEbnf(ebnf('A → { a } | b | { a }'))).toBe('A → { a } | b');
	});
});

describe('printSymbols', () => {
	it('writes symbols with spaces and ε for the empty string', () => {
		expect(printSymbols(['E', '+', 'T'])).toBe('E + T');
		expect(printSymbols(['(', 'int', '+', 'int', ')', '*', 'int'])).toBe('( int + int ) * int');
		expect(printSymbols([])).toBe('ε');
	});

	it('quotes a symbol only when it would not read back as itself', () => {
		expect(printSymbols(['S’', 'a-b', '_x1', '{', ']', '$', '-', '>', 'δ'])).toBe(
			'S’ a-b _x1 { ] $ - > δ'
		);
		expect(printSymbols(['the cat', '|', 'ε', 'epsilon', '→', '->', '//', '/*', '=='])).toBe(
			'"the cat" "|" "ε" "epsilon" "→" "->" "//" "/*" "=="'
		);
		expect(printSymbols(["S'", '∗', "'", '"', 'a"b', `a"b'c`, 'a\\', '\\"', 'c\\d'])).toBe(
			`"S'" "∗" "'" '"' 'a"b' "a\\"b'c" "a\\\\" "\\\\\\"" "c\\d"`
		);
	});

	it('quotes braces and square brackets for EBNF', () => {
		expect(printSymbols(['{', 'a', '}', '[', ']', '('], { ebnf: true })).toBe(
			'"{" a "}" "[" "]" ('
		);
	});
});

const ODD_NAMES = [
	'the cat',
	'|',
	'ε',
	'ϵ',
	'epsilon',
	'→',
	'->',
	"'",
	'"',
	'’',
	'\\',
	'a\\',
	'\\"',
	"it's",
	'S’',
	"S'",
	'{',
	']',
	'//',
	'/*',
	'a b',
	' a',
	'∗',
	'*',
	'$',
	'-',
	'>',
	'x-y',
	'x-',
	'_',
	'9',
	'42',
	'é',
	'😀',
	'E',
	'if'
];

describe('printGrammar', () => {
	it('writes one line per non-terminal by default', () => {
		for (const text of [AMBIGUOUS, CASCADE, TOP_DOWN, TOP_DOWN_2, LEFT_RECURSIVE])
			expect(printGrammar(grammar(text))).toBe(text);
		expect(printGrammar(grammar('S → ε | ( S )'))).toBe('S → ε | ( S )');
		expect(printGrammar(grammar("S → 1 S'\nS' → 0 S' | epsilon"))).toBe('S → 1 S’\nS’ → 0 S’ | ε');
		expect(printGrammar(grammar(ARITHMETIC))).toBe('E → int | E + E | E * E | ( E )');
		expect(printGrammar(grammar(ARITHMETIC_ID))).toBe('E → E + E | E * E | ( E ) | id');
	});

	it('writes one production per line, or one alternative per line', () => {
		expect(printGrammar(grammar(ARITHMETIC), { perLine: 'production' })).toBe(ARITHMETIC);
		expect(printGrammar(grammar(TOP_DOWN), { perLine: 'production' })).toBe(
			'E → T\nE → T + E\nT → int\nT → int * T\nT → ( E )'
		);
		expect(printGrammar(grammar(COOL), { perLine: 'alternative' })).toBe(COOL);
		expect(printGrammar(grammar(TOP_DOWN), { perLine: 'alternative' })).toBe(
			'E → T\n  | T + E\nT → int\n  | int * T\n  | ( E )'
		);
	});

	it('quotes only the terminals that need it', () => {
		expect(printGrammar(grammar(ENGLISH)).split('\n').slice(4)).toEqual([
			'Noun → "the cat" | "the mat" | "the floor"',
			'Verb → sat | saw',
			'Preposition → on | under'
		]);
	});

	it('keeps the order of productions that are not grouped by non-terminal', () => {
		const text = 'E → a | F\nF → b\nE → c';
		expect(printGrammar(grammar(text))).toBe(text);
		expect(printGrammar(grammar(text), { perLine: 'alternative' })).toBe(
			'E → a\n  | F\nF → b\nE → c'
		);
	});

	it('round-trips the lecture grammars in every layout', () => {
		const texts = [
			ARITHMETIC,
			ARITHMETIC_ID,
			COOL,
			ENGLISH,
			AMBIGUOUS,
			CASCADE,
			DANGLING_ELSE,
			MATCHED_IF,
			TOP_DOWN,
			TOP_DOWN_2,
			'S → ε | ( S )',
			'S → 1 A\nA → 0 | 1 A',
			'S → A α | δ\nA → S β'
		];
		for (const text of texts) {
			const g = grammar(text);
			for (const perLine of ['nonterminal', 'production', 'alternative'] as const) {
				const again = parseGrammar(printGrammar(g, { perLine }));
				expect(again.diagnostics).toEqual([]);
				expect(bare(again.grammar!)).toEqual(bare(g));
			}
		}
	});

	it('round-trips symbols that need quoting, on either side of the arrow', () => {
		const productions = ODD_NAMES.map((name, i) => ({
			lhs: i % 3 === 0 ? 'Start' : ODD_NAMES[i - 1],
			rhs: [name, ODD_NAMES[(i * 7) % ODD_NAMES.length]]
		}));
		const g = makeGrammar([{ lhs: 'Start', rhs: [] }, ...productions]);
		for (const perLine of ['nonterminal', 'production', 'alternative'] as const) {
			const again = parseGrammar(printGrammar(g, { perLine })).grammar;
			expect(again && bare(again)).toEqual(bare(g));
		}
	});

	it('round-trips random grammars', () => {
		const next = random(435);
		const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
		const names = ['S', 'A', 'B', 'a', 'b', '+', '(', ...ODD_NAMES];
		for (let round = 0; round < 200; round++) {
			const heads = ['S', pick(names), pick(names)];
			const productions = Array.from({ length: 1 + Math.floor(next() * 6) }, (_, i) => ({
				lhs: i === 0 ? 'S' : pick(heads),
				rhs: Array.from({ length: Math.floor(next() * 4) }, () => pick(names))
			}));
			const g = makeGrammar(productions);
			const text = printGrammar(g, { perLine: pick(['nonterminal', 'production', 'alternative']) });
			const again = parseGrammar(text).grammar;
			expect(again && bare(again), text).toEqual(bare(g));
		}
	});
});

describe('printEbnf', () => {
	it('puts spaces inside brackets and round-trips', () => {
		for (const text of [
			EBNF_OPTION,
			EBNF_REPETITION,
			'A → { a | b [ c ] } d | ε',
			'A → x [ { [ y ] } ] "{" "the cat" S’\nS’ → { ε | "|" }'
		]) {
			const g = ebnf(text);
			expect(printEbnf(g)).toBe(text);
			expect(bareEbnf(ebnf(printEbnf(g)))).toEqual(bareEbnf(g));
		}
	});

	it('multiplies out a choice inside a sequence, which the notation cannot write', () => {
		const g: EbnfGrammar = {
			start: 'A',
			nonterminals: ['A'],
			terminals: ['a', 'b', 'c', 'd'],
			rules: [
				{
					lhs: 'A',
					body: seq(
						sym('a'),
						alt(sym('b'), seq(sym('c'), seq(sym('d'), eps))),
						opt(alt(alt(sym('a')), eps))
					)
				}
			]
		};
		expect(printEbnf(g)).toBe('A → a b [ a | ε ] | a c d [ a | ε ]');
		expect(printGrammar(ebnfToGrammar(g))).toBe('A → a b A’ | a c d A’’\nA’ → a | ε\nA’’ → a | ε');
	});

	it('round-trips random EBNF grammars', () => {
		const next = random(11);
		const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
		const atom = (depth: number): string => {
			const roll = next();
			if (depth < 3 && roll < 0.2) return `{ ${alternatives(depth + 1)} }`;
			if (depth < 3 && roll < 0.4) return `[ ${alternatives(depth + 1)} ]`;
			return pick(['a', 'b', 'A', 'B', '(', ')', '"{"', '"the cat"', 'S’']);
		};
		const alternatives = (depth: number): string =>
			Array.from({ length: 1 + Math.floor(next() * 2.5) }, () =>
				next() < 0.1
					? 'ε'
					: Array.from({ length: 1 + Math.floor(next() * 3) }, () => atom(depth)).join(' ')
			).join(' | ');
		for (let round = 0; round < 200; round++) {
			const text = ['A', 'B'].map((lhs) => `${lhs} → ${alternatives(0)}`).join('\n');
			const { grammar: g, diagnostics } = parseEbnf(text);
			if (!g) throw new Error(`${text}: ${JSON.stringify(diagnostics)}`);
			const printed = printEbnf(g);
			expect(bareEbnf(ebnf(printed)), text).toEqual(bareEbnf(g));
			expect(printEbnf(ebnf(printed))).toBe(printed);
		}
	});
});

describe('tokenizeInput', () => {
	const arithmetic = grammar(ARITHMETIC);

	it('splits a token string and gives each token its span', () => {
		const text = '( int + int ) * int';
		const { tokens, spans, diagnostics } = tokenizeInput(text, arithmetic.terminals);
		expect(tokens).toEqual(['(', 'int', '+', 'int', ')', '*', 'int']);
		expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(tokens);
		expect(spans[1]).toEqual({ start: 2, end: 5, source: null });
		expect(diagnostics).toEqual([]);
	});

	it('uses the lexing of grammar symbols: tight spacing, ∗, primes, quotes', () => {
		expect(tokenizeInput('(int+int)*int', arithmetic.terminals).tokens).toEqual([
			'(',
			'int',
			'+',
			'int',
			')',
			'*',
			'int'
		]);
		expect(tokenizeInput('(id) ∗ id\n\tid', grammar(ARITHMETIC_ID).terminals)).toMatchObject({
			tokens: ['(', 'id', ')', '*', 'id', 'id'],
			diagnostics: []
		});
		expect(tokenizeInput("a' 'b c' “d”", ['a’', 'b c', 'd'])).toMatchObject({
			tokens: ['a’', 'b c', 'd'],
			diagnostics: []
		});
	});

	it('reads the quoted tokens of the English grammar', () => {
		const english = grammar(ENGLISH);
		const text = '"the cat" "on" "the mat" "sat"';
		expect(tokenizeInput(text, english.terminals)).toMatchObject({
			tokens: ['the cat', 'on', 'the mat', 'sat'],
			diagnostics: []
		});
		const unquoted = tokenizeInput('the cat sat', english.terminals);
		expect(unquoted.tokens).toEqual(['the', 'cat', 'sat']);
		expect(report('the cat sat', unquoted.diagnostics)).toEqual([
			['error', 'the is not a terminal of the grammar.', 'the'],
			['error', 'cat is not a terminal of the grammar.', 'cat']
		]);
	});

	it('reports a symbol that is not a terminal, with its span', () => {
		const text = 'int + x1 * "y z"';
		const { tokens, spans, diagnostics } = tokenizeInput(text, arithmetic.terminals);
		expect(tokens).toEqual(['int', '+', 'x1', '*', 'y z']);
		expect(spans).toHaveLength(5);
		expect(report(text, diagnostics)).toEqual([
			['error', 'x1 is not a terminal of the grammar.', 'x1'],
			['error', '"y z" is not a terminal of the grammar.', '"y z"']
		]);
		expect(diagnostics[0].span).toEqual({ start: 6, end: 8, source: null });
	});

	it('allows a closing $ only when $ is one of the terminals passed', () => {
		const text = 'int * int $';
		const without = tokenizeInput(text, arithmetic.terminals);
		expect(report(text, without.diagnostics)).toEqual([
			['error', '$ is not a terminal of the grammar.', '$']
		]);
		const withEnd = tokenizeInput(text, [...arithmetic.terminals, '$']);
		expect(withEnd.tokens).toEqual(['int', '*', 'int', '$']);
		expect(withEnd.diagnostics).toEqual([]);
	});

	it('reads ε as the empty string unless it is a terminal', () => {
		for (const text of ['', '   ', 'ε', 'epsilon', ' ϵ\n'])
			expect(tokenizeInput(text, ['a'])).toEqual({ tokens: [], spans: [], diagnostics: [] });
		expect(tokenizeInput('ε a', ['a']).tokens).toEqual(['a']);
		expect(tokenizeInput('ε epsilon', ['ε', 'epsilon']).tokens).toEqual(['ε', 'epsilon']);
		expect(tokenizeInput('"ε"', ['a']).diagnostics).toHaveLength(1);
	});

	it('says when a symbol is a non-terminal', () => {
		const { diagnostics } = tokenizeInput('E + int', arithmetic.terminals, {
			nonterminals: arithmetic.nonterminals
		});
		expect(diagnostics.map((d) => d.message)).toEqual([
			'E is a non-terminal. The input is a string of terminals.'
		]);
	});

	it('suggests spaces for a hyphenated name made of terminals', () => {
		expect(tokenizeInput('int-int', ['int', '-']).diagnostics[0].message).toBe(
			'int-int is not a terminal of the grammar. Write int - int with spaces.'
		);
		expect(tokenizeInput('int-x', ['int', '-']).diagnostics[0].message).toBe(
			'int-x is not a terminal of the grammar.'
		);
		expect(tokenizeInput('a-b', ['a-b']).diagnostics).toEqual([]);
	});

	it('has no comments or notation: / | → are symbols', () => {
		const terminals = ['a', '/', '*', '|', '-', '>', '→', 'b'];
		expect(tokenizeInput('a // b /* | -> → */', terminals)).toMatchObject({
			tokens: ['a', '/', '/', 'b', '/', '*', '|', '-', '>', '→', '*', '/'],
			diagnostics: []
		});
	});

	it('reports an unclosed quote', () => {
		const text = 'int + "int';
		expect(report(text, tokenizeInput(text, arithmetic.terminals).diagnostics)).toEqual([
			['error', 'Quoted symbol is not closed. Add "', '"int']
		]);
	});

	it('reads back what printSymbols writes', () => {
		expect(tokenizeInput(printSymbols(ODD_NAMES), ODD_NAMES)).toMatchObject({
			tokens: ODD_NAMES,
			diagnostics: []
		});
		expect(tokenizeInput(printSymbols([]), ODD_NAMES).tokens).toEqual(['ε']);
		expect(tokenizeInput(printSymbols([]), ['a']).tokens).toEqual([]);
	});
});

describe('ebnfToGrammar', () => {
	const sentences = (g: Grammar) =>
		enumerateLanguage(g, { maxLength: 7, limit: 10000 }).strings.map((s) => printSymbols(s));

	it('turns [ α ] into X’ → α | ε (Top-Down Parsing, slide 36)', () => {
		const g = ebnfToGrammar(ebnf(EBNF_OPTION));
		expect(printGrammar(g)).toBe('E → T E’\nE’ → + E | ε\nT → ( E ) | int T’\nT’ → * T | ε');
		expect(g.start).toBe('E');
		expect(g.nonterminals).toEqual(['E', 'E’', 'T', 'T’']);
		expect(g.terminals).toEqual(['+', '(', ')', 'int', '*']);
		expect(g.productions.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it('turns { α } into X’ → α X’ | ε (slide 38)', () => {
		const g = ebnfToGrammar(ebnf(EBNF_REPETITION));
		expect(printGrammar(g)).toBe(
			'E → T E’\nE’ → + T E’ | ε\nT → F T’\nT’ → * F T’ | ε\nF → ( E ) | int'
		);
		expect(g.terminals).toEqual(['+', '*', '(', ')', 'int']);
	});

	it('gives S → 1 S’ ; S’ → 0 S’ | ε for S → 1 { 0 } (slide 25)', () => {
		expect(printGrammar(ebnfToGrammar(ebnf('S → 1 { 0 }')))).toBe('S → 1 S’\nS’ → 0 S’ | ε');
	});

	it('generates the sentences of E → T + E | T ; T → ( E ) | int | int * T up to length 7', () => {
		const viaEbnf = ebnfToGrammar(ebnf(EBNF_OPTION));
		const plain = grammar(TOP_DOWN_2);
		expect(compareGrammars(viaEbnf, plain, { maxLength: 7 })).toEqual({
			onlyA: [],
			onlyB: [],
			checkedUpTo: 7
		});
		expect(new Set(sentences(viaEbnf))).toEqual(new Set(sentences(plain)));
		expect(sentences(plain).length).toBeGreaterThan(20);
	});

	it('generates the sentences of the E/T/F grammar up to length 7', () => {
		const viaEbnf = ebnfToGrammar(ebnf(EBNF_REPETITION));
		for (const text of [LEFT_RECURSIVE, CASCADE]) {
			const plain = grammar(text);
			expect(compareGrammars(viaEbnf, plain, { maxLength: 7 })).toEqual({
				onlyA: [],
				onlyB: [],
				checkedUpTo: 7
			});
			expect(new Set(sentences(viaEbnf))).toEqual(new Set(sentences(plain)));
		}
	});

	it('adds primes until the name is unused', () => {
		expect(printGrammar(ebnfToGrammar(ebnf('E → { a } E’ | E’’’\nE’ → b')))).toBe(
			'E → E’’ E’ | E’’’\nE’’ → a E’’ | ε\nE’ → b'
		);
	});

	it('names new non-terminals left to right, outer brackets first', () => {
		expect(printGrammar(ebnfToGrammar(ebnf('A → { a [ b ] } [ c ]\nB → [ A ]')))).toBe(
			[
				'A → A’ A’’',
				'A’ → a A’’’ A’ | ε',
				'A’’ → c | ε',
				'A’’’ → b | ε',
				'B → B’',
				'B’ → A | ε'
			].join('\n')
		);
	});

	it('keeps alternation inside brackets', () => {
		expect(printGrammar(ebnfToGrammar(ebnf('A → x { + x | - x }')))).toBe(
			'A → x A’\nA’ → + x A’ | - x A’ | ε'
		);
		expect(printGrammar(ebnfToGrammar(ebnf('A → [ a | b ] c')))).toBe('A → A’ c\nA’ → a | b | ε');
	});

	it('lists each production once and adds no X’ → X’', () => {
		expect(printGrammar(ebnfToGrammar(ebnf('A → { ε | a } [ ε | b ] | [ ε ]')))).toBe(
			'A → A’ A’’ | A’’’\nA’ → a A’ | ε\nA’’ → ε | b\nA’’’ → ε'
		);
	});

	it('keeps the terminals in the order of the EBNF grammar and passes spans on', () => {
		const e = ebnf('E → { a } b\nF → c');
		const g = ebnfToGrammar(e);
		expect(g.terminals).toEqual(['a', 'b', 'c']);
		expect(g.productions.map((p) => p.span)).toEqual([
			e.rules[0].span,
			e.rules[0].span,
			e.rules[0].span,
			e.rules[1].span
		]);
	});

	it('leaves a grammar without brackets as it is', () => {
		expect(bare(ebnfToGrammar(ebnf(TOP_DOWN)))).toEqual(bare(grammar(TOP_DOWN)));
	});
});

describe('any text', () => {
	const PIECES = [
		'E',
		'T',
		"S'",
		'a',
		'b-c',
		'int',
		'epsilon',
		'ε',
		'→',
		'->',
		'-',
		'>',
		'|',
		'|',
		'{',
		'}',
		'[',
		']',
		'(',
		')',
		'"',
		"'",
		'“',
		'”',
		'‘',
		'’',
		'\\',
		'/',
		'*',
		'//',
		'/*',
		'*/',
		'∗',
		'$',
		'0',
		'😀',
		' ',
		' ',
		' ',
		'\t',
		'\n',
		'\n',
		'\r\n'
	];

	/** Checks every entry point on `text`; returns whether it is a grammar. */
	const exercise = (text: string, round: number): boolean => {
		const plain = parseGrammar(text);
		const extended = parseEbnf(text);
		const tokens = tokenizeInput(text, ['a', 'int', '(', ')']);
		const scanned = scanGrammar(text, { ebnf: round % 2 === 0 });
		for (const d of [...plain.diagnostics, ...extended.diagnostics, ...tokens.diagnostics]) {
			expect(d.message.length, text).toBeGreaterThan(0);
			expect(d.span!.start, text).toBeGreaterThanOrEqual(0);
			expect(d.span!.end, text).toBeGreaterThanOrEqual(d.span!.start);
			expect(d.span!.end, text).toBeLessThanOrEqual(text.length);
		}
		expect(tokens.spans).toHaveLength(tokens.tokens.length);
		expect(
			scanned.every((t) => t.span.start < t.span.end && t.span.end <= text.length),
			text
		).toBe(true);
		// No grammar exactly when there is an error.
		expect(plain.grammar === null, text).toBe(
			plain.diagnostics.some((d) => d.severity === 'error')
		);
		expect(extended.grammar === null, text).toBe(
			extended.diagnostics.some((d) => d.severity === 'error')
		);
		if (plain.grammar) {
			const again = parseGrammar(printGrammar(plain.grammar)).grammar;
			expect(again && bare(again), text).toEqual(bare(plain.grammar));
		}
		if (extended.grammar) {
			const again = parseEbnf(printEbnf(extended.grammar)).grammar;
			expect(again && bareEbnf(again), text).toEqual(bareEbnf(extended.grammar));
			expect(ebnfToGrammar(extended.grammar).start, text).toBe(extended.grammar.start);
		}
		return plain.grammar !== null;
	};

	it('never throws on noise: problems come back as diagnostics with spans inside the text', () => {
		const next = random(1234);
		let failed = 0;
		for (let round = 0; round < 1500; round++) {
			const text = Array.from(
				{ length: Math.floor(next() * 24) },
				() => PIECES[Math.floor(next() * PIECES.length)]
			).join('');
			if (!exercise(text, round)) failed++;
		}
		expect(failed).toBeGreaterThan(1000);
	});

	it('never throws on grammars with mistakes in them', () => {
		const next = random(77);
		const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
		const BODY = [
			'E',
			'T',
			"S'",
			'a',
			'b-c',
			'int',
			'+',
			'(',
			')',
			'ε',
			'|',
			'"the cat"',
			'{',
			'}',
			'[',
			']'
		];
		let parsed = 0;
		let failed = 0;
		for (let round = 0; round < 1500; round++) {
			const lines = Array.from({ length: 1 + Math.floor(next() * 4) }, () => {
				const body = Array.from({ length: 1 + Math.floor(next() * 6) }, () =>
					next() < 0.03 ? pick(PIECES) : pick(BODY)
				).join(next() < 0.9 ? ' ' : '');
				const head = next() < 0.2 ? '  |' : `${pick(['E', 'T', "S'", 'e'])} ${pick(['→', '->'])}`;
				return `${head} ${body}${next() < 0.1 ? ' // note' : ''}`;
			});
			if (exercise(lines.join('\n'), round)) parsed++;
			else failed++;
		}
		expect(parsed).toBeGreaterThan(300);
		expect(failed).toBeGreaterThan(300);
	});

	it('parses pieces of valid grammars cut anywhere', () => {
		const texts = [ENGLISH, MATCHED_IF, COOL, EBNF_REPETITION, "S → 1 S' // x\nS' → 0 S' | ε"];
		let checked = 0;
		for (const text of texts) {
			for (let cut = 0; cut <= text.length; cut++) {
				for (const piece of [text.slice(0, cut), text.slice(cut)]) {
					const { grammar: g, diagnostics } = parseGrammar(piece);
					expect(g === null, piece).toBe(diagnostics.some((d) => d.severity === 'error'));
					const e = parseEbnf(piece);
					expect(e.grammar === null, piece).toBe(e.diagnostics.some((d) => d.severity === 'error'));
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(1000);
	});
});

describe('makeGrammar', () => {
	it('finds N, T and S and numbers the productions', () => {
		const g = makeGrammar([
			{ lhs: 'S', rhs: ['1', 'S’'] },
			{ lhs: 'S’', rhs: ['0', 'S’'] },
			{ lhs: 'S’', rhs: [] }
		]);
		expect(g).toEqual({
			start: 'S',
			nonterminals: ['S', 'S’'],
			terminals: ['1', '0'],
			productions: [
				{ id: 0, lhs: 'S', rhs: ['1', 'S’'] },
				{ id: 1, lhs: 'S’', rhs: ['0', 'S’'] },
				{ id: 2, lhs: 'S’', rhs: [] }
			]
		});
	});

	it('lists a repeated production once and keeps spans', () => {
		const span = { start: 3, end: 4, source: null };
		const g = makeGrammar([
			{ lhs: 'S', rhs: ['a'], span },
			{ lhs: 'S', rhs: ['b'] },
			{ lhs: 'S', rhs: ['a'] }
		]);
		expect(g.productions).toEqual([
			{ id: 0, lhs: 'S', rhs: ['a'], span },
			{ id: 1, lhs: 'S', rhs: ['b'] }
		]);
	});

	it('orders the terminals named in opts.terminals first', () => {
		const productions = [{ lhs: 'S', rhs: ['c', 'b', 'S', 'a'] }];
		expect(makeGrammar(productions).terminals).toEqual(['c', 'b', 'a']);
		expect(makeGrammar(productions, { terminals: ['a', 'x', 'S', 'b'] }).terminals).toEqual([
			'a',
			'b',
			'c'
		]);
	});

	it('does not share right-hand sides with its input and rejects an empty list', () => {
		const rhs = ['a'];
		const g = makeGrammar([{ lhs: 'S', rhs }]);
		rhs.push('b');
		expect(g.productions[0].rhs).toEqual(['a']);
		expect(() => makeGrammar([])).toThrow(/needs a production/);
	});
});

describe('scanGrammar', () => {
	const kinds = (text: string, opts?: { ebnf?: boolean }) =>
		scanGrammar(text, opts).map((t) => `${t.kind}:${text.slice(t.span.start, t.span.end)}`);

	it('classifies symbols, notation and comments in text order', () => {
		expect(kinds('E -> T E\' | ε // sum\nE\' → + T /* x */ | "the cat"')).toEqual([
			'nonterminal:E',
			'arrow:->',
			'terminal:T',
			"nonterminal:E'",
			'bar:|',
			'epsilon:ε',
			'comment:// sum',
			"nonterminal:E'",
			'arrow:→',
			'terminal:+',
			'terminal:T',
			'comment:/* x */',
			'bar:|',
			'terminal:"the cat"'
		]);
		expect(scanGrammar("E' → a")[0]).toEqual({
			kind: 'nonterminal',
			span: { start: 0, end: 2, source: null },
			name: 'E’'
		});
	});

	it('marks EBNF brackets only when asked', () => {
		expect(kinds('E → T { + T }', { ebnf: true })).toEqual([
			'nonterminal:E',
			'arrow:→',
			'terminal:T',
			'bracket:{',
			'terminal:+',
			'terminal:T',
			'bracket:}'
		]);
		expect(kinds('E → { }')).toEqual(['nonterminal:E', 'arrow:→', 'terminal:{', 'terminal:}']);
	});

	it('works on text with errors', () => {
		expect(kinds('E → a |\nb c\nT → "x')).toEqual([
			'nonterminal:E',
			'arrow:→',
			'terminal:a',
			'bar:|',
			'terminal:b',
			'terminal:c',
			'nonterminal:T',
			'arrow:→',
			'terminal:"x'
		]);
	});
});
