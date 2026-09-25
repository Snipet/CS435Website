import { describe, expect, it } from 'vitest';
import { presetById, presets } from './presets';
import {
	MAX_INPUT,
	MAX_MATRIX_CELLS,
	advance,
	clip,
	describeStep,
	matrixColumns,
	matrixLength,
	prefixesAt,
	quoteShort,
	rulesMatching,
	runScan,
	type LexRun,
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
		expect(matrixLength(ctx.run.steps[0], false)).toBe(4);
	});

	it('with no rules, the Error rule still gets the x1 column', () => {
		const spec = buildSpec('', []);
		const run = runScan(spec, 'ab', true);
		const step = run.steps[0];
		expect(step.maxLen).toBe(0);
		expect(run.tokens[0]).toMatchObject({ name: 'Error', lexeme: 'a' });
		expect(matrixLength(step, true)).toBe(1);
		expect(prefixesAt(run.text, step, matrixLength(step, true))).toEqual(['a']);
		expect(matrixColumns(matrixLength(step, true), 1)).toEqual([{ kind: 'len', len: 1 }]);
		expect(matrixLength(runScan(spec, 'ab', false).steps[0], false)).toBe(0);
		expect(prefixesAt('ab', step, 5)).toEqual(['a', 'ab']);
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
		expect(run.limit).toBe('length');
		expect(run.tokens[0].lexeme).toHaveLength(MAX_INPUT);
	});

	describe('the read-ahead budget', () => {
		// 'a'* 'b' stays viable to the end of "aaa…", so every step reads the rest.
		const spec = buildSpec('', [
			{ name: 'AB', re: "'a'* 'b'" },
			{ name: 'A', re: "'a'" }
		]);
		const cells = (run: LexRun) =>
			run.steps.reduce((n, s) => n + s.maxLen, 0) * spec.tokenRules.length;

		it('scans only the start of the input once the tables would pass the cap', () => {
			const run = runScan(spec, 'a'.repeat(MAX_INPUT), false);
			expect(run.limit).toBe('matrix');
			expect(run.truncated).toBe(true);
			expect(run.text.length).toBeGreaterThan(0);
			expect(run.text.length).toBeLessThan(MAX_INPUT);
			expect(cells(run)).toBeLessThanOrEqual(MAX_MATRIX_CELLS);
			expect(run.stuck).toBeNull();
			expect(run.tokens).toHaveLength(run.text.length);
			expect(run.tokens.every((t) => t.name === 'A')).toBe(true);
			// Every step reads to the end of the text that was kept.
			expect(run.steps.every((s) => s.pos + s.maxLen === run.text.length)).toBe(true);
		});

		it('keeps the steps before the cutoff', () => {
			const run = runScan(spec, 'aaaa', false, 10);
			expect(run).toMatchObject({ text: 'aa', limit: 'matrix', truncated: true, stuck: null });
			expect(run.steps.map((s) => s.maxLen)).toEqual([2, 1]);
			expect(run.tokens.map((t) => t.lexeme)).toEqual(['a', 'a']);
			expect(runScan(spec, 'aaaa', false, 20).limit).toBeNull();
		});

		it('no preset comes near it', () => {
			for (const p of presets) {
				const s = buildSpec(p.value.defs ?? '', p.value.rules);
				expect(runScan(s, p.value.input, p.value.errorRule ?? false).limit, p.id).toBeNull();
			}
		});
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
