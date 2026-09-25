import { describe, expect, it } from 'vitest';
import {
	BENCH_METRICS,
	equationLayout,
	flowLayout,
	pickDropTarget,
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
