import { describe, expect, it } from 'vitest';
import { parseGrammar } from '$lib/theory/grammar';
import {
	COMPARE_LENGTH,
	LIST_LIMIT,
	compareSummary,
	compareTexts,
	sameRequest,
	type CompareRequest
} from './compare';
import { rewriteGrammar } from './transform';

const request = (
	original: string,
	rewritten: string,
	maxLength = COMPARE_LENGTH
): CompareRequest => ({
	original,
	rewritten,
	maxLength
});

describe('compareTexts', () => {
	it('finds the rewritten grammars of the slides to generate the same strings', () => {
		for (const [original, rewritten] of [
			['S → 1 | S 0', 'S → 1 { 0 }'],
			['S → 1 | S 0', 'S → 1 S’\nS’ → 0 S’ | ε'],
			[
				'E → E + T | T\nT → T * F | F\nF → ( E ) | int',
				'E → T { + T }\nT → F { * F }\nF → ( E ) | int'
			],
			['E → T + E | T\nT → ( E ) | int | int * T', 'E → T [ + E ]\nT → ( E ) | int [ * T ]'],
			['A → X op A | X', 'A → X [ op A ]']
		]) {
			const result = compareTexts(request(original, rewritten));
			expect(result, rewritten).toEqual({
				status: 'done',
				checkedUpTo: 7,
				maxLength: 7,
				onlyOriginal: { count: 0, examples: [] },
				onlyRewritten: { count: 0, examples: [] }
			});
			expect(compareSummary(result)).toEqual({
				same: true,
				text: 'Both grammars generate the same strings of up to 7 tokens.'
			});
		}
	});

	it('agrees with the rewrite of a grammar', () => {
		const text = 'E → E + T | E - T | T\nT → T * F | F\nF → ( E ) | int | id';
		const rewrite = rewriteGrammar(parseGrammar(text).grammar!);
		expect(compareSummary(compareTexts(request(text, rewrite.text, 5))).same).toBe(true);
	});

	it('lists the strings only one grammar generates', () => {
		// The loop takes one 0 too many: 1 is missing.
		const result = compareTexts(request('S → 1 | S 0', 'S → 1 0 { 0 } | 1 1', 4));
		expect(result).toEqual({
			status: 'done',
			checkedUpTo: 4,
			maxLength: 4,
			onlyOriginal: { count: 1, examples: ['1'] },
			onlyRewritten: { count: 1, examples: ['1 1'] }
		});
		expect(compareSummary(result)).toEqual({
			same: false,
			text: 'The grammars do not generate the same strings of up to 4 tokens.'
		});
	});

	it('lists a few of many', () => {
		const result = compareTexts(request('S → a S | b S | ε', 'S → c', 5));
		expect(result.status).toBe('done');
		if (result.status !== 'done') return;
		expect(result.onlyOriginal.count).toBe(63);
		expect(result.onlyOriginal.examples).toHaveLength(LIST_LIMIT);
		expect(result.onlyOriginal.examples.slice(0, 3)).toEqual(['ε', 'a', 'b']);
		expect(result.onlyRewritten).toEqual({ count: 1, examples: ['c'] });
	});

	it('reads the second grammar as EBNF and the first as BNF', () => {
		// In BNF the braces are terminals.
		const result = compareTexts(request('S → 1 { 0 }', 'S → 1 { 0 }', 4));
		expect(result).toMatchObject({
			status: 'done',
			onlyOriginal: { count: 1, examples: ['1 { 0 }'] },
			onlyRewritten: { count: 4, examples: ['1', '1 0', '1 0 0', '1 0 0 0'] }
		});
	});

	it('has nothing to compare while a grammar is missing or has errors', () => {
		expect(compareTexts(request('', 'S → a'))).toEqual({ status: 'none' });
		expect(compareTexts(request('S → a', '  '))).toEqual({ status: 'none' });
		expect(compareTexts(request('S →', 'S → a'))).toEqual({ status: 'none' });
		expect(compareTexts(request('S → a', 'S → { a'))).toEqual({ status: 'none' });
		expect(compareSummary({ status: 'none' })).toEqual({
			same: null,
			text: 'The grammars are compared once both are free of errors.'
		});
	});

	it('keeps the length within bounds', () => {
		expect(compareTexts(request('S → a', 'S → a', 0))).toMatchObject({ maxLength: 7 });
		expect(compareTexts(request('S → a', 'S → a', 99))).toMatchObject({ maxLength: 12 });
		expect(compareTexts(request('S → a', 'S → a', 1))).toMatchObject({ maxLength: 1 });
		expect(COMPARE_LENGTH).toBe(7);
	});

	it('says so when the languages are too large to list', () => {
		expect(
			compareSummary({
				status: 'done',
				checkedUpTo: 0,
				maxLength: 7,
				onlyOriginal: { count: 0, examples: [] },
				onlyRewritten: { count: 0, examples: [] }
			})
		).toEqual({ same: null, text: 'The grammars have too many strings to compare.' });
		expect(
			compareSummary({
				status: 'done',
				checkedUpTo: 1,
				maxLength: 7,
				onlyOriginal: { count: 0, examples: [] },
				onlyRewritten: { count: 0, examples: [] }
			}).text
		).toBe('Both grammars generate the same strings of up to 1 token.');
	});
});

describe('sameRequest', () => {
	it('compares the grammars and the length', () => {
		const a = request('S → a', 'S → a');
		expect(sameRequest(a, { ...a })).toBe(true);
		expect(sameRequest(null, a)).toBe(false);
		expect(sameRequest(a, { ...a, rewritten: 'S → b' })).toBe(false);
		expect(sameRequest(a, { ...a, original: 'S → b' })).toBe(false);
		expect(sameRequest(a, { ...a, maxLength: 3 })).toBe(false);
	});
});
