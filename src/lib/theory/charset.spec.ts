import { describe, expect, it } from 'vitest';
import { CharSet, MAX_CODE_POINT, partitionCharSets } from './charset';
import { formatClass, formatLabel, formatString, formatStringSet, showChar } from './chars';

describe('CharSet', () => {
	it('normalizes overlapping and adjacent ranges', () => {
		const s = CharSet.fromRanges([
			[5, 9],
			[1, 3],
			[4, 4],
			[20, 30],
			[25, 26]
		]);
		expect(s.ranges).toEqual([
			[1, 9],
			[20, 30]
		]);
		expect(s.size).toBe(20);
	});

	it('supports membership by char or code point', () => {
		const digits = CharSet.range('0', '9');
		expect(digits.has('5')).toBe(true);
		expect(digits.has('a')).toBe(false);
		expect(digits.has(0x30)).toBe(true);
		expect(CharSet.EMPTY.has('a')).toBe(false);
	});

	it('computes union, intersection, difference, and complement', () => {
		const lower = CharSet.range('a', 'z');
		const vowels = CharSet.of('aeiou');
		expect(lower.union(vowels).equals(lower)).toBe(true);
		expect(lower.intersect(vowels).equals(vowels)).toBe(true);
		const consonants = lower.subtract(vowels);
		expect(consonants.size).toBe(21);
		expect(consonants.has('e')).toBe(false);
		expect(consonants.has('b')).toBe(true);
		const notNewline = CharSet.single('\n').complement();
		expect(notNewline.has('\n')).toBe(false);
		expect(notNewline.has('x')).toBe(true);
		expect(notNewline.size).toBe(MAX_CODE_POINT);
		expect(CharSet.ANY.complement().isEmpty).toBe(true);
		expect(CharSet.EMPTY.complement().equals(CharSet.ANY)).toBe(true);
	});

	it('reports singletons, subsets, and keys', () => {
		expect(CharSet.single('a').isSingleton).toBe(true);
		expect(CharSet.of('ab').isSingleton).toBe(false);
		expect(CharSet.of('ab').isSubsetOf(CharSet.range('a', 'c'))).toBe(true);
		expect(CharSet.of('ab').key()).toBe(CharSet.range('a', 'b').key());
		expect(CharSet.of('ab').firstChar()).toBe('a');
		expect(CharSet.range('a', 'e').chars(3)).toEqual(['a', 'b', 'c']);
	});
});

describe('partitionCharSets', () => {
	it('splits overlapping sets into disjoint classes', () => {
		const letter = CharSet.fromRanges([
			[65, 90],
			[97, 122]
		]);
		const i = CharSet.single('i');
		const f = CharSet.single('f');
		const digit = CharSet.range('0', '9');
		const classes = partitionCharSets([letter, i, f, digit]);
		// Every class is disjoint from the others.
		for (let a = 0; a < classes.length; a++)
			for (let b = a + 1; b < classes.length; b++)
				expect(classes[a].overlaps(classes[b])).toBe(false);
		// Every input is a union of classes.
		for (const s of [letter, i, f, digit]) {
			const covered = classes
				.filter((c) => c.isSubsetOf(s))
				.reduce((acc, c) => acc.union(c), CharSet.EMPTY);
			expect(covered.equals(s)).toBe(true);
		}
		expect(classes.some((c) => c.equals(i))).toBe(true);
		expect(classes.some((c) => c.equals(digit))).toBe(true);
	});

	it('returns [] for no input', () => {
		expect(partitionCharSets([])).toEqual([]);
	});
});

describe('display helpers', () => {
	it('shows characters per context', () => {
		expect(showChar(' ', 'label')).toBe('␣');
		expect(showChar('\t', 'label')).toBe('\\t');
		expect(showChar("'", 'quoted')).toBe("\\'");
		expect(showChar('"', 'string')).toBe('\\"');
		expect(showChar('-', 'class')).toBe('\\-');
		expect(showChar(0x01)).toBe('\\x01');
	});

	it('formats strings and string sets like the slides', () => {
		expect(formatString('')).toBe('""');
		expect(formatString('if')).toBe('"if"');
		expect(formatStringSet(['', '0', '00'], { more: true })).toBe('{ "", "0", "00", … }');
		expect(formatStringSet([])).toBe('{ }');
	});

	it('formats labels compactly', () => {
		expect(formatLabel(CharSet.of('01'))).toBe('0,1');
		expect(formatLabel(CharSet.range('0', '9'))).toBe('0–9');
		expect(
			formatLabel(
				CharSet.fromRanges([
					[65, 90],
					[97, 122]
				])
			)
		).toBe('A–Z,a–z');
		expect(formatLabel(CharSet.single('\n').complement())).toBe('[^\\n]');
		const digit = CharSet.range('0', '9');
		expect(formatLabel(digit, { names: [{ name: 'digit', set: digit }] })).toBe('digit');
	});

	it('formats flex classes', () => {
		expect(formatClass(CharSet.range('0', '9'))).toBe('[0-9]');
		expect(formatClass(CharSet.single('\n').complement())).toBe('[^\\n]');
		expect(formatClass(CharSet.single('a'))).toBe('a');
	});
});
