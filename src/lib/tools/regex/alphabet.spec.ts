import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { FLEX_DOT, parseDefinitions } from '$lib/theory/regex';
import { formatAlphabet, parseAlphabet } from './alphabet';

const chars = (text: string, defs = '') => {
	const r = parseAlphabet(text, parseDefinitions(defs).defs);
	return r.set?.chars().join('') ?? null;
};

describe('parseAlphabet', () => {
	it('reads the slide forms', () => {
		expect(chars('{ 0, 1 }')).toBe('01');
		expect(chars('0 1')).toBe('01');
		expect(chars('{ 0, 1, 2, 3, …, 9, (, ), - }')).toBe('()-0123456789');
		expect(chars('{ a, ..., e }')).toBe('abcde');
		expect(chars('letter ∪ { ., @ }', "letter = 'a' | 'b'")).toBe('.@ab');
	});

	it('is blank for an empty field', () => {
		expect(parseAlphabet('  ')).toEqual({ set: null, blank: true, diagnostics: [] });
	});

	it('reads quoted symbols and escapes', () => {
		expect(chars("{ ' ', '\\t', ',', '{' }")).toBe('\t ,{');
		expect(chars("'\\''")).toBe("'");
		expect(chars('"ab"')).toBe('ab');
	});

	it('reads an unknown word as its letters, with a note', () => {
		const r = parseAlphabet('ab');
		expect(r.set?.chars().join('')).toBe('ab');
		expect(r.diagnostics).toMatchObject([{ severity: 'info' }]);
	});

	it('reports problems', () => {
		const bad = (text: string) => parseAlphabet(text).diagnostics.map((d) => d.message);
		expect(bad('{ …, 9 }')).toEqual(['… needs a single symbol on each side, e.g. 0, …, 9']);
		expect(bad('{ 9, …, 0 }')).toEqual(['9, …, 0 is backwards']);
		expect(bad("{ 'a }")).toEqual(['missing closing quote']);
		expect(bad("{ '' }")).toEqual(['empty quotes; put one symbol between them']);
		expect(parseAlphabet('{ x').set).not.toBeNull();
		const any = parseAlphabet('d', parseDefinitions('d = Σ').defs);
		expect(any.set).toBeNull();
	});

	it('warns that two dots are a symbol, not a range', () => {
		const r = parseAlphabet('0..9');
		expect(r.set?.chars().join('')).toBe('.09');
		expect(r.diagnostics).toMatchObject([
			{ severity: 'warning', span: { start: 1, end: 3, source: '<alphabet>' } }
		]);
		expect(parseAlphabet('0...9').set?.size).toBe(10);
		expect(parseAlphabet('{ ., @ }').diagnostics).toEqual([]);
	});
});

describe('formatAlphabet', () => {
	it('writes lecture notation that reads back', () => {
		for (const text of ['{ 0, 1 }', '{ (, ), -, 0, …, 9 }', "{ ' ', ',', a, b, c }", '{ }']) {
			const set = parseAlphabet(text).set ?? CharSet.EMPTY;
			expect(formatAlphabet(set)).toBe(text);
			expect(parseAlphabet(formatAlphabet(set)).set?.equals(set) ?? set.isEmpty).toBe(true);
		}
	});

	it('describes very large sets by what they leave out', () => {
		expect(formatAlphabet(FLEX_DOT)).toBe("every character except '\\n'");
	});

	it('quotes letters that name definitions', () => {
		expect(formatAlphabet(CharSet.of('ab'), { names: new Set(['a']) })).toBe("{ 'a', b }");
	});
});
