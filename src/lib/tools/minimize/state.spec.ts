import { describe, expect, it } from 'vitest';
import type { LinkStates } from '$lib/tools/links';
import { BLANK, fromSaved, inputKey, isSavedState, type MinimizeState } from './state';

describe('isSavedState', () => {
	it('accepts the link shapes other tools send', () => {
		const links: LinkStates['minimize'][] = [
			{ from: 're', re: '(1 | 0)*1' },
			{ from: 're', re: 'digit+', defs: "digit = '0' | … | '9'" },
			{ from: 'dfa', text: 'start: A\naccept: B\nA 0 B\n' }
		];
		for (const link of links) expect(isSavedState(link)).toBe(true);
	});

	it('accepts its own saved state', () => {
		const saved: MinimizeState = { ...BLANK, from: 'rules', rules: "If = 'if'", round: 2, p: 'A' };
		expect(isSavedState(saved)).toBe(true);
		expect(isSavedState(JSON.parse(JSON.stringify(saved)))).toBe(true);
	});

	it('rejects other shapes', () => {
		for (const v of [
			null,
			'text',
			[],
			{},
			{ from: 'nfa', text: 'A 0 B' },
			{ from: 're' },
			{ from: 're', re: 3 },
			{ from: 'dfa', re: 'a' },
			{ from: 'rules', rules: 'x', byToken: 'yes' },
			{ from: 're', re: 'a', round: -1 },
			{ from: 're', re: 'a', round: 1.5 },
			{ from: 're', re: 'a', p: 1 }
		])
			expect(isSavedState(v)).toBe(false);
	});
});

describe('fromSaved', () => {
	it('fills missing fields with blanks', () => {
		expect(fromSaved({ from: 'dfa', text: 'start: A' })).toEqual({
			...BLANK,
			from: 'dfa',
			text: 'start: A'
		});
	});

	it('keeps known fields and drops unknown ones', () => {
		const v = { from: 're', re: 'a', byToken: false, round: 3, extra: 1 } as const;
		const s = fromSaved(v);
		expect(s).toMatchObject({ from: 're', re: 'a', byToken: false, round: 3 });
		expect('extra' in s).toBe(false);
	});
});

describe('inputKey', () => {
	it('compares only the fields the source uses, ignoring outer whitespace', () => {
		const a = { ...BLANK, from: 'dfa' as const, text: 'start: A\n', re: 'x' };
		const b = { ...BLANK, from: 'dfa' as const, text: 'start: A', re: 'y' };
		expect(inputKey(a)).toBe(inputKey(b));
		expect(inputKey({ ...a, from: 're' })).not.toBe(inputKey({ ...b, from: 're' }));
	});
});
