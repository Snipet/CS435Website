import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import {
	blankState,
	escapeTest,
	isRegexState,
	MAX_LENGTH_LIMIT,
	normalizeState,
	unescapeTest
} from './state';

describe('isRegexState', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['regex'] = { re: '(0 | 1)*00' };
		expect(isRegexState(link)).toBe(true);
		const full: LinkStates['regex'] = {
			re: 'digit+',
			defs: "digit = '0' | … | '9'",
			dialect: 'lecture',
			alphabet: '{ 0, …, 9 }',
			tests: ['42'],
			compare: 'digit digit*'
		};
		expect(isRegexState(full)).toBe(true);
	});

	it('accepts its own saved state', () => {
		expect(isRegexState(blankState())).toBe(true);
	});

	it('rejects other shapes', () => {
		expect(isRegexState(null)).toBe(false);
		expect(isRegexState([])).toBe(false);
		expect(isRegexState({})).toBe(false);
		expect(isRegexState({ re: 1 })).toBe(false);
		expect(isRegexState({ re: '', dialect: 'posix' })).toBe(false);
		expect(isRegexState({ re: '', tests: [1] })).toBe(false);
		expect(isRegexState({ re: '', node: [-1] })).toBe(false);
		expect(isRegexState({ re: '', view: 'graph' })).toBe(false);
	});
});

describe('normalizeState', () => {
	it('fills in defaults and clamps the list length', () => {
		const s = normalizeState({ re: 'a', maxLength: 99 });
		expect(s).toEqual({ ...blankState(), re: 'a', maxLength: MAX_LENGTH_LIMIT });
	});
});

describe('test string escapes', () => {
	it('reads \\t \\n \\r and \\\\', () => {
		expect(unescapeTest('a\\tb\\n\\r\\\\')).toBe('a\tb\n\r\\');
		expect(unescapeTest('\\x')).toBe('\\x');
		expect(unescapeTest('\\')).toBe('\\');
	});

	it('round-trips every string', () => {
		const alphabet = ['\\', 't', 'n', '\t', '\n', '\r', 'x', ' '];
		const all = (len: number): string[] =>
			len === 0 ? [''] : all(len - 1).flatMap((s) => alphabet.map((c) => s + c));
		for (let len = 0; len <= 4; len++)
			for (const s of all(len)) expect(unescapeTest(escapeTest(s))).toBe(s);
	});

	it('writes plain strings as they are', () => {
		expect(escapeTest('(717) 867-5309')).toBe('(717) 867-5309');
		expect(escapeTest(' \t')).toBe(' \\t');
	});
});
