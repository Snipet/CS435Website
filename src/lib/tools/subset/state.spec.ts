import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import type { LinkStates } from '$lib/tools/links';
import { MAX_RUN_INPUT } from './logic';
import { DEFAULT_PRESET } from './presets';
import { defaultState, isSubsetHash, stateFromHash, stepFromHash, type SubsetHash } from './state';

describe('defaultState', () => {
	it('loads the default preset on the regular-expression source', () => {
		const s = defaultState();
		expect(s).toMatchObject({ from: 're', re: '(1 | 0)*1', defs: '', naming: 'discovery' });
		expect(s.showEmpty).toBe(false);
		expect(s.input).toBe(DEFAULT_PRESET.value.input);
	});
});

describe('isSubsetHash', () => {
	it('accepts every LinkStates["subset"] shape', () => {
		const links: LinkStates['subset'][] = [
			{ from: 're', re: '(0 | 1)*00' },
			{ from: 're', re: 'digit+', defs: "digit = '0' | '1'" },
			{ from: 'nfa', text: 'start: A\nA 0 B\n' }
		];
		for (const l of links) {
			expect(isSubsetHash(l)).toBe(true);
			expect(decode(encode(l), isSubsetHash)).toEqual(l);
		}
	});

	it('accepts the page’s own saved state', () => {
		expect(isSubsetHash({ ...defaultState(), step: 4 })).toBe(true);
	});

	it('rejects other shapes', () => {
		for (const v of [
			null,
			[],
			'x',
			{},
			{ from: 're' },
			{ from: 'nfa', re: 'a' },
			{ from: 'dfa', text: 'x' },
			{ from: 're', re: 3 }
		])
			expect(isSubsetHash(v)).toBe(false);
	});
});

describe('stateFromHash', () => {
	const base = { ...defaultState(), text: 'start: X\n', defs: 'd = 0' };

	it('opens a regular-expression link, keeping the NFA text for later', () => {
		const s = stateFromHash(base, { from: 're', re: '(0 | 1)*00' });
		expect(s).toMatchObject({ from: 're', re: '(0 | 1)*00', defs: '', text: 'start: X\n' });
		expect(stateFromHash(base, { from: 're', re: 'd', defs: 'd = 1' }).defs).toBe('d = 1');
	});

	it('opens an NFA link, keeping the regular expression', () => {
		const s = stateFromHash(base, { from: 'nfa', text: 'start: A\n' });
		expect(s).toMatchObject({ from: 'nfa', text: 'start: A\n', re: base.re, defs: 'd = 0' });
	});

	it('restores saved options and ignores fields of the wrong type', () => {
		const saved = {
			...defaultState(),
			naming: 'numbered',
			showEmpty: true,
			tab: 'blowup',
			predict: true,
			input: '0110',
			k: 5,
			seeds: [4, 9]
		} as SubsetHash;
		expect(stateFromHash(base, saved)).toMatchObject({
			naming: 'numbered',
			showEmpty: true,
			tab: 'blowup',
			predict: true,
			input: '0110',
			k: 5,
			seeds: [4, 9]
		});
		const junk = {
			from: 're',
			re: 'a',
			naming: 'fancy',
			showEmpty: 'yes',
			tab: 'other',
			k: 99,
			seeds: [1, -2, 'x', 2.5],
			input: 'x'.repeat(500)
		} as unknown as SubsetHash;
		const s = stateFromHash(base, junk);
		expect(s).toMatchObject({ naming: base.naming, showEmpty: false, tab: base.tab, k: base.k });
		expect(s.seeds).toEqual([1]);
		expect(s.input).toHaveLength(MAX_RUN_INPUT);
	});

	it('reads the step, or null for the finished construction', () => {
		expect(stepFromHash({ from: 're', re: 'a', step: 3 })).toBe(3);
		expect(stepFromHash({ from: 're', re: 'a' })).toBeNull();
		expect(stepFromHash({ from: 're', re: 'a', step: -1 })).toBeNull();
	});
});
