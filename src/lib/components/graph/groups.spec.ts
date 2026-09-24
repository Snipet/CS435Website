import { describe, expect, it } from 'vitest';
import { fitView, toUser, toViewport, zoomView, clampZoom, viewScale } from './camera';
import { groupShapes } from './groups';
import { layoutAutomaton } from './layout';
import { dfaEndsIn00, thompsonNfa, thompsonPositions } from './fixtures';

describe('groupShapes', () => {
	const thompson = layoutAutomaton(thompsonNfa, { positions: thompsonPositions });
	const shapes = groupShapes(thompson, [
		{ id: 'one', label: "'1'", states: [2, 4] },
		{ id: 'alt', label: '1 | 0', states: [1, 2, 3, 4, 5, 6] },
		{ id: 'star', label: '(1 | 0)*', states: [0, 1, 2, 3, 4, 5, 6, 7], tone: 9 },
		{ id: 'none', states: [42] }
	]);

	it('outlines fragments with rounded rectangles, padded by nesting depth', () => {
		expect(shapes.map((s) => s.id)).toEqual(['one', 'alt', 'star']);
		expect(shapes.every((s) => s.kind === 'rect')).toBe(true);
		const [one, alt, star] = shapes;
		// C and E sit on row −0.5 (y = −42) with radius 22.
		expect(one.bounds.y).toBeLessThan(-42 - 22);
		expect(alt.bounds.x).toBeLessThan(one.bounds.x - 10);
		expect(star.bounds.x).toBeLessThan(alt.bounds.x - 10);
		expect(star.tone).toBe(3);
		expect(alt.tone).toBe(1);
	});

	it('encloses the fragment’s own edges, such as the arcs of A*', () => {
		const star = shapes[2];
		const back = thompson.edges.find((e) => e.from === 6 && e.to === 0)!;
		for (const p of back.points) {
			expect(p.y).toBeGreaterThanOrEqual(star.bounds.y);
			expect(p.x).toBeGreaterThanOrEqual(star.bounds.x);
		}
	});

	it('falls back to halos when members are not next to each other', () => {
		const row = layoutAutomaton(dfaEndsIn00, {
			positions: new Map([
				[0, { x: 0, y: 0 }],
				[1, { x: 110, y: 0 }],
				[2, { x: 220, y: 0 }]
			])
		});
		const [block] = groupShapes(row, [{ id: 'b', label: 'block', states: [0, 2] }]);
		expect(block.kind).toBe('halo');
		expect(block.d.match(/M/g)).toHaveLength(2);
	});
});

describe('camera', () => {
	const content = { x: 0, y: 0, width: 200, height: 100 };

	it('fits content with padding and caps the magnification', () => {
		const v = fitView(content, 10, { width: 1000, height: 1000 });
		expect(viewScale(v, { width: 1000, height: 1000 })).toBeCloseTo(1.25);
		expect(v.x + v.width / 2).toBeCloseTo(100);
		const small = fitView(content, 10, { width: 110, height: 400 });
		expect(small.width).toBeCloseTo(220);
		expect(small.height / small.width).toBeCloseTo(400 / 110);
		expect(fitView(content, 10)).toEqual({ x: -10, y: -10, width: 220, height: 120 });
	});

	it('zooms about a fixed point and clamps', () => {
		const v = { x: 0, y: 0, width: 100, height: 100 };
		const z = zoomView(v, 2, { x: 80, y: 20 });
		expect(z).toEqual({ x: 40, y: 10, width: 50, height: 50 });
		const tooFar = clampZoom(zoomView(v, 100, { x: 50, y: 50 }), v, 0.2, 8);
		expect(v.width / tooFar.width).toBeCloseTo(8);
	});

	it('maps between viewport pixels and user space', () => {
		const v = { x: -50, y: 20, width: 200, height: 100 };
		const vp = { width: 400, height: 300 };
		const p = { x: 12, y: 34 };
		const back = toUser(v, vp, toViewport(v, vp, p));
		expect(back.x).toBeCloseTo(p.x);
		expect(back.y).toBeCloseTo(p.y);
	});
});
