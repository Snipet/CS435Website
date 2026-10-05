import { describe, expect, it } from 'vitest';
import { parseGrammar, printSet, printSymbols, type Grammar } from '$lib/theory/grammar';
import { ENGLISH, presets } from './presets';
import { PLAIN, quotedSymbols, spellingOf } from './spelling';

function grammar(text: string): Grammar {
	const { grammar } = parseGrammar(text);
	if (!grammar) throw new Error(`grammar has errors: ${text}`);
	return grammar;
}

describe('the symbols a grammar text quotes', () => {
	it('lists every terminal of the English grammar (Introduction to Parsing, slide 25)', () => {
		expect([...quotedSymbols(ENGLISH)]).toEqual([
			['the cat', '"the cat"'],
			['the mat', '"the mat"'],
			['the floor', '"the floor"'],
			['sat', '"sat"'],
			['saw', '"saw"'],
			['on', '"on"'],
			['under', '"under"']
		]);
	});

	it('lists nothing for a grammar without quotes', () => {
		for (const p of presets.filter((p) => !p.value.grammar.includes('"')))
			expect(quotedSymbols(p.value.grammar).size).toBe(0);
		// A prime is not a quote.
		expect(quotedSymbols("S' → S\nS → a").size).toBe(0);
	});

	it('keeps the quotes as they are written', () => {
		const quoted = quotedSymbols('S → \'a\' “b c” "d\\"e" f');
		expect([...quoted]).toEqual([
			['a', "'a'"],
			['b c', '“b c”'],
			['d"e', '"d\\"e"']
		]);
	});

	it('goes by the first appearance of a symbol', () => {
		expect([...quotedSymbols('S → "a" S | a | b | "b"')]).toEqual([['a', '"a"']]);
		// Left-hand sides count, and comments do not.
		expect([...quotedSymbols('// "x"\n"S" → x S | x')]).toEqual([['S', '"S"']]);
	});

	it('reads text with errors', () => {
		expect([...quotedSymbols('S → "a" |\nS "b')].map(([name]) => name)).toContain('a');
	});
});

describe('the spelling of a grammar', () => {
	it('is the plain one when the grammar quotes nothing', () => {
		for (const p of presets.filter((p) => !p.value.grammar.includes('"')))
			expect(spellingOf(p.value.grammar)).toBe(PLAIN);
	});

	it('writes plain symbols as the printers of the engine do', () => {
		const symbols = ['E', '+', 'the cat', ',', 'ε', '|', 'S’'];
		expect(symbols.map(PLAIN.symbol)).toEqual(symbols.map((s) => printSymbols([s])));
		expect(PLAIN.symbols(symbols)).toBe(printSymbols(symbols));
		expect(PLAIN.symbols([])).toBe('ε');
		expect(PLAIN.set(symbols)).toBe(printSet(symbols));
		expect(PLAIN.set([])).toBe('{ }');
	});

	it('writes a quoted symbol as the grammar text does, and the others plainly', () => {
		const write = spellingOf(ENGLISH);
		expect(write.symbol('sat')).toBe('"sat"');
		expect(write.symbol('the cat')).toBe('"the cat"');
		expect(write.symbol('Verb')).toBe('Verb');
		expect(write.symbols(['the cat', 'on', 'the mat', 'sat'])).toBe(
			'"the cat" "on" "the mat" "sat"'
		);
		expect(write.symbols(['Noun', 'sat'])).toBe('Noun "sat"');
		expect(write.symbols([])).toBe('ε');
		expect(write.set(['Verb', 'sat', 'saw'])).toBe('{ Verb, "sat", "saw" }');
		expect(write.set([])).toBe('{ }');
	});

	it('writes strings that read back as the same symbols', () => {
		const text = 'S → \'a\' “b c” "d\\"e" , f | "ε" S';
		const g = grammar(text);
		const write = spellingOf(text);
		for (const p of g.productions) {
			const again = grammar(`${write.symbol(p.lhs)} → ${write.symbols(p.rhs)}`);
			expect(again.productions[0].rhs).toEqual(p.rhs);
		}
	});

	it('keeps the rules of printSet for the members it does not quote', () => {
		// A comma is quoted in a set; the symbol named ε is always quoted in the text.
		const text = 'S → "a" , S | "ε"';
		const g = grammar(text);
		const write = spellingOf(text);
		expect(write.set(g.terminals)).toBe('{ "a", ",", "ε" }');
		expect(write.symbols(g.productions[0].rhs)).toBe('"a" , S');
		// Without a quoted symbol in the set, the result is printSet's.
		const plain = grammar('S → a , S | b');
		expect(spellingOf('S → a , S | b').set(plain.terminals)).toBe(printSet(plain.terminals));
	});
});
