/**
 * Small 2-D geometry kit for the automaton renderer: piecewise cubic Bézier
 * paths, B-spline smoothing, ellipse clipping, and arrowheads. Pure TS.
 */
import type { Point } from '$lib/theory/automata/types';

export type Cubic = readonly [Point, Point, Point, Point];
/** A piecewise cubic path; the global parameter u runs from 0 to segments.length. */
export type CurvePath = readonly Cubic[];

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Ellipse {
	x: number;
	y: number;
	rx: number;
	ry: number;
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
	x: a.x + (b.x - a.x) * t,
	y: a.y + (b.y - a.y) * t
});

export function unit(a: Point): Point {
	const l = len(a);
	return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand normal of a direction in screen coordinates (y down): east → north. */
export const leftNormal = (d: Point): Point => ({ x: d.y, y: -d.x });

export function cubicAt(c: Cubic, t: number): Point {
	const s = 1 - t;
	const a = s * s * s;
	const b = 3 * s * s * t;
	const d = 3 * s * t * t;
	const e = t * t * t;
	return {
		x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
		y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y
	};
}

/** de Casteljau split at t. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
	const p01 = lerp(c[0], c[1], t);
	const p12 = lerp(c[1], c[2], t);
	const p23 = lerp(c[2], c[3], t);
	const p012 = lerp(p01, p12, t);
	const p123 = lerp(p12, p23, t);
	const m = lerp(p012, p123, t);
	return [
		[c[0], p01, p012, m],
		[m, p123, p23, c[3]]
	];
}

/** The part of a cubic between t0 and t1 (0 ≤ t0 ≤ t1 ≤ 1). */
export function subCubic(c: Cubic, t0: number, t1: number): Cubic {
	if (t0 <= 0 && t1 >= 1) return c;
	let seg = c;
	if (t1 < 1) seg = splitCubic(seg, t1)[0];
	if (t0 > 0) seg = splitCubic(seg, t1 <= 0 ? 0 : t0 / t1)[1];
	return seg;
}

export function lineCubic(a: Point, b: Point): Cubic {
	return [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
}

function locate(path: CurvePath, u: number): [Cubic, number] {
	const n = path.length;
	const clamped = Math.min(Math.max(u, 0), n);
	const i = Math.min(Math.floor(clamped), n - 1);
	return [path[i], clamped - i];
}

export function pathAt(path: CurvePath, u: number): Point {
	const [c, t] = locate(path, u);
	return cubicAt(c, t);
}

/** The part of a path between global parameters u0 and u1. */
export function subPath(path: CurvePath, u0: number, u1: number): Cubic[] {
	const n = path.length;
	const a = Math.min(Math.max(u0, 0), n);
	const b = Math.min(Math.max(u1, a), n);
	const out: Cubic[] = [];
	const i0 = Math.min(Math.floor(a), n - 1);
	const i1 = Math.min(Math.ceil(b) - 1, n - 1);
	for (let i = i0; i <= i1; i++) {
		const t0 = i === i0 ? a - i : 0;
		const t1 = i === i1 ? b - i : 1;
		if (t1 - t0 < 1e-9 && out.length > 0) continue;
		out.push(subCubic(path[i], t0, t1));
	}
	return out;
}

/** Points along the path, `perSegment` intervals per cubic (inclusive of both ends). */
export function samplePath(path: CurvePath, perSegment = 16): Point[] {
	if (path.length === 0) return [];
	const pts: Point[] = [path[0][0]];
	for (const c of path) for (let k = 1; k <= perSegment; k++) pts.push(cubicAt(c, k / perSegment));
	return pts;
}

export function polylineLength(pts: readonly Point[]): number {
	let l = 0;
	for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
	return l;
}

/** Point and unit tangent at a fraction (0–1) of a polyline's length. */
export function alongPolyline(pts: readonly Point[], s: number): { point: Point; tangent: Point } {
	if (pts.length < 2) return { point: pts[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
	const total = polylineLength(pts);
	let target = total * Math.min(Math.max(s, 0), 1);
	for (let i = 1; i < pts.length; i++) {
		const l = dist(pts[i - 1], pts[i]);
		if (target <= l || i === pts.length - 1) {
			const t = l < 1e-9 ? 0 : Math.min(target / l, 1);
			return { point: lerp(pts[i - 1], pts[i], t), tangent: unit(sub(pts[i], pts[i - 1])) };
		}
		target -= l;
	}
	return { point: pts[pts.length - 1], tangent: { x: 1, y: 0 } };
}

/**
 * Smooth uniform B-spline guided by the points (like d3.curveBasis): it starts
 * and ends on the first and last point and passes near, not through, the rest.
 */
export function basisSpline(points: readonly Point[]): Cubic[] {
	const n = points.length;
	if (n < 2) return [];
	if (n === 2) return [lineCubic(points[0], points[1])];
	const out: Cubic[] = [];
	const third = (a: Point, b: Point) => ({ x: (2 * a.x + b.x) / 3, y: (2 * a.y + b.y) / 3 });
	const knot = (a: Point, b: Point, c: Point) => ({
		x: (a.x + 4 * b.x + c.x) / 6,
		y: (a.y + 4 * b.y + c.y) / 6
	});
	let at = { x: (5 * points[0].x + points[1].x) / 6, y: (5 * points[0].y + points[1].y) / 6 };
	out.push(lineCubic(points[0], at));
	for (let k = 2; k <= n; k++) {
		const a = points[k - 2];
		const b = points[k - 1];
		const c = points[Math.min(k, n - 1)];
		const end = knot(a, b, c);
		out.push([at, third(a, b), third(b, a), end]);
		at = end;
	}
	out.push(lineCubic(at, points[n - 1]));
	return out;
}

/** ((x − cx)/rx)² + ((y − cy)/ry)²: below 1 inside the ellipse. */
export function ellipseLevel(p: Point, e: Ellipse): number {
	const dx = (p.x - e.x) / e.rx;
	const dy = (p.y - e.y) / e.ry;
	return dx * dx + dy * dy;
}

/** Point on the ellipse boundary in the direction of `toward` from its center. */
export function ellipseBoundary(e: Ellipse, toward: Point): Point {
	const d = sub(toward, e);
	if (len(d) < 1e-9) return { x: e.x + e.rx, y: e.y };
	const k = 1 / Math.sqrt((d.x / e.rx) ** 2 + (d.y / e.ry) ** 2);
	return { x: e.x + d.x * k, y: e.y + d.y * k };
}

/** Half-extent of an ellipse along a unit direction (its support function). */
export const ellipseExtent = (e: { rx: number; ry: number }, n: Point): number =>
	Math.hypot(e.rx * n.x, e.ry * n.y);

/** Half-extent of an axis-aligned box of the given size along a unit direction. */
export const boxExtent = (w: number, h: number, n: Point): number =>
	(Math.abs(n.x) * w) / 2 + (Math.abs(n.y) * h) / 2;

function bisect(f: (u: number) => boolean, lo: number, hi: number): number {
	// f(lo) is false and f(hi) is true.
	for (let k = 0; k < 40; k++) {
		const mid = (lo + hi) / 2;
		if (f(mid)) hi = mid;
		else lo = mid;
	}
	return (lo + hi) / 2;
}

/**
 * Parameter where the path first leaves `e` (searching forward from 0), or 0
 * when the path starts outside it.
 */
export function exitParam(path: CurvePath, e: Ellipse): number {
	const n = path.length;
	const outside = (u: number) => ellipseLevel(pathAt(path, u), e) >= 1;
	if (outside(0)) return 0;
	const step = 1 / 48;
	for (let u = step; u <= n + 1e-9; u += step) {
		if (outside(u)) return bisect(outside, u - step, Math.min(u, n));
	}
	return 0;
}

/**
 * Parameter where the path last enters `e` (searching backward from the end),
 * or the end when the path finishes outside it.
 */
export function enterParam(path: CurvePath, e: Ellipse): number {
	const n = path.length;
	const outside = (u: number) => ellipseLevel(pathAt(path, u), e) >= 1;
	if (outside(n)) return n;
	const step = 1 / 48;
	for (let u = n - step; u >= -1e-9; u -= step) {
		if (outside(u)) return bisect((v) => !outside(v), Math.max(u, 0), u + step);
	}
	return n;
}

/** Largest parameter below `uEnd` whose point lies `distance` away from pathAt(uEnd). */
export function backOff(path: CurvePath, uEnd: number, distance: number, uMin = 0): number {
	const tip = pathAt(path, uEnd);
	const far = (u: number) => dist(pathAt(path, u), tip) >= distance;
	const step = 1 / 96;
	for (let u = uEnd - step; u >= uMin - 1e-9; u -= step) {
		if (far(u)) return bisect((v) => !far(v), Math.max(u, uMin), u + step);
	}
	return uMin;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pathToD(path: CurvePath): string {
	if (path.length === 0) return '';
	const s = path[0][0];
	let d = `M${r2(s.x)} ${r2(s.y)}`;
	for (const c of path)
		d += `C${r2(c[1].x)} ${r2(c[1].y)} ${r2(c[2].x)} ${r2(c[2].y)} ${r2(c[3].x)} ${r2(c[3].y)}`;
	return d;
}

export const ARROW_LENGTH = 9;
export const ARROW_HALF_WIDTH = 3.6;

/** A slim, slightly concave arrowhead with its tip at `tip`, pointing along `angle` (radians). */
export function arrowHeadD(
	tip: Point,
	angle: number,
	length = ARROW_LENGTH,
	halfWidth = ARROW_HALF_WIDTH
): string {
	const d = { x: Math.cos(angle), y: Math.sin(angle) };
	const n = { x: -d.y, y: d.x };
	const base = sub(tip, scale(d, length));
	const l = add(base, scale(n, halfWidth));
	const r = sub(base, scale(n, halfWidth));
	const notch = add(base, scale(d, length * 0.22));
	return `M${r2(tip.x)} ${r2(tip.y)}L${r2(l.x)} ${r2(l.y)}L${r2(notch.x)} ${r2(notch.y)}L${r2(r.x)} ${r2(r.y)}Z`;
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
	return (
		a.x < b.x + b.width + margin &&
		b.x < a.x + a.width + margin &&
		a.y < b.y + b.height + margin &&
		b.y < a.y + a.height + margin
	);
}

export function boxContains(b: Box, p: Point, margin = 0): boolean {
	return (
		p.x >= b.x - margin &&
		p.x <= b.x + b.width + margin &&
		p.y >= b.y - margin &&
		p.y <= b.y + b.height + margin
	);
}

/** Whether the segment a–b crosses or lies inside the box grown by `margin` (Liang–Barsky). */
export function segmentHitsBox(a: Point, b: Point, box: Box, margin = 0): boolean {
	const x0 = box.x - margin;
	const y0 = box.y - margin;
	const x1 = box.x + box.width + margin;
	const y1 = box.y + box.height + margin;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	let t0 = 0;
	let t1 = 1;
	const clip = (p: number, q: number) => {
		if (Math.abs(p) < 1e-12) return q >= 0;
		const r = q / p;
		if (p < 0) {
			if (r > t1) return false;
			if (r > t0) t0 = r;
		} else {
			if (r < t0) return false;
			if (r < t1) t1 = r;
		}
		return true;
	};
	return clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y);
}

/** Distance from p to the segment a–b. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
	const d = sub(b, a);
	const l2 = dot(d, d);
	const t = l2 < 1e-12 ? 0 : Math.min(Math.max(dot(sub(p, a), d) / l2, 0), 1);
	return dist(p, { x: a.x + d.x * t, y: a.y + d.y * t });
}

/** Whether segments a–b and c–d cross or come within `margin` of each other. */
export function segmentsNear(a: Point, b: Point, c: Point, d: Point, margin = 0): boolean {
	const cross = (o: Point, p: Point, q: Point) =>
		(p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
	const d1 = cross(c, d, a);
	const d2 = cross(c, d, b);
	const d3 = cross(a, b, c);
	const d4 = cross(a, b, d);
	if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)))
		return true;
	return (
		Math.min(
			pointSegmentDistance(a, c, d),
			pointSegmentDistance(b, c, d),
			pointSegmentDistance(c, a, b),
			pointSegmentDistance(d, a, b)
		) < margin
	);
}

/** Whether a polyline passes through the box grown by `margin`. */
export function polylineHitsBox(pts: readonly Point[], box: Box, margin = 0): boolean {
	if (pts.length === 1) return boxContains(box, pts[0], margin);
	for (let i = 1; i < pts.length; i++)
		if (segmentHitsBox(pts[i - 1], pts[i], box, margin)) return true;
	return false;
}

/**
 * Uniform grid over polyline segments, so "which polylines pass through this
 * box" costs a few cells instead of a scan of every point of every polyline.
 */
export class SegmentGrid {
	private readonly cells = new Map<number, number[]>();
	/** Segments spanning too many cells to index; checked on every query. */
	private readonly wide: number[] = [];
	private readonly a: Point[] = [];
	private readonly b: Point[] = [];
	private readonly owner: number[] = [];
	private maxOwner = 0;
	private segSeen = new Int32Array(0);
	private ownerSeen = new Int32Array(0);
	private stamp = 0;

	constructor(private readonly cell = 48) {}

	private static key(cx: number, cy: number): number {
		return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
	}

	private span(lo: number, hi: number): [number, number] {
		return [Math.floor(lo / this.cell), Math.floor(hi / this.cell)];
	}

	/** Adds the segments of a polyline (a lone point counts), tagged with an owner id ≥ 0. */
	add(owner: number, pts: readonly Point[]): void {
		this.maxOwner = Math.max(this.maxOwner, owner);
		for (let i = pts.length === 1 ? 0 : 1; i < pts.length; i++) {
			const a = pts[Math.max(i - 1, 0)];
			const b = pts[i];
			const s = this.owner.length;
			this.a.push(a);
			this.b.push(b);
			this.owner.push(owner);
			const [x0, x1] = this.span(Math.min(a.x, b.x), Math.max(a.x, b.x));
			const [y0, y1] = this.span(Math.min(a.y, b.y), Math.max(a.y, b.y));
			if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= 64)) {
				this.wide.push(s);
				continue;
			}
			for (let cx = x0; cx <= x1; cx++)
				for (let cy = y0; cy <= y1; cy++) {
					const k = SegmentGrid.key(cx, cy);
					const list = this.cells.get(k);
					if (list) list.push(s);
					else this.cells.set(k, [s]);
				}
		}
	}

	/** Calls `visit` once for each owner with a segment through the box grown by `margin`. */
	owners(box: Box, margin: number, visit: (owner: number) => void): void {
		const n = this.owner.length;
		if (this.segSeen.length < n) this.segSeen = new Int32Array(n * 2);
		if (this.ownerSeen.length <= this.maxOwner)
			this.ownerSeen = new Int32Array(this.maxOwner * 2 + 2);
		const stamp = ++this.stamp;
		const test = (s: number) => {
			if (this.segSeen[s] === stamp) return;
			this.segSeen[s] = stamp;
			const o = this.owner[s];
			if (this.ownerSeen[o] === stamp) return;
			if (segmentHitsBox(this.a[s], this.b[s], box, margin)) {
				this.ownerSeen[o] = stamp;
				visit(o);
			}
		};
		for (const s of this.wide) test(s);
		const [x0, x1] = this.span(box.x - margin, box.x + box.width + margin);
		const [y0, y1] = this.span(box.y - margin, box.y + box.height + margin);
		if (!((x1 - x0 + 1) * (y1 - y0 + 1) <= 4096)) {
			for (let s = 0; s < n; s++) test(s);
			return;
		}
		for (let cx = x0; cx <= x1; cx++)
			for (let cy = y0; cy <= y1; cy++) {
				const list = this.cells.get(SegmentGrid.key(cx, cy));
				if (list) for (const s of list) test(s);
			}
	}
}

/** Whether an axis-aligned box touches an ellipse (exact, via scaling the ellipse to a circle). */
export function boxHitsEllipse(b: Box, e: Ellipse): boolean {
	const cx = Math.min(Math.max(e.x, b.x), b.x + b.width);
	const cy = Math.min(Math.max(e.y, b.y), b.y + b.height);
	// Nearest box point in the scaled space is the clamp of the center (the box stays a box).
	return ellipseLevel({ x: cx, y: cy }, e) < 1;
}

/** Growing bounding box. */
export class BoundsBuilder {
	x0 = Infinity;
	y0 = Infinity;
	x1 = -Infinity;
	y1 = -Infinity;

	point(p: Point, pad = 0): void {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
		this.x0 = Math.min(this.x0, p.x - pad);
		this.y0 = Math.min(this.y0, p.y - pad);
		this.x1 = Math.max(this.x1, p.x + pad);
		this.y1 = Math.max(this.y1, p.y + pad);
	}

	box(b: Box): void {
		this.point({ x: b.x, y: b.y });
		this.point({ x: b.x + b.width, y: b.y + b.height });
	}

	get empty(): boolean {
		return this.x0 > this.x1;
	}

	result(fallback: Box = { x: 0, y: 0, width: 0, height: 0 }): Box {
		if (this.empty) return fallback;
		return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
	}
}

/** Convex hull (Andrew's monotone chain), counter-clockwise in screen space. */
export function convexHull(points: readonly Point[]): Point[] {
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (pts.length < 3) return pts;
	const cross = (o: Point, a: Point, b: Point) =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const lower: Point[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
			lower.pop();
		lower.push(p);
	}
	const upper: Point[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
			upper.pop();
		upper.push(p);
	}
	upper.pop();
	lower.pop();
	return lower.concat(upper);
}

export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i];
		const b = poly[j];
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
			inside = !inside;
	}
	return inside;
}

export const round2 = r2;
