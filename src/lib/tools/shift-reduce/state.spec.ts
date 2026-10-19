import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { presetState, presets } from './presets';
import {
	DEFAULT_STATE,
	SLIDE_GRAMMAR,
	SLIDE_INPUT,
	isShiftReduceHash,
	stateFromHash,
	type ShiftReduceState
} from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['shift-reduce'] = { grammar: 'S → ε | id S', input: 'id id' };
		expect(isShiftReduceHash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			grammar: 'S → ε | id S',
			input: 'id id',
			view: 'trace',
			collapse: true,
			stacks: false,
			step: null,
			handleStep: null
		});
		const bare: LinkStates['shift-reduce'] = { grammar: 'S → a' };
		expect(isShiftReduceHash(bare)).toBe(true);
		expect(stateFromHash(bare).input).toBe('');
	});

	it('accepts a link meant for the conflicts tool, precedence and all', () => {
		const link: LinkStates['conflicts'] = {
			grammar: 'E → E + E | int',
			input: 'int + int',
			precedence: "%left '+'"
		};
		expect(isShiftReduceHash(link)).toBe(true);
		expect(stateFromHash(link as LinkStates['shift-reduce'])).not.toHaveProperty('precedence');
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: ShiftReduceState = {
			grammar: 'E → E + T | T\nT → int',
			input: 'int + int $',
			view: 'handles',
			collapse: false,
			stacks: true,
			step: 3,
			handleStep: 0
		};
		expect(isShiftReduceHash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
		expect(isShiftReduceHash({ grammar: 'S → a', other: 1 })).toBe(true);
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
			{ grammar: 'S → a', view: 'table' },
			{ grammar: 'S → a', collapse: 'yes' },
			{ grammar: 'S → a', stacks: 1 },
			{ grammar: 'S → a', step: -1 },
			{ grammar: 'S → a', step: 1.5 },
			{ grammar: 'S → a', handleStep: '2' }
		])
			expect(isShiftReduceHash(bad), JSON.stringify(bad)).toBe(false);
	});

	it('survives the trip through the URL hash', () => {
		for (const p of presets) {
			const state = presetState(p);
			const back = decode(encode(state), isShiftReduceHash);
			expect(back).not.toBeNull();
			expect(stateFromHash(back!)).toEqual(state);
		}
	});

	it('opens on the whole trace of Bottom-up Parsing II, slide 14', () => {
		expect(SLIDE_GRAMMAR).toBe('E → E + ( E ) | int');
		expect(SLIDE_INPUT).toBe('int + ( int ) + ( int )');
		expect(DEFAULT_STATE).toEqual({
			grammar: SLIDE_GRAMMAR,
			input: SLIDE_INPUT,
			view: 'trace',
			collapse: true,
			stacks: false,
			step: null,
			handleStep: null
		});
	});
});
