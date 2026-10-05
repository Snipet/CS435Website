import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import type { LinkStates } from '$lib/tools/links';
import { DEFAULT_PRESET_ID, presetState, presets } from './presets';
import { DEFAULT_STATE, isRdHash, stateFromHash, type RdState } from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['rd-backtracking'] = { grammar: 'S → a S | ε', input: 'a a' };
		expect(isRdHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			grammar: 'S → a S | ε',
			input: 'a a',
			tab: 'backtracking',
			numbers: false,
			anyway: false,
			step: null,
			fstep: null
		});
		const bare: LinkStates['rd-backtracking'] = { grammar: 'S → a' };
		expect(isRdHash(bare)).toBe(true);
		expect(stateFromHash(bare).input).toBe('');
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: RdState = {
			grammar: 'S → S 0 | 1',
			input: '1 0',
			tab: 'functions',
			numbers: true,
			anyway: true,
			step: 3,
			fstep: 0
		};
		expect(isRdHash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(isRdHash({ ...DEFAULT_STATE })).toBe(true);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
		expect(isRdHash({ grammar: 'S → a', other: 1 })).toBe(true);
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
			{ grammar: 'S → a', tab: 'code' },
			{ grammar: 'S → a', numbers: 'yes' },
			{ grammar: 'S → a', anyway: 1 },
			{ grammar: 'S → a', step: -1 },
			{ grammar: 'S → a', step: 1.5 },
			{ grammar: 'S → a', fstep: '2' }
		])
			expect(isRdHash(bad)).toBe(false);
	});

	it('round-trips through the hash', () => {
		const saved: RdState = { ...DEFAULT_STATE, tab: 'functions', fstep: 13, numbers: true };
		expect(decode(encode(saved), isRdHash)).toEqual(saved);
		expect(decode(encode({ grammar: 'E → T' }), isRdHash)).toEqual({ grammar: 'E → T' });
		expect(decode(encode({ re: 'a' }), isRdHash)).toBeNull();
	});

	it('starts on Example 1, at the first step', () => {
		const p = presets.find((x) => x.id === DEFAULT_PRESET_ID)!;
		expect(DEFAULT_STATE).toEqual({
			grammar: p.value.grammar,
			input: p.value.input,
			tab: p.value.tab,
			numbers: false,
			anyway: false,
			step: 0,
			fstep: 0
		});
		expect(DEFAULT_STATE).toEqual(presetState(p));
	});

	it('shows the last step for a link without one', () => {
		// A link from another tool, and a saved view left on the last step.
		expect(stateFromHash({ grammar: 'S → a', input: 'a' })).toMatchObject({
			step: null,
			fstep: null
		});
		const saved = decode(encode({ ...DEFAULT_STATE, step: null, fstep: null }), isRdHash)!;
		expect(stateFromHash(saved)).toMatchObject({ step: null, fstep: null });
		// The first step is a step like any other.
		expect(stateFromHash(decode(encode(DEFAULT_STATE), isRdHash)!)).toEqual(DEFAULT_STATE);
	});
});
