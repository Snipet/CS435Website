/**
 * What the Subset Construction page computes on the main thread for every
 * keystroke is parsing only: Thompson's construction, the subset
 * construction and layout throw here, and the page's own check still succeeds
 * on large sources.
 */
import { describe, expect, it, vi } from 'vitest';
import { computeConstruction, requestKey } from './job';
import { blowupNfaText, checkSource, MAX_NFA_STATES, type NfaSource } from './logic';

vi.mock('$lib/theory/automata', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/theory/automata')>();
	const off = (name: string) => () => {
		throw new Error(`${name} ran on the main thread`);
	};
	return {
		...real,
		thompson: off('thompson'),
		subsetConstruction: off('subsetConstruction'),
		ClosureIndex: class {
			constructor() {
				off('ClosureIndex')();
			}
		}
	};
});

vi.mock('$lib/components/graph/layout', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/components/graph/layout')>();
	return {
		...real,
		layoutAutomaton: () => {
			throw new Error('layoutAutomaton ran on the main thread');
		}
	};
});

// The DFA would need 2¹¹ states; the NFA has 70.
const large: NfaSource = { from: 're', re: '(a|b)*a(a|b)^{10}', defs: '', text: '' };
// A typed NFA with the most states the page builds.
const chain = [
	'start: S0',
	`accept: S${MAX_NFA_STATES - 1}`,
	...Array.from({ length: MAX_NFA_STATES - 1 }, (_, i) => `S${i} a,b S${i + 1}`)
].join('\n');

describe('the page on the main thread', () => {
	it('checks large sources without building an automaton', () => {
		const start = performance.now();
		for (let i = 0; i < 20; i++) {
			expect(checkSource(large)).toMatchObject({ ok: true, tooLarge: null });
			expect(checkSource({ ...large, from: 'nfa', text: blowupNfaText(8) }).ok).toBe(true);
		}
		expect(checkSource({ ...large, from: 'nfa', text: chain }).ok).toBe(true);
		// Twenty keystrokes' worth of checking; generous for slow CI machines.
		expect(performance.now() - start).toBeLessThan(500);
	});

	it('leaves the constructions to the worker computation', () => {
		const req = { ...large, naming: 'discovery' as const, showEmpty: false, have: null };
		expect(requestKey(req)).toContain(large.re);
		expect(() => computeConstruction(req)).toThrow(/ran on the main thread/);
	});
});
