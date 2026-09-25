import { describe, expect, it } from 'vitest';
import { overflows } from './scroll-region';

describe('overflows', () => {
	const box = (scrollWidth: number, scrollHeight: number) => ({
		scrollWidth,
		scrollHeight,
		clientWidth: 300,
		clientHeight: 200
	});

	it('is true when the content is taller or wider than the box', () => {
		expect(overflows(box(300, 540))).toBe(true);
		expect(overflows(box(411, 200))).toBe(true);
	});

	it('is false when the content fits, allowing a pixel for rounding', () => {
		expect(overflows(box(300, 200))).toBe(false);
		expect(overflows(box(301, 201))).toBe(false);
	});
});
