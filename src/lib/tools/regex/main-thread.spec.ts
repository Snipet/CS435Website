/**
 * What the Regular Expressions page computes on the main thread for every
 * keystroke is parsing only: every automaton construction throws here, and
 * the page's own calls still succeed on a large expression.
 */
import { describe, expect, it, vi } from 'vitest';
import { analyzeExpression, parseCompare, thompsonState, type ExpressionInput } from './analysis';
import { languageBlocked, structureBlocked } from './messages';
import { computeViews } from './views';

vi.mock('$lib/theory/automata', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/theory/automata')>();
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		...real,
		thompson: off('thompson'),
		subsetConstruction: off('subsetConstruction'),
		minimize: off('minimize'),
		compareLanguages: off('compareLanguages'),
		enumerate: off('enumerate'),
		ClosureIndex: class {
			constructor() {
				off('ClosureIndex')();
			}
		}
	};
});

// L(R) needs a DFA with 2¹¹ states.
const input: ExpressionInput = {
	re: '(a|b)*a(a|b)^{10}',
	defs: '',
	dialect: 'lecture',
	alphabet: ''
};
const compare = '(a|b)*a(a|b)^{9}';

describe('the page on the main thread', () => {
	it('parses a large expression without building an automaton', () => {
		const start = performance.now();
		for (let i = 0; i < 20; i++) {
			const typed = analyzeExpression(input, { build: false });
			const r2 = parseCompare(typed, compare);
			expect(typed.re.regex).not.toBeNull();
			expect(typed.language).toBeNull();
			expect(r2?.regex).not.toBeNull();
			expect(structureBlocked(input.re, typed)).toBeNull();
			expect(languageBlocked(input.re, { ...typed, language: null })).toBeNull();
			expect(thompsonState(input, typed)).toEqual({ re: input.re });
		}
		// Twenty keystrokes' worth of parsing; generous for slow CI machines.
		expect(performance.now() - start).toBeLessThan(250);
	});

	it('leaves the automata to the worker computation', () => {
		expect(() =>
			computeViews({ ...input, compare, tests: ['ab'], maxLength: 6, node: [] })
		).toThrow(/ran on the main thread/);
	});
});
