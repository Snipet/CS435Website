import { describe, expect, it } from 'vitest';
import { rovingTarget, tabStop } from './roving';

describe('rovingTarget', () => {
	it('moves one row with the arrow keys and stops at the ends', () => {
		expect(rovingTarget('ArrowDown', 0, 3)).toBe(1);
		expect(rovingTarget('ArrowDown', 2, 3)).toBe(2);
		expect(rovingTarget('ArrowUp', 2, 3)).toBe(1);
		expect(rovingTarget('ArrowUp', 0, 3)).toBe(0);
	});

	it('goes to the first and the last row with Home and End', () => {
		expect(rovingTarget('Home', 2, 3)).toBe(0);
		expect(rovingTarget('End', 0, 3)).toBe(2);
	});

	it('leaves other keys alone', () => {
		for (const key of ['Enter', ' ', 'Tab', 'ArrowLeft', 'ArrowRight', 'a'])
			expect(rovingTarget(key, 1, 3)).toBeNull();
		expect(rovingTarget('ArrowDown', 0, 0)).toBeNull();
	});
});

describe('tabStop', () => {
	const rows = [
		{ id: 0, current: false },
		{ id: 3, current: true },
		{ id: 6, current: false }
	];

	it('is the row that had the focus last', () => {
		expect(tabStop(rows, 6)).toBe(6);
		expect(tabStop(rows, 0)).toBe(0);
	});

	it('is the row of the step shown when no listed row had the focus', () => {
		expect(tabStop(rows, null)).toBe(3);
		// The row that had the focus is gone (the run changed).
		expect(tabStop(rows, 9)).toBe(3);
	});

	it('is the newest row when no row is the current one', () => {
		expect(tabStop([rows[0], rows[2]], null)).toBe(6);
	});

	it('is the last of several current rows', () => {
		const calls = [
			{ id: 1, current: true },
			{ id: 2, current: true },
			{ id: 3, current: false }
		];
		expect(tabStop(calls, null)).toBe(2);
	});

	it('is null for an empty list', () => {
		expect(tabStop([], 4)).toBeNull();
	});
});
