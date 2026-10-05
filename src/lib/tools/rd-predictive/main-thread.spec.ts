/**
 * What the page computes on the main thread for every keystroke is parsing,
 * the rewrite, the prediction analysis, the generated code and the two runs,
 * each bounded by the size of the text or by a step limit. Listing a language
 * throws here: comparing two grammars is left to the worker computation
 * (compare.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { compareTexts } from './compare';
import { readAst, readInput, readParser, readSource, runParser } from './model';
import { presetFor, presetState, presets } from './presets';
import { DEFAULT_MAX_STEPS } from './run';
import { describeStep, forestAt, outcomeText, stackRows, tokenHighlights } from './view';

vi.mock('$lib/theory/grammar', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/theory/grammar')>();
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		...real,
		compareGrammars: off('compareGrammars'),
		enumerateLanguage: off('enumerateLanguage'),
		parseTrees: off('parseTrees'),
		recognizes: off('recognizes')
	};
});

describe('the page on the main thread', () => {
	it('computes every view of every preset without listing a language', () => {
		for (const preset of presets) {
			const state = presetState(preset);
			const source = readSource(state.grammar, state);
			const parser = readParser(state.ebnf ?? source.rewrite!.text);
			const input = readInput(state.input, parser.ebnf!);
			const run = runParser(parser, input)!;
			const ast = readAst(parser, input, state.ast)!;
			for (const result of [run, ast.run]) {
				if (!result) continue;
				expect(result.steps.length).toBeLessThan(DEFAULT_MAX_STEPS);
				result.steps.forEach((_, i) => {
					describeStep(result, i);
					tokenHighlights(result, i);
					stackRows(result, i);
					forestAt(result, i);
				});
				outcomeText(result);
			}
			expect(presetFor(state)).toBe(preset);
		}
	});

	it('leaves the comparison of two grammars to the worker', () => {
		expect(() =>
			compareTexts({ original: 'S → 1 | S 0', rewritten: 'S → 1 { 0 }', maxLength: 7 })
		).toThrow('compareGrammars ran on the main thread');
		// Without two grammars there is nothing to list.
		expect(compareTexts({ original: 'S → 1 | S 0', rewritten: '', maxLength: 7 })).toEqual({
			status: 'none'
		});
	});

	it('stops a run of any length at the step limit', () => {
		const parser = readParser('S → { a }');
		const input = readInput(Array.from({ length: 15000 }, () => 'a').join(' '), parser.ebnf!);
		const run = runParser(parser, input)!;
		expect(run.outcome).toBe('limit');
		expect(run.steps).toHaveLength(DEFAULT_MAX_STEPS + 1);
		expect(outcomeText(run)).toEqual({
			tone: 'warn',
			title: 'Stopped after 20000 steps',
			lines: []
		});
		expect(describeStep(run, run.steps.length - 1).detail).toBe(
			'The run is longer than this page follows.'
		);
	});
});
