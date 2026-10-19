/**
 * A layered layout for the item-set drawing of the LR(1) parsing DFA
 * (Bottom-up Parsing III, slide 14): rectangular states (the item box with
 * its number) with their reduce and accept labels beside them, and edges
 * labeled with one grammar symbol.
 *
 * States go in layers from the top by their distance from the start state
 * (the construction makes states breadth first, so a state is one layer
 * below the state that made it). Edges between layers leave a box at its
 * bottom and enter the next one at its top; an edge back up leaves at the
 * top and enters at the bottom; an edge within a layer dips into the gap
 * under the layer; an edge to the state itself loops on the box's left side.
 * Edges that span several layers pass through reserved places in the layers
 * between, so no edge crosses a box. Within a layer the order comes from
 * barycenter sweeps, and the places from an isotonic fit of each box to its
 * neighbors. Labels go beside their edges where they touch no box and no
 * other label; a gap grows until every label fits.
 *
 * Pure: sizes in, geometry out (the page measures the boxes it draws).
 */
import { arrowHeadD, boxesOverlap, segmentHitsBox, type Box } from '$lib/components/graph/geometry';

export interface Point {
	x: number;
	y: number;
}

export interface BoxNodeInput {
	id: number;
	/** The frame: the item box with its number. Edges attach to it. */
	width: number;
	height: number;
	/**
	 * Width of the part of the frame, from its left, where edges attach: the
	 * item box without the number beside it. Default: the whole frame.
	 */
	attach?: number;
	/** Text beside the frame on its right (the state's reduce and accept labels). */
	note?: { width: number; height: number } | null;
}

export interface BoxEdgeInput {
	from: number;
	to: number;
	label: string;
	/** Width of the label's text. */
	labelWidth: number;
}

export interface BoxLayoutOptions {
	/** The start state: it goes first and gets the arrow from nowhere. */
	start?: number | null;
	/** Least horizontal space between two things in a layer. */
	nodeGap?: number;
	/** Least vertical space between two layers. */
	layerGap?: number;
	/** Space between a frame and its note. */
	noteGap?: number;
	padding?: number;
	/** Height of an edge label's box. */
	labelHeight?: number;
	/** A layer holds states up to about this width; further states go to the layers below. */
	maxWidth?: number;
}

export type EdgeKind = 'down' | 'up' | 'side' | 'loop';

export interface PlacedNode {
	id: number;
	layer: number;
	/** The frame (item box and number). */
	frame: Box;
	/** The note beside the frame, or null. */
	note: Box | null;
	/** Everything the node takes up: frame, note, its loop and the loop's label, the start arrow. */
	bounds: Box;
}

export interface PlacedEdge {
	/** Index in the edges given. */
	index: number;
	from: number;
	to: number;
	label: string;
	kind: EdgeKind;
	/** The route, from the source frame's boundary to the target frame's boundary. */
	points: Point[];
	/** SVG path of the line (stops at the arrowhead's base). */
	d: string;
	/** SVG path of the arrowhead. */
	arrow: string;
	/** Where the label goes; its text is centered in the box. */
	labelBox: Box;
}

export interface BoxLayout {
	/** In the order given. */
	nodes: PlacedNode[];
	/** In the order given; edges with an end that is not a node are left out. */
	edges: PlacedEdge[];
	/** The arrow into the start state, or null. */
	start: { d: string; arrow: string } | null;
	width: number;
	height: number;
}

const DUMMY_WIDTH = 14;
const LOOP_REACH = 26;
const START_DX = 34;
const START_DY = 22;
const SIDE_DIP = 16;
const SIDE_STEP = 10;
const CORNER = 8;
const ARROW_BACK = 7;
/** The most a gap grows while making room for labels. */
const GROW_ROUNDS = 6;

interface Elem {
	/** Node index, or -1 for a dummy. */
	node: number;
	/** Edge index (of `live`) for a dummy. */
	edge: number;
	layer: number;
	width: number;
	/** x of the anchor (the frame's center for a node) from the element's left. */
	anchor: number;
	left: number;
}

interface Chain {
	edge: number;
	from: number;
	to: number;
	kind: EdgeKind;
	/** Dummy elements, from the source's side to the target's. */
	dummies: number[];
}

/** Non-decreasing least-squares fit (pool adjacent violators). */
function isotonic(targets: readonly number[]): number[] {
	const sums: number[] = [];
	const counts: number[] = [];
	for (const t of targets) {
		sums.push(t);
		counts.push(1);
		while (
			sums.length > 1 &&
			sums[sums.length - 2] / counts[counts.length - 2] >
				sums[sums.length - 1] / counts[counts.length - 1]
		) {
			const s = sums.pop()!;
			const c = counts.pop()!;
			sums[sums.length - 1] += s;
			counts[counts.length - 1] += c;
		}
	}
	const out: number[] = [];
	sums.forEach((s, k) => {
		for (let i = 0; i < counts[k]; i++) out.push(s / counts[k]);
	});
	return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A polyline with rounded corners, as an SVG path. */
function roundedPath(points: readonly Point[]): string {
	if (points.length === 0) return '';
	let d = `M${r2(points[0].x)} ${r2(points[0].y)}`;
	for (let i = 1; i < points.length - 1; i++) {
		const p = points[i - 1];
		const c = points[i];
		const q = points[i + 1];
		const a = Math.hypot(c.x - p.x, c.y - p.y);
		const b = Math.hypot(q.x - c.x, q.y - c.y);
		const r = Math.min(CORNER, a / 2, b / 2);
		if (r < 0.5) {
			d += `L${r2(c.x)} ${r2(c.y)}`;
			continue;
		}
		const p1 = { x: c.x + ((p.x - c.x) * r) / a, y: c.y + ((p.y - c.y) * r) / a };
		const p2 = { x: c.x + ((q.x - c.x) * r) / b, y: c.y + ((q.y - c.y) * r) / b };
		d += `L${r2(p1.x)} ${r2(p1.y)}Q${r2(c.x)} ${r2(c.y)} ${r2(p2.x)} ${r2(p2.y)}`;
	}
	const last = points[points.length - 1];
	d += `L${r2(last.x)} ${r2(last.y)}`;
	return d;
}

/** The points without repeats in a row. */
function dedupe(points: Point[]): Point[] {
	return points.filter(
		(p, i) =>
			i === 0 || Math.abs(p.x - points[i - 1].x) > 0.01 || Math.abs(p.y - points[i - 1].y) > 0.01
	);
}

/** The path stopped short of its end by the arrowhead, and the arrowhead. */
function withArrow(points: Point[]): { d: string; arrow: string } {
	const tip = points[points.length - 1];
	const prev = points[points.length - 2];
	const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
	const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
	const back = Math.min(ARROW_BACK, len * 0.6);
	const end = { x: tip.x - Math.cos(angle) * back, y: tip.y - Math.sin(angle) * back };
	return { d: roundedPath([...points.slice(0, -1), end]), arrow: arrowHeadD(tip, angle) };
}

/**
 * Lays out the states and edges. Node ids must be distinct; edges may come in
 * any order, but the result is the same for the same input.
 */
export function layoutBoxes(
	nodesIn: readonly BoxNodeInput[],
	edgesIn: readonly BoxEdgeInput[],
	opts: BoxLayoutOptions = {}
): BoxLayout {
	const nodeGap = opts.nodeGap ?? 36;
	const baseGap = opts.layerGap ?? 52;
	const noteGap = opts.noteGap ?? 10;
	const padding = opts.padding ?? 16;
	const labelH = opts.labelHeight ?? 18;
	const maxWidth = opts.maxWidth ?? 960;
	const n = nodesIn.length;
	if (n === 0)
		return { nodes: [], edges: [], start: null, width: 2 * padding, height: 2 * padding };
	const indexOf = new Map(nodesIn.map((node, i) => [node.id, i]));
	const live = edgesIn
		.map((e, index) => ({ ...e, index, u: indexOf.get(e.from)!, v: indexOf.get(e.to)! }))
		.filter((e) => e.u !== undefined && e.v !== undefined);
	const startNode =
		opts.start !== undefined && opts.start !== null && indexOf.has(opts.start)
			? indexOf.get(opts.start)!
			: -1;

	// ── the extent of each node around its frame ──
	const loopLabel = new Map<number, number>();
	for (const e of live)
		if (e.u === e.v) loopLabel.set(e.u, Math.max(loopLabel.get(e.u) ?? 0, e.labelWidth));
	const leftExt = nodesIn.map((_, i) => {
		const loop = loopLabel.has(i) ? LOOP_REACH + 6 + loopLabel.get(i)! : 0;
		return Math.max(loop, i === startNode ? START_DX : 0);
	});
	const rightExt = nodesIn.map((node) => (node.note ? noteGap + node.note.width : 0));
	const topExt = nodesIn.map((_, i) => (i === startNode ? START_DY : 0));
	const bodyH = nodesIn.map((node) => Math.max(node.height, node.note?.height ?? 0));
	const fullWidth = nodesIn.map((node, i) => leftExt[i] + node.width + rightExt[i]);

	// ── layers: breadth first from the start, then from each state not yet reached; a
	// state goes one layer below the state that reached it, or lower when that layer is full ──
	const outs: number[][] = nodesIn.map(() => []);
	for (const e of live) if (e.u !== e.v) outs[e.u].push(e.v);
	const parent = new Array<number>(n).fill(-1);
	const seen = new Array<boolean>(n).fill(false);
	const sequence: number[] = [];
	for (const r of startNode >= 0 ? [startNode, ...nodesIn.keys()] : nodesIn.keys()) {
		if (seen[r]) continue;
		seen[r] = true;
		const queue = [r];
		for (let q = 0; q < queue.length; q++) {
			const u = queue[q];
			sequence.push(u);
			for (const v of outs[u])
				if (!seen[v]) {
					seen[v] = true;
					parent[v] = u;
					queue.push(v);
				}
		}
	}
	const layer = new Array<number>(n).fill(0);
	const used: number[] = [];
	for (const v of sequence) {
		let l = parent[v] >= 0 ? layer[parent[v]] + 1 : 0;
		while ((used[l] ?? 0) > 0 && (used[l] ?? 0) + fullWidth[v] > maxWidth) l++;
		layer[v] = l;
		used[l] = (used[l] ?? 0) + fullWidth[v] + nodeGap;
	}
	const layers = Math.max(...layer) + 1;

	// ── elements: the nodes, and dummies for edges that span more than one layer ──
	const elems: Elem[] = nodesIn.map((node, i) => ({
		node: i,
		edge: -1,
		layer: layer[i],
		width: fullWidth[i],
		anchor: leftExt[i] + node.width / 2,
		left: 0
	}));
	const chains: Chain[] = live.map((e, k) => {
		const a = layer[e.u];
		const b = layer[e.v];
		const kind: EdgeKind = e.u === e.v ? 'loop' : b === a ? 'side' : b > a ? 'down' : 'up';
		const dummies: number[] = [];
		if (kind === 'down' || kind === 'up') {
			const step = b > a ? 1 : -1;
			for (let l = a + step; l !== b; l += step) {
				dummies.push(elems.length);
				elems.push({
					node: -1,
					edge: k,
					layer: l,
					width: DUMMY_WIDTH,
					anchor: DUMMY_WIDTH / 2,
					left: 0
				});
			}
		}
		return { edge: k, from: e.u, to: e.v, kind, dummies };
	});
	// Links between elements of adjacent layers: [upper, lower].
	const links: [number, number][] = [];
	for (const c of chains) {
		if (c.kind !== 'down' && c.kind !== 'up') continue;
		const path = [c.from, ...c.dummies, c.to];
		for (let i = 0; i + 1 < path.length; i++) {
			const [p, q] = [path[i], path[i + 1]];
			links.push(elems[p].layer < elems[q].layer ? [p, q] : [q, p]);
		}
	}
	const up: number[][] = elems.map(() => []);
	const down: number[][] = elems.map(() => []);
	for (const [p, q] of links) {
		down[p].push(q);
		up[q].push(p);
	}

	// ── order within layers: barycenter sweeps, keeping the order with fewest crossings ──
	let rows: number[][] = Array.from({ length: layers }, () => []);
	elems.forEach((el, i) => rows[el.layer].push(i));
	const pos = new Array<number>(elems.length).fill(0);
	const setPos = () => rows.forEach((row) => row.forEach((e, k) => (pos[e] = k)));
	setPos();
	const crossings = (): number => {
		let total = 0;
		for (let l = 0; l + 1 < layers; l++) {
			const segs = links.filter(([p]) => elems[p].layer === l).map(([p, q]) => [pos[p], pos[q]]);
			for (let i = 0; i < segs.length; i++)
				for (let j = i + 1; j < segs.length; j++)
					if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) total++;
		}
		return total;
	};
	const sortRow = (l: number, nbrs: number[][]) => {
		const keyed = rows[l].map((e) => {
			const ns = nbrs[e];
			const bary = ns.length > 0 ? ns.reduce((s, x) => s + pos[x], 0) / ns.length : pos[e];
			return { e, bary, at: pos[e] };
		});
		keyed.sort((a, b) => a.bary - b.bary || a.at - b.at);
		rows[l] = keyed.map((k) => k.e);
		rows[l].forEach((e, k) => (pos[e] = k));
	};
	let best = rows.map((r) => [...r]);
	let bestCrossings = crossings();
	for (let iter = 0; iter < 8 && bestCrossings > 0; iter++) {
		if (iter % 2 === 0) for (let l = 1; l < layers; l++) sortRow(l, up);
		else for (let l = layers - 2; l >= 0; l--) sortRow(l, down);
		const c = crossings();
		if (c < bestCrossings) {
			bestCrossings = c;
			best = rows.map((r) => [...r]);
		}
	}
	rows = best;
	setPos();

	// ── x: each element as near its neighbors as the order and the gaps allow ──
	for (const row of rows) {
		let x = 0;
		for (const e of row) {
			elems[e].left = x;
			x += elems[e].width + nodeGap;
		}
	}
	const anchorX = (e: number) => elems[e].left + elems[e].anchor;
	const placeRow = (row: number[], nbrs: (e: number) => number[]) => {
		const offsets: number[] = [];
		let off = 0;
		for (const e of row) {
			offsets.push(off);
			off += elems[e].width + nodeGap;
		}
		const targets = row.map((e, k) => {
			const ns = nbrs(e);
			const want = ns.length > 0 ? ns.reduce((s, x) => s + anchorX(x), 0) / ns.length : anchorX(e);
			return want - elems[e].anchor - offsets[k];
		});
		isotonic(targets).forEach((y, k) => (elems[row[k]].left = y + offsets[k]));
	};
	for (let iter = 0; iter < 6; iter++) {
		for (let l = 1; l < layers; l++) placeRow(rows[l], (e) => up[e]);
		for (let l = layers - 2; l >= 0; l--) placeRow(rows[l], (e) => down[e]);
	}
	for (let l = 0; l < layers; l++) placeRow(rows[l], (e) => [...up[e], ...down[e]]);
	const minLeft = Math.min(...elems.map((e) => e.left));
	for (const el of elems) el.left += padding - minLeft;

	// ── side edges (within a layer) dip into the gap under it, one depth each ──
	const sideDepth = new Map<number, number>();
	const sideCount = new Array<number>(layers).fill(0);
	chains
		.filter((c) => c.kind === 'side')
		.map((c) => ({ c, span: Math.abs(anchorX(c.from) - anchorX(c.to)) }))
		.sort((a, b) => a.span - b.span || a.c.edge - b.c.edge)
		.forEach(({ c }) => {
			const l = layer[c.from];
			sideDepth.set(c.edge, sideCount[l]++);
		});

	const gapExtra = new Array<number>(layers).fill(0);
	let result: BoxLayout | null = null;
	for (let round = 0; round <= GROW_ROUNDS; round++) {
		const attempt = route(gapExtra);
		result = attempt.layout;
		if (attempt.crowded.size === 0 || round === GROW_ROUNDS) break;
		for (const l of attempt.crowded) gapExtra[l] += labelH + 4;
	}
	return result!;

	// ── y, routes and labels for the given extra room under each layer ──
	function route(extra: readonly number[]): { layout: BoxLayout; crowded: Set<number> } {
		const top: number[] = [];
		const pad: number[] = [];
		const band: number[] = [];
		let y = padding;
		for (let l = 0; l < layers; l++) {
			const nodesHere = rows[l].filter((e) => elems[e].node >= 0).map((e) => elems[e].node);
			pad[l] = Math.max(0, ...nodesHere.map((i) => topExt[i]));
			band[l] = pad[l] + Math.max(0, ...nodesHere.map((i) => bodyH[i]));
			top[l] = y;
			const sides = sideCount[l] > 0 ? SIDE_DIP + (sideCount[l] - 1) * SIDE_STEP + labelH + 8 : 0;
			y += band[l] + baseGap + sides + extra[l];
		}
		const bandBottom = (l: number) => top[l] + band[l];

		const placed: PlacedNode[] = nodesIn.map((node, i) => {
			const el = elems[i];
			const fx = el.left + leftExt[i];
			const fy = top[layer[i]] + pad[layer[i]];
			const frame = { x: fx, y: fy, width: node.width, height: node.height };
			const note = node.note
				? { x: fx + node.width + noteGap, y: fy, width: node.note.width, height: node.note.height }
				: null;
			const bounds = {
				x: el.left,
				y: fy - topExt[i],
				width: el.width,
				height: topExt[i] + bodyH[i]
			};
			return { id: node.id, layer: layer[i], frame, note, bounds };
		});
		const frameOf = (i: number) => placed[i].frame;

		// Ports: the places on the top and bottom sides of each frame where edges attach.
		type Side = 'top' | 'bottom';
		const attach = new Map<string, { node: number; side: Side; toward: number; key: string }[]>();
		const portKey = (edge: number, end: 'from' | 'to') => `${edge}:${end}`;
		const addPort = (node: number, side: Side, toward: number, key: string) => {
			const k = `${node}:${side}`;
			const list = attach.get(k) ?? [];
			list.push({ node, side, toward, key });
			attach.set(k, list);
		};
		for (const c of chains) {
			if (c.kind === 'loop') continue;
			const first = c.dummies.length > 0 ? anchorX(c.dummies[0]) : anchorX(c.to);
			const last =
				c.dummies.length > 0 ? anchorX(c.dummies[c.dummies.length - 1]) : anchorX(c.from);
			if (c.kind === 'side') {
				addPort(c.from, 'bottom', anchorX(c.to), portKey(c.edge, 'from'));
				addPort(c.to, 'bottom', anchorX(c.from), portKey(c.edge, 'to'));
			} else if (c.kind === 'down') {
				addPort(c.from, 'bottom', first, portKey(c.edge, 'from'));
				addPort(c.to, 'top', last, portKey(c.edge, 'to'));
			} else {
				addPort(c.from, 'top', first, portKey(c.edge, 'from'));
				addPort(c.to, 'bottom', last, portKey(c.edge, 'to'));
			}
		}
		const portX = new Map<string, number>();
		for (const list of attach.values()) {
			list.sort(
				(a, b) => a.toward - b.toward || a.key.localeCompare(b.key, 'en', { numeric: true })
			);
			const f = frameOf(list[0].node);
			const w = Math.min(f.width, nodesIn[list[0].node].attach ?? f.width);
			list.forEach((p, k) => portX.set(p.key, f.x + (w * (k + 1)) / (list.length + 1)));
		}

		// Routes.
		const routes: Point[][] = chains.map((c) => {
			if (c.kind === 'loop') {
				const f = frameOf(c.from);
				const y1 = f.y + f.height * 0.28;
				const y2 = f.y + f.height * 0.72;
				return [
					{ x: f.x, y: y1 },
					{ x: f.x - LOOP_REACH, y: y1 - 4 },
					{ x: f.x - LOOP_REACH, y: y2 + 4 },
					{ x: f.x, y: y2 }
				];
			}
			const fu = frameOf(c.from);
			const fv = frameOf(c.to);
			const xu = portX.get(portKey(c.edge, 'from'))!;
			const xv = portX.get(portKey(c.edge, 'to'))!;
			const lu = layer[c.from];
			const lv = layer[c.to];
			if (c.kind === 'side') {
				const dip = bandBottom(lu) + SIDE_DIP + (sideDepth.get(c.edge) ?? 0) * SIDE_STEP;
				return dedupe([
					{ x: xu, y: fu.y + fu.height },
					{ x: xu, y: dip },
					{ x: xv, y: dip },
					{ x: xv, y: fv.y + fv.height }
				]);
			}
			const pts: Point[] = [];
			if (c.kind === 'down') {
				pts.push({ x: xu, y: fu.y + fu.height }, { x: xu, y: bandBottom(lu) });
				for (const d of c.dummies) {
					const l = elems[d].layer;
					pts.push({ x: anchorX(d), y: top[l] }, { x: anchorX(d), y: bandBottom(l) });
				}
				pts.push({ x: xv, y: top[lv] }, { x: xv, y: fv.y });
			} else {
				pts.push({ x: xu, y: fu.y }, { x: xu, y: top[lu] });
				for (const d of c.dummies) {
					const l = elems[d].layer;
					pts.push({ x: anchorX(d), y: bandBottom(l) }, { x: anchorX(d), y: top[l] });
				}
				pts.push({ x: xv, y: bandBottom(lv) }, { x: xv, y: fv.y + fv.height });
			}
			return dedupe(pts);
		});

		// Obstacles for labels: frames, notes, the start arrow, loop labels.
		const obstacles: Box[] = [];
		for (const p of placed) {
			obstacles.push(p.frame);
			if (p.note) obstacles.push(p.note);
		}
		let start: BoxLayout['start'] = null;
		if (startNode >= 0) {
			const f = frameOf(startNode);
			const tip = { x: f.x, y: f.y + Math.min(10, f.height / 3) };
			const tail = { x: f.x - START_DX + 4, y: f.y - START_DY + 4 };
			start = withArrow([tail, tip]);
			obstacles.push({ x: tail.x, y: tail.y, width: tip.x - tail.x, height: tip.y - tail.y });
		}
		const labelBoxes: (Box | null)[] = chains.map((c) => {
			if (c.kind !== 'loop') return null;
			const f = frameOf(c.from);
			const w = live[c.edge].labelWidth;
			return {
				x: f.x - LOOP_REACH - 6 - w,
				y: f.y + f.height / 2 - labelH / 2,
				width: w,
				height: labelH
			};
		});
		for (const b of labelBoxes) if (b) obstacles.push(b);

		// Labels of the other edges, longest routes first (they have the most room).
		const crowded = new Set<number>();
		const order = chains
			.filter((c) => c.kind !== 'loop')
			.map((c) => c.edge)
			.sort((a, b) => a - b);
		const allSegments: { edge: number; a: Point; b: Point }[] = [];
		routes.forEach((pts, k) => {
			for (let i = 0; i + 1 < pts.length; i++)
				allSegments.push({ edge: k, a: pts[i], b: pts[i + 1] });
		});
		const taken: Box[] = [];
		for (const k of order) {
			const c = chains[k];
			const w = live[k].labelWidth;
			const pts = routes[k];
			const candidates: { box: Box; rank: number; gap: number }[] = [];
			let rank = 0;
			if (c.kind === 'side') {
				const a = pts[1];
				const b = pts[2];
				for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
					const x = a.x + (b.x - a.x) * t;
					candidates.push({
						box: { x: x - w / 2, y: a.y + 3, width: w, height: labelH },
						rank: rank++,
						gap: layer[c.from]
					});
					candidates.push({
						box: { x: x - w / 2, y: a.y - 3 - labelH, width: w, height: labelH },
						rank: rank++,
						gap: layer[c.from]
					});
				}
			} else {
				// The slanted pieces, each in the gap between two layers.
				for (let i = 0; i + 1 < pts.length; i++) {
					const a = pts[i];
					const b = pts[i + 1];
					if (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.y - a.y) < labelH) continue;
					const g = Math.min(...[a, b].map((p) => gapAt(p.y)));
					if (g < 0) continue;
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const len = Math.hypot(dx, dy) || 1;
					const nx = -dy / len;
					const ny = dx / len;
					for (const t of [0.5, 0.38, 0.62, 0.26, 0.74]) {
						const px = a.x + dx * t;
						const py = a.y + dy * t;
						const reach = (Math.abs(nx) * w) / 2 + (Math.abs(ny) * labelH) / 2 + 4;
						for (const s of [1, -1]) {
							const cx = px + nx * reach * s;
							const cy = py + ny * reach * s;
							candidates.push({
								box: { x: cx - w / 2, y: cy - labelH / 2, width: w, height: labelH },
								rank: rank++,
								gap: g
							});
						}
					}
				}
			}
			let chosen: { box: Box; score: number; gap: number } | null = null;
			for (const cand of candidates) {
				const blocked =
					obstacles.some((o) => boxesOverlap(cand.box, o, 2)) ||
					taken.some((o) => boxesOverlap(cand.box, o, 2));
				const hits = allSegments.filter(
					(s) => s.edge !== k && segmentHitsBox(s.a, s.b, cand.box, 1)
				).length;
				const score = (blocked ? 1e6 : 0) + hits * 100 + cand.rank;
				if (!chosen || score < chosen.score) chosen = { box: cand.box, score, gap: cand.gap };
			}
			if (!chosen) {
				const mid = pts[Math.floor(pts.length / 2)];
				chosen = {
					box: { x: mid.x + 4, y: mid.y - labelH / 2, width: w, height: labelH },
					score: 1e6,
					gap: -1
				};
			}
			if (chosen.score >= 1e6) crowded.add(Math.max(0, chosen.gap));
			taken.push(chosen.box);
			labelBoxes[k] = chosen.box;
		}

		const edges: PlacedEdge[] = chains.map((c, k) => {
			const { d, arrow } = withArrow(routes[k]);
			return {
				index: live[k].index,
				from: nodesIn[c.from].id,
				to: nodesIn[c.to].id,
				label: live[k].label,
				kind: c.kind,
				points: routes[k],
				d,
				arrow,
				labelBox: labelBoxes[k]!
			};
		});
		let right = 0;
		let bottom = 0;
		const grow = (b: Box) => {
			right = Math.max(right, b.x + b.width);
			bottom = Math.max(bottom, b.y + b.height);
		};
		placed.forEach((p) => grow(p.bounds));
		labelBoxes.forEach((b) => b && grow(b));
		routes.flat().forEach((p) => grow({ x: p.x, y: p.y, width: 0, height: 0 }));
		return {
			layout: {
				nodes: placed,
				edges,
				start,
				width: Math.ceil(right + padding),
				height: Math.ceil(bottom + padding)
			},
			crowded
		};

		/** The layer whose gap (the space under it) holds y, or -1 inside a band. */
		function gapAt(y: number): number {
			for (let l = 0; l < layers; l++) {
				const below = l + 1 < layers ? top[l + 1] : Infinity;
				if (y >= bandBottom(l) - 0.01 && y <= below + 0.01) return l;
			}
			return -1;
		}
	}
}
