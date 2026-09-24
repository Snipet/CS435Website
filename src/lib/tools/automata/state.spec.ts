import { describe, expect, it } from 'vitest';
import { automatonFromText } from '$lib/theory/automata/core';
import { formatAutomatonText } from '$lib/theory/automata/core';
import type { LinkStates } from '$lib/tools/links';
import { newMachine, stateSetText, symbolsText, alphabetText, setText } from './model';
import { DEFAULT_VIEW, isSavedState, loadSaved, saveState } from './state';
import { mergeTextEdit } from './text-sync';
import { presetById } from './presets';
import { CharSet } from '$lib/theory/charset';

describe('saved state', () => {
	it('accepts the link shape other tools send', () => {
		const link: LinkStates['automata'] = { text: 'start: A\naccept: B\nA 0 B', input: '0' };
		expect(isSavedState(link)).toBe(true);
		const loaded = loadSaved(link);
		expect(loaded.machine!.states.map((s) => s.name)).toEqual(['A', 'B']);
		expect(loaded.positions).toBeNull();
		expect(loaded.view).toEqual({ ...DEFAULT_VIEW, input: '0' });
		expect(loaded.badText).toBeNull();
	});

	it('opens bad link text in the Text tab', () => {
		const loaded = loadSaved({ text: 'A 0' });
		expect(loaded.machine).toBeNull();
		expect(loaded.view.tab).toBe('text');
		expect(loaded.badText?.diagnostics.length).toBeGreaterThan(0);
	});

	it('round-trips its own shape and ignores malformed fields', () => {
		const { machine, positions } = newMachine();
		const saved = JSON.parse(
			JSON.stringify(saveState(machine, positions, { ...DEFAULT_VIEW, input: '01', tab: 'table' }))
		);
		expect(isSavedState(saved)).toBe(true);
		const loaded = loadSaved({ ...saved, missing: 'explode', hideNames: 'yes' });
		expect(loaded.machine).toEqual(machine);
		expect(loaded.positions).toEqual(positions);
		expect(loaded.view).toMatchObject({
			input: '01',
			tab: 'table',
			missing: 'trap',
			hideNames: false
		});
	});

	it('rejects values without a machine', () => {
		for (const v of [null, 'x', [], {}, { input: '1' }, { machine: { s: 1 } }, { text: 3 }])
			expect(isSavedState(v)).toBe(false);
	});
});

describe('text edits', () => {
	const relop = presetById('08-16')!.value.machine;

	it('keeps positions of surviving states and places new ones below', () => {
		const prev = automatonFromText('start: A\nA 0 B');
		const pos = new Map([
			[0, { x: 0, y: 0 }],
			[1, { x: 130, y: 20 }]
		]);
		const next = automatonFromText('start: B\nB 1 C\nC 0 D');
		const out = mergeTextEdit(prev, pos, next);
		expect(out.positions).toEqual(
			new Map([
				[0, { x: 130, y: 20 }],
				[1, { x: 130, y: 130 }],
				[2, { x: 240, y: 130 }]
			])
		);
		expect(mergeTextEdit(prev, null, next).positions).toBeNull();
	});

	it('keeps notes, retract marks and other labels by name', () => {
		const text = formatAutomatonText(relop).replace('6 = 7', '6 = 7\n7 = 5');
		const out = mergeTextEdit(relop, null, automatonFromText(text));
		expect(out.machine.states[8]).toMatchObject({ note: 'return GT', retract: true });
		expect(out.machine.transitions.filter((t) => t.display === 'other')).toHaveLength(2);
		expect(out.machine.transitions).toHaveLength(relop.transitions.length + 1);
	});

	it('drops the display text when the label changes', () => {
		const text = formatAutomatonText(relop).replace('6 [^=] 8', '6 [^=<] 8');
		const out = mergeTextEdit(relop, null, automatonFromText(text));
		expect(out.machine.transitions.filter((t) => t.display === 'other')).toHaveLength(1);
	});
});

describe('text helpers', () => {
	it('writes sets in lecture notation', () => {
		const a = automatonFromText('start: B\nB 0 A\nA 0 C');
		expect(stateSetText(a, [2, 1, 0])).toBe('{ A, B, C }');
		expect(setText([])).toBe('{ }');
		expect(symbolsText(CharSet.of('01'))).toBe('0, 1');
		expect(symbolsText(CharSet.of('01'), CharSet.of('01'))).toBe('every symbol');
		expect(symbolsText(CharSet.of('<=>').complement(), CharSet.ANY)).toBe(
			'every symbol except <, =, >'
		);
		expect(alphabetText(CharSet.of('10'))).toBe('{ 0, 1 }');
		expect(alphabetText(CharSet.ANY)).toBe('{ every character }');
		expect(alphabetText(CharSet.range('a', 'z').union(CharSet.range('0', '9')))).toBe(
			'{ 0–9, a–z }'
		);
	});
});
