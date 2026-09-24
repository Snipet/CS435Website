/**
 * Geometry of T-diagrams drawn like the slides (Intro (cont’d), slides 3–8):
 * a wide crossbar with the source at its top-left and the target at its
 * top-right, and a narrower stem below its middle holding the host. The stem
 * is as tall as the crossbar; the crossbar is at least three stems wide.
 *
 * In a composition (slide 8) the program sits upper-left and the translator
 * lower-right, one stem height down: the program's stem abuts the left end of
 * the translator's crossbar, so the program's host sits next to the
 * translator's source. The result follows after "=".
 */
import { labelWidth } from './labels';
import type { TDiagram } from './model';

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Drawing scale: `unit` is the crossbar height (= stem height and minimum stem width). */
export interface Metrics {
	unit: number;
	/** Label font size in px. */
	font: number;
	/** Inner padding between the outline and a label. */
	pad: number;
}

/** The toolbox tray. */
export const TRAY_METRICS: Metrics = { unit: 34, font: 15, pad: 8 };
/** The composition bench. */
export const BENCH_METRICS: Metrics = { unit: 42, font: 18, pad: 10 };
/** The bootstrapping figure. */
export const FIGURE_METRICS: Metrics = { unit: 40, font: 17, pad: 9 };

export interface TGeom {
	width: number;
	/** Two units: crossbar plus stem. */
	height: number;
	unit: number;
	font: number;
	stemX: number;
	stemW: number;
	/** Outline, relative to the diagram's top-left corner. */
	path: string;
	/** Label baselines. Source and host are start-anchored, target end-anchored. */
	source: Point;
	target: Point;
	host: Point;
	regions: { leftArm: Rect; rightArm: Rect; stem: Rect };
}

const r = (n: number) => Math.round(n);

/** Sizes a T-diagram so its labels fit (a blank label is drawn as `?`). */
export function tGeometry(t: TDiagram, m: Metrics): TGeom {
	const { unit: u, font, pad } = m;
	const w = (s: string) => labelWidth(s.trim() ? s : '?', font);
	const stemW = Math.max(u, r(w(t.host) + 2 * pad));
	const width = Math.max(3 * u, stemW + 2 * u, r(w(t.source) + w(t.target) + 2 * pad + font));
	const stemX = r((width - stemW) / 2);
	const baseline = (row: number) => r(row * u + u / 2 + font * 0.36);
	const path = `M0 0H${width}V${u}H${stemX + stemW}V${2 * u}H${stemX}V${u}H0Z`;
	return {
		width,
		height: 2 * u,
		unit: u,
		font,
		stemX,
		stemW,
		path,
		source: { x: pad, y: baseline(0) },
		target: { x: width - pad, y: baseline(0) },
		host: { x: stemX + pad, y: baseline(1) },
		regions: {
			leftArm: { x: 0, y: 0, width: stemX, height: u },
			rightArm: { x: stemX + stemW, y: 0, width: width - stemX - stemW, height: u },
			stem: { x: stemX, y: u, width: stemW, height: u }
		}
	};
}

/** Where the translator's top-left corner goes relative to the program's (slide 8). */
export function snapOffset(program: TGeom): Point {
	return { x: program.stemX + program.stemW, y: program.unit };
}

export interface EquationLayout {
	program: Point;
	translator: Point;
	/** Center of the "=" sign; null without a result. */
	equals: Point | null;
	result: Point | null;
	width: number;
	height: number;
}

export interface EquationOptions {
	/** Stem abutting the arm (legal), or pulled apart by `apart` px (not legal). */
	snapped: boolean;
	apart?: number;
	/** Space on each side of "=". */
	gap?: number;
	/** Width reserved for "=". */
	equalsWidth?: number;
}

/**
 * Lays out `program` on `translator` (= `result`), with the program's
 * top-left corner at the origin. The "=" sits at the height of the stems, and
 * the result's crossbar lines up with the program's.
 */
export function equationLayout(
	program: TGeom,
	translator: TGeom,
	result: TGeom | null,
	opts: EquationOptions
): EquationLayout {
	const gap = opts.gap ?? 18;
	const eqW = opts.equalsWidth ?? 16;
	const off = snapOffset(program);
	const t = { x: off.x + (opts.snapped ? 0 : (opts.apart ?? 28)), y: off.y };
	const pairRight = Math.max(program.width, t.x + translator.width);
	const pairBottom = t.y + translator.height;
	if (!result) {
		return {
			program: { x: 0, y: 0 },
			translator: t,
			equals: null,
			result: null,
			width: pairRight,
			height: pairBottom
		};
	}
	const equals = { x: pairRight + gap + eqW / 2, y: program.unit * 1.5 };
	const rx = pairRight + 2 * gap + eqW;
	return {
		program: { x: 0, y: 0 },
		translator: t,
		equals,
		result: { x: rx, y: 0 },
		width: rx + result.width,
		height: Math.max(pairBottom, result.height)
	};
}

export interface Size {
	width: number;
	height: number;
}

export interface FlowOptions {
	gapX: number;
	gapY: number;
	padX: number;
	padY: number;
}

/**
 * Places boxes left to right, wrapping into rows that fit `maxWidth` (a box
 * wider than the row gets a row of its own). Returns top-left corners.
 */
export function flowLayout(
	sizes: readonly Size[],
	maxWidth: number,
	opts: FlowOptions
): { positions: Point[]; width: number; height: number } {
	const positions: Point[] = [];
	let x = opts.padX;
	let y = opts.padY;
	let rowH = 0;
	let right = opts.padX;
	for (const s of sizes) {
		if (x > opts.padX && x + s.width > maxWidth - opts.padX) {
			x = opts.padX;
			y += rowH + opts.gapY;
			rowH = 0;
		}
		positions.push({ x, y });
		right = Math.max(right, x + s.width);
		x += s.width + opts.gapX;
		rowH = Math.max(rowH, s.height);
	}
	return {
		positions,
		width: right + opts.padX,
		height: sizes.length ? y + rowH + opts.padY : 2 * opts.padY
	};
}

export interface DropCandidate {
	id: string;
	pos: Point;
	geom: TGeom;
}

/**
 * The diagram a dragged diagram would compose with: the one whose left arm is
 * nearest the dragged diagram's stem (within `radius`), or the one under the
 * pointer. `snap` is where the dragged diagram goes when it snaps on.
 */
export function pickDropTarget(
	drag: { pos: Point; geom: TGeom },
	candidates: readonly DropCandidate[],
	pointer: Point,
	radius: number
): { id: string; snap: Point } | null {
	const off = snapOffset(drag.geom);
	const stem = {
		x: drag.pos.x + drag.geom.stemX + drag.geom.stemW,
		y: drag.pos.y + drag.geom.unit * 1.5
	};
	let best: { id: string; snap: Point; score: number } | null = null;
	for (const c of candidates) {
		const arm = { x: c.pos.x, y: c.pos.y + c.geom.unit / 2 };
		const d = Math.hypot(stem.x - arm.x, stem.y - arm.y);
		const under =
			pointer.x >= c.pos.x &&
			pointer.x <= c.pos.x + c.geom.width &&
			pointer.y >= c.pos.y &&
			pointer.y <= c.pos.y + c.geom.height;
		if (!under && d > radius) continue;
		if (!best || d < best.score) {
			best = { id: c.id, snap: { x: c.pos.x - off.x, y: c.pos.y - off.y }, score: d };
		}
	}
	return best && { id: best.id, snap: best.snap };
}
