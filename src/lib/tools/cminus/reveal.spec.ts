import { describe, expect, it } from 'vitest';
import { centered, scrollDelta, sideDelta } from './reveal';

describe('scrollDelta', () => {
	const view = { height: 400, head: 30 };

	it('leaves a block that is in view where it is', () => {
		expect(scrollDelta({ ...view, top: 36, bottom: 394 })).toBe(0);
		expect(scrollDelta({ ...view, top: 100, bottom: 122 })).toBe(0);
	});

	it('scrolls the least distance to a block that fits in the view', () => {
		// Above the view (under the sticky header): down to just below the header.
		expect(scrollDelta({ ...view, top: 10, bottom: 32 })).toBe(10 - 36);
		expect(scrollDelta({ ...view, top: -200, bottom: -100 })).toBe(-236);
		// Below the view: up until its last row shows.
		expect(scrollDelta({ ...view, top: 380, bottom: 500 })).toBe(500 - 394);
	});

	it('puts the first row of a block taller than the view at the top, with context above it', () => {
		expect(scrollDelta({ ...view, top: 380, bottom: 1400 })).toBe(380 - 36 - 24);
		expect(scrollDelta({ ...view, top: -500, bottom: 900 })).toBe(-500 - 36 - 24);
		// A small box keeps less context.
		expect(scrollDelta({ height: 60, head: 0, top: 200, bottom: 600 })).toBe(200 - 6 - 12);
	});

	it('works without a header', () => {
		expect(scrollDelta({ height: 300, head: 0, top: 2, bottom: 20 })).toBe(-4);
		expect(scrollDelta({ height: 300, head: 0, top: 6, bottom: 294 })).toBe(0);
	});
});

describe('sideDelta', () => {
	it('leaves a piece that is in view, clear of the gutter', () => {
		expect(sideDelta(80, 120, 300, 72)).toBe(0);
		expect(sideDelta(72, 294, 300, 72)).toBe(0);
	});

	it('brings the start of a piece to the margin from either side', () => {
		// Cut off at the right edge.
		expect(sideDelta(280, 320, 300, 72)).toBe(208);
		// Under the gutter, or scrolled away to the left.
		expect(sideDelta(40, 60, 300, 72)).toBe(-32);
		expect(sideDelta(-150, -100, 300, 72)).toBe(-222);
	});
});

describe('centered', () => {
	it('puts the middle of a stretch in the middle of the view, never before the start', () => {
		expect(centered(500, 560, 300)).toBe(380);
		expect(centered(100, 140, 300)).toBe(0);
		expect(centered(0, 2000, 400)).toBe(800);
	});
});
