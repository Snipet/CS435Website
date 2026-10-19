import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { presetState, presets } from './presets';
import { MAX_RANGE } from './range';
import { DEFAULT_GRAMMAR, DEFAULT_STATE, isLr1Hash, stateFromHash, type Lr1State } from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['lr1'] = { grammar: 'S → ε | id S', input: 'id id' };
		expect(isLr1Hash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			...DEFAULT_STATE,
			grammar: 'S → ε | id S',
			input: 'id id'
		});
		const bare: LinkStates['lr1'] = { grammar: 'S → a' };
		expect(isLr1Hash(bare)).toBe(true);
		expect(stateFromHash(bare).input).toBe('');
		// The conflicts tool's shape has one more field, which is ignored.
		const conflicts: LinkStates['conflicts'] = {
			grammar: 'E → E + E | int',
			precedence: "%left '+'"
		};
		expect(isLr1Hash(conflicts)).toBe(true);
		expect(stateFromHash(conflicts as never)).not.toHaveProperty('precedence');
	});

	it('accepts its own saved shape', () => {
		const saved: Lr1State = {
			grammar: 'E → int | E + ( E )',
			input: 'int + ( int )',
			order: 'reversed',
			method: 'lalr1',
			items: 'full',
			view: 'circles',
			range: [3, 7],
			closure: 'transition',
			seed: 'E → E + ( •E ), +',
			from: 3,
			symbol: '(',
			closureStep: 4,
			buildStep: 0,
			parseStep: 12
		};
		expect(isLr1Hash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
	});

	it('rejects values of the wrong shape', () => {
		for (const bad of [
			null,
			'E → int',
			[],
			{},
			{ input: 'int' },
			{ grammar: 1 },
			{ grammar: 'S → a', input: 2 },
			{ grammar: 'S → a', order: 'sorted' },
			{ grammar: 'S → a', method: 'lr2' },
			{ grammar: 'S → a', items: 'merged' },
			{ grammar: 'S → a', view: 'table' },
			{ grammar: 'S → a', range: [5, 3] },
			{ grammar: 'S → a', range: [1] },
			{ grammar: 'S → a', range: [-1, 3] },
			{ grammar: 'S → a', closure: 'goto' },
			{ grammar: 'S → a', seed: 3 },
			{ grammar: 'S → a', from: -1 },
			{ grammar: 'S → a', from: 1.5 },
			{ grammar: 'S → a', symbol: null },
			{ grammar: 'S → a', closureStep: -1 },
			{ grammar: 'S → a', buildStep: '2' },
			{ grammar: 'S → a', parseStep: 0.5 }
		])
			expect(isLr1Hash(bad), JSON.stringify(bad)).toBe(false);
	});

	it('cuts a range to the most states drawn at once', () => {
		expect(stateFromHash({ grammar: 'S → a', range: [0, 10_000_000] }).range).toEqual([
			0,
			MAX_RANGE - 1
		]);
		expect(stateFromHash({ grammar: 'S → a', range: [340, 371] }).range).toEqual([340, 371]);
		expect(stateFromHash({ grammar: 'S → a', range: [7, 7] }).range).toEqual([7, 7]);
	});

	it('survives the trip through the URL hash', () => {
		for (const p of presets) {
			const state = presetState(p);
			const back = decode(encode(state), isLr1Hash);
			expect(back).not.toBeNull();
			expect(stateFromHash(back!)).toEqual(state);
		}
	});

	it('opens on the grammar of Bottom-up Parsing II with every stepper at its end', () => {
		expect(DEFAULT_GRAMMAR).toBe('E → E + ( E ) | int');
		expect(DEFAULT_STATE).toMatchObject({
			method: 'lr1',
			order: 'grammar',
			range: null,
			closureStep: null,
			buildStep: null,
			parseStep: null
		});
	});
});
