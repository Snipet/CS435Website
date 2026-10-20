import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { presetState, presets } from './presets';
import {
	DEFAULT_STATE,
	MAX_CHOICES,
	isConflictsHash,
	stateFromHash,
	withChoice,
	type ConflictsState
} from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['conflicts'] = {
			grammar: 'E → E + E | int',
			input: 'int + int',
			precedence: "%left '+'"
		};
		expect(isConflictsHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			grammar: 'E → E + E | int',
			input: 'int + int',
			precedence: "%left '+'",
			items: 'partial',
			choices: []
		});
		const bare: LinkStates['conflicts'] = { grammar: 'S → a' };
		expect(isConflictsHash(bare)).toBe(true);
		expect(stateFromHash(bare)).toMatchObject({ input: '', precedence: '', choices: [] });
		// A link can open a preset with its other parse.
		const ambiguous = presets.find((p) => p.id === 'ambiguous')!.value;
		const other: LinkStates['conflicts'] = {
			grammar: ambiguous.grammar,
			input: ambiguous.input,
			choices: ambiguous.choices
		};
		expect(isConflictsHash(other)).toBe(true);
		expect(stateFromHash(other)).toEqual(presetState({ value: ambiguous }));
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: ConflictsState = {
			grammar: 'S → ε | id | id S',
			input: 'id',
			precedence: '',
			items: 'full',
			choices: [[0, 1]]
		};
		expect(isConflictsHash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
		expect(isConflictsHash({ grammar: 'S → a', other: 1 })).toBe(true);
		expect(stateFromHash({ grammar: 'S → a', other: 1 } as never)).not.toHaveProperty('other');
	});

	it('rejects values of the wrong shape', () => {
		for (const bad of [
			null,
			'S → a',
			[],
			{},
			{ grammar: 1 },
			{ grammar: 'S → a', input: 2 },
			{ grammar: 'S → a', precedence: ['%left a'] },
			{ grammar: 'S → a', items: 'all' },
			{ grammar: 'S → a', choices: [[0, 2]] },
			{ grammar: 'S → a', choices: [[-1, 0]] },
			{ grammar: 'S → a', choices: [[0.5, 0]] },
			{ grammar: 'S → a', choices: [[0]] },
			{ grammar: 'S → a', choices: 'none' },
			{ grammar: 'S → a', choices: Array.from({ length: MAX_CHOICES + 1 }, (_, i) => [i, 0]) }
		])
			expect(isConflictsHash(bad), JSON.stringify(bad)?.slice(0, 60)).toBe(false);
	});

	it('round-trips every preset through the hash', () => {
		for (const p of presets) {
			const state = presetState(p);
			const back = decode(encode(state));
			expect(isConflictsHash(back)).toBe(true);
			expect(stateFromHash(back as never)).toEqual(state);
		}
	});
});

describe('withChoice', () => {
	it('sets, replaces and removes the choice for a conflict, in conflict order', () => {
		const one = withChoice([], 3, 1);
		expect(one).toEqual([[3, 1]]);
		const two = withChoice(one, 1, 0);
		expect(two).toEqual([
			[1, 0],
			[3, 1]
		]);
		expect(withChoice(two, 3, 0)).toEqual([
			[1, 0],
			[3, 0]
		]);
		expect(withChoice(two, 1, null)).toEqual([[3, 1]]);
		expect(two).toEqual([
			[1, 0],
			[3, 1]
		]);
	});
});
