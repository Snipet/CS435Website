import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampIndex, DEFAULT_SPEED, keyToCommand, Stepper } from './stepper.svelte';

describe('clampIndex', () => {
	it('clamps into [0, total - 1]', () => {
		expect(clampIndex(5, 3)).toBe(2);
		expect(clampIndex(-2, 3)).toBe(0);
		expect(clampIndex(1.7, 3)).toBe(1);
		expect(clampIndex(4, 0)).toBe(0);
		expect(clampIndex(NaN, 5)).toBe(0);
	});
});

describe('Stepper', () => {
	let total = 5;
	let stepper: Stepper;

	beforeEach(() => {
		vi.useFakeTimers();
		total = 5;
		stepper = new Stepper(() => total);
	});

	afterEach(() => {
		stepper.dispose();
		vi.useRealTimers();
	});

	it('moves within bounds', () => {
		expect(stepper.index).toBe(0);
		expect(stepper.atStart).toBe(true);
		stepper.prev();
		expect(stepper.index).toBe(0);
		stepper.next();
		stepper.next();
		expect(stepper.index).toBe(2);
		stepper.last();
		expect(stepper.index).toBe(4);
		expect(stepper.atEnd).toBe(true);
		stepper.next();
		expect(stepper.index).toBe(4);
		stepper.first();
		expect(stepper.index).toBe(0);
		stepper.set(3);
		expect(stepper.index).toBe(3);
		stepper.set(99);
		expect(stepper.index).toBe(4);
		stepper.index = -1;
		expect(stepper.index).toBe(0);
	});

	it('clamps when the number of steps shrinks', () => {
		stepper.set(4);
		total = 2;
		expect(stepper.index).toBe(1);
		expect(stepper.atEnd).toBe(true);
		stepper.prev();
		expect(stepper.index).toBe(0);
		total = 0;
		expect(stepper.total).toBe(0);
		expect(stepper.index).toBe(0);
	});

	it('keeps the clamped step when the number of steps grows again', () => {
		total = 10;
		stepper.set(8);
		total = 3;
		expect(stepper.index).toBe(2);
		total = 10;
		expect(stepper.index).toBe(2);
		stepper.next();
		expect(stepper.index).toBe(3);
		// While there are no steps (e.g. the input does not parse) the position resets.
		total = 0;
		expect(stepper.index).toBe(0);
		total = 10;
		expect(stepper.index).toBe(0);
	});

	it('plays at the configured speed and stops at the end', () => {
		expect(stepper.speed).toBe(DEFAULT_SPEED);
		stepper.speed = 2;
		stepper.play();
		expect(stepper.playing).toBe(true);
		vi.advanceTimersByTime(500);
		expect(stepper.index).toBe(1);
		vi.advanceTimersByTime(1500);
		expect(stepper.index).toBe(4);
		expect(stepper.playing).toBe(false);
		vi.advanceTimersByTime(2000);
		expect(stepper.index).toBe(4);
	});

	it('restarts from the first step when played at the end', () => {
		stepper.last();
		stepper.toggle();
		expect(stepper.playing).toBe(true);
		expect(stepper.index).toBe(0);
		stepper.toggle();
		expect(stepper.playing).toBe(false);
	});

	it('changes speed while playing', () => {
		stepper.play();
		stepper.speed = 10;
		vi.advanceTimersByTime(200);
		expect(stepper.index).toBe(2);
		stepper.speed = 0;
		expect(stepper.speed).toBe(10);
	});

	it('does not play with fewer than two steps', () => {
		total = 1;
		stepper.play();
		expect(stepper.playing).toBe(false);
	});

	it('stops on dispose', () => {
		stepper.play();
		stepper.dispose();
		vi.advanceTimersByTime(5000);
		expect(stepper.index).toBe(0);
		expect(stepper.playing).toBe(false);
	});

	it('accepts a base speed and a start index', () => {
		const s = new Stepper(() => 10, { speed: 3, index: 4 });
		expect(s.baseSpeed).toBe(3);
		expect(s.speed).toBe(3);
		expect(s.index).toBe(4);
	});
});

describe('keyToCommand', () => {
	const div = { tagName: 'DIV' };

	it('maps arrows, Home/End and Space on plain elements', () => {
		expect(keyToCommand('ArrowRight', div)).toBe('next');
		expect(keyToCommand('ArrowLeft', div)).toBe('prev');
		expect(keyToCommand('Home', div)).toBe('first');
		expect(keyToCommand('End', div)).toBe('last');
		expect(keyToCommand(' ', div)).toBe('toggle');
		expect(keyToCommand('a', div)).toBeNull();
	});

	it('never fires while typing', () => {
		for (const t of [
			{ tagName: 'INPUT', type: 'text' },
			{ tagName: 'INPUT', type: 'number' },
			{ tagName: 'TEXTAREA' },
			{ tagName: 'SELECT' },
			{ tagName: 'DIV', isContentEditable: true }
		]) {
			for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', ' ']) {
				expect(keyToCommand(key, t)).toBeNull();
			}
		}
	});

	it('leaves Space to buttons and links but steps with arrows', () => {
		expect(keyToCommand(' ', { tagName: 'BUTTON' })).toBeNull();
		expect(keyToCommand(' ', { tagName: 'A' })).toBeNull();
		expect(keyToCommand('ArrowRight', { tagName: 'BUTTON' })).toBe('next');
	});

	it('leaves arrows to sliders and composite widgets', () => {
		const range = { tagName: 'INPUT', type: 'range' };
		expect(keyToCommand('ArrowRight', range)).toBeNull();
		expect(keyToCommand('Home', range)).toBeNull();
		expect(keyToCommand(' ', range)).toBe('toggle');
		expect(keyToCommand('ArrowRight', { tagName: 'BUTTON', role: 'tab' })).toBeNull();
		expect(keyToCommand('ArrowRight', { tagName: 'INPUT', type: 'radio' })).toBeNull();
		expect(keyToCommand('ArrowDown', { tagName: 'DIV', role: 'listbox' })).toBeNull();
	});

	it('ignores modified keys', () => {
		expect(keyToCommand('ArrowRight', div, { meta: true })).toBeNull();
		expect(keyToCommand('ArrowLeft', div, { alt: true })).toBeNull();
		expect(keyToCommand('Home', div, { ctrl: true })).toBeNull();
	});
});
