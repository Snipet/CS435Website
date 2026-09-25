import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import { SLIDE_LANGUAGES, SLIDE_TARGETS } from './architecture';
import { MAX_LABEL } from './labels';
import { compose, parseRunnable } from './model';
import { presetById, presets } from './presets';
import {
	defaultState,
	isTDiagramsHash,
	matchPreset,
	MAX_TOOLBOX,
	nextId,
	picksAfterRemove,
	resolvePicks,
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
		expect(s.archView).toBe('shared');
		expect(s.preset).toBe('bootstrap');
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
			targets: ['RISC-V'],
			archView: 'separate'
		});
		expect(s.languages).toEqual(['Go']);
		expect(s.targets).toEqual(['RISC-V']);
		expect(s.archView).toBe('separate');
		expect(s.guide).toBeNull();
		expect(s.preset).toBeNull();
	});

	it('remembers the preset it came from', () => {
		const p = presetById('retargetable')!;
		expect(stateFromPreset(p.value, undefined, p.id).preset).toBe('retargetable');
	});
});

describe('matchPreset', () => {
	const load = (id: string) => {
		const p = presetById(id)!;
		return stateFromPreset(p.value, undefined, p.id);
	};

	it('recognizes every preset after loading, with or without the remembered id', () => {
		for (const p of presets) {
			expect(matchPreset(load(p.id))?.id).toBe(p.id);
			expect(matchPreset({ ...load(p.id), preset: null })?.id).toBe(p.id);
		}
	});

	it('still shows the preset after a result is added to the toolbox', () => {
		// Bootstrapping step 1, then "Add to toolbox" (the flow slide 8 needs for step 2).
		const s = load('bootstrap');
		const facts = { subsets: s.subsets, runnable: parseRunnable(s.runnable) };
		const one = compose(s.toolbox[0], s.toolbox[1], facts).result!;
		s.toolbox.push({ id: nextId(s.toolbox), ...one });
		expect(matchPreset(s)?.id).toBe('bootstrap');
		for (const id of ['cross', 'retargetable', 'generic']) {
			const t = load(id);
			t.toolbox.push({ id: nextId(t.toolbox), source: 'X', target: 'Y', host: 'Z' });
			expect(matchPreset(t)?.id).toBe(id);
		}
	});

	it('lets go once a preset’s own diagrams, facts, or goal change', () => {
		const edited = load('bootstrap');
		edited.toolbox[0].host = 'L';
		expect(matchPreset(edited)).toBeUndefined();

		const removed = load('bootstrap');
		removed.toolbox.splice(0, 1);
		expect(matchPreset(removed)).toBeUndefined();

		const facts = load('bootstrap');
		facts.subsets = [];
		expect(matchPreset(facts)).toBeUndefined();

		const runs = load('bootstrap');
		runs.runnable = 'M';
		expect(matchPreset(runs)).toBeUndefined();

		const goal = load('cross');
		goal.goal = null;
		expect(matchPreset(goal)).toBeUndefined();
	});
});

describe('resolvePicks / picksAfterRemove', () => {
	it('falls back to the first diagram and the first other one', () => {
		expect(resolvePicks({ program: '', translator: '' }, ['t1', 't2', 't3'])).toEqual({
			program: 't1',
			translator: 't2'
		});
		expect(resolvePicks({ program: 't3', translator: 't9' }, ['t1', 't2', 't3'])).toEqual({
			program: 't3',
			translator: 't1'
		});
		expect(resolvePicks({ program: '', translator: '' }, [])).toEqual({
			program: '',
			translator: ''
		});
	});

	it('does not choose a diagram added after the chosen one was removed', () => {
		// Diagram 3 is the translator; it is removed; a new blank diagram gets id t3 again.
		const after = picksAfterRemove({ program: 't1', translator: 't3' }, 't3', ['t1', 't2']);
		expect(after).toEqual({ program: 't1', translator: 't2' });
		const ids = ['t1', 't2', nextId([{ id: 't1' }, { id: 't2' }])];
		expect(ids[2]).toBe('t3');
		expect(resolvePicks(after, ids)).toEqual({ program: 't1', translator: 't2' });
	});

	it('keeps choices that are still there', () => {
		expect(picksAfterRemove({ program: 't2', translator: 't3' }, 't1', ['t2', 't3'])).toEqual({
			program: 't2',
			translator: 't3'
		});
	});
});

describe('isTDiagramsHash', () => {
	it('accepts saved state, round-tripped through the URL encoding', () => {
		const s = defaultState();
		s.compose = { program: 't1', translator: 't2' };
		s.step = 3;
		s.archView = 'separate';
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
		expect(isTDiagramsHash({ toolbox: [], preset: 3 })).toBe(false);
		expect(isTDiagramsHash({ toolbox: [], archView: 'grid' })).toBe(false);
	});

	it('accepts the preset and the architecture drawing', () => {
		expect(isTDiagramsHash({ toolbox: [], preset: 'cross', archView: 'separate' })).toBe(true);
		expect(isTDiagramsHash({ toolbox: [], preset: null, archView: 'shared' })).toBe(true);
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
			preset: null,
			languages: [...SLIDE_LANGUAGES],
			targets: [...SLIDE_TARGETS],
			archView: 'shared'
		});
	});

	it('keeps the drawing and a known preset; forgets an unknown one', () => {
		const s = stateFromHash({ toolbox: [], preset: 'cross', archView: 'separate' });
		expect(s.preset).toBe('cross');
		expect(s.archView).toBe('separate');
		expect(stateFromHash({ toolbox: [], preset: 'nope' }).preset).toBeNull();
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
