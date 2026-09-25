import { describe, expect, it } from 'vitest';
import type { ScanToken } from '$lib/theory/automata';
import { presetById } from './presets';
import { runScan } from './scan';
import { buildSpec } from './spec';
import { describeDiff, diffTokens, stripDropped } from './strip';

const tok = (name: string, lexeme: string, skipped = false): ScanToken => ({
	rule: 0,
	name,
	lexeme,
	start: 0,
	end: lexeme.length,
	skipped,
	error: false
});

describe('stripDropped', () => {
	it('removes the lexemes of dropped rules', () => {
		const p = presetById('strip-comment')!;
		const run = runScan(buildSpec(p.value.defs ?? '', p.value.rules), p.value.input, false);
		const s = stripDropped(run);
		expect(s.text).toBe('inta2=3;');
		expect(s.removed).toEqual([
			{ start: 3, end: 4 },
			{ start: 5, end: 11 },
			{ start: 12, end: 13 },
			{ start: 14, end: 15 }
		]);
	});

	it('keeps the text after a stuck position', () => {
		const p = presetById('equals-56')!;
		const run = runScan(buildSpec(p.value.defs ?? '', p.value.rules), 'a b =5 6', false);
		expect(run.stuck).toBe(4);
		expect(stripDropped(run).text).toBe('ab=5 6');
	});
});

describe('diffTokens', () => {
	it('flags the tokens outside the longest common subsequence', () => {
		const a = [
			tok('Keyword', 'int'),
			tok('Whitespace', ' ', true),
			tok('Identifier', 'a'),
			tok('Integer', '2'),
			tok('Assign', '='),
			tok('Integer', '3'),
			tok('Semicolon', ';')
		];
		const b = [
			tok('Identifier', 'inta2'),
			tok('Assign', '='),
			tok('Integer', '3'),
			tok('Semicolon', ';')
		];
		const d = diffTokens(a, b);
		expect(d.changedA).toEqual([true, false, true, true, false, false, false]);
		expect(d.changedB).toEqual([true, false, false, false]);
		expect(d.same).toBe(false);
	});

	it('reports identical streams', () => {
		const a = [tok('ID', 'x'), tok('WS', ' ', true), tok('ID', 'y')];
		const b = [tok('ID', 'x'), tok('ID', 'y')];
		expect(diffTokens(a, b)).toEqual({
			changedA: [false, false, false],
			changedB: [false, false],
			same: true
		});
	});

	it('describes the difference in one sentence', () => {
		const a = [
			tok('Keyword', 'int'),
			tok('Identifier', 'a'),
			tok('Integer', '2'),
			tok('Semi', ';')
		];
		const b = [tok('Identifier', 'inta2'), tok('Semi', ';')];
		expect(describeDiff(a, b, diffTokens(a, b), 'paren')).toBe(
			'(Keyword, "int"), (Identifier, "a"), (Integer, "2") become (Identifier, "inta2").'
		);
		expect(describeDiff(a, a, diffTokens(a, a), 'paren')).toBe('Both give the same tokens.');
		expect(describeDiff([], b, diffTokens([], b), 'angle')).toBe(
			"Stripping first adds <Identifier,'inta2'>, <Semi,';'>."
		);
		expect(describeDiff(a, [], diffTokens(a, []), 'paren', 2)).toBe(
			'Stripping first loses (Keyword, "int"), (Identifier, "a"), 2 more.'
		);
		const one = [tok('ID', 'x')];
		const other = [tok('ID', 'y')];
		expect(describeDiff(one, other, diffTokens(one, other), 'paren')).toBe(
			'(ID, "x") becomes (ID, "y").'
		);
	});

	it('handles empty streams', () => {
		expect(diffTokens([], [tok('ID', 'x')])).toEqual({
			changedA: [],
			changedB: [true],
			same: false
		});
	});
});
