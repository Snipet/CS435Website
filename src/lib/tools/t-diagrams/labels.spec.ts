import { describe, expect, it } from 'vitest';
import {
	labelWidth,
	MONO_ADVANCE,
	normalizeLang,
	normalizePrimes,
	parseLang,
	spokenLang,
	SUB_SCALE
} from './labels';

describe('parseLang', () => {
	it('reads primes typed as apostrophes', () => {
		expect(parseLang("L'")).toEqual({ main: 'L′', sub: '' });
		expect(parseLang('M’')).toEqual({ main: 'M′', sub: '' });
		expect(parseLang('L′')).toEqual({ main: 'L′', sub: '' });
	});

	it('splits a subscript at the first underscore (slide 4: M_OTHER, M_NATIVE)', () => {
		expect(parseLang('M_OTHER')).toEqual({ main: 'M', sub: 'OTHER' });
		expect(parseLang('M_{NATIVE}')).toEqual({ main: 'M', sub: 'NATIVE' });
		expect(parseLang(" M'_x ")).toEqual({ main: 'M′', sub: 'x' });
	});

	it('keeps a leading underscore and ignores a trailing one', () => {
		expect(parseLang('_x')).toEqual({ main: '_x', sub: '' });
		expect(parseLang('M_')).toEqual({ main: 'M', sub: '' });
	});

	it('leaves ordinary names alone', () => {
		expect(parseLang('C++')).toEqual({ main: 'C++', sub: '' });
		expect(parseLang('  ARMv9 ')).toEqual({ main: 'ARMv9', sub: '' });
		expect(parseLang('Visual   Basic')).toEqual({ main: 'Visual Basic', sub: '' });
	});
});

describe('normalizeLang', () => {
	it('gives one spelling per language', () => {
		expect(normalizeLang("L'")).toBe('L′');
		expect(normalizeLang('M_{OTHER}')).toBe('M_OTHER');
		expect(normalizeLang(' M_OTHER ')).toBe('M_OTHER');
		expect(normalizeLang('')).toBe('');
		expect(normalizeLang('   ')).toBe('');
	});

	it('is case-sensitive', () => {
		expect(normalizeLang('x86')).not.toBe(normalizeLang('X86'));
	});
});

describe('normalizePrimes', () => {
	it('only replaces prime spellings', () => {
		expect(normalizePrimes("  L' ")).toBe('  L′ ');
		expect(normalizePrimes('M_{OTHER}')).toBe('M_{OTHER}');
	});
});

describe('labelWidth', () => {
	it('measures monospace glyphs, subscripts at their smaller size', () => {
		expect(labelWidth('L', 10)).toBeCloseTo(MONO_ADVANCE * 10);
		expect(labelWidth('L′', 10)).toBeCloseTo(2 * MONO_ADVANCE * 10);
		expect(labelWidth('M_OTHER', 10)).toBeCloseTo(MONO_ADVANCE * 10 * (1 + SUB_SCALE * 5));
		expect(labelWidth('', 10)).toBe(0);
	});
});

describe('spokenLang', () => {
	it('reads subscripts as words and blanks as "blank"', () => {
		expect(spokenLang('M_NATIVE')).toBe('M NATIVE');
		expect(spokenLang("L'")).toBe('L′');
		expect(spokenLang(' ')).toBe('blank');
	});
});
