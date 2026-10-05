import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { decode, encode } from '$lib/url-state';
import { DEFAULT_ATOMS, DEFAULT_LEVELS, MAX_LEVELS } from './cascade';
import { DEFAULT_LENGTH } from './compare';
import { DEFAULT_STATE, presets, presetState } from './presets';
import {
	BLANK_STATE,
	MAX_DECLARATIONS,
	isAmbiguityHash,
	stateFromHash,
	type AmbiguityState
} from './state';

describe('isAmbiguityHash', () => {
	it('accepts the cross-tool link shape', () => {
		const link: LinkStates['ambiguity'] = { grammar: 'E → E + E | int', input: 'int + int' };
		expect(isAmbiguityHash(link)).toBe(true);
		expect(isAmbiguityHash({ grammar: 'E → int' })).toBe(true);
		expect(isAmbiguityHash({ grammar: 'E → int', somethingElse: 1 })).toBe(true);
	});

	it('accepts the page’s own state, for every preset', () => {
		expect(isAmbiguityHash(DEFAULT_STATE)).toBe(true);
		for (const p of presets) expect(isAmbiguityHash(presetState(p))).toBe(true);
	});

	it('rejects values of the wrong shape', () => {
		const bad: unknown[] = [
			null,
			'E → int',
			[],
			{},
			{ input: 'int' },
			{ grammar: 1 },
			{ grammar: 'E → int', input: 5 },
			{ grammar: 'E → int', labels: {} },
			{ grammar: 'E → int', abbreviated: 'yes' },
			{ grammar: 'E → int', tab: 'trees' },
			{ grammar: 'E → int', maxLength: '7' },
			{ grammar: 'E → int', levels: [{ ops: '+', assoc: 'none' }] },
			{ grammar: 'E → int', levels: 'x' },
			{ grammar: 'E → int', decls: [{ ops: '+' }] },
			{ grammar: 'E → int', decls: [{ ops: 1, assoc: 'left' }] },
			{ grammar: 'E → int', decls: [{ ops: '+', assoc: 'toString' }] }
		];
		for (const value of bad) expect(isAmbiguityHash(value)).toBe(false);
	});
});

describe('stateFromHash', () => {
	it('fills a link with blank fields, not with the default preset’s', () => {
		const state = stateFromHash({ grammar: 'S → a S | a', input: 'a a' });
		expect(state).toEqual({
			grammar: 'S → a S | a',
			input: 'a a',
			labels: '',
			values: '',
			abbreviated: false,
			derivations: false,
			tab: 'rewrite',
			rewrite: '',
			levels: [...DEFAULT_LEVELS],
			atoms: DEFAULT_ATOMS,
			maxLength: DEFAULT_LENGTH,
			decls: []
		});
		expect(stateFromHash({ grammar: 'S → a' }).input).toBe('');
		// The default preset has operand values; a link without them has none.
		expect(DEFAULT_STATE.values).not.toBe('');
	});

	it('copies lists, so editing the state leaves the defaults alone', () => {
		const a = stateFromHash({ grammar: '' });
		a.levels[0].ops = '-';
		a.levels.push({ ops: '^', assoc: 'right' });
		expect(BLANK_STATE.levels).toEqual([...DEFAULT_LEVELS]);
		expect(DEFAULT_LEVELS[0].ops).toBe('+');
		const decls = [{ assoc: 'left' as const, ops: '+' }];
		const b = stateFromHash({ grammar: '', decls });
		b.decls[0].ops = '*';
		expect(decls[0].ops).toBe('+');
	});

	it('drops extra fields and keeps sizes within bounds', () => {
		const many = Array.from({ length: 40 }, () => ({ ops: '+', assoc: 'left' as const }));
		const hash = {
			grammar: 'E → int',
			maxLength: 99,
			levels: many.map((level) => ({ ...level, extra: true })),
			decls: many
		};
		expect(isAmbiguityHash(hash)).toBe(true);
		const state = stateFromHash(hash);
		expect(state.maxLength).toBe(9);
		expect(state.levels).toHaveLength(MAX_LEVELS);
		expect(state.levels[0]).toEqual({ ops: '+', assoc: 'left' });
		expect(state.decls).toHaveLength(MAX_DECLARATIONS);
	});

	it('survives the URL hash for every preset', () => {
		for (const p of presets) {
			const state: AmbiguityState = presetState(p);
			const back = decode(encode(state), isAmbiguityHash);
			expect(back).not.toBeNull();
			expect(stateFromHash(back!)).toEqual(state);
		}
	});
});
