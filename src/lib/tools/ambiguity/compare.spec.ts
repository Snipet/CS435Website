import { describe, expect, it } from 'vitest';
import { answer, serveTask, type TaskScope } from '$lib/components/ui/worker-protocol';
import {
	DEFAULT_LENGTH,
	LIST_LIMIT,
	MAX_LENGTH,
	MIN_LENGTH,
	clampLength,
	compareTexts,
	sameRequest,
	type CompareRequest
} from './compare';
import { AMBIGUOUS, CASCADE, DANGLING_ELSE, MATCHED_IF } from './presets';

const same = (maxLength: number) => ({
	status: 'done',
	checkedUpTo: maxLength,
	maxLength,
	onlyOriginal: { count: 0, examples: [] },
	onlyRewritten: { count: 0, examples: [] }
});

describe('compareTexts', () => {
	it('finds the cascade and the ambiguous expression grammar equal up to length 9', () => {
		expect(compareTexts({ original: AMBIGUOUS, rewritten: CASCADE, maxLength: 9 })).toEqual(
			same(9)
		);
	});

	it('finds the MIF/UIF grammar and the dangling-else grammar equal up to length 9 (slide 13)', () => {
		expect(compareTexts({ original: DANGLING_ELSE, rewritten: MATCHED_IF, maxLength: 9 })).toEqual(
			same(9)
		);
	});

	it('lists the strings only one grammar generates', () => {
		// The rewrite lost the parentheses.
		const r = compareTexts({
			original: AMBIGUOUS,
			rewritten: 'E → E + T | T\nT → T * F | F\nF → int',
			maxLength: 3
		});
		expect(r).toEqual({
			status: 'done',
			checkedUpTo: 3,
			maxLength: 3,
			onlyOriginal: { count: 1, examples: ['( int )'] },
			onlyRewritten: { count: 0, examples: [] }
		});
		const reverse = compareTexts({
			original: 'E → int',
			rewritten: 'E → int | ε | int int',
			maxLength: 2
		});
		expect(reverse.status === 'done' && reverse.onlyRewritten).toEqual({
			count: 2,
			examples: ['ε', 'int int']
		});
	});

	it('lists a few examples and counts them all', () => {
		const r = compareTexts({ original: AMBIGUOUS, rewritten: 'E → int', maxLength: 5 });
		if (r.status !== 'done') throw new Error('no comparison');
		expect(r.onlyOriginal.count).toBeGreaterThan(LIST_LIMIT);
		expect(r.onlyOriginal.examples).toHaveLength(LIST_LIMIT);
		// Shorter sentences first; one length in the order of the grammar's terminals.
		expect(r.onlyOriginal.examples.slice(0, 3)).toEqual(['( int )', 'int + int', 'int * int']);
	});

	it('says how far it got when the work limit stops it', () => {
		const wide = 'E → E + E | E - E | E * E | E / E | ( E ) | int | id';
		const r = compareTexts({ original: wide, rewritten: wide, maxLength: 9 });
		if (r.status !== 'done') throw new Error('no comparison');
		expect(r.maxLength).toBe(9);
		expect(r.checkedUpTo).toBeLessThan(9);
		expect(r.checkedUpTo).toBeGreaterThanOrEqual(5);
	});

	it('has nothing to compare without two grammars', () => {
		expect(compareTexts({ original: AMBIGUOUS, rewritten: '  ', maxLength: 5 })).toEqual({
			status: 'none'
		});
		expect(compareTexts({ original: '', rewritten: CASCADE, maxLength: 5 })).toEqual({
			status: 'none'
		});
		expect(compareTexts({ original: AMBIGUOUS, rewritten: 'E → ', maxLength: 5 })).toEqual({
			status: 'none'
		});
	});

	it('keeps the length within 1–9', () => {
		expect([MIN_LENGTH, MAX_LENGTH]).toEqual([1, 9]);
		expect(clampLength(0)).toBe(1);
		expect(clampLength(40)).toBe(9);
		expect(clampLength(4.4)).toBe(4);
		expect(clampLength(NaN)).toBe(DEFAULT_LENGTH);
		const r = compareTexts({ original: AMBIGUOUS, rewritten: CASCADE, maxLength: 99 });
		expect(r.status === 'done' && r.maxLength).toBe(9);
	});
});

describe('the worker', () => {
	it('answers a request with plain data that survives a structured clone', () => {
		const request: CompareRequest = { original: AMBIGUOUS, rewritten: CASCADE, maxLength: 5 };
		const posted: unknown[] = [];
		const scope: TaskScope = { onmessage: null, postMessage: (m) => posted.push(m) };
		serveTask(compareTexts, scope);
		scope.onmessage!({ data: { id: 7, input: structuredClone(request) } } as MessageEvent);
		expect(posted).toEqual(['ready', { id: 7, ok: true, output: same(5) }]);
		expect(structuredClone(posted[1])).toEqual(answer(7, () => compareTexts(request)));
	});

	it('tells requests apart', () => {
		const a: CompareRequest = { original: AMBIGUOUS, rewritten: CASCADE, maxLength: 5 };
		expect(sameRequest(a, { ...a })).toBe(true);
		expect(sameRequest(a, { ...a, maxLength: 6 })).toBe(false);
		expect(sameRequest(a, { ...a, rewritten: '' })).toBe(false);
		expect(sameRequest(null, a)).toBe(false);
	});
});
