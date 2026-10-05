import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import {
	DEFAULT_MAX_LENGTH,
	MAX_LENGTH_LIMIT,
	MAX_STEPS,
	MAX_TESTS,
	blankState,
	isGrammarHash,
	stateFromHash,
	type GrammarToolState,
	type StepPair
} from './state';

describe('Context-Free Grammars URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['grammar'] = { grammar: 'E → E + E | int' };
		expect(isGrammarHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({ ...blankState(), grammar: 'E → E + E | int' });

		const withInput: LinkStates['grammar'] = { grammar: 'S → ( S ) | ε', input: '( ( ) )' };
		expect(isGrammarHash(withInput)).toBe(true);
		expect(stateFromHash(withInput)).toMatchObject({
			grammar: 'S → ( S ) | ε',
			input: '( ( ) )',
			steps: [],
			tests: [],
			order: 'any',
			maxLength: DEFAULT_MAX_LENGTH,
			seed: null,
			preset: null
		});
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: GrammarToolState = {
			grammar: 'E → int\nE → E + E',
			input: 'int + int',
			tests: ['int', ''],
			order: 'leftmost',
			steps: [
				[0, 1],
				[0, 0]
			],
			lm: true,
			rm: false,
			maxLength: 7,
			seed: 4_000_000_000,
			preset: 'rewrite-rules'
		};
		expect(isGrammarHash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(isGrammarHash({ ...saved, other: 1 })).toBe(true);
		expect(isGrammarHash({ ...saved, seed: null, preset: null })).toBe(true);
	});

	it('rejects values of the wrong shape', () => {
		const ok = { grammar: 'S → a' };
		for (const bad of [
			null,
			'S → a',
			[],
			{},
			{ grammar: 1 },
			{ ...ok, input: 2 },
			{ ...ok, tests: 'a' },
			{ ...ok, tests: ['a', 1] },
			{ ...ok, order: 'middle' },
			{ ...ok, steps: [[0]] },
			{ ...ok, steps: [[0, -1]] },
			{ ...ok, steps: [[0.5, 1]] },
			{ ...ok, steps: [['0', 1]] },
			{ ...ok, steps: [[0, 1, 2]] },
			{ ...ok, steps: 'none' },
			{ ...ok, lm: 1 },
			{ ...ok, rm: 'yes' },
			{ ...ok, maxLength: '5' },
			{ ...ok, maxLength: Infinity },
			{ ...ok, seed: -1 },
			{ ...ok, seed: 1.5 },
			{ ...ok, seed: 2 ** 32 },
			{ ...ok, preset: 3 }
		])
			expect(isGrammarHash(bad), JSON.stringify(bad)).toBe(false);
	});

	it('clamps what a link carries', () => {
		const steps = Array.from({ length: MAX_STEPS + 20 }, (): StepPair => [0, 0]);
		const tests = Array.from({ length: MAX_TESTS + 5 }, (_, i) => `a${i}`);
		const state = stateFromHash({ grammar: 'S → S | a', steps, tests, maxLength: 99 });
		expect(state.steps).toHaveLength(MAX_STEPS);
		expect(state.tests).toHaveLength(MAX_TESTS);
		expect(state.maxLength).toBe(MAX_LENGTH_LIMIT);
		expect(stateFromHash({ grammar: 'S → a', maxLength: -3 }).maxLength).toBe(0);
		expect(stateFromHash({ grammar: 'S → a', maxLength: 4.4 }).maxLength).toBe(4);
	});

	it('copies the steps, so a loaded value is not shared with the state', () => {
		const steps: StepPair[] = [[0, 0]];
		const state = stateFromHash({ grammar: 'S → a', steps });
		expect(state.steps).toEqual(steps);
		expect(state.steps[0]).not.toBe(steps[0]);
	});

	it('round-trips through the hash', () => {
		const saved: GrammarToolState = {
			...blankState(),
			grammar: 'Sentence → NounPhrase VerbPhrase\nNoun → "the cat"',
			input: '"the cat" sat',
			steps: [[0, 0]],
			seed: 2
		};
		expect(decode(encode(saved), isGrammarHash)).toEqual(saved);
	});
});
