/**
 * What the page computes on the main thread for every keystroke is parsing
 * and the bounded list of trees. Listing a language throws here: comparing
 * two grammars is left to the worker computation (compare.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { compareTexts } from './compare';
import { buildCascade } from './cascade';
import { analyzeDeclarations, analyzeRewrite, leftmostChain, listTrees, readSource } from './model';
import { presetFor, presets, presetState } from './presets';

vi.mock('$lib/theory/grammar', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/theory/grammar')>();
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		...real,
		compareGrammars: off('compareGrammars'),
		enumerateLanguage: off('enumerateLanguage')
	};
});

describe('the page on the main thread', () => {
	it('computes every view of every preset without listing a language', () => {
		for (const preset of presets) {
			const state = presetState(preset);
			const source = readSource(state);
			const original = listTrees(source.grammar!, source);
			expect(original.trees.length).toBeGreaterThan(0);
			for (const entry of original.trees) leftmostChain(source.grammar!, entry.tree);
			const rewrite = analyzeRewrite(source, original, state.rewrite);
			expect(rewrite.empty).toBe(state.rewrite === '');
			expect(analyzeDeclarations(source.grammar!, source, original, state.decls).problems).toEqual(
				[]
			);
			expect(buildCascade(state.levels, state.atoms).grammar).not.toBeNull();
			expect(presetFor(state)).toBe(preset);
		}
	});

	it('leaves the comparison to the worker computation', () => {
		const state = presetState(presets.find((p) => p.id === 'cascade')!);
		expect(() =>
			compareTexts({ original: state.grammar, rewritten: state.rewrite, maxLength: 5 })
		).toThrow(/compareGrammars ran on the main thread/);
		// Nothing to compare: answered at once, also on the page's first render.
		expect(compareTexts({ original: state.grammar, rewritten: '', maxLength: 9 })).toEqual({
			status: 'none'
		});
	});
});
