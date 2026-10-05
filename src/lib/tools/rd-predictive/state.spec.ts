import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { presetState, presets } from './presets';
import {
	DEFAULT_GRAMMAR,
	DEFAULT_STATE,
	isPredictiveHash,
	stateFromHash,
	type PredictiveState
} from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['rd-predictive'] = { grammar: 'S → 1 | S 0', input: '1 0' };
		expect(isPredictiveHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			grammar: 'S → 1 | S 0',
			input: '1 0',
			form: 'ebnf',
			order: 'written',
			ebnf: null,
			step: null,
			ast: null,
			astStep: null
		});
		const bare: LinkStates['rd-predictive'] = { grammar: 'S → a' };
		expect(isPredictiveHash(bare)).toBe(true);
		expect(stateFromHash(bare).input).toBe('');
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: PredictiveState = {
			grammar: 'S → A a | d\nA → S b',
			input: 'd b a $',
			form: 'bnf',
			order: 'reversed',
			ebnf: 'S → d { b a }',
			step: 3,
			ast: 'recursion',
			astStep: 0
		};
		expect(isPredictiveHash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(isPredictiveHash({ ...DEFAULT_STATE })).toBe(true);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
		expect(isPredictiveHash({ grammar: 'S → a', other: 1 })).toBe(true);
		expect(stateFromHash({ grammar: 'S → a', other: 1 } as never)).not.toHaveProperty('other');
	});

	it('rejects values of the wrong shape', () => {
		for (const bad of [
			null,
			'S → a',
			[],
			{},
			{ input: 'a' },
			{ grammar: 1 },
			{ grammar: 'S → a', input: 2 },
			{ grammar: 'S → a', form: 'primed' },
			{ grammar: 'S → a', order: 'sorted' },
			{ grammar: 'S → a', ebnf: 3 },
			{ grammar: 'S → a', ast: 'left' },
			{ grammar: 'S → a', step: -1 },
			{ grammar: 'S → a', step: 1.5 },
			{ grammar: 'S → a', astStep: '2' }
		])
			expect(isPredictiveHash(bad), JSON.stringify(bad)).toBe(false);
	});

	it('survives the trip through the URL hash', () => {
		for (const p of presets) {
			const state = presetState(p);
			const back = decode(encode(state), isPredictiveHash);
			expect(back).not.toBeNull();
			expect(stateFromHash(back!)).toEqual(state);
		}
	});

	it('opens on the grammar of slide 38 with the runs at their end', () => {
		expect(DEFAULT_GRAMMAR).toBe('E → E + T | T\nT → T * F | F\nF → ( E ) | int');
		expect(DEFAULT_STATE).toEqual({
			grammar: DEFAULT_GRAMMAR,
			input: 'int + int * int',
			form: 'ebnf',
			order: 'written',
			ebnf: null,
			step: null,
			ast: null,
			astStep: null
		});
	});
});
