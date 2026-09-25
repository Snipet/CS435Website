import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { isSavedState, loadState, type ScannerDfaState } from './state';
import { sizesOf, tableSize } from './sizes';
import { relopDfa, stuDfa } from './machines';
import { buildRuleDfa, compileRules } from './rules';
import { LEX2_DEFS, LEX2_RULES } from './presets';

const BASE: ScannerDfaState = {
	tab: 'switch',
	source: 'relop',
	defs: 'digit = 0',
	rules: [{ name: 'X', re: "'x'" }],
	input: '<=',
	minimal: true,
	mode: 'first',
	switchInput: '<>',
	breaks: true,
	inputs: { stu: '01' }
};

describe('isSavedState', () => {
	it('accepts the link shape from other tools', () => {
		const link: LinkStates['scanner-dfa'] = {
			defs: "digit = '0' | … | '9'",
			rules: [{ name: 'Integer', re: 'digit+', drop: false }],
			input: '42'
		};
		expect(isSavedState(link)).toBe(true);
		expect(isSavedState({ rules: [], input: '' })).toBe(true);
	});

	it('accepts its own state and any part of it', () => {
		expect(isSavedState(BASE)).toBe(true);
		expect(isSavedState({ tab: 'sizes' })).toBe(true);
		expect(isSavedState({ switchInput: '>a', breaks: false })).toBe(true);
	});

	it('rejects other values', () => {
		for (const v of [
			null,
			42,
			'text',
			[],
			{},
			{ unrelated: 1 },
			{ tab: 'other' },
			{ source: 'nfa' },
			{ rules: [{ name: 'A' }] },
			{ rules: 'x', input: '' },
			{ input: 5 },
			{ mode: 'shortest' },
			{ switchInput: '<<' },
			{ breaks: 'yes' },
			{ input: 'x'.repeat(5000) }
		])
			expect(isSavedState(v), JSON.stringify(v)?.slice(0, 40)).toBe(false);
	});
});

describe('loadState', () => {
	it('opens a link on the rules with the longest match', () => {
		const s = loadState(BASE, { rules: [{ name: 'Integer', re: 'digit+' }], input: '42' });
		expect(s).toMatchObject({
			tab: 'table',
			source: 'rules',
			mode: 'longest',
			defs: '',
			input: '42',
			switchInput: '<>',
			breaks: true
		});
		expect(s.rules).toEqual([{ name: 'Integer', re: 'digit+' }]);
	});

	it('keeps fields the saved value leaves out and copies the rules', () => {
		const rules = [{ name: 'A', re: "'a'" }];
		const s = loadState(BASE, { source: 'rules', rules, tab: 'sizes' });
		expect(s.tab).toBe('sizes');
		expect(s.mode).toBe('first');
		expect(s.defs).toBe('digit = 0');
		expect(s.rules).toEqual(rules);
		expect(s.rules).not.toBe(rules);
		expect(s.rules[0]).not.toBe(rules[0]);
	});
});

describe('sizes', () => {
	it('relop: 9 states × 4 columns', () => {
		expect(tableSize(relopDfa())).toEqual({
			states: 9,
			classes: 4,
			labelClasses: 4,
			cells: 36,
			asciiCells: 1152
		});
		expect(sizesOf(relopDfa()).minimal.states).toBe(9);
	});

	it('counts merged columns, and the label classes before merging', () => {
		const compiled = compileRules("lower = 'a' | … | 'z'", [
			{ name: 'Word', re: 'lower+' },
			{ name: 'Never', re: "ɸ 'q'" }
		]);
		const built = buildRuleDfa(compiled.rules!);
		if (!built.ok) throw new Error('too large');
		// The ɸ rule's 'q' edge splits the letters into two label classes that no state tells apart.
		expect(tableSize(built.full, compiled.names)).toEqual({
			states: 3,
			classes: 1,
			labelClasses: 2,
			cells: 3,
			asciiCells: 384
		});
	});

	it('Lexical Analysis II rules: A–Z and a–z stay apart as built (different next states), merge when minimized', () => {
		const compiled = compileRules(LEX2_DEFS, LEX2_RULES);
		const built = buildRuleDfa(compiled.rules!);
		if (!built.ok) throw new Error('too large');
		const s = sizesOf(built.full, compiled.names);
		expect(s.built).toMatchObject({ states: 11, classes: 5, labelClasses: 5, cells: 55 });
		expect(s.minimal).toMatchObject({ states: 5, classes: 4, labelClasses: 4, cells: 20 });
	});

	it('S, T, U: 3 × 2 = 6 cells (slide 14), 2 × 2 = 4 when minimized', () => {
		const s = sizesOf(stuDfa());
		expect(s.built).toMatchObject({ states: 3, classes: 2, cells: 6 });
		expect(s.minimal).toMatchObject({ states: 2, classes: 2, cells: 4 });
	});
});
