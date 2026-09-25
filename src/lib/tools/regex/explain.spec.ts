import { describe, expect, it } from 'vitest';
import { regexToDfa } from '$lib/theory/automata';
import { CharSet } from '$lib/theory/charset';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { describeSymbols, explainRejection, shortestCompletion } from './explain';

function dfa(text: string, defs = '') {
	const r = parseRegex(text, { defs: parseDefinitions(defs).defs });
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return regexToDfa(r.regex, { minimal: true });
}

describe('explainRejection', () => {
	const phone = dfa(
		"'(' area ')' exchange '-' phone",
		"digit = '0' | … | '9'\narea = digit^3\nexchange = digit^3\nphone = digit^4"
	);

	it('finds where "(717) 867-5309" fails (Lexical Analysis, slide 31)', () => {
		const r = explainRejection(phone, '(717) 867-5309');
		expect(r).toMatchObject({ kind: 'fails', prefixEnd: 5, at: { start: 5, end: 6, char: ' ' } });
		if (r.kind === 'fails') expect(r.allowed.chars().join('')).toBe('0123456789');
	});

	it('completes a string that stops early', () => {
		expect(explainRejection(phone, '(717)867-530')).toMatchObject({
			kind: 'incomplete',
			completion: '0'
		});
		expect(explainRejection(phone, '')).toMatchObject({
			kind: 'incomplete',
			completion: '(000)000-0000'
		});
	});

	it('fails at the first symbol when nothing starts with it', () => {
		const r = explainRejection(dfa('1*0'), '01');
		expect(r).toMatchObject({ kind: 'fails', prefixEnd: 1, at: { char: '1' } });
		if (r.kind === 'fails') expect(r.allowed.isEmpty).toBe(true);
		expect(explainRejection(dfa('1*0'), 'x')).toMatchObject({ kind: 'fails', prefixEnd: 0 });
	});

	it('reports an empty language', () => {
		expect(explainRejection(dfa('ɸ'), 'a')).toEqual({ kind: 'empty-language' });
	});

	it('works on partial DFAs and astral symbols', () => {
		const partial = regexToDfa(parseRegexOk("'😀' 'x'"));
		expect(explainRejection(partial, '😀y')).toMatchObject({
			kind: 'fails',
			prefixEnd: 2,
			at: { start: 2, end: 3 }
		});
	});
});

describe('describeSymbols', () => {
	const letter = {
		name: 'letter',
		set: CharSet.fromRanges([
			[65, 90],
			[97, 122]
		])
	};
	const digit = { name: 'digit', set: CharSet.range('0', '9') };
	const names = [letter, digit];

	it('names the definitions a set contains and quotes the rest', () => {
		// Email, after "a" (Lexical Analysis, slide 32): a letter or '@', not "@–Z, a–z".
		expect(describeSymbols(letter.set.union(CharSet.of('@')), names)).toBe("letter, '@'");
		// Identifier, after "x" (slide 29).
		expect(describeSymbols(letter.set.union(digit.set), names)).toBe('letter, digit');
		expect(describeSymbols(digit.set, names)).toBe('digit');
	});

	it('quotes symbols and writes runs as ranges', () => {
		expect(describeSymbols(CharSet.of('x'))).toBe("'x'");
		expect(describeSymbols(CharSet.of('01'))).toBe("'0', '1'");
		expect(describeSymbols(CharSet.of(" \t'"))).toBe("'\\t', ' ', '\\''");
		expect(describeSymbols(CharSet.range('a', 'f').union(CharSet.of('@')), names)).toBe(
			"'@', 'a'–'f'"
		);
	});

	it('skips a name that the larger names already cover', () => {
		const alnum = { name: 'alnum', set: letter.set.union(digit.set) };
		expect(describeSymbols(alnum.set, [letter, digit, alnum])).toBe('alnum');
	});

	it('writes very large sets as a class', () => {
		expect(describeSymbols(CharSet.of('\n').complement())).toBe('[^\\n]');
	});
});

describe('shortestCompletion', () => {
	it('is empty from an accepting state', () => {
		const m = dfa("'a'*");
		expect(shortestCompletion(m, m.start)).toBe('');
	});
});

function parseRegexOk(text: string) {
	const r = parseRegex(text);
	if (!r.ok) throw new Error('bad');
	return r.regex;
}
