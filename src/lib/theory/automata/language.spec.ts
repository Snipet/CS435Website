import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, any, cat, chars, empty, eps, plus, ref, star, sym } from '../regex/ast';
import { analyzeDeterminism, automatonFromText } from './core';
import {
	compareLanguages,
	countByLength,
	enumerate,
	isEmptyLanguage,
	isFiniteLanguage,
	regexToDfa,
	regexToNfa,
	shortestAccepted,
	toDfa
} from './language';
import { accepts } from './simulate';

const letter = () =>
	ref(
		'letter',
		chars(
			CharSet.fromRanges([
				[65, 90],
				[97, 122]
			]),
			'[A-Za-z]'
		)
	);
const digit = () => ref('digit', chars(CharSet.range('0', '9'), '[0-9]'));
const identifier = () => cat(letter(), star(alt(letter(), digit())));
const bit = () => alt(sym('0'), sym('1'));
const list = (r: Parameters<typeof regexToNfa>[0], maxLength = 5, limit = 100) =>
	enumerate(regexToNfa(r), { maxLength, limit });

describe('regexToNfa / regexToDfa / toDfa', () => {
	it('builds the Thompson NFA and its DFA', () => {
		const r = cat(star(alt(sym('1'), sym('0'))), sym('1'));
		expect(regexToNfa(r).states).toHaveLength(10);
		expect(regexToDfa(r).states.map((s) => s.name)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(regexToDfa(r, { minimal: true }).states).toHaveLength(2);
	});

	it('passes the alphabet on for Σ', () => {
		const dfa = regexToDfa(star(any()), { alphabet: CharSet.of('ab') });
		expect(accepts(dfa, 'abba')).toBe(true);
		expect(accepts(dfa, 'abc')).toBe(false);
	});

	it('determinizes only when needed', () => {
		const dfa = automatonFromText('start: A\naccept: B\nA x B');
		expect(toDfa(dfa)).toBe(dfa);
		expect(analyzeDeterminism(toDfa(regexToNfa(star(sym('a'))))).kind).not.toBe('nfa');
	});
});

describe('enumerate', () => {
	it('lists 0* in shortlex order: "", "0", "00", "000"', () => {
		expect(list(star(sym('0')), 3)).toEqual({ strings: ['', '0', '00', '000'], truncated: true });
	});

	it("('0'|'1')('0'|'1') has exactly 4 strings", () => {
		expect(list(cat(bit(), bit()))).toEqual({
			strings: ['00', '01', '10', '11'],
			truncated: false
		});
	});

	it('ɸ has none; ε has only ""', () => {
		expect(list(empty())).toEqual({ strings: [], truncated: false });
		expect(list(eps())).toEqual({ strings: [''], truncated: false });
	});

	it('orders by length, then by code point', () => {
		const r = alt(sym('b'), sym('aa'), sym('a'), sym('ab'));
		expect(list(r).strings).toEqual(['a', 'b', 'aa', 'ab']);
	});

	it('respects the limit and reports truncation', () => {
		expect(list(star(bit()), 10, 5)).toEqual({
			strings: ['', '0', '1', '00', '01'],
			truncated: true
		});
		expect(list(cat(bit(), bit()), 5, 4).truncated).toBe(false);
	});

	it('reports strings longer than maxLength as truncation', () => {
		expect(list(sym('abc'), 2)).toEqual({ strings: [], truncated: true });
		expect(list(sym('abc'), 3)).toEqual({ strings: ['abc'], truncated: false });
	});

	it('handles huge classes exactly, smallest members first', () => {
		const notNewline = chars(CharSet.single('\n').complement(), '.');
		const { strings, truncated } = list(cat(notNewline, notNewline), 2, 4);
		expect(strings).toEqual(['\0\0', '\0\x01', '\0\x02', '\0\x03']);
		expect(truncated).toBe(true);
	});

	it('skips prefixes that cannot finish', () => {
		// Strings over {a, b} ending in "b": the "a…" branch must not starve the list.
		const r = cat(star(alt(sym('a'), sym('b'))), sym('b'));
		expect(list(r, 3, 100).strings).toEqual(['b', 'ab', 'bb', 'aab', 'abb', 'bab', 'bbb']);
	});
});

describe('isEmptyLanguage / isFiniteLanguage', () => {
	it('detects the empty language', () => {
		expect(isEmptyLanguage(regexToNfa(empty()))).toBe(true);
		expect(isEmptyLanguage(regexToNfa(cat(sym('a'), empty())))).toBe(true);
		expect(isEmptyLanguage(regexToNfa(eps()))).toBe(false);
		expect(isEmptyLanguage(automatonFromText('start: A\naccept: B\nC x B'))).toBe(true);
	});

	it('detects finite languages', () => {
		expect(isFiniteLanguage(regexToNfa(cat(bit(), bit())))).toBe(true);
		expect(isFiniteLanguage(regexToNfa(star(sym('a'))))).toBe(false);
		expect(isFiniteLanguage(regexToNfa(empty()))).toBe(true);
		// A cycle that cannot reach acceptance does not count.
		expect(isFiniteLanguage(automatonFromText('start: A\naccept: B\nA x B\nA y C\nC y C'))).toBe(
			true
		);
		// ε-cycles do not make a language infinite.
		expect(isFiniteLanguage(regexToNfa(star(eps())))).toBe(true);
	});
});

describe('countByLength', () => {
	it('counts strings of each length with class sizes as weights', () => {
		expect(countByLength(regexToNfa(star(bit())), 3)).toEqual([1n, 2n, 4n, 8n]);
		expect(countByLength(regexToNfa(identifier()), 2)).toEqual([0n, 52n, 52n * 62n]);
		expect(countByLength(regexToNfa(empty()), 1)).toEqual([0n, 0n]);
	});

	it('counts each string once even with overlapping duplicate edges', () => {
		const a = automatonFromText('start: A\naccept: B\nA [a-c] B\nA [b-d] B');
		expect(countByLength(a, 1)).toEqual([0n, 4n]);
	});
});

describe('shortestAccepted', () => {
	it('finds the shortest, shortlex-first string', () => {
		expect(shortestAccepted(regexToNfa(cat(star(bit()), sym('1'))))).toBe('1');
		expect(shortestAccepted(regexToNfa(alt(sym('ba'), sym('ab'), sym('ccc'))))).toBe('ab');
		expect(shortestAccepted(regexToNfa(star(sym('a'))))).toBe('');
		expect(shortestAccepted(regexToNfa(empty()))).toBeNull();
		expect(shortestAccepted(regexToNfa(identifier()))).toBe('A');
	});
});

describe('compareLanguages', () => {
	it('identifier vs (letter* | digit*): onlyA = "A0", onlyB = ""', () => {
		const other = alt(star(letter()), star(digit()));
		const c = compareLanguages(regexToNfa(identifier()), regexToNfa(other));
		expect(c.equivalent).toBe(false);
		expect(c.onlyA).toBe('A0');
		expect(c.onlyB).toBe('');
		expect(c.examples.onlyA).toEqual(['A0', 'A1', 'A2', 'A3', 'A4']);
		expect(c.examples.onlyB).toEqual(['', '0', '1', '2', '3']);
		expect(c.examples.both).toEqual(['A', 'B', 'C', 'D', 'E']);
	});

	it('recognizes equivalent expressions', () => {
		const a = regexToNfa(star(alt(sym('a'), sym('b'))));
		const b = regexToNfa(star(cat(star(sym('a')), star(sym('b')))));
		const c = compareLanguages(a, b, { exampleLimit: 3 });
		expect(c).toMatchObject({ equivalent: true, onlyA: null, onlyB: null });
		expect(c.examples.onlyA).toEqual([]);
		expect(c.examples.both).toEqual(['', 'a', 'b']);
	});

	it('compares a+ with a a*', () => {
		const c = compareLanguages(
			regexToNfa(plus(sym('a'))),
			regexToNfa(cat(sym('a'), star(sym('a'))))
		);
		expect(c.equivalent).toBe(true);
	});

	it('respects maxLength for examples', () => {
		const c = compareLanguages(regexToNfa(star(sym('a'))), regexToNfa(eps()), { maxLength: 2 });
		expect(c.onlyA).toBe('a');
		expect(c.examples.onlyA).toEqual(['a', 'aa']);
		expect(c.examples.both).toEqual(['']);
	});
});
