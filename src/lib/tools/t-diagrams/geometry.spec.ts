import { describe, expect, it } from 'vitest';
import {
	BENCH_METRICS,
	canvasFrame,
	canvasToClient,
	clientToCanvas,
	DRAG_THRESHOLD,
	dragAt,
	edgeScroll,
	equationLayout,
	fitEquation,
	flowLayout,
	MIN_LABEL_PX,
	minFitWidth,
	overlayBox,
	pickDropTarget,
	pickFit,
	snapOffset,
	tGeometry,
	TRAY_METRICS,
	type Metrics
} from './geometry';
import type { TDiagram } from './model';

const T = (source: string, target: string, host: string): TDiagram => ({ source, target, host });
const m: Metrics = { unit: 40, font: 16, pad: 8 };

describe('tGeometry', () => {
	it('draws short labels with the slide proportions: three stems wide, stem centered', () => {
		const g = tGeometry(T('S', 'T', 'H'), m);
		expect(g.width).toBe(120);
		expect(g.height).toBe(80);
		expect(g.stemW).toBe(40);
		expect(g.stemX).toBe(40);
		expect(g.path).toBe('M0 0H120V40H80V80H40V40H0Z');
	});

	it('places the source top-left, the target top-right and the host in the stem', () => {
		const g = tGeometry(T('S', 'T', 'H'), m);
		expect(g.source.x).toBe(m.pad);
		expect(g.target.x).toBe(g.width - m.pad);
		expect(g.source.y).toBeLessThan(m.unit);
		expect(g.host.x).toBe(g.stemX + m.pad);
		expect(g.host.y).toBeGreaterThan(m.unit);
		expect(g.host.y).toBeLessThan(2 * m.unit);
	});

	it('widens the stem for a long host and keeps arms at least one unit wide', () => {
		const g = tGeometry(T('L', 'M_OTHER', 'M_NATIVE'), m);
		expect(g.stemW).toBeGreaterThan(m.unit);
		expect(g.stemX).toBeGreaterThanOrEqual(m.unit);
		expect(g.width - g.stemX - g.stemW).toBeGreaterThanOrEqual(m.unit);
	});

	it('widens the crossbar so source and target do not overlap', () => {
		const g = tGeometry(T('Fortran', 'PowerPC', 'C'), m);
		const need = (7 + 7) * 0.6 * m.font + 2 * m.pad;
		expect(g.width).toBeGreaterThan(need);
	});

	it('names the regions a composition marks', () => {
		const g = tGeometry(T('S', 'T', 'H'), m);
		expect(g.regions.stem).toEqual({ x: 40, y: 40, width: 40, height: 40 });
		expect(g.regions.leftArm).toEqual({ x: 0, y: 0, width: 40, height: 40 });
		expect(g.regions.rightArm).toEqual({ x: 80, y: 0, width: 40, height: 40 });
	});
});

describe('equationLayout (slide 8)', () => {
	const program = tGeometry(T('L', 'M', 'L′'), m);
	const translator = tGeometry(T('L′', 'M′', 'M'), m);
	const result = tGeometry(T('L', 'M', 'M′'), m);

	it('puts the translator one stem height down, its left edge against the stem', () => {
		const lay = equationLayout(program, translator, result, { snapped: true });
		expect(snapOffset(program)).toEqual({ x: 80, y: 40 });
		expect(lay.program).toEqual({ x: 0, y: 0 });
		expect(lay.translator).toEqual({ x: program.stemX + program.stemW, y: program.unit });
		// The stem's bottom and the translator crossbar's bottom line up.
		expect(lay.program.y + program.height).toBe(lay.translator.y + translator.unit);
	});

	it('puts "=" at stem height and the result level with the program', () => {
		const lay = equationLayout(program, translator, result, { snapped: true, gap: 18 });
		const pairRight = lay.translator.x + translator.width;
		expect(lay.equals!.y).toBe(60);
		expect(lay.equals!.x).toBeGreaterThan(pairRight);
		expect(lay.result!.y).toBe(0);
		expect(lay.result!.x).toBeGreaterThan(lay.equals!.x);
		expect(lay.width).toBe(lay.result!.x + result.width);
		expect(lay.height).toBe(3 * m.unit);
	});

	it('pulls an illegal pair apart and leaves out the result', () => {
		const lay = equationLayout(program, translator, null, { snapped: false, apart: 30 });
		expect(lay.translator.x).toBe(110);
		expect(lay.equals).toBeNull();
		expect(lay.result).toBeNull();
		expect(lay.width).toBe(110 + translator.width);
	});

	it('stacked: puts "=" and the result below the pair, program and result lined up', () => {
		const lay = equationLayout(program, translator, result, {
			snapped: true,
			gap: 18,
			stacked: true
		});
		const indent = 16 + 18;
		expect(lay.program).toEqual({ x: indent, y: 0 });
		expect(lay.translator).toEqual({ x: indent + 80, y: 40 });
		expect(lay.result).toEqual({ x: indent, y: 3 * m.unit + 18 });
		// "=" in the column left of the result, level with its crossbar.
		expect(lay.equals).toEqual({ x: 8, y: 3 * m.unit + 18 + m.unit / 2 });
		expect(lay.width).toBe(indent + 80 + translator.width);
		expect(lay.height).toBe(3 * m.unit + 18 + result.height);
		// Narrower than side by side.
		const wide = equationLayout(program, translator, result, { snapped: true, gap: 18 });
		expect(lay.width).toBeLessThan(wide.width);
	});

	it('stacked without a result is the plain pair', () => {
		const opts = { snapped: false, apart: 30 };
		expect(equationLayout(program, translator, null, { ...opts, stacked: true })).toEqual(
			equationLayout(program, translator, null, opts)
		);
	});

	it('stacked keeps a wide result inside the width', () => {
		const long = tGeometry(T('Fortran', 'PowerPC', 'M_NATIVE'), m);
		const lay = equationLayout(program, translator, long, { snapped: true, stacked: true });
		expect(lay.width).toBeGreaterThanOrEqual(lay.result!.x + long.width);
	});
});

describe('fitting drawings to narrow boxes', () => {
	it('minFitWidth: the narrowest box that keeps labels at 15 px', () => {
		expect(MIN_LABEL_PX).toBe(15);
		expect(minFitWidth(517, 17)).toBe(457);
		expect(minFitWidth(300, 15)).toBe(300);
		expect(minFitWidth(300, 18, 9)).toBe(150);
	});

	it('pickFit: the first layout that fits, else the narrowest; the first before measuring', () => {
		const a = { name: 'wide', width: 400 };
		const b = { name: 'narrow', width: 250 };
		expect(pickFit(600, 18, [a, b]).name).toBe('wide');
		expect(pickFit(minFitWidth(400, 18), 18, [a, b]).name).toBe('wide');
		expect(pickFit(minFitWidth(400, 18) - 1, 18, [a, b]).name).toBe('narrow');
		expect(pickFit(100, 18, [a, b]).name).toBe('narrow');
		expect(pickFit(0, 18, [a, b]).name).toBe('wide');
		expect(pickFit(Number.NaN, 18, [a, b]).name).toBe('wide');
	});

	describe('fitEquation (the bench)', () => {
		const M = BENCH_METRICS;
		const pg = tGeometry(T('L', 'M', 'L′'), M);
		const tg = tGeometry(T('L′', 'M′', 'M'), M);
		const rg = tGeometry(T('L', 'M', 'M′'), M);
		const opts = { snapped: true, apart: 40, gap: 20 };
		const PAD = 10;
		/** The bench's box on a 360 px screen. */
		const PHONE = 278;
		const label = (lay: { width: number }, box: number) =>
			M.font * Math.min(1, box / (lay.width + 2 * PAD));

		it('keeps the slide’s layout where it fits', () => {
			expect(fitEquation(pg, tg, rg, opts, 800, PAD)).toEqual(equationLayout(pg, tg, rg, opts));
			expect(fitEquation(pg, tg, rg, opts, 0, PAD)).toEqual(equationLayout(pg, tg, rg, opts));
		});

		it('stacks on a phone, keeping the labels at 15 px or more', () => {
			const wide = equationLayout(pg, tg, rg, opts);
			expect(label(wide, PHONE)).toBeLessThan(MIN_LABEL_PX);
			const lay = fitEquation(pg, tg, rg, opts, PHONE, PAD);
			expect(lay).toEqual(equationLayout(pg, tg, rg, { ...opts, stacked: true }));
			expect(label(lay, PHONE)).toBeGreaterThanOrEqual(MIN_LABEL_PX);
		});

		it('stacks the cross-compiler preset’s pair on a phone too', () => {
			const p = tGeometry(T('L', 'M_OTHER', 'L'), M);
			const t = tGeometry(T('L', 'M_NATIVE', 'M_NATIVE'), M);
			const r = tGeometry(T('L', 'M_OTHER', 'M_NATIVE'), M);
			const lay = fitEquation(p, t, r, opts, PHONE, PAD);
			expect(lay.result!.y).toBeGreaterThan(0);
			expect(label(lay, PHONE)).toBeGreaterThanOrEqual(MIN_LABEL_PX);
		});

		it('leaves a pair without a result as it is', () => {
			const bad = { ...opts, snapped: false };
			expect(fitEquation(pg, tg, null, bad, 100, PAD)).toEqual(equationLayout(pg, tg, null, bad));
		});
	});
});

describe('canvas frames (the tray’s drag overlay)', () => {
	it('maps client points to canvas units and back', () => {
		const f = canvasFrame({ left: 100, top: 50, width: 200 }, 400);
		expect(f).toEqual({ left: 100, top: 50, scale: 2 });
		expect(clientToCanvas(f, { x: 110, y: 60 })).toEqual({ x: 20, y: 20 });
		expect(canvasToClient(f, { x: 20, y: 20 })).toEqual({ x: 110, y: 60 });
		expect(canvasFrame({ left: 0, top: 0, width: 0 }, 400).scale).toBe(1);
	});

	it('follows a scrolled canvas: the same client point is further along it', () => {
		const before = canvasFrame({ left: 20, top: 300, width: 600 }, 600);
		const after = canvasFrame({ left: 20 - 150, top: 300, width: 600 }, 600);
		const pointer = { x: 200, y: 340 };
		expect(clientToCanvas(after, pointer).x - clientToCanvas(before, pointer).x).toBe(150);
	});

	it('places the overlay over the diagram, margin included, in client px', () => {
		const f = { left: 10, top: 20, scale: 1 };
		expect(overlayBox(f, { x: 100, y: 50 }, { width: 120, height: 80 }, 6)).toEqual({
			left: 104,
			top: 64,
			width: 132,
			height: 92
		});
		// A snap position left of the canvas (x < 0) is still drawn, left of its box.
		expect(overlayBox(f, { x: -40, y: 0 }, { width: 120, height: 80 }).left).toBe(-30);
		const half = { left: 0, top: 0, scale: 2 };
		expect(overlayBox(half, { x: 100, y: 50 }, { width: 120, height: 80 })).toEqual({
			left: 50,
			top: 25,
			width: 60,
			height: 40
		});
	});
});

describe('edgeScroll', () => {
	const box = { left: 100, right: 400 };

	it('scrolls toward an edge the pointer is near, faster closer to it', () => {
		expect(edgeScroll(250, box)).toBe(0);
		expect(edgeScroll(140, box)).toBe(0);
		expect(edgeScroll(120, box)).toBeLessThan(0);
		expect(edgeScroll(100, box)).toBe(-12);
		expect(edgeScroll(40, box)).toBe(-12);
		expect(edgeScroll(380, box)).toBeGreaterThan(0);
		expect(edgeScroll(400, box)).toBe(12);
		expect(Math.abs(edgeScroll(125, box))).toBeLessThan(Math.abs(edgeScroll(105, box)));
	});

	it('uses a smaller edge in a small box, and nothing in an empty one', () => {
		expect(edgeScroll(130, { left: 100, right: 180 })).toBe(0);
		expect(edgeScroll(110, { left: 100, right: 180 })).toBeLessThan(0);
		expect(edgeScroll(100, { left: 100, right: 100 })).toBe(0);
	});
});

describe('dragAt', () => {
	const g = tGeometry(T('S', 'T', 'H'), TRAY_METRICS);
	const home = { x: 14, y: 30 };
	const target = { id: 'b', pos: { x: 14, y: 160 }, geom: g };
	const off = snapOffset(g);
	const radius = g.unit * 1.8;

	it('moves the diagram with the pointer and waits for the threshold', () => {
		const frame = { left: 0, top: 0, scale: 1 };
		const start = { x: 40, y: 50 };
		const drag = { home, geom: g, start };
		expect(dragAt(drag, frame, { x: 42, y: 51 }, [], radius).far).toBe(false);
		const at = dragAt(drag, frame, { x: 40 + DRAG_THRESHOLD, y: 50 }, [], radius);
		expect(at.far).toBe(true);
		expect(at.pos).toEqual({ x: home.x + DRAG_THRESHOLD, y: home.y });
		expect(at.target).toBeNull();
	});

	it('finds the drop target after the box scrolls under a still pointer', () => {
		// The pointer holds the diagram so its stem is left of the target's arm, off by 100.
		const start = { x: 40, y: 50 };
		const drag = { home, geom: g, start };
		const snapClient = {
			x: start.x + (target.pos.x - off.x - home.x) - 100,
			y: start.y + (target.pos.y - off.y - home.y)
		};
		const still = canvasFrame({ left: 0, top: 0, width: 600 }, 600);
		expect(dragAt(drag, still, snapClient, [target], radius).target).toBeNull();
		// The box scrolls 100 px to the right, so the canvas moves 100 px left on
		// screen: the pointer has not moved, but it is now 100 units further
		// along the canvas, and the stem is on the target's arm.
		const scrolled = canvasFrame({ left: -100, top: 0, width: 600 }, 600);
		const at = dragAt(drag, scrolled, snapClient, [target], radius);
		expect(at.pointer.x).toBe(snapClient.x + 100);
		expect(at.target).toEqual({
			id: 'b',
			snap: { x: target.pos.x - off.x, y: target.pos.y - off.y }
		});
	});
});

describe('flowLayout', () => {
	const opts = { gapX: 10, gapY: 5, padX: 4, padY: 2 };

	it('fills rows left to right and wraps', () => {
		const sizes = [
			{ width: 50, height: 20 },
			{ width: 50, height: 30 },
			{ width: 50, height: 20 }
		];
		const out = flowLayout(sizes, 130, opts);
		expect(out.positions).toEqual([
			{ x: 4, y: 2 },
			{ x: 64, y: 2 },
			{ x: 4, y: 37 }
		]);
		expect(out.height).toBe(37 + 20 + 2);
		expect(out.width).toBe(64 + 50 + 4);
	});

	it('gives an oversized box its own row', () => {
		const out = flowLayout(
			[
				{ width: 300, height: 10 },
				{ width: 20, height: 10 }
			],
			100,
			opts
		);
		expect(out.positions[0]).toEqual({ x: 4, y: 2 });
		expect(out.positions[1]).toEqual({ x: 4, y: 17 });
		// The reported width covers it, so the tray can widen its canvas (and scroll).
		expect(out.width).toBe(4 + 300 + 4);
	});

	it('reports a long-named diagram wider than a phone’s tray', () => {
		const g = tGeometry(T('x86-64 machine code', 'WebAssembly bytecode', 'C'), TRAY_METRICS);
		const out = flowLayout([{ width: g.width, height: g.height }], 302, opts);
		expect(out.width).toBeGreaterThan(302);
		expect(out.width).toBe(opts.padX + g.width + opts.padX);
	});

	it('handles an empty list', () => {
		expect(flowLayout([], 100, opts)).toEqual({ positions: [], width: 8, height: 4 });
	});
});

describe('pickDropTarget', () => {
	const g = tGeometry(T('S', 'T', 'H'), TRAY_METRICS);
	const target = { id: 'b', pos: { x: 300, y: 100 }, geom: g };
	const snap = { x: 300 - (g.stemX + g.stemW), y: 100 - g.unit };

	it('snaps a stem that is close to the left arm', () => {
		const pos = { x: snap.x + 6, y: snap.y - 4 };
		expect(pickDropTarget({ pos, geom: g }, [target], { x: 0, y: 0 }, 40)).toEqual({
			id: 'b',
			snap
		});
	});

	it('ignores far diagrams unless the pointer is over them', () => {
		const far = { x: 0, y: 0 };
		expect(pickDropTarget({ pos: far, geom: g }, [target], { x: 5, y: 5 }, 40)).toBeNull();
		expect(pickDropTarget({ pos: far, geom: g }, [target], { x: 310, y: 110 }, 40)).toEqual({
			id: 'b',
			snap
		});
	});

	it('prefers the nearest left arm', () => {
		const other = { id: 'c', pos: { x: 300, y: 300 }, geom: g };
		const pos = { x: snap.x, y: snap.y + 150 };
		expect(pickDropTarget({ pos, geom: g }, [target, other], { x: 0, y: 0 }, 400)?.id).toBe('c');
	});

	it('works at the bench scale too', () => {
		const big = tGeometry(T('L', 'M', 'L′'), BENCH_METRICS);
		expect(snapOffset(big)).toEqual({ x: big.stemX + big.stemW, y: BENCH_METRICS.unit });
	});
});
