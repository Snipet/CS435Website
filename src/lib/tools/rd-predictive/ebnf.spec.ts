import { describe, expect, it } from 'vitest';
import { parseEbnf, parseGrammar, printEbnf } from '$lib/theory/grammar';
import {
	PRIME,
	altKey,
	alternativesOf,
	bodyOf,
	distinct,
	ebnfOf,
	freshName,
	hasBrackets,
	isSymbol,
	itemKey,
	namesOf,
	opt,
	printAlt,
	printAlts,
	printProduction,
	printRule,
	printRules,
	printSymbol,
	rep,
	rulesOf,
	rulesOfEbnf,
	rulesOfGrammar,
	sym,
	symbolsOf,
	type Rule
} from './ebnf';

const ebnf = (text: string) => parseEbnf(text).grammar!;
const grammar = (text: string) => parseGrammar(text).grammar!;

const E: Rule = { lhs: 'E', alts: [[sym('T'), rep([[sym('+'), sym('T')]])]] };
const T: Rule = {
	lhs: 'T',
	alts: [
		[sym('('), sym('E'), sym(')')],
		[sym('int'), opt([[sym('*'), sym('T')]])]
	]
};

describe('rules as alternatives of items', () => {
	it('reads the rules of an EBNF grammar', () => {
		expect(rulesOfEbnf(ebnf('E → T { + T }\nT → ( E ) | int [ * T ]'))).toEqual([E, T]);
		expect(rulesOfEbnf(ebnf('S → 1 S’\nS’ → 0 S’ | ε'))).toEqual([
			{ lhs: 'S', alts: [[sym('1'), sym('S’')]] },
			{ lhs: 'S’', alts: [[sym('0'), sym('S’')], []] }
		]);
	});

	it('reads the rules of a plain grammar, one per non-terminal', () => {
		expect(rulesOfGrammar(grammar('S → 1 | S 0'))).toEqual([
			{ lhs: 'S', alts: [[sym('1')], [sym('S'), sym('0')]] }
		]);
		// Productions of one non-terminal that are written apart are joined.
		expect(rulesOfGrammar(grammar('A → a\nB → b\nA → ε')).map(printRule)).toEqual([
			'A → a | ε',
			'B → b'
		]);
		// In a plain grammar braces are terminals.
		expect(rulesOfGrammar(grammar('B → { }'))).toEqual([
			{ lhs: 'B', alts: [[sym('{'), sym('}')]] }
		]);
	});

	it('rulesOf takes either kind of grammar', () => {
		expect(rulesOf(ebnf('S → 1 { 0 }'))).toEqual([
			{ lhs: 'S', alts: [[sym('1'), rep([[sym('0')]])]] }
		]);
		expect(rulesOf(grammar('S → 1'))).toEqual([{ lhs: 'S', alts: [[sym('1')]] }]);
	});

	it('alternativesOf multiplies a choice inside a sequence out and drops ε in brackets', () => {
		expect(
			alternativesOf({
				kind: 'seq',
				items: [
					{ kind: 'sym', name: 'a' },
					{
						kind: 'alt',
						options: [
							{ kind: 'sym', name: 'b' },
							{ kind: 'sym', name: 'c' }
						]
					}
				]
			})
		).toEqual([
			[sym('a'), sym('b')],
			[sym('a'), sym('c')]
		]);
		expect(
			alternativesOf({
				kind: 'opt',
				body: { kind: 'alt', options: [{ kind: 'sym', name: 'a' }, { kind: 'eps' }] }
			})
		).toEqual([[opt([[sym('a')]])]]);
		expect(alternativesOf({ kind: 'rep', body: { kind: 'eps' } })).toEqual([[]]);
		expect(alternativesOf({ kind: 'eps' })).toEqual([[]]);
	});

	it('bodyOf is the tree parseEbnf builds', () => {
		const e = ebnf('E → T { + T }\nT → ( E ) | int [ * T ]\nA → ε');
		expect(bodyOf(E.alts)).toEqual(e.rules[0].body);
		expect(bodyOf(T.alts)).toEqual(e.rules[1].body);
		expect(bodyOf([[]])).toEqual(e.rules[2].body);
	});

	it('ebnfOf builds the grammar: start, N, T, and one rule per non-terminal', () => {
		const e = ebnfOf([E, T, { lhs: 'E', alts: [[sym('x')]] }, E]);
		expect(e.start).toBe('E');
		expect(e.nonterminals).toEqual(['E', 'T']);
		expect(e.terminals).toEqual(['+', 'x', '(', ')', 'int', '*']);
		expect(printEbnf(e)).toBe('E → T { + T } | x\nT → ( E ) | int [ * T ]');
		expect(() => ebnfOf([])).toThrow();
	});
});

describe('items and alternatives', () => {
	it('builds items', () => {
		expect(sym('a')).toEqual({ kind: 'sym', name: 'a' });
		expect(opt([[sym('a')]])).toEqual({ kind: 'opt', alts: [[{ kind: 'sym', name: 'a' }]] });
		expect(rep([[]])).toEqual({ kind: 'rep', alts: [[]] });
		expect(PRIME).toBe('’');
	});

	it('compares them by structure', () => {
		expect(itemKey(sym('a'))).toBe(itemKey(sym('a')));
		expect(itemKey(opt([[sym('a')]]))).not.toBe(itemKey(rep([[sym('a')]])));
		expect(altKey([sym('a'), sym('b')])).not.toBe(altKey([sym('b'), sym('a')]));
		expect(isSymbol(sym('a'), 'a')).toBe(true);
		expect(isSymbol(sym('a'), 'b')).toBe(false);
		expect(isSymbol(opt([[sym('a')]]), 'a')).toBe(false);
		expect(isSymbol(undefined, 'a')).toBe(false);
	});

	it('distinct lists a repeated alternative once', () => {
		expect(distinct([[sym('a')], [], [sym('a')], [sym('b')], []])).toEqual([
			[sym('a')],
			[],
			[sym('b')]
		]);
	});

	it('symbolsOf lists every symbol, inside brackets too', () => {
		expect(symbolsOf(T.alts)).toEqual(['(', 'E', ')', 'int', '*', 'T']);
		expect([...namesOf([E, T])]).toEqual(['E', 'T', '+', '(', ')', 'int', '*']);
	});

	it('hasBrackets', () => {
		expect(hasBrackets([E])).toBe(true);
		expect(hasBrackets([{ lhs: 'S', alts: [[sym('1'), sym('S’')], []] }])).toBe(false);
	});
});

describe('printing', () => {
	it('writes rules as the decks do', () => {
		expect(printRule(E)).toBe('E → T { + T }');
		expect(printRules([E, T])).toBe('E → T { + T }\nT → ( E ) | int [ * T ]');
		expect(printAlt([])).toBe('ε');
		expect(printAlt(T.alts[1])).toBe('int [ * T ]');
		expect(printAlts([[sym('a')], []])).toBe('a | ε');
		expect(printAlt([rep([[sym('a')], [sym('b'), opt([[sym('c')]])]])])).toBe('{ a | b [ c ] }');
		expect(printProduction('S’', [sym('0'), sym('S’')])).toBe('S’ → 0 S’');
	});

	it('quotes what would not read back as one symbol', () => {
		expect(printSymbol('{')).toBe('"{"');
		expect(printSymbol(']')).toBe('"]"');
		expect(printSymbol('the cat')).toBe('"the cat"');
		expect(printSymbol('(')).toBe('(');
		expect(printRule({ lhs: 'B', alts: [[sym('{'), sym('B'), sym('}')], []] })).toBe(
			'B → "{" B "}" | ε'
		);
	});

	it('prints what parseEbnf reads back as the same rules', () => {
		const text = printRules([E, T]);
		expect(rulesOfEbnf(ebnf(text))).toEqual([E, T]);
	});
});

describe('freshName', () => {
	it('adds primes until the name is unused, and takes it', () => {
		const used = new Set(['S', 'S’']);
		expect(freshName('S', used)).toBe('S’’');
		expect(freshName('S', used)).toBe('S’’’');
		expect(freshName('E', used)).toBe('E’');
		expect([...used]).toEqual(['S', 'S’', 'S’’', 'S’’’', 'E’']);
	});
});
