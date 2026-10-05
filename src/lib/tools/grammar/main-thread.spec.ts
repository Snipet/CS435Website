/**
 * What the Context-Free Grammars page computes on the main thread for every
 * keystroke never runs the Earley parser: every Earley function throws here,
 * and the page's own calls still succeed, also on a large grammar.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	parseGrammar,
	sentenceLengths,
	tokenizeInput,
	treeFromDerivation
} from '$lib/theory/grammar';
import {
	allowedPositions,
	bothDerivations,
	chainOf,
	currentForm,
	describeLastStep,
	freshPaths,
	frontier,
	kindLabel,
	replay
} from './builder';
import { applyPreset, presets } from './presets';
import { randomSentence } from './random';
import { regularNfa } from './regular';
import { blankState, type GrammarToolState } from './state';
import { chomskyOf, tupleOf } from './tuple';
import { computeCheck, computeLanguage } from './views';

vi.mock('$lib/theory/grammar/earley', () => {
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		DEFAULT_MAX_STEPS: 10_000_000,
		recognizes: off('recognizes'),
		parseTrees: off('parseTrees'),
		enumerateLanguage: off('enumerateLanguage'),
		compareGrammars: off('compareGrammars')
	};
});

/** Everything the page derives from its state without the worker. */
function pageWork(state: GrammarToolState) {
	const { grammar: g } = parseGrammar(state.grammar);
	if (!g) throw new Error('grammar has errors');
	const built = replay(g, state.steps);
	const tree = treeFromDerivation(g, built.derivation);
	const form = currentForm(built.derivation);
	const complete = allowedPositions(g, form, state.order).length === 0;
	return {
		tuple: tupleOf(g),
		chomsky: chomskyOf(g),
		nfa: regularNfa(g),
		size: sentenceLengths(g),
		example: randomSentence(g, 0, { maxDepth: 0 }),
		random: state.seed === null ? null : randomSentence(g, state.seed),
		chain: chainOf(g, built.derivation),
		kind: kindLabel(g, built.derivation),
		leaves: frontier(tree),
		fresh: freshPaths(g, built.derivation),
		spoken: describeLastStep(g, built.derivation),
		both: complete && built.pairs.length > 0 ? bothDerivations(g, built.derivation) : null,
		input: tokenizeInput(state.input, g.terminals, { nonterminals: g.nonterminals }),
		tests: state.tests.map((t) => tokenizeInput(t, g.terminals))
	};
}

describe('the page on the main thread', () => {
	it.each(presets.map((p) => [p.id, p] as const))(
		'%s: parsing, the four-tuple, the builder and the random sentence need no Earley parser',
		(_, p) => {
			const work = pageWork(applyPreset(p, blankState()));
			expect(work.tuple.productions.length).toBeGreaterThan(0);
			expect(work.chain.forms.length).toBe(work.chain.steps.length + 1);
			expect(work.example.ok).toBe(true);
		}
	);

	it('leaves membership and the sentences of L(G) to the worker computation', () => {
		const grammar = presets[0].value.grammar;
		expect(() => computeCheck({ kind: 'check', grammar, input: 'int', tests: [] })).toThrow(
			/ran on the main thread/
		);
		expect(() => computeLanguage({ kind: 'language', grammar, maxLength: 3 })).toThrow(
			/ran on the main thread/
		);
	});

	it('follows keystrokes on a grammar of 2000 productions', () => {
		// A regular grammar: each non-terminal reads a digit and moves on, or stops.
		const n = 1000;
		const lines = Array.from(
			{ length: n },
			(_, i) => `A${i} → ${i % 10} A${(i + 1) % n} | ${i % 10}`
		);
		const state: GrammarToolState = {
			...blankState(),
			grammar: lines.join('\n'),
			input: '0 1 2 3',
			tests: ['0', '0 1'],
			steps: Array.from({ length: 150 }, (_, i) => [i, 2 * i] as [number, number]),
			seed: 5
		};
		const start = performance.now();
		const work = pageWork(state);
		const elapsed = performance.now() - start;
		expect(work.tuple.productions).toHaveLength(2 * n);
		expect(work.chomsky.type).toBe(3);
		expect(work.nfa.ok).toBe(true);
		expect(work.chain.forms).toHaveLength(151);
		expect(work.random?.ok).toBe(true);
		// One keystroke's worth of work; generous for slow CI machines.
		expect(elapsed).toBeLessThan(1500);
	});
});
