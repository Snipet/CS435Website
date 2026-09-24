/**
 * View-box math for a pannable, zoomable SVG drawn with
 * preserveAspectRatio="xMidYMid meet".
 */
import type { Point } from '$lib/theory/automata/types';
import type { Box } from './geometry';

export type ViewBox = Box;

export interface Viewport {
	width: number;
	height: number;
}

/** Largest magnification "fit" uses, so small machines are not blown up. */
export const FIT_MAX_SCALE = 1.25;

/** Pixels per user unit. */
export function viewScale(v: ViewBox, vp: Viewport): number {
	if (vp.width <= 0 || vp.height <= 0 || v.width <= 0 || v.height <= 0) return 1;
	return Math.min(vp.width / v.width, vp.height / v.height);
}

/**
 * View box showing `content` plus `pad` on every side, centered. With a known
 * viewport the box matches its aspect ratio and never magnifies past `maxScale`.
 */
export function fitView(
	content: Box,
	pad: number,
	vp?: Viewport,
	maxScale = FIT_MAX_SCALE
): ViewBox {
	const w = Math.max(content.width + 2 * pad, 1);
	const h = Math.max(content.height + 2 * pad, 1);
	const cx = content.x + content.width / 2;
	const cy = content.y + content.height / 2;
	if (!vp || vp.width <= 0 || vp.height <= 0)
		return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
	const s = Math.min(vp.width / w, vp.height / h, maxScale);
	const vw = vp.width / s;
	const vh = vp.height / s;
	return { x: cx - vw / 2, y: cy - vh / 2, width: vw, height: vh };
}

/** Zoom by `factor` (> 1 magnifies) keeping the user-space point `about` fixed on screen. */
export function zoomView(v: ViewBox, factor: number, about: Point): ViewBox {
	const f = factor > 0 && Number.isFinite(factor) ? factor : 1;
	return {
		x: about.x - (about.x - v.x) / f,
		y: about.y - (about.y - v.y) / f,
		width: v.width / f,
		height: v.height / f
	};
}

/** Zoom keeping the view's magnification within [minScale, maxScale] times the reference view's. */
export function clampZoom(v: ViewBox, ref: ViewBox, minScale = 0.2, maxScale = 8): ViewBox {
	const current = ref.width / v.width;
	const target = Math.min(Math.max(current, minScale), maxScale);
	if (target === current) return v;
	return zoomView(v, target / current, { x: v.x + v.width / 2, y: v.y + v.height / 2 });
}

export const panView = (v: ViewBox, dx: number, dy: number): ViewBox => ({
	...v,
	x: v.x - dx,
	y: v.y - dy
});

/** Offset of the drawing inside the viewport (letterboxing of "meet"). */
function offset(v: ViewBox, vp: Viewport, s: number): Point {
	return { x: (vp.width - v.width * s) / 2, y: (vp.height - v.height * s) / 2 };
}

/** Viewport pixel offset (from the element's top-left) → user coordinates. */
export function toUser(v: ViewBox, vp: Viewport, px: Point): Point {
	const s = viewScale(v, vp);
	const o = offset(v, vp, s);
	return { x: v.x + (px.x - o.x) / s, y: v.y + (px.y - o.y) / s };
}

/** User coordinates → viewport pixel offset. */
export function toViewport(v: ViewBox, vp: Viewport, p: Point): Point {
	const s = viewScale(v, vp);
	const o = offset(v, vp, s);
	return { x: (p.x - v.x) * s + o.x, y: (p.y - v.y) * s + o.y };
}

export const boxesIntersect = (a: Box, b: Box): boolean =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function unionBox(boxes: readonly Box[]): Box {
	if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const b of boxes) {
		x0 = Math.min(x0, b.x);
		y0 = Math.min(y0, b.y);
		x1 = Math.max(x1, b.x + b.width);
		y1 = Math.max(y1, b.y + b.height);
	}
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
