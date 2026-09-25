import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitedStepper } from './limited-stepper';

describe('LimitedStepper', () => {
	let total = 10;
	let limit: number | null = 3;
	let stepper: LimitedStepper;

	beforeEach(() => {
		vi.useFakeTimers();
		total = 10;
		limit = 3;
		stepper = new LimitedStepper(
			() => total,
			() => limit
		);
	});

	afterEach(() => {
		stepper.dispose();
		vi.useRealTimers();
	});

	it('counts every step but stops at the limit', () => {
		expect(stepper.total).toBe(10);
		expect(stepper.max).toBe(3);
		for (let i = 0; i < 6; i++) stepper.next();
		expect(stepper.index).toBe(3);
		expect(stepper.atEnd).toBe(true);
		stepper.prev();
		expect(stepper.index).toBe(2);
		expect(stepper.atEnd).toBe(false);
	});

	it('End, set and the index setter go no further than the limit', () => {
		stepper.last();
		expect(stepper.index).toBe(3);
		stepper.first();
		stepper.set(8);
		expect(stepper.index).toBe(3);
		stepper.index = 9;
		expect(stepper.index).toBe(3);
	});

	it('follows the limit as it moves, and has none when it is null', () => {
		stepper.last();
		limit = 6;
		expect(stepper.index).toBe(3);
		stepper.last();
		expect(stepper.index).toBe(6);
		limit = 1;
		expect(stepper.index).toBe(1);
		limit = null;
		stepper.last();
		expect(stepper.index).toBe(9);
		limit = 99;
		expect(stepper.max).toBe(9);
	});

	it('plays up to the limit, and not at all when only the first step can be shown', () => {
		stepper.play();
		vi.advanceTimersByTime(20_000);
		expect(stepper.index).toBe(3);
		expect(stepper.playing).toBe(false);
		limit = 0;
		stepper.first();
		// StepControls disables Play when the stepper is at its start and its end at once.
		expect(stepper.atStart && stepper.atEnd).toBe(true);
		stepper.play();
		expect(stepper.playing).toBe(false);
		expect(stepper.index).toBe(0);
	});
});
