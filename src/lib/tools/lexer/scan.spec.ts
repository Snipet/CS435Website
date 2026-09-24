import { describe, expect, it } from 'vitest';
import { presetById } from './presets';
import {
	MAX_INPUT,
	advance,
	clip,
	describeStep,
	matrixColumns,
	prefixesAt,
	quoteShort,
	rulesMatching,
	runScan,
	type StepContext
} from './scan';
import { buildSpec } from './spec';

function context(id: string, input?: string, errorRule = false): StepContext {
	const p = presetById(id)!;
	const spec = buildSpec(p.value.defs ?? '', p.value.rules);
	const run = runScan(spec, input ?? p.value.input, errorRule);
	return { spec, run, errorRule, format: 'paren' };
}

describe('describeStep', () => {
	it('longest match with a single rule (foo+3)', () => {
		const ctx = context('foo-plus-3');
		expect(describeStep(ctx, 0)).toBe(
			'Longest match: "foo" (3 characters). Only Identifier (R3) matches it → (Identifier, "foo").'
		);
		expect(describeStep(ctx, 1)).toBe(
			'Longest match: "+" (1 character). Only \'+\' (R4) matches it → (Plus, "+").'
		);
	});

	it('ties go to the rule listed first (new foo)', () => {
		const ctx = context('new-foo');
		expect(describeStep(ctx, 0)).toBe(
			'Longest match: "new" (3 characters). \'new\' (R2) and Identifier (R4) both match "new"; R2 is listed first → (New, "new").'
		);
		expect(describeStep(ctx, 1)).toBe(
			'Longest match: " " (1 character). Only Whitespace (R1) matches it → (Whitespace, " "), which is dropped.'
		);
	});

	it('the stuck scanner and the Error rule (=56)', () => {
		expect(describeStep(context('equals-56'), 0)).toBe(
			'No prefix of "=56" matches R — the scanner is stuck at position 0.'
		);
		const ctx = context('equals-56', undefined, true);
		expect(describeStep(ctx, 0)).toBe(
			'No prefix of "=56" matches R1…R4. The Error rule (R5) matches one character → (Error, "=").'
		);
		expect(describeStep(ctx, 1)).toBe(
			'Longest match: "56" (2 characters). Only Integer (R2) matches it → (Integer, "56").'
		);
	});

	it('lists the Error rule among one-character matches', () => {
		const ctx = context('equals-56', '+', true);
		expect(describeStep(ctx, 0)).toBe(
			'Longest match: "+" (1 character). \'+\' (R4) and Error (R5) both match "+"; R4 is listed first → (Plus, "+").'
		);
	});

	it('names three or more matching rules', () => {
		const spec = buildSpec('', [
			{ name: 'A', re: "'x'" },
			{ name: 'B', re: "'x' | 'y'" },
			{ name: 'C', re: 'x*' }
		]);
		const run = runScan(spec, 'x', false);
		expect(describeStep({ spec, run, errorRule: false, format: 'angle' }, 0)).toBe(
			'Longest match: "x" (1 character). \'x\' (R1), B (R2) and C (R3) all match "x"; R1 is listed first → <A,\'x\'>.'
		);
	});

	it('is empty past the last step', () => {
		expect(describeStep(context('foo-plus-3'), 99)).toBe('');
	});
});

describe('matrix helpers', () => {
	it('prefixesAt lists x1…xi for every examined length', () => {
		const ctx = context('foo-plus-3');
		expect(prefixesAt(ctx.run.text, ctx.run.steps[0])).toEqual(['f', 'fo', 'foo', 'foo+']);
	});

	it('rulesMatching adds the Error rule at length 1', () => {
		const ctx = context('new-foo');
		expect(rulesMatching(ctx.run.steps[0], 3, false)).toEqual([1, 3]);
		expect(rulesMatching(ctx.run.steps[0], 1, true)).toEqual([3, 4]);
	});

	it('matrixColumns shows every column up to the cap', () => {
		expect(matrixColumns(4, 3)).toEqual([1, 2, 3, 4].map((len) => ({ kind: 'len', len })));
		expect(matrixColumns(0, null)).toEqual([]);
	});

	it('matrixColumns elides long runs around the chosen length', () => {
		const cols = matrixColumns(100, 50, 24);
		const lens = cols.flatMap((c) => (c.kind === 'len' ? [c.len] : []));
		expect(lens).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 47, 48, 49, 50, 51, 52, 53, 97, 98, 99, 100]);
		expect(cols.filter((c) => c.kind === 'gap')).toEqual([
			{ kind: 'gap', from: 9, to: 46 },
			{ kind: 'gap', from: 54, to: 96 }
		]);
	});
});

describe('input helpers', () => {
	it('clip cuts long inputs without splitting a surrogate pair', () => {
		expect(clip('abc', 5)).toBe('abc');
		expect(clip('abcdef', 3)).toBe('abc');
		expect(clip('ab😀', 3)).toBe('ab');
		expect(clip('x'.repeat(MAX_INPUT + 10))).toHaveLength(MAX_INPUT);
	});

	it('runScan reports truncation', () => {
		const p = presetById('foo-plus-3')!;
		const spec = buildSpec(p.value.defs ?? '', p.value.rules);
		const run = runScan(spec, 'a'.repeat(MAX_INPUT + 1), false);
		expect(run.truncated).toBe(true);
		expect(run.tokens[0].lexeme).toHaveLength(MAX_INPUT);
	});

	it('advance counts code points', () => {
		expect(advance('a😀b', 0, 2)).toBe(3);
		expect(advance('ab', 1, 5)).toBe(2);
	});

	it('quoteShort shortens long strings', () => {
		expect(quoteShort('abc')).toBe('"abc"');
		expect(quoteShort('abcdef', 3)).toBe('"abc…"');
		expect(quoteShort('a\tb')).toBe('"a\\tb"');
	});
});
