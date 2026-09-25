import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasErrors } from '$lib/theory/diagnostics';
import { MAX_STATES } from './model';
import { TEXT_APPLY_DELAY, checkAutomatonText, createTextApplier } from './text-sync';

describe('text applier', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function setup() {
		const machine = { current: 'M0' };
		const applied: string[] = [];
		const applier = createTextApplier({
			current: () => machine.current,
			apply: (text) => applied.push(text)
		});
		return { machine, applied, applier };
	}

	it('applies the last text after a pause in typing', () => {
		const { applied, applier } = setup();
		applier.input('A 0');
		vi.advanceTimersByTime(TEXT_APPLY_DELAY - 1);
		applier.input('A 0 B');
		vi.advanceTimersByTime(TEXT_APPLY_DELAY - 1);
		expect(applied).toEqual([]);
		expect(applier.pending).toBe(true);
		vi.advanceTimersByTime(1);
		expect(applied).toEqual(['A 0 B']);
		expect(applier.pending).toBe(false);
	});

	it('drops an edit when the machine is replaced before it applies (a preset, Undo)', () => {
		const { machine, applied, applier } = setup();
		applier.input('C 3 A');
		machine.current = 'M1';
		vi.advanceTimersByTime(TEXT_APPLY_DELAY);
		expect(applied).toEqual([]);
	});

	it('drops an edit that was cancelled, even if the machine comes back (Undo, then Redo)', () => {
		const { machine, applied, applier } = setup();
		applier.input('C 3 A');
		machine.current = 'M1';
		applier.cancel();
		machine.current = 'M0';
		vi.advanceTimersByTime(TEXT_APPLY_DELAY);
		expect(applied).toEqual([]);
		expect(applier.pending).toBe(false);
	});

	it('writes the next edit against the machine current when it is typed', () => {
		const { machine, applied, applier } = setup();
		machine.current = 'M1';
		applier.input('A 1 B');
		vi.advanceTimersByTime(TEXT_APPLY_DELAY);
		expect(applied).toEqual(['A 1 B']);
	});
});

describe('checkAutomatonText', () => {
	it('returns the machine for good text', () => {
		const r = checkAutomatonText('start: A\naccept: B\nA 0 B');
		expect(r.automaton?.states.map((s) => s.name)).toEqual(['A', 'B']);
		expect(hasErrors(r.diagnostics)).toBe(false);
	});

	it('reports errors and returns no machine for bad text', () => {
		const r = checkAutomatonText('A ??? ');
		expect(r.automaton).toBeNull();
		expect(hasErrors(r.diagnostics)).toBe(true);
	});

	it('refuses machines larger than the editor draws', () => {
		const lines = Array.from({ length: MAX_STATES + 1 }, (_, i) => `q${i} 0 q${i + 1}`);
		const r = checkAutomatonText(['start: q0', ...lines].join('\n'));
		expect(r.automaton).toBeNull();
		expect(r.diagnostics.at(-1)?.message).toMatch(/at most 200 states/);
	});
});
