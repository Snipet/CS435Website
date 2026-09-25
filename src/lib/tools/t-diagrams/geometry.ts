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
	/** Space on each side of "=" (and, stacked, between the pair and the result). */
	gap?: number;
	/** Width reserved for "=". */
	equalsWidth?: number;
	/**
	 * For narrow screens: "=" and the result go below the pair instead of to
	 * its right. "=" takes a column on the left, so the program and the result
	 * line up. Without a result the layout is the same as unstacked.
	 */
	stacked?: boolean;
}

/**
 * Lays out `program` on `translator` (= `result`), with the program's
 * top-left corner at the origin. The "=" sits at the height of the stems, and
 * the result's crossbar lines up with the program's. Stacked, the pair is
 * indented by the "=" column and the result sits below it, level with the
 * program on the left.
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
	if (opts.stacked) {
		const indent = eqW + gap;
		const ry = pairBottom + gap;
		return {
			program: { x: indent, y: 0 },
			translator: { x: indent + t.x, y: t.y },
			equals: { x: eqW / 2, y: ry + result.unit / 2 },
			result: { x: indent, y: ry },
			width: indent + Math.max(pairRight, result.width),
			height: ry + result.height
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

/** Smallest size, in px, a drawing that scales to fit may show its T-diagram labels at. */
export const MIN_LABEL_PX = 15;

/**
 * The narrowest box, in px, that shows a drawing `width` units wide with its
 * `font`-px labels at `minFont` px or more.
 */
export function minFitWidth(width: number, font: number, minFont = MIN_LABEL_PX): number {
	return Math.ceil((width * minFont) / font);
}

/**
 * The first layout that keeps its labels at `minFont` px or more when scaled
 * down to fit `available` px, or the narrowest one when none does. Before the
 * box is measured (`available` is 0) the first layout is kept.
 */
export function pickFit<T extends { width: number }>(
	available: number,
	font: number,
	layouts: readonly [T, ...T[]],
	minFont = MIN_LABEL_PX
): T {
	if (!(available > 0)) return layouts[0];
	const fit = layouts.find((l) => minFitWidth(l.width, font, minFont) <= available);
	return fit ?? layouts.reduce((a, b) => (b.width < a.width ? b : a));
}

/**
 * `equationLayout` for a box `available` px wide: side by side as on the
 * slide, or stacked when side by side would draw the labels under
 * `MIN_LABEL_PX`. `pad` is the room the SVG adds on each side.
 */
export function fitEquation(
	program: TGeom,
	translator: TGeom,
	result: TGeom | null,
	opts: EquationOptions,
	available: number,
	pad = 0
): EquationLayout {
	const wide = equationLayout(program, translator, result, { ...opts, stacked: false });
	if (!result) return wide;
	const stacked = equationLayout(program, translator, result, { ...opts, stacked: true });
	const view = (layout: EquationLayout) => ({ layout, width: layout.width + 2 * pad });
	return pickFit(available, program.font, [view(wide), view(stacked)]).layout;
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

/**
 * Where a drawing is on screen: the client position (px) of its origin, and
 * drawing units per px (1 unless it is scaled). Measured afresh on every
 * pointer event, so it follows scrolling.
 */
export interface CanvasFrame {
	left: number;
	top: number;
	scale: number;
}

/** The frame of an SVG `canvasWidth` units wide from its bounding client rect. */
export function canvasFrame(
	rect: { left: number; top: number; width: number },
	canvasWidth: number
): CanvasFrame {
	return { left: rect.left, top: rect.top, scale: rect.width ? canvasWidth / rect.width : 1 };
}

/** A client (viewport) point in drawing units. */
export function clientToCanvas(frame: CanvasFrame, p: Point): Point {
	return { x: (p.x - frame.left) * frame.scale, y: (p.y - frame.top) * frame.scale };
}

/** A drawing point in client (viewport) px, e.g. for an overlay with `position: fixed`. */
export function canvasToClient(frame: CanvasFrame, p: Point): Point {
	return { x: frame.left + p.x / frame.scale, y: frame.top + p.y / frame.scale };
}

/**
 * The client-px box of an overlay that draws a `size` diagram placed at `pos`
 * on the canvas, with `margin` drawing units around it (for the outline and
 * the shadow). With `position: fixed` it is clipped by nothing but the viewport.
 */
export function overlayBox(
	frame: CanvasFrame,
	pos: Point,
	size: Size,
	margin = 0
): { left: number; top: number; width: number; height: number } {
	const at = canvasToClient(frame, { x: pos.x - margin, y: pos.y - margin });
	return {
		left: at.x,
		top: at.y,
		width: (size.width + 2 * margin) / frame.scale,
		height: (size.height + 2 * margin) / frame.scale
	};
}

/**
 * How far to scroll a box per frame while dragging at client x `x`: negative
 * within `edge` px of its left side, positive near its right side, faster
 * nearer the edge (up to `max` px), 0 elsewhere.
 */
export function edgeScroll(
	x: number,
	box: { left: number; right: number },
	edge = 32,
	max = 12
): number {
	const edgeW = Math.min(edge, (box.right - box.left) / 4);
	if (!(edgeW > 0)) return 0;
	const speed = (depth: number) => Math.ceil(max * Math.min(1, depth / edgeW));
	if (x < box.left + edgeW) return -speed(box.left + edgeW - x);
	if (x > box.right - edgeW) return speed(x - (box.right - edgeW));
	return 0;
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

/** A drag in progress, in canvas units: where the diagram started and where the pointer went down. */
export interface DragOrigin {
	home: Point;
	geom: TGeom;
	/** The pointer at pointerdown, in canvas units. */
	start: Point;
}

/** How far (canvas units) the pointer moves before a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/**
 * A drag with the pointer at `client` over a canvas at `frame`: the pointer
 * in canvas units, whether it has gone past `DRAG_THRESHOLD`, where the
 * dragged diagram is (it follows the pointer), and what it would drop on.
 * Pass the frame measured now: after the canvas scrolls under a pointer that
 * stays put, the same client point is a different canvas point.
 */
export function dragAt(
	drag: DragOrigin,
	frame: CanvasFrame,
	client: Point,
	candidates: readonly DropCandidate[],
	radius: number
): { pointer: Point; far: boolean; pos: Point; target: { id: string; snap: Point } | null } {
	const pointer = clientToCanvas(frame, client);
	const dx = pointer.x - drag.start.x;
	const dy = pointer.y - drag.start.y;
	const pos = { x: drag.home.x + dx, y: drag.home.y + dy };
	return {
		pointer,
		far: Math.hypot(dx, dy) >= DRAG_THRESHOLD,
		pos,
		target: pickDropTarget({ pos, geom: drag.geom }, candidates, pointer, radius)
	};
}
