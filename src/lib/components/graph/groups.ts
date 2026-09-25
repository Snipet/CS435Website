/**
 * Outlines drawn behind groups of states (Thompson fragments, partition
 * blocks). A group gets a rounded rectangle when that encloses no other state,
 * else a rounded convex hull, else a halo around each member. Nested groups get
 * more padding so their outlines and labels stay apart.
 */
import type { Point, StateId } from '$lib/theory/automata/types';
import {
	BoundsBuilder,
	boxHitsEllipse,
	boxesOverlap,
	convexHull,
	polylineHitsBox,
	pointInPolygon,
	round2,
	type Box
} from './geometry';
import { labelBox, MONO_ADVANCE, type AutomatonLayout } from './layout';
import { GROUP_TONES, type AutomatonGroup } from './types';

export interface GroupShape {
	id: string;
	label: string;
	/** Palette index 0–5. */
	tone: number;
	kind: 'rect' | 'hull' | 'halo';
	/** SVG path data of the outline. */
	d: string;
	/** Label baseline anchor; the text runs right from it ('start') or ends at it ('end'). */
	labelPos: Point;
	labelAnchor: 'start' | 'end';
	/** Outline plus label. */
	bounds: Box;
	/** Drawn lighter and dashed (`AutomatonGroup.faint`). */
	faint: boolean;
}

const BASE_PAD = 10;
const NEST_PAD = 14;
const LABEL_SIZE = 11;

function roundedRect(b: Box, r: number): string {
	const x0 = round2(b.x);
	const y0 = round2(b.y);
	const x1 = round2(b.x + b.width);
	const y1 = round2(b.y + b.height);
	const rr = Math.min(r, b.width / 2, b.height / 2);
	return (
		`M${x0 + rr} ${y0}H${x1 - rr}A${rr} ${rr} 0 0 1 ${x1} ${y0 + rr}` +
		`V${y1 - rr}A${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}H${x0 + rr}` +
		`A${rr} ${rr} 0 0 1 ${x0} ${y1 - rr}V${y0 + rr}A${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}Z`
	);
}

const ellipsePoints = (x: number, y: number, rx: number, ry: number, n = 20): Point[] =>
	Array.from({ length: n }, (_, k) => {
		const t = (2 * Math.PI * k) / n;
		return { x: x + rx * Math.cos(t), y: y + ry * Math.sin(t) };
	});

export function groupShapes(
	layout: AutomatonLayout,
	groups: readonly AutomatonGroup[]
): GroupShape[] {
	const members = groups.map((g) => new Set([...g.states].filter((id) => layout.nodes.has(id))));
	// Nesting depth: longest chain of strictly smaller groups inside each group.
	const strictSubset = (a: Set<StateId>, b: Set<StateId>) =>
		a.size < b.size && [...a].every((x) => b.has(x));
	const depth = new Map<number, number>();
	const depthOf = (i: number): number => {
		const known = depth.get(i);
		if (known !== undefined) return known;
		depth.set(i, 0);
		let d = 0;
		members.forEach((m, j) => {
			if (j !== i && m.size > 0 && strictSubset(m, members[i])) d = Math.max(d, depthOf(j) + 1);
		});
		depth.set(i, d);
		return d;
	};

	const out: GroupShape[] = [];
	// What group labels should not cover: edges, edge labels, states, earlier group labels.
	const labelBoxes = layout.edges.map(labelBox);
	const placed: Box[] = [];
	const labelCost = (b: Box) => {
		let cost = 0;
		for (const e of layout.edges) if (polylineHitsBox(e.points, b, 2)) cost += 4;
		for (const l of [...labelBoxes, ...placed]) if (boxesOverlap(b, l, 2)) cost += 6;
		for (const n of layout.nodes.values())
			if (boxHitsEllipse(b, { x: n.x, y: n.y, rx: n.outerRx + 2, ry: n.outerRy + 2 })) cost += 10;
		return cost;
	};
	groups.forEach((g, i) => {
		const m = members[i];
		if (m.size === 0) return;
		const pad = BASE_PAD + depthOf(i) * NEST_PAD;
		const tone = (((g.tone ?? i) % GROUP_TONES) + GROUP_TONES) % GROUP_TONES;
		const label = g.label ?? '';
		const nodes = [...m].map((id) => layout.nodes.get(id)!);
		const others = [...layout.nodes.values()].filter((n) => !m.has(n.id));
		const inner = layout.edges.filter((e) => m.has(e.from) && m.has(e.to));

		// Everything the outline must enclose.
		const bb = new BoundsBuilder();
		const pts: Point[] = [];
		for (const n of nodes) {
			bb.point({ x: n.x - n.outerRx, y: n.y - n.outerRy });
			bb.point({ x: n.x + n.outerRx, y: n.y + n.outerRy });
			pts.push(...ellipsePoints(n.x, n.y, n.outerRx + pad, n.outerRy + pad));
			if (n.note) bb.box(n.note.box);
		}
		for (const e of inner) {
			const lb = labelBox(e);
			bb.box(lb);
			for (let k = 0; k < e.points.length; k += 3) {
				bb.point(e.points[k]);
				pts.push(...ellipsePoints(e.points[k].x, e.points[k].y, pad, pad, 8));
			}
			pts.push(
				{ x: lb.x - pad, y: lb.y - pad },
				{ x: lb.x + lb.width + pad, y: lb.y - pad },
				{ x: lb.x - pad, y: lb.y + lb.height + pad },
				{ x: lb.x + lb.width + pad, y: lb.y + lb.height + pad }
			);
		}
		const core = bb.result();
		const rect = {
			x: core.x - pad,
			y: core.y - pad,
			width: core.width + 2 * pad,
			height: core.height + 2 * pad
		};
		const hits = (n: (typeof others)[number], grow = 0) => ({
			x: n.x,
			y: n.y,
			rx: n.outerRx + grow,
			ry: n.outerRy + grow
		});

		let kind: GroupShape['kind'];
		let d: string;
		let outline: Box;
		if (!others.some((n) => boxHitsEllipse(rect, hits(n, 2)))) {
			kind = 'rect';
			d = roundedRect(rect, 14);
			outline = rect;
		} else {
			const hull = convexHull(pts);
			const blocked = others.some(
				(n) =>
					pointInPolygon(n, hull) ||
					ellipsePoints(n.x, n.y, n.outerRx + 2, n.outerRy + 2, 12).some((p) =>
						pointInPolygon(p, hull)
					)
			);
			if (!blocked) {
				kind = 'hull';
				d = `M${hull.map((p) => `${round2(p.x)} ${round2(p.y)}`).join('L')}Z`;
				const hb = new BoundsBuilder();
				for (const p of hull) hb.point(p);
				outline = hb.result();
			} else {
				kind = 'halo';
				const ring = 7;
				d = nodes
					.map((n) => {
						const rx = n.outerRx + ring;
						const ry = n.outerRy + ring;
						return `M${round2(n.x - rx)} ${round2(n.y)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
					})
					.join('');
				const hb = new BoundsBuilder();
				for (const n of nodes) {
					hb.point({ x: n.x - n.outerRx - ring, y: n.y - n.outerRy - ring });
					hb.point({ x: n.x + n.outerRx + ring, y: n.y + n.outerRy + ring });
				}
				outline = hb.result();
			}
		}

		// Label on a corner of the outline (for halos, of the first member's halo).
		let frame = outline;
		if (kind === 'halo') {
			const n = nodes[0];
			frame = {
				x: n.x - n.outerRx - 7,
				y: n.y - n.outerRy - 7,
				width: 2 * (n.outerRx + 7),
				height: 2 * (n.outerRy + 7)
			};
		}
		const w = [...label].length * LABEL_SIZE * MONO_ADVANCE;
		const inset = kind === 'halo' ? 0 : 10;
		const above = frame.y - 4;
		const below = frame.y + frame.height + LABEL_SIZE + 2;
		const left = frame.x + inset;
		const right = frame.x + frame.width - inset;
		const mid = frame.x + frame.width / 2 + w / 2;
		// Preferred first: outside the top-left corner, as a figure caption.
		const candidates: { pos: Point; anchor: 'start' | 'end' }[] = [
			{ pos: { x: left, y: above }, anchor: 'start' },
			{ pos: { x: right, y: above }, anchor: 'end' },
			{ pos: { x: mid, y: above }, anchor: 'end' },
			{ pos: { x: left, y: below }, anchor: 'start' },
			{ pos: { x: right, y: below }, anchor: 'end' },
			{ pos: { x: mid, y: below }, anchor: 'end' }
		];
		if (kind !== 'halo')
			candidates.push(
				{ pos: { x: left, y: frame.y + LABEL_SIZE + 3 }, anchor: 'start' },
				{ pos: { x: right, y: frame.y + LABEL_SIZE + 3 }, anchor: 'end' },
				{ pos: { x: left, y: frame.y + frame.height - 5 }, anchor: 'start' },
				{ pos: { x: right, y: frame.y + frame.height - 5 }, anchor: 'end' }
			);
		const boxOf = (c: (typeof candidates)[number]): Box => ({
			x: c.anchor === 'start' ? c.pos.x : c.pos.x - w,
			y: c.pos.y - LABEL_SIZE,
			width: w,
			height: LABEL_SIZE + 3
		});
		let best = candidates[0];
		if (label) {
			let bestCost = Infinity;
			for (const [k, c] of candidates.entries()) {
				const cost = labelCost(boxOf(c)) + k * 0.1;
				if (cost < bestCost) {
					bestCost = cost;
					best = c;
				}
			}
			placed.push(boxOf(best));
		}
		const labelPos = best.pos;
		const labelAnchor = best.anchor;
		const bounds = new BoundsBuilder();
		bounds.box(outline);
		if (label) bounds.box(boxOf(best));
		out.push({
			id: g.id,
			label,
			tone,
			kind,
			d,
			labelPos,
			labelAnchor,
			bounds: bounds.result(),
			faint: g.faint === true
		});
	});
	return out;
}
