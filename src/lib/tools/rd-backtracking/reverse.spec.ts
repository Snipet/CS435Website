import { describe, expect, it } from 'vitest';
import { parseGrammar } from '$lib/theory/grammar';
import { canReverse, reverseAlternatives } from './reverse';

const productions = (text: string): string[] =>
	parseGrammar(text).grammar!.productions.map((p) => `${p.lhs} → ${p.rhs.join(' ') || 'ε'}`);

describe('reverseAlternatives (Top-Down Parsing, slide 17: "Same grammar, different order")', () => {
	it('reverses the alternatives of every non-terminal', () => {
		const text = 'E → T | T + E\nT → int | int * T | ( E )';
		expect(reverseAlternatives(text)).toBe('E → T + E | T\nT → ( E ) | int * T | int');
		expect(canReverse(text)).toBe(true);
	});

	it('gives the text back when applied twice', () => {
		for (const text of [
			'E → T | T + E\nT → int | int * T | ( E )',
			'S → 1 | S 0',
			'S → a S | ε',
			'E -> T+E | T   // sums\n  | ( E )\nT → int'
		])
			expect(reverseAlternatives(reverseAlternatives(text)!)).toBe(text);
	});

	it('keeps the layout, the comments and the order of the non-terminals', () => {
		const text = '// expressions\nE → T + E   /* sum */\n  | T\nT → int\nE → ( E )';
		const reversed = reverseAlternatives(text)!;
		expect(reversed).toBe('// expressions\nE → ( E )   /* sum */\n  | T\nT → int\nE → T + E');
		expect(productions(reversed)).toEqual(['E → ( E )', 'E → T', 'T → int', 'E → T + E']);
	});

	it('keeps the same set of productions', () => {
		const text = 'S → A b | c | ε\nA → a A | "x y" | d';
		const sorted = (list: string[]) => [...list].sort();
		expect(sorted(productions(reverseAlternatives(text)!))).toEqual(sorted(productions(text)));
		expect(productions(reverseAlternatives(text)!)).toEqual([
			'S → ε',
			'S → c',
			'S → A b',
			'A → d',
			'A → x y',
			'A → a A'
		]);
	});

	it('has nothing to do when every non-terminal has one alternative', () => {
		expect(reverseAlternatives('S → a S b')).toBe('S → a S b');
		expect(canReverse('S → a S b')).toBe(false);
		expect(canReverse('S → a | a')).toBe(false);
	});

	it('is null for text that is not a grammar', () => {
		expect(reverseAlternatives('')).toBeNull();
		expect(reverseAlternatives('E T')).toBeNull();
		expect(reverseAlternatives('E → T |')).toBeNull();
		expect(canReverse('E → T |')).toBe(false);
	});
});
