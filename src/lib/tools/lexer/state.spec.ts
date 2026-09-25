import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import type { LinkStates } from '$lib/tools/links';
import { isLexerHash, normalizeState, ruleLinkState, type LexerState } from './state';

const link: LinkStates['lexer'] = {
	defs: "digit = '0' | … | '9'",
	rules: [
		{ name: 'Whitespace', re: "' '+", drop: true },
		{ name: 'Integer', re: 'digit+' }
	],
	input: '1 2',
	errorRule: true
};

describe('isLexerHash', () => {
	it("accepts LinkStates['lexer'] with and without optional fields", () => {
		expect(isLexerHash(link)).toBe(true);
		expect(isLexerHash({ rules: [], input: '' })).toBe(true);
		expect(decode(encode(link), isLexerHash)).toEqual(link);
	});

	it("accepts the page's own state", () => {
		const own: LexerState = { ...normalizeState(link), tab: 'strip', step: 3, preset: 'x' };
		expect(isLexerHash(own)).toBe(true);
	});

	it('rejects other shapes', () => {
		expect(isLexerHash(null)).toBe(false);
		expect(isLexerHash({ input: '' })).toBe(false);
		expect(isLexerHash({ rules: [{ name: 'A' }], input: '' })).toBe(false);
		expect(isLexerHash({ rules: [{ name: 'A', re: 'a', drop: 'yes' }], input: '' })).toBe(false);
		expect(isLexerHash({ rules: [], input: 3 })).toBe(false);
		expect(isLexerHash({ rules: [], input: '', defs: 1 })).toBe(false);
		expect(isLexerHash({ rules: [], input: '', errorRule: 'on' })).toBe(false);
		expect(isLexerHash({ re: 'a', defs: '' })).toBe(false);
	});
});

describe('normalizeState', () => {
	it('fills in the view options', () => {
		expect(normalizeState({ rules: [{ name: 'A', re: "'a'" }], input: 'a' })).toEqual({
			defs: '',
			rules: [{ name: 'A', re: "'a'", drop: false }],
			input: 'a',
			errorRule: false,
			format: 'paren',
			showDropped: false,
			tab: 'matches',
			strip: false,
			step: 0,
			lookahead: 0,
			preset: null
		});
	});

	it('ignores view options of the wrong type', () => {
		const s = normalizeState({
			...link,
			format: 'curly',
			tab: 'nope',
			step: -2,
			lookahead: 2.7,
			showDropped: 'yes',
			preset: 5
		} as unknown as LinkStates['lexer']);
		expect(s).toMatchObject({
			format: 'paren',
			tab: 'matches',
			step: 0,
			lookahead: 2,
			showDropped: false,
			preset: null
		});
	});
});

describe('ruleLinkState', () => {
	it('keeps drop only where it is set', () => {
		expect(ruleLinkState(normalizeState(link))).toEqual({
			defs: link.defs,
			rules: [
				{ name: 'Whitespace', re: "' '+", drop: true },
				{ name: 'Integer', re: 'digit+' }
			],
			input: '1 2'
		});
	});
});
