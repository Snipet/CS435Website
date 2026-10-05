import { describe, expect, it } from 'vitest';
import { scrollToShow, tailWindow } from './scroll';

describe('scrollToShow', () => {
	it('leaves the box alone when the row is in view', () => {
		expect(scrollToShow(0, 300, 0, 30)).toBe(0);
		expect(scrollToShow(100, 300, 100, 30)).toBe(100);
		expect(scrollToShow(100, 300, 370, 30)).toBe(100);
	});

	it('scrolls down just far enough for a row below', () => {
		expect(scrollToShow(0, 300, 290, 30)).toBe(20);
		// The case of the log at 900 px: a row of three lines at the end.
		expect(scrollToShow(24, 336, 307, 76)).toBe(47);
	});

	it('scrolls up to the top of a row above', () => {
		expect(scrollToShow(200, 300, 150, 30)).toBe(150);
		expect(scrollToShow(200, 300, 0, 30)).toBe(0);
	});

	it('shows the top of a row taller than the box', () => {
		expect(scrollToShow(0, 100, 250, 180)).toBe(250);
		expect(scrollToShow(400, 100, 250, 180)).toBe(250);
	});

	it('never scrolls before the start', () => {
		// A target near the edge, asked for with a margin around it.
		expect(scrollToShow(40, 300, -12, 44)).toBe(0);
	});
});

describe('tailWindow', () => {
	it('draws every row of a list within the limit', () => {
		expect(tailWindow(0, 400)).toEqual({ start: 0, hidden: 0 });
		expect(tailWindow(12, 400)).toEqual({ start: 0, hidden: 0 });
		expect(tailWindow(400, 400)).toEqual({ start: 0, hidden: 0 });
	});

	it('draws the last rows of a longer list and counts the rest', () => {
		expect(tailWindow(401, 400)).toEqual({ start: 1, hidden: 1 });
		expect(tailWindow(3000, 400)).toEqual({ start: 2600, hidden: 2600 });
	});

	it('draws at least one row', () => {
		expect(tailWindow(5, 0)).toEqual({ start: 4, hidden: 4 });
		expect(tailWindow(5, 2.9)).toEqual({ start: 3, hidden: 3 });
	});
});
