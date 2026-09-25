import { describe, expect, it } from 'vitest';
import { appendInput, inputError, parseInputs, parseInteger } from './input';
import { presetById } from './presets';
import { defaultState, isTinyVmHash, normalizeState, stateFromPreset } from './state';
import { MAX_TRACE } from './trace';

describe('state', () => {
	it('defaults to the factorial preset, stepping by instruction from reset', () => {
		const s = defaultState();
		expect(s.preset).toBe('factorial');
		expect(s.input).toBe('3');
		expect(s.mode).toBe('instruction');
		expect(s.step).toBe(0);
		expect(s.program).toBe(presetById('factorial')!.value.program);
	});

	it('validates hash values', () => {
		expect(isTinyVmHash({ program: '0: HALT' })).toBe(true);
		expect(isTinyVmHash(defaultState())).toBe(true);
		expect(isTinyVmHash({ ...defaultState(), preset: null })).toBe(true);
		expect(isTinyVmHash(null)).toBe(false);
		expect(isTinyVmHash([])).toBe(false);
		expect(isTinyVmHash({ input: '3' })).toBe(false);
		expect(isTinyVmHash({ program: '', input: 3 })).toBe(false);
		expect(isTinyVmHash({ program: '', mode: 'fast' })).toBe(false);
		expect(isTinyVmHash({ program: '', step: '2' })).toBe(false);
		expect(isTinyVmHash({ program: '', preset: 4 })).toBe(false);
	});

	it('fills defaults and clamps the step', () => {
		expect(normalizeState({ program: '0: HALT' })).toEqual({
			program: '0: HALT',
			input: '',
			mode: 'instruction',
			step: 0,
			preset: null
		});
		expect(normalizeState({ program: '', step: -3.5 }).step).toBe(0);
		expect(normalizeState({ program: '', step: 7.9 }).step).toBe(7);
		expect(normalizeState({ program: '', step: 1e12 }).step).toBe(3 * MAX_TRACE);
		expect(normalizeState({ program: '', step: NaN }).step).toBe(0);
		expect(normalizeState({ program: '', preset: 'gone' }).preset).toBeNull();
		expect(normalizeState({ program: '', preset: 'sum', mode: 'phase' })).toMatchObject({
			preset: 'sum',
			mode: 'phase'
		});
	});

	it('loads a preset, keeping the stepping mode', () => {
		const s = stateFromPreset(presetById('max')!, 'phase');
		expect(s).toMatchObject({ preset: 'max', input: '17 42', mode: 'phase', step: 0 });
	});
});

describe('input queue', () => {
	it('reads integers separated by spaces or commas', () => {
		expect(parseInputs(' 5, 12  -3,+4 ').values).toEqual([5, 12, -3, 4]);
		expect(parseInputs('').values).toEqual([]);
	});

	it('skips tokens that are not 32-bit integers and says so', () => {
		const q = parseInputs('1 x 2.5 3');
		expect(q.values).toEqual([1, 3]);
		expect(q.invalid.map((t) => t.text)).toEqual(['x', '2.5']);
		expect(inputError(q)).toBe('"x", "2.5" are not 32-bit integers; they are skipped.');
		expect(inputError(parseInputs('9999999999'))).toBe(
			'"9999999999" is not a 32-bit integer; it is skipped.'
		);
		expect(inputError(parseInputs('1 2'))).toBeNull();
	});

	it('parses a single prompt answer', () => {
		expect(parseInteger(' -12 ')).toBe(-12);
		expect(parseInteger('3a')).toBeNull();
		expect(parseInteger('')).toBeNull();
	});

	it('appends values in the separator style already used', () => {
		expect(appendInput('', 3)).toBe('3');
		expect(appendInput('1 2 ', 3)).toBe('1 2 3');
		expect(appendInput('1, 2', 3)).toBe('1, 2, 3');
		expect(appendInput('1,2,', 3)).toBe('1,2,3');
	});
});
