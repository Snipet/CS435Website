import { describe, expect, it } from 'vitest';
import { decode, encode } from '$lib/url-state';
import type { LinkStates } from '$lib/tools/links';
import { MAX_RUN_INPUT } from './logic';
import { buildNfa } from './logic';
import { DEFAULT_PRESET, PRESETS } from './presets';
import {
	defaultState,
	isSubsetHash,
	presetFields,
	stateFromHash,
	stepFromHash,
	switchSource,
	thompsonText,
	type SubsetHash
} from './state';

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

	it('drops repeated seeds, keeping the order they were first picked', () => {
		const s = stateFromHash(base, { from: 're', re: '(1 | 0)*1', seeds: [0, 0, 3, 0, 1] });
		expect(s.seeds).toEqual([0, 3, 1]);
	});

	it('reads the step, or null for the finished construction', () => {
		expect(stepFromHash({ from: 're', re: 'a', step: 3 })).toBe(3);
		expect(stepFromHash({ from: 're', re: 'a' })).toBeNull();
		expect(stepFromHash({ from: 're', re: 'a', step: -1 })).toBeNull();
	});
});

describe('presetFields and switchSource', () => {
	const nfaPreset = PRESETS.find((p) => p.value.from === 'nfa')!;
	const rePreset = PRESETS.find((p) => p.value.from === 're' && p.id !== DEFAULT_PRESET.id)!;

	it('an NFA preset keeps the regular expression', () => {
		const keep = { re: 'a | b*', defs: 'd = 0' };
		const f = presetFields(nfaPreset.value, keep);
		expect(f).toMatchObject({ from: 'nfa', re: 'a | b*', defs: 'd = 0' });
		// Switching back finds a regular expression that builds.
		const back = switchSource(f, 're', null);
		expect(back).toMatchObject({ from: 're', re: 'a | b*' });
		expect(buildNfa(back).nfa).not.toBeNull();
	});

	it('a regular-expression preset clears the NFA text, which then starts from the NFA shown', () => {
		const f = presetFields(rePreset.value, { re: 'x', defs: '' });
		expect(f.text).toBe('');
		const nfa = switchSource(f, 'nfa', 'start: A\nA a B\n');
		expect(nfa).toMatchObject({ from: 'nfa', text: 'start: A\nA a B\n', re: f.re });
		// Text already there is kept.
		expect(switchSource({ ...f, text: 'start: Q\n' }, 'nfa', 'start: A\n').text).toBe('start: Q\n');
	});

	it('switching to an empty regular expression starts from the default preset', () => {
		const s = switchSource({ from: 'nfa', re: '', defs: '', text: 'start: A\n' }, 're', null);
		expect(s).toMatchObject({ from: 're', re: '(1 | 0)*1', defs: '', text: 'start: A\n' });
		expect(buildNfa(s).nfa).not.toBeNull();
		// Definitions typed earlier stay.
		const d = switchSource({ from: 'nfa', re: ' ', defs: 'd = 0', text: '' }, 're', null);
		expect(d).toMatchObject({ re: '(1 | 0)*1', defs: 'd = 0' });
	});

	it('an NFA filled in from the regular expression follows later edits to it', () => {
		const start = presetFields(DEFAULT_PRESET.value);
		// "From an NFA" starts from the Thompson NFA shown (10 states).
		const shown = thompsonText(start);
		expect(shown).not.toBeNull();
		const onNfa = switchSource(start, 'nfa', shown);
		expect(buildNfa(onNfa).nfa?.states).toHaveLength(10);
		// Back on the regular expression, the generated text is dropped …
		const back = switchSource(onNfa, 're', null);
		expect(back).toMatchObject({ from: 're', re: '(1 | 0)*1', text: '' });
		// … so after typing `ab`, "From an NFA" shows the 4-state NFA of `ab`.
		const edited = { ...back, re: 'ab' };
		const again = switchSource(edited, 'nfa', thompsonText(edited));
		expect(buildNfa(again).nfa?.states).toHaveLength(4);
		// Spacing changes to the generated text do not make it hand-written.
		const spaced = { ...onNfa, text: `\n${shown!.replace(/\n/g, '\n  ')}\n` };
		expect(switchSource(spaced, 're', null).text).toBe('');
	});

	it('an NFA written by hand stays when the regular expression changes', () => {
		const start = presetFields(DEFAULT_PRESET.value);
		const own = { ...switchSource(start, 'nfa', thompsonText(start)), text: 'start: A\nA 0 B\n' };
		const back = switchSource(own, 're', null);
		expect(back.text).toBe('start: A\nA 0 B\n');
		const again = switchSource({ ...back, re: 'ab' }, 'nfa', 'start: X\n');
		expect(again.text).toBe('start: A\nA 0 B\n');
		// An edited copy of the generated text is hand-written too.
		const edited = { ...own, text: `${thompsonText(start)}J 0 J\n` };
		expect(switchSource(edited, 're', null).text).toBe(edited.text);
	});

	it('switching to the current source changes nothing', () => {
		const f = presetFields(DEFAULT_PRESET.value);
		expect(switchSource(f, 're', 'start: A\n')).toBe(f);
	});
});
