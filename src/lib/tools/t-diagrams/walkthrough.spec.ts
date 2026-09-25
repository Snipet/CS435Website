import { describe, expect, it } from 'vitest';
import { FIGURE_METRICS, MIN_LABEL_PX, minFitWidth } from './geometry';
import { formatT, piecesText } from './model';
import {
	BOOTSTRAP_FACTS,
	bootstrapFigure,
	bootstrapRows,
	bootstrapSteps,
	COMPILER_IN_SUBSET,
	FIGURE_NARROW_BELOW,
	FIGURE_PAD,
	FIGURE_TEXT_SIZE,
	figureViewWidth,
	QUICK_COMPILER,
	WANT,
	WANT_LABEL_SIZE,
	type BootstrapFigure
} from './walkthrough';

describe('bootstrapRows (Intro (cont’d), slide 8)', () => {
	const [one, two] = bootstrapRows();

	it('has the slide’s givens', () => {
		expect(formatT(WANT)).toBe('T(L → M / M)');
		expect(formatT(COMPILER_IN_SUBSET)).toBe('T(L → M / L′)');
		expect(formatT(QUICK_COMPILER)).toBe('T(L′ → M′ / M)');
		expect(BOOTSTRAP_FACTS.subsets).toEqual([{ sub: 'L′', sup: 'L' }]);
		expect(BOOTSTRAP_FACTS.runnable).toEqual(['M', 'M′']);
	});

	it('step 1): T(L → M / L′) with T(L′ → M′ / M) = T(L → M / M′)', () => {
		expect(one.label).toBe('1)');
		expect(formatT(one.program)).toBe('T(L → M / L′)');
		expect(formatT(one.translator)).toBe('T(L′ → M′ / M)');
		expect(one.composition.legal).toBe(true);
		expect(formatT(one.result)).toBe('T(L → M / M′)');
	});

	it('step 2): T(L → M / L′) with T(L → M / M′) = T(L → M / M), using L′ ⊆ L', () => {
		expect(two.label).toBe('2)');
		expect(formatT(two.program)).toBe('T(L → M / L′)');
		expect(formatT(two.translator)).toBe('T(L → M / M′)');
		expect(two.composition.legal).toBe(true);
		expect(formatT(two.result)).toBe(formatT(WANT));
		const reads = two.composition.checks.find((c) => c.rule === 'reads')!;
		expect(piecesText(reads.pieces)).toContain('L′ ⊆ L');
	});
});

describe('bootstrapSteps', () => {
	const steps = bootstrapSteps();

	it('shows the goal, then each row’s pair and its result', () => {
		expect(steps.map((s) => s.rows)).toEqual([
			['hidden', 'hidden'],
			['pair', 'hidden'],
			['result', 'hidden'],
			['result', 'pair'],
			['result', 'result']
		]);
		expect(steps.map((s) => s.focus)).toEqual([
			null,
			{ row: 0, part: 'meet' },
			{ row: 0, part: 'result' },
			{ row: 1, part: 'meet' },
			{ row: 1, part: 'result' }
		]);
	});

	it('reaches the goal only at the last step', () => {
		expect(steps.map((s) => s.goalMet)).toEqual([false, false, false, false, true]);
	});

	it('words each step with the slide’s terms', () => {
		const text = steps.map((s) => piecesText(s.pieces));
		expect(text[0]).toContain('T(L → M / M)');
		expect(text[0]).toContain('tough');
		expect(text[1]).toMatch(/^1\) /);
		expect(text[1]).toContain('simple subset');
		expect(text[1]).toContain('inefficient M-code');
		expect(text[2]).toMatch(/^= T\(L → M \/ M′\)/);
		expect(text[3]).toMatch(/^2\) /);
		expect(text[3]).toContain('L′ ⊆ L');
		expect(text[4]).toMatch(/^= T\(L → M \/ M\)/);
	});
});

describe('bootstrapFigure', () => {
	const fig = bootstrapFigure();

	it('lines the goal up with the results column', () => {
		for (const row of fig.rows) expect(row.layout.result!.x).toBe(fig.goal.pos.x);
		expect(fig.rows[0].layout.equals!.x).toBe(fig.rows[1].layout.equals!.x);
	});

	it('stacks the rows below the goal without overlap', () => {
		const [a, b] = fig.rows;
		expect(a.layout.program.y).toBeGreaterThanOrEqual(fig.goal.geom.height);
		expect(b.layout.program.y).toBeGreaterThanOrEqual(a.layout.program.y + a.layout.height);
		expect(fig.height).toBe(b.layout.program.y + b.layout.height);
	});

	it('snaps each program onto its translator', () => {
		for (const row of fig.rows) {
			const p = row.geoms.program;
			expect(row.layout.translator.x - row.layout.program.x).toBe(p.stemX + p.stemW);
			expect(row.layout.translator.y - row.layout.program.y).toBe(p.unit);
		}
	});

	it('keeps the "Want this" arrow between the text and the goal', () => {
		expect(fig.arrow.x1).toBeGreaterThan(0);
		expect(fig.arrow.x2).toBeLessThan(fig.goal.pos.x);
		expect(fig.arrow.x2 - fig.arrow.x1).toBeGreaterThan(40);
		expect(fig.arrow.y1).toBe(fig.arrow.y2);
		expect(fig.arrow.label.anchor).toBe('middle');
		expect(fig.width).toBeGreaterThanOrEqual(fig.goal.pos.x + fig.goal.geom.width);
	});

	it('writes the slide’s prose on either side of the goal', () => {
		expect(fig.given.lines).toEqual(['Given machine M', 'and language L']);
		expect(fig.tough.lines).toEqual(['But tough', 'directly!']);
		expect(fig.tough.y).toBe(fig.given.y);
		// Right of the goal, clear of the check mark on its top-right corner…
		expect(fig.tough.x).toBeGreaterThan(fig.goal.pos.x + fig.goal.geom.width + 10);
		// …and inside the figure.
		const longest = Math.max(...fig.tough.lines.map((l) => l.length));
		expect(fig.width).toBeGreaterThanOrEqual(fig.tough.x + longest * 16 * 0.5);
	});

	it('is the slide’s layout by default, unchanged', () => {
		expect(fig.layout).toBe('slide');
		expect(bootstrapFigure(FIGURE_METRICS, 'slide')).toEqual(fig);
		expect({ width: fig.width, height: fig.height }).toEqual({ width: 503, height: 388 });
		expect(fig.given).toMatchObject({ x: 0, y: 15, lineHeight: 22 });
		expect(fig.arrow).toEqual({
			x1: 144,
			y1: 20,
			x2: 276,
			y2: 20,
			label: { x: 210, y: 13, anchor: 'middle' }
		});
		expect(fig.goal.pos).toEqual({ x: 282, y: 0 });
		expect({ x: fig.tough.x, y: fig.tough.y }).toEqual({ x: 422, y: 15 });
		expect(fig.rows.map((r) => [r.labelAt, r.layout])).toEqual([
			[
				{ x: 0, y: 140 },
				{
					program: { x: 30, y: 114 },
					translator: { x: 110, y: 154 },
					equals: { x: 256, y: 174 },
					result: { x: 282, y: 114 },
					width: 372,
					height: 120
				}
			],
			[
				{ x: 0, y: 294 },
				{
					program: { x: 30, y: 268 },
					translator: { x: 110, y: 308 },
					equals: { x: 256, y: 328 },
					result: { x: 282, y: 268 },
					width: 372,
					height: 120
				}
			]
		]);
	});
});

/** Axis-aligned boxes of everything drawn, to check that nothing overlaps. */
function boxes(f: BootstrapFigure) {
	const sans = (s: string, size: number) => s.length * size * 0.56;
	const text = (x: number, y: number, w: number, size: number) => ({
		x,
		y: y - size * 0.8,
		w,
		h: size
	});
	const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
	f.given.lines.forEach((l, i) =>
		out.push({
			name: `given ${i}`,
			...text(f.given.x, f.given.y + i * f.given.lineHeight, sans(l, FIGURE_TEXT_SIZE), 16)
		})
	);
	f.tough.lines.forEach((l, i) =>
		out.push({
			name: `tough ${i}`,
			...text(f.tough.x, f.tough.y + i * f.tough.lineHeight, sans(l, FIGURE_TEXT_SIZE), 16)
		})
	);
	const g = f.goal;
	out.push({ name: 'goal', x: g.pos.x, y: g.pos.y, w: g.geom.width, h: g.geom.height });
	for (const r of f.rows) {
		const L = r.layout;
		out.push({ name: `${r.label} label`, ...text(r.labelAt.x, r.labelAt.y, 18, 16) });
		out.push({ name: `${r.label} program`, ...L.program, w: r.geoms.program.width, h: 40 });
		out.push({
			name: `${r.label} program stem`,
			x: L.program.x + r.geoms.program.stemX,
			y: L.program.y + 40,
			w: r.geoms.program.stemW,
			h: 40
		});
		out.push({
			name: `${r.label} translator`,
			...L.translator,
			w: r.geoms.translator.width,
			h: 40
		});
		out.push({
			name: `${r.label} result`,
			...L.result!,
			w: r.geoms.result.width,
			h: r.geoms.result.height
		});
		out.push({ name: `${r.label} =`, x: L.equals!.x - 7, y: L.equals!.y - 8, w: 14, h: 16 });
	}
	const w = sans('Want this', WANT_LABEL_SIZE);
	const lx = f.arrow.label.anchor === 'start' ? f.arrow.label.x : f.arrow.label.x - w / 2;
	out.push({ name: 'want label', ...text(lx, f.arrow.label.y, w, WANT_LABEL_SIZE) });
	const { x1, y1, x2, y2 } = f.arrow;
	out.push({
		name: 'arrow',
		x: Math.min(x1, x2) - 4,
		y: Math.min(y1, y2) - 4,
		w: Math.abs(x2 - x1) + 8,
		h: Math.abs(y2 - y1) + 8
	});
	return out;
}

function overlaps(f: BootstrapFigure): string[] {
	const list = boxes(f);
	const hits: string[] = [];
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			const a = list[i];
			const b = list[j];
			// Touching is fine: a program's stem abuts its translator's left arm.
			if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
				hits.push(`${a.name} / ${b.name}`);
			}
		}
	}
	return hits;
}

describe('bootstrapFigure: narrow layout (phones)', () => {
	const slide = bootstrapFigure();
	const fig = bootstrapFigure(FIGURE_METRICS, 'narrow');
	/** Width of the figure box on a 360 px screen (page gutters, panel and figure padding). */
	const PHONE_BOX = 292;
	const labelPx = (f: BootstrapFigure, box: number) =>
		FIGURE_METRICS.font * Math.min(1.25, box / figureViewWidth(f));

	it('keeps the T labels at 15 px or more in a 360 px screen’s figure box', () => {
		expect(labelPx(slide, PHONE_BOX)).toBeLessThan(MIN_LABEL_PX);
		expect(labelPx(fig, PHONE_BOX)).toBeGreaterThanOrEqual(MIN_LABEL_PX);
		// Even a 320 px screen (box 252 px).
		expect(labelPx(fig, 252)).toBeGreaterThanOrEqual(MIN_LABEL_PX);
	});

	it('switches below the box width where the slide layout would shrink its labels too far', () => {
		expect(FIGURE_NARROW_BELOW).toBe(minFitWidth(figureViewWidth(slide), FIGURE_METRICS.font));
		expect(labelPx(slide, FIGURE_NARROW_BELOW)).toBeGreaterThanOrEqual(MIN_LABEL_PX);
		expect(labelPx(slide, FIGURE_NARROW_BELOW - 1)).toBeLessThan(MIN_LABEL_PX);
		expect(figureViewWidth(slide)).toBe(slide.width + FIGURE_PAD.left + FIGURE_PAD.right);
	});

	it('puts the prose above the goal and points the arrow down into it', () => {
		expect(fig.layout).toBe('narrow');
		expect(fig.given.lines).toEqual(slide.given.lines);
		expect(fig.arrow.x1).toBe(fig.arrow.x2);
		expect(fig.arrow.y1).toBeGreaterThan(fig.given.y + fig.given.lineHeight);
		expect(fig.arrow.y2).toBeLessThan(fig.goal.pos.y);
		expect(fig.arrow.x1).toBeGreaterThan(fig.goal.pos.x);
		expect(fig.arrow.x1).toBeLessThan(fig.goal.pos.x + fig.goal.geom.stemX);
		expect(fig.arrow.label.anchor).toBe('start');
	});

	it('keeps "But tough directly!" beside the goal', () => {
		expect(fig.tough.lines).toEqual(slide.tough.lines);
		expect(fig.tough.x).toBeGreaterThan(fig.goal.pos.x + fig.goal.geom.width + 10);
		expect(fig.tough.y - fig.goal.pos.y).toBe(slide.tough.y - slide.goal.pos.y);
	});

	it('puts each row’s "=" and result below its pair, in the goal’s column', () => {
		for (const r of fig.rows) {
			const L = r.layout;
			expect(L.result!.x).toBe(fig.goal.pos.x);
			expect(L.program.x).toBe(fig.goal.pos.x);
			expect(L.result!.y).toBeGreaterThanOrEqual(L.translator.y + r.geoms.translator.height);
			expect(L.equals!.x).toBeLessThan(L.result!.x);
			expect(L.equals!.y).toBe(L.result!.y + FIGURE_METRICS.unit / 2);
			// Still snapped: the program's stem against the translator's left arm.
			expect(L.translator.x - L.program.x).toBe(r.geoms.program.stemX + r.geoms.program.stemW);
			expect(L.translator.y - L.program.y).toBe(FIGURE_METRICS.unit);
		}
		const [a, b] = fig.rows;
		expect(b.layout.program.y).toBeGreaterThanOrEqual(a.layout.result!.y + a.geoms.result.height);
		expect(a.layout.program.y).toBeGreaterThanOrEqual(fig.goal.pos.y + fig.goal.geom.height);
		expect(fig.height).toBe(b.layout.result!.y + b.geoms.result.height);
	});

	it('draws the same rows as the slide', () => {
		expect(fig.rows.map((r) => [r.label, formatT(r.row.program), formatT(r.row.result)])).toEqual(
			slide.rows.map((r) => [r.label, formatT(r.row.program), formatT(r.row.result)])
		);
	});

	it('has nothing overlapping, in either layout', () => {
		expect(overlaps(slide)).toEqual([]);
		expect(overlaps(fig)).toEqual([]);
		// The check itself notices a note moved onto the goal.
		const moved = { ...fig, tough: { ...fig.tough, x: fig.goal.pos.x + 10 } };
		expect(overlaps(moved)).toContain('tough 0 / goal');
	});

	it('fits everything inside its width', () => {
		for (const b of boxes(fig)) expect(b.x + b.w, b.name).toBeLessThanOrEqual(fig.width + 1);
		expect(fig.width).toBeLessThan(slide.width);
	});
});
