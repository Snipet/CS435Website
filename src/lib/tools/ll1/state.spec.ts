import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { presetState, presets } from './presets';
import {
	DECK_COLUMNS,
	DECK_GRAMMAR,
	DECK_ROWS,
	DEFAULT_STATE,
	isLL1Hash,
	stateFromHash,
	type LL1State
} from './state';

describe('URL state', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['ll1'] = { grammar: 'E → E + ( E ) | int', input: 'int + ( int )' };
		expect(isLL1Hash(link)).toBe(true);
		expect(stateFromHash(link)).toEqual({
			grammar: 'E → E + ( E ) | int',
			input: 'int + ( int )',
			rows: '',
			columns: '',
			names: {},
			cell: null,
			setStep: null,
			step: null,
			fill: false,
			preset: null
		});
		const bare: LinkStates['ll1'] = { grammar: 'S → a' };
		expect(isLL1Hash(bare)).toBe(true);
		expect(stateFromHash(bare).input).toBe('');
	});

	it('accepts its own saved shape, with extra fields ignored', () => {
		const saved: LL1State = {
			grammar: 'E → T + E | T\nT → int',
			input: 'int + int',
			rows: 'T E',
			columns: 'int + $',
			names: { 'E’': 'X' },
			cell: ['E', 'int'],
			setStep: 4,
			step: 0,
			fill: true,
			preset: 'fill-in'
		};
		expect(isLL1Hash(saved)).toBe(true);
		expect(stateFromHash(saved)).toEqual(saved);
		expect(isLL1Hash({ ...DEFAULT_STATE })).toBe(true);
		expect(stateFromHash({ ...DEFAULT_STATE })).toEqual(DEFAULT_STATE);
		expect(isLL1Hash({ grammar: 'S → a', other: 1 })).toBe(true);
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
			{ grammar: 'S → a', rows: ['S'] },
			{ grammar: 'S → a', columns: 3 },
			{ grammar: 'S → a', names: ['X'] },
			{ grammar: 'S → a', names: { 'S’': 1 } },
			{ grammar: 'S → a', cell: ['S'] },
			{ grammar: 'S → a', cell: ['S', 1] },
			{ grammar: 'S → a', setStep: -1 },
			{ grammar: 'S → a', step: 1.5 },
			{ grammar: 'S → a', step: '2' },
			{ grammar: 'S → a', fill: 'yes' },
			{ grammar: 'S → a', preset: 3 },
			{ grammar: 'S → a', preset: ['trace'] }
		])
			expect(isLL1Hash(bad), JSON.stringify(bad)).toBe(false);
	});

	it('survives the trip through the URL hash, the preset’s id included', () => {
		for (const p of presets) {
			const state = presetState(p);
			const back = decode(encode(state), isLL1Hash);
			expect(back).not.toBeNull();
			expect(stateFromHash(back!)).toEqual(state);
			expect(stateFromHash(back!).preset).toBe(p.id);
		}
		expect(stateFromHash({ grammar: 'S → a', preset: null }).preset).toBeNull();
	});

	it('opens on the grammar of slides 7–12 in the slides’ order, the trace at its end', () => {
		expect(DEFAULT_STATE).toEqual({
			grammar: DECK_GRAMMAR,
			input: 'int * int',
			rows: DECK_ROWS,
			columns: DECK_COLUMNS,
			names: {},
			cell: null,
			setStep: null,
			step: null,
			fill: false,
			preset: 'trace'
		});
		expect(DECK_GRAMMAR).toBe('E → T X\nX → + E | ε\nT → ( E ) | int Y\nY → * T | ε');
		expect([DECK_ROWS, DECK_COLUMNS]).toEqual(['T E X Y', 'int * + ( ) $']);
	});
});
