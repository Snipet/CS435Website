import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import { MAX_SOURCE } from './pipeline';
import {
	b1IsInt,
	cIsConstant,
	defaultState,
	isPhasesHash,
	MAX_DECLS,
	setB1IsInt,
	setCIsConstant,
	stateFromHash,
	type PhasesState
} from './state';

describe('hash state', () => {
	it('round-trips the page state', () => {
		const s: PhasesState = {
			source: 'if x==y then z  =1; else z= 2  ;',
			decls: [{ name: 'x', type: 'int', value: '' }],
			view: 'five',
			grouping: 'passes'
		};
		const back = decode(encode(s), isPhasesHash);
		expect(back).not.toBeNull();
		expect(stateFromHash(defaultState(), back!)).toEqual(s);
	});

	it('rejects values that are not the state', () => {
		for (const v of [null, 3, 'x', [], {}, { view: 'eight' }, { source: 3 }])
			expect(isPhasesHash(v)).toBe(false);
		expect(isPhasesHash({ source: 'a = 1;' })).toBe(true);
		expect(isPhasesHash({ grouping: 'ends' })).toBe(true);
	});

	it('keeps the base for missing or wrong fields and cleans the declarations', () => {
		const base = defaultState();
		const next = stateFromHash(base, {
			view: 'eight' as never,
			decls: [
				{ name: 'a', type: 'double' as never, value: 5 as never },
				'junk' as never,
				{ name: 'b', type: 'float', value: '1.5' }
			]
		});
		expect(next.source).toBe(base.source);
		expect(next.view).toBe(base.view);
		expect(next.decls).toEqual([
			{ name: 'a', type: 'int', value: '' },
			{ name: 'b', type: 'float', value: '1.5' }
		]);
	});

	it('caps the source and the number of declarations', () => {
		const decls = Array.from({ length: MAX_DECLS + 10 }, (_, i) => ({
			name: `v${i}`,
			type: 'int' as const,
			value: ''
		}));
		const next = stateFromHash(defaultState(), { source: 'x'.repeat(MAX_SOURCE + 5), decls });
		expect(next.source).toHaveLength(MAX_SOURCE);
		expect(next.decls).toHaveLength(MAX_DECLS);
	});

	it('does not share declaration objects with the base', () => {
		const base = defaultState();
		const next = stateFromHash(base, {});
		next.decls[0].name = 'changed';
		expect(base.decls[0].name).toBe('A');
	});
});

describe('the slide’s assumptions', () => {
	it('reads and sets "B1 is int"', () => {
		const { decls } = defaultState();
		expect(b1IsInt(decls)).toBe(true);
		setB1IsInt(decls, false);
		expect(decls.find((d) => d.name === 'B1')?.type).toBe('float');
		expect(b1IsInt(decls)).toBe(false);
		expect(b1IsInt([])).toBeNull();
	});

	it('reads and sets "C is the constant 2.3"', () => {
		const { decls } = defaultState();
		expect(cIsConstant(decls)).toBe(true);
		setCIsConstant(decls, false);
		expect(decls.find((d) => d.name === 'C')).toEqual({ name: 'C', type: 'float', value: '' });
		expect(cIsConstant(decls)).toBe(false);
		setCIsConstant(decls, true);
		expect(cIsConstant(decls)).toBe(true);
		expect(cIsConstant([{ name: 'C', type: 'int', value: '2' }])).toBe(false);
		expect(cIsConstant([])).toBeNull();
	});
});
