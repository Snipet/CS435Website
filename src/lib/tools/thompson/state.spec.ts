import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import type { LinkStates } from '$lib/tools/links';
import { DEFAULT_STATE, isThompsonHash, stateFromHash } from './state';

describe('Thompson URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['thompson'] = { re: '(1 | 0)*1' };
		expect(isThompsonHash(link)).toBe(true);
		expect(isThompsonHash({ re: 'digit+', defs: "digit = '0' | … | '9'" })).toBe(true);
		expect(stateFromHash(link)).toEqual({ re: '(1 | 0)*1', defs: '', step: null });
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		expect(isThompsonHash({ ...DEFAULT_STATE, step: 3 })).toBe(true);
		expect(isThompsonHash({ ...DEFAULT_STATE, step: null })).toBe(true);
		expect(isThompsonHash({ re: 'a', other: 1 })).toBe(true);
		expect(stateFromHash({ re: 'a', defs: 'x = b', step: 2 })).toEqual({
			re: 'a',
			defs: 'x = b',
			step: 2
		});
	});

	it('rejects values of the wrong shape', () => {
		for (const bad of [
			null,
			'a',
			[],
			{},
			{ re: 1 },
			{ re: 'a', defs: 2 },
			{ re: 'a', step: -1 },
			{ re: 'a', step: 1.5 },
			{ re: 'a', step: '2' }
		])
			expect(isThompsonHash(bad)).toBe(false);
	});

	it('round-trips through the hash', () => {
		const saved = { re: "'if' | 'then'", defs: '', step: 4 };
		expect(decode(encode(saved), isThompsonHash)).toEqual(saved);
	});
});
