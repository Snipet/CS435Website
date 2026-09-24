import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import { SLIDE_LANGUAGES, SLIDE_TARGETS } from './architecture';
import { MAX_LABEL } from './labels';
import { presetById } from './presets';
import {
	defaultState,
	isTDiagramsHash,
	MAX_TOOLBOX,
	nextId,
	stateFromHash,
	stateFromPreset,
	withIds
} from './state';

describe('nextId / withIds', () => {
	it('numbers diagrams t1, t2, …', () => {
		expect(withIds([{ source: 'S', target: 'T', host: 'H' }])[0].id).toBe('t1');
		expect(nextId([])).toBe('t1');
		expect(nextId([{ id: 't1' }, { id: 't7' }, { id: 'x' }])).toBe('t8');
	});
});

describe('defaultState', () => {
	it('is bootstrapping with slide 6’s architecture', () => {
		const s = defaultState();
		expect(s.toolbox.map((t) => t.id)).toEqual(['t1', 't2']);
		expect(s.compose).toBeNull();
		expect(s.languages).toEqual([...SLIDE_LANGUAGES]);
		expect(s.targets).toEqual([...SLIDE_TARGETS]);
	});

	it('returns a fresh object each time', () => {
		const a = defaultState();
		a.toolbox[0].source = 'X';
		expect(defaultState().toolbox[0].source).toBe('L');
	});
});

describe('stateFromPreset', () => {
	it('keeps the architecture it is given', () => {
		const s = stateFromPreset(presetById('cross')!.value, {
			languages: ['Go'],
			targets: ['RISC-V']
		});
		expect(s.languages).toEqual(['Go']);
		expect(s.targets).toEqual(['RISC-V']);
		expect(s.guide).toBeNull();
	});
});

describe('isTDiagramsHash', () => {
	it('accepts saved state, round-tripped through the URL encoding', () => {
		const s = defaultState();
		s.compose = { program: 't1', translator: 't2' };
		s.step = 3;
		const back = decode(encode(s), isTDiagramsHash);
		expect(back).not.toBeNull();
		expect(stateFromHash(back!)).toEqual(s);
	});

	it('accepts a minimal value', () => {
		expect(isTDiagramsHash({ toolbox: [] })).toBe(true);
		expect(isTDiagramsHash({ toolbox: [{ source: 'S', target: 'T', host: 'H' }] })).toBe(true);
	});

	it('rejects wrong shapes', () => {
		expect(isTDiagramsHash(null)).toBe(false);
		expect(isTDiagramsHash([])).toBe(false);
		expect(isTDiagramsHash({})).toBe(false);
		expect(isTDiagramsHash({ toolbox: [{ source: 'S', target: 'T' }] })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [{ id: 3, source: 'S', target: 'T', host: 'H' }] })).toBe(
			false
		);
		expect(isTDiagramsHash({ toolbox: [], subsets: [{ sub: 'L′' }] })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], runnable: 5 })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], goal: { source: 'L' } })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], compose: { program: 't1' } })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], guide: 'other' })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], step: -1 })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], step: 1.5 })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], languages: [1] })).toBe(false);
	});
});

describe('stateFromHash', () => {
	it('fills in defaults', () => {
		const s = stateFromHash({ toolbox: [{ source: 'S', target: 'T', host: 'H' }] });
		expect(s).toEqual({
			toolbox: [{ id: 't1', source: 'S', target: 'T', host: 'H' }],
			subsets: [],
			runnable: '',
			goal: null,
			compose: null,
			guide: null,
			step: 0,
			languages: [...SLIDE_LANGUAGES],
			targets: [...SLIDE_TARGETS]
		});
	});

	it('repairs ids and drops a composition of diagrams that are gone', () => {
		const s = stateFromHash({
			toolbox: [
				{ id: 't2', source: 'A', target: 'B', host: 'C' },
				{ id: 't2', source: 'D', target: 'E', host: 'F' },
				{ id: 'weird', source: 'G', target: 'H', host: 'I' }
			],
			compose: { program: 't2', translator: 't9' }
		});
		expect(s.toolbox.map((t) => t.id)).toEqual(['t2', 't3', 't4']);
		expect(s.compose).toBeNull();
	});

	it('keeps the tool’s limits', () => {
		const many = Array.from({ length: 30 }, () => ({
			source: 'x'.repeat(40),
			target: 'T',
			host: 'H'
		}));
		const s = stateFromHash({ toolbox: many, runnable: ['M', 'M′'] });
		expect(s.toolbox).toHaveLength(MAX_TOOLBOX);
		expect([...s.toolbox[0].source]).toHaveLength(MAX_LABEL);
		expect(s.runnable).toBe('M, M′');
	});
});
