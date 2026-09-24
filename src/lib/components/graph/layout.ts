/**
 * Pure layout for automaton diagrams (docs/ARCHITECTURE.md §3.5, §5.2).
 *
 * Nodes are sized from their names; transitions are merged per (from, to, ε)
 * into one labelled edge. Without pinned positions the machine is laid out left
 * to right with dagre and each edge follows dagre's route as a smooth B-spline.
 * With pinned positions (Thompson's grid, or after the user drags a state) the
 * edges are routed here: straight when the way is clear, otherwise an arc that
 * clears the states in between (back edges above, long forward edges below).
 */
import dagre from '@dagrejs/dagre';
import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import { CharSet } from '$lib/theory/charset';
import { formatLabel, type NamedSet } from '$lib/theory/chars';
import type { Automaton, Point, Positions, StateId, Transition } from '$lib/theory/automata/types';
import {
	ARROW_LENGTH,
	BoundsBuilder,
	alongPolyline,
	backOff,
	basisSpline,
	boxExtent,
	boxHitsEllipse,
	boxesOverlap,
	dist,
	dot,
	ellipseBoundary,
	ellipseExtent,
	ellipseLevel,
	enterParam,
	exitParam,
	leftNormal,
	lineCubic,
	pathAt,
	pathToD,
	polylineHitsBox,
	polylineLength,
	samplePath,
	segmentHitsBox,
	segmentsNear,
	sub,
	subPath,
	unit,
	SegmentGrid,
	type Box,
	type Cubic,
	type CurvePath,
	type Ellipse
} from './geometry';

// ---------------------------------------------------------------------------
// Metrics (SVG user units = CSS px at zoom 1)
// ---------------------------------------------------------------------------

export const STATE_FONT_SIZE = 14;
export const LABEL_FONT_SIZE = 13;
export const NOTE_FONT_SIZE = 12;
/** Advance width of the monospace font, in em. */
export const MONO_ADVANCE = 0.62;
export const STATE_RADIUS = 22;
/** Gap between the two outlines of an accepting state. */
export const ACCEPT_GAP = 4;
export const LABEL_HEIGHT = 15;

const ELLIPSE_RY = 21;
const LABEL_GAP = 3;
const START_ARROW = 30;
const LOOP_REACH = 34;

export const textWidth = (text: string, fontSize: number): number =>
	[...text].length * fontSize * MONO_ADVANCE;

export type NodeShape = 'circle' | 'ellipse';

/** Circle for names up to three characters (and unlabeled states), else an ellipse sized to the name. */
export function stateShape(name: string): { rx: number; ry: number; shape: NodeShape } {
	if ([...name].length <= 3) return { rx: STATE_RADIUS, ry: STATE_RADIUS, shape: 'circle' };
	const w = textWidth(name, STATE_FONT_SIZE);
	return { rx: Math.ceil(w * 0.56 + 12), ry: ELLIPSE_RY, shape: 'ellipse' };
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface NoteGeometry {
	text: string;
	/** Text anchor point (vertical center). */
	x: number;
	y: number;
	anchor: 'start' | 'middle';
	box: Box;
}

export interface NodeGeometry {
	id: StateId;
	x: number;
	y: number;
	rx: number;
	ry: number;
	shape: NodeShape;
	/** Outline that edges end on: the second ring of an accepting state, else the shape itself. */
	outerRx: number;
	outerRy: number;
	/** `state.note`, placed right of states without outgoing edges, else below. */
	note?: NoteGeometry;
	/** Center of the retract marker `*` (`state.retract`). */
	retract?: Point;
}

export interface EdgeGeometry {
	key: string;
	from: StateId;
	to: StateId;
	transitionIds: number[];
	label: string;
	epsilon: boolean;
	selfLoop: boolean;
	/** SVG path data, ending where the arrowhead begins. */
	path: string;
	/** Center of the label text. */
	labelPos: Point;
	labelSize: { width: number; height: number };
	arrowTip: Point;
	/** Direction the arrowhead points, in radians. */
	arrowAngle: number;
	/** Points along the drawn path (hit testing, group outlines). */
	points: Point[];
}

export interface StartArrow {
	path: string;
	tail: Point;
	arrowTip: Point;
	arrowAngle: number;
	label?: { text: string; x: number; y: number };
}

export interface AutomatonLayout {
	nodes: ReadonlyMap<StateId, NodeGeometry>;
	edges: readonly EdgeGeometry[];
	start: StartArrow | null;
	bounds: Box;
	/** True when node positions came from `opts.positions`. */
	pinned: boolean;
}

export interface LayoutOptions {
	/** Pinned positions (state centers). States missing from the map are placed in a row below. */
	positions?: Positions;
	/** Named sets shown by name in labels (e.g. digit). */
	names?: readonly NamedSet[];
	/** Text above the start arrow, e.g. 'start' (Lexical Analysis IV, slide 16). */
	startLabel?: string;
}

// ---------------------------------------------------------------------------
// Edge merging
// ---------------------------------------------------------------------------

export const edgeKey = (from: StateId, to: StateId, epsilon: boolean): string =>
	`${from}>${to}${epsilon ? 'ε' : ''}`;

export interface MergedEdge {
	key: string;
	from: StateId;
	to: StateId;
	epsilon: boolean;
	transitions: Transition[];
	label: string;
}

/** Display text for a group of parallel transitions: `0,1`, `other`, or `ε`. */
export function edgeLabel(ts: readonly Transition[], names?: readonly NamedSet[]): string {
	if (ts.length === 0) return '';
	if (ts.every((t) => t.label === null)) return 'ε';
	let union = CharSet.EMPTY;
	const displays: string[] = [];
	for (const t of ts) {
		if (t.label === null) continue;
		if (t.display) {
			if (!displays.includes(t.display)) displays.push(t.display);
		} else union = union.union(t.label);
	}
	const parts = union.isEmpty ? [] : [formatLabel(union, { names })];
	return [...parts, ...displays].join(',');
}

/** One edge per (from, to, ε) in order of first appearance; dangling transitions are skipped. */
export function mergeTransitions(a: Automaton, names?: readonly NamedSet[]): MergedEdge[] {
	const byKey = new Map<string, MergedEdge>();
	for (const t of a.transitions) {
		if (!a.states[t.from] || !a.states[t.to]) continue;
		const epsilon = t.label === null;
		const key = edgeKey(t.from, t.to, epsilon);
		let e = byKey.get(key);
		if (!e) {
			e = { key, from: t.from, to: t.to, epsilon, transitions: [], label: '' };
			byKey.set(key, e);
		}
		e.transitions.push(t);
	}
	for (const e of byKey.values()) e.label = edgeLabel(e.transitions, names);
	return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type LoopSide = 'above' | 'below';

interface NodeBox {
	id: StateId;
	rx: number;
	ry: number;
	shape: NodeShape;
	orx: number;
	ory: number;
	loops: Map<string, LoopSide>;
	noteSide: 'right' | 'below' | null;
	noteWidth: number;
}

const labelSize = (label: string) => ({
	width: Math.max(1, [...label].length) * LABEL_FONT_SIZE * MONO_ADVANCE + 2,
	height: LABEL_HEIGHT
});

const outer = (n: NodeBox, p: Point): Ellipse => ({ x: p.x, y: p.y, rx: n.orx, ry: n.ory });

/** Teardrop self-loop on top of (or below) a node, ending at the node with its arrow. */
function loopCubic(c: Point, n: NodeBox, side: LoopSide): Cubic {
	const s = side === 'above' ? -1 : 1;
	const b = Math.min(n.orx * 0.55, 13);
	const yb = c.y + s * n.ory * Math.sqrt(1 - (b / n.orx) ** 2);
	const phi = (27 * Math.PI) / 180;
	const right = { x: c.x + b, y: yb };
	const left = { x: c.x - b, y: yb };
	return [
		right,
		{ x: right.x + LOOP_REACH * Math.sin(phi), y: yb + s * LOOP_REACH * Math.cos(phi) },
		{ x: left.x - LOOP_REACH * Math.sin(phi), y: yb + s * LOOP_REACH * Math.cos(phi) },
		left
	];
}

/** How far a loop (with its label) reaches from the node center. */
function loopExtent(n: NodeBox): number {
	const c = loopCubic({ x: 0, y: 0 }, n, 'above');
	const apex = Math.min(...samplePath([c], 24).map((p) => p.y));
	return -apex + LABEL_GAP + LABEL_HEIGHT;
}

function nodeBoxes(a: Automaton, merged: readonly MergedEdge[]): Map<StateId, NodeBox> {
	const out = new Map<StateId, NodeBox>();
	const hasOut = new Set<StateId>();
	for (const e of merged) if (e.from !== e.to) hasOut.add(e.from);
	for (const s of a.states) {
		const shape = stateShape(s.name);
		const ring = s.accepting ? ACCEPT_GAP : 0;
		out.set(s.id, {
			id: s.id,
			...shape,
			orx: shape.rx + ring,
			ory: shape.ry + ring,
			loops: new Map(),
			noteSide: s.note ? (hasOut.has(s.id) ? 'below' : 'right') : null,
			noteWidth: s.note ? textWidth(s.note, NOTE_FONT_SIZE) : 0
		});
	}
	for (const e of merged) {
		if (e.from !== e.to) continue;
		const n = out.get(e.from)!;
		// Symbol loops go on top; an ε loop takes the bottom when the top is used.
		const taken = [...n.loops.values()];
		n.loops.set(e.key, taken.includes('above') ? 'below' : 'above');
	}
	// Keep the symbol loop on top when an ε loop was seen first.
	for (const n of out.values()) {
		if (n.loops.size !== 2) continue;
		for (const [key, side] of n.loops) {
			const eps = key.endsWith('ε');
			if (eps && side === 'above') {
				for (const k of n.loops.keys()) n.loops.set(k, k === key ? 'below' : 'above');
				break;
			}
		}
	}
	return out;
}

/** Space a node needs around its center (for dagre, which only knows symmetric boxes). */
function reserve(n: NodeBox): { width: number; height: number } {
	let up = n.ory;
	let down = n.ory;
	let right = n.orx;
	const loopReach = n.loops.size > 0 ? loopExtent(n) : 0;
	for (const side of n.loops.values()) {
		if (side === 'above') up = Math.max(up, loopReach);
		else down = Math.max(down, loopReach);
	}
	if (n.noteSide === 'below') down = Math.max(down, n.ory + 6 + NOTE_FONT_SIZE + 4);
	if (n.noteSide === 'right') right = Math.max(right, n.orx + 12 + n.noteWidth);
	return { width: 2 * Math.max(n.orx, right), height: 2 * Math.max(up, down) };
}

// ---------------------------------------------------------------------------
// Automatic layout (dagre)
// ---------------------------------------------------------------------------

interface AutoResult {
	pos: Map<StateId, Point>;
	/** Interior route points per edge key, from source to target. */
	via: Map<string, Point[]>;
}

type Align = 'UL' | 'UR' | 'DL' | 'DR' | undefined;

/**
 * Machines up to this size try every Brandes–Köpf alignment and keep the
 * straightest. Each try is a full dagre run, so larger machines take dagre's
 * balanced default only.
 */
const ALIGN_SEARCH_STATES = 10;
const ALIGN_SEARCH_EDGES = 20;

// Not integer-like, so dagre keeps the nodes in insertion order (start first).
const nodeKey = (id: StateId) => `s${id}`;

/**
 * What keeps the start state in the first rank: every edge into the start is
 * reversed, and each part of the machine the start cannot reach (following the
 * edges as dagre sees them) hangs off the start by an invisible edge. The start
 * is then the only source, every state lies on a path from it, and dagre's DFS
 * cycle breaking (from the sources) never reverses a tree edge out of it.
 */
function rankConstraints(
	a: Automaton,
	edges: readonly MergedEdge[]
): { reversed: Set<string>; anchors: StateId[] } {
	const reversed = new Set<string>();
	const succ = new Map<StateId, StateId[]>();
	for (const e of edges) {
		const back = e.to === a.start;
		if (back) reversed.add(e.key);
		const [v, w] = back ? [e.to, e.from] : [e.from, e.to];
		const list = succ.get(v);
		if (list) list.push(w);
		else succ.set(v, [w]);
	}
	if (!a.states[a.start]) return { reversed, anchors: [] };
	const seen = new Set<StateId>();
	const visit = (root: StateId) => {
		const stack = [root];
		seen.add(root);
		while (stack.length > 0)
			for (const w of succ.get(stack.pop()!) ?? [])
				if (!seen.has(w)) {
					seen.add(w);
					stack.push(w);
				}
	};
	visit(a.start);
	const anchors: StateId[] = [];
	for (const s of a.states)
		if (!seen.has(s.id)) {
			anchors.push(s.id);
			visit(s.id);
		}
	return { reversed, anchors };
}

function runDagre(
	a: Automaton,
	boxes: Map<StateId, NodeBox>,
	edges: readonly MergedEdge[],
	align: Align
): AutoResult & { score: number } {
	const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true });
	g.setGraph({
		rankdir: 'LR',
		nodesep: 26,
		ranksep: 40,
		edgesep: 14,
		marginx: 0,
		marginy: 0,
		align
	});
	g.setDefaultEdgeLabel(() => ({}));
	const order = [a.start, ...a.states.map((s) => s.id).filter((id) => id !== a.start)];
	for (const id of order) {
		const n = boxes.get(id);
		if (n) g.setNode(nodeKey(id), { ...reserve(n) });
	}
	const { reversed, anchors } = rankConstraints(a, edges);
	for (const e of edges) {
		const size = labelSize(e.label);
		// Room for the label beside the route, on either side.
		const label: EdgeLabel = {
			width: size.width + 6,
			height: size.height * 2 + LABEL_GAP * 2,
			labelpos: 'c',
			minlen: 1,
			weight: 1
		};
		if (reversed.has(e.key)) g.setEdge(nodeKey(e.to), nodeKey(e.from), label, e.key);
		else g.setEdge(nodeKey(e.from), nodeKey(e.to), label, e.key);
	}
	for (const id of anchors)
		g.setEdge(nodeKey(a.start), nodeKey(id), { minlen: 1, weight: 0 }, `anchor ${id}`);
	dagre.layout(g);

	const pos = new Map<StateId, Point>();
	for (const id of order) {
		const n = g.node(nodeKey(id));
		if (n) pos.set(id, { x: n.x ?? 0, y: n.y ?? 0 });
	}
	const via = new Map<string, Point[]>();
	let score = 0;
	let maxY = -Infinity;
	let minY = Infinity;
	for (const p of pos.values()) {
		maxY = Math.max(maxY, p.y);
		minY = Math.min(minY, p.y);
	}
	for (const e of edges) {
		const back = reversed.has(e.key);
		const v = nodeKey(back ? e.to : e.from);
		const w = nodeKey(back ? e.from : e.to);
		const pts = (g.edge(v, w, e.key)?.points ?? []).slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
		if (back) pts.reverse();
		via.set(e.key, pts);
		const p = pos.get(e.from)!;
		const q = pos.get(e.to)!;
		// Prefer straight chains: penalize vertical offsets and bends.
		const n = leftNormal(unit(sub(q, p)));
		let bend = 0;
		for (const r of pts) bend = Math.max(bend, Math.abs(dot(sub(r, p), n)));
		score += bend + 0.6 * Math.abs(q.y - p.y);
	}
	if (pos.size > 0) score += 0.25 * (maxY - minY);
	return { pos, via, score };
}

function autoLayout(
	a: Automaton,
	boxes: Map<StateId, NodeBox>,
	edges: readonly MergedEdge[]
): AutoResult {
	const nonLoop = edges.filter((e) => e.from !== e.to);
	const search = a.states.length <= ALIGN_SEARCH_STATES && nonLoop.length <= ALIGN_SEARCH_EDGES;
	const aligns: Align[] = search ? [undefined, 'UR', 'UL', 'DR', 'DL'] : [undefined];
	let best: (AutoResult & { score: number }) | null = null;
	for (const align of aligns) {
		const r = runDagre(a, boxes, nonLoop, align);
		if (!best || r.score < best.score - 0.5) best = r;
	}
	const { pos, via } = best!;

	// Mirror vertically when that reads better: back edges below the states (loops
	// live on top), and a state's successors top to bottom in transition order.
	let score = 0;
	for (const e of nonLoop) {
		const p = pos.get(e.from)!;
		const q = pos.get(e.to)!;
		if (q.x >= p.x - 1) continue;
		const pts = via.get(e.key) ?? [];
		const mid = pts[Math.floor(pts.length / 2)];
		if (!mid) continue;
		const chordY = p.y + ((q.y - p.y) * (mid.x - p.x)) / (q.x - p.x || 1);
		if (mid.y < chordY - 2) score += 2;
		else if (mid.y > chordY + 2) score -= 2;
	}
	const succ = new Map<StateId, StateId[]>();
	for (const e of nonLoop) {
		const list = succ.get(e.from) ?? [];
		if (!list.includes(e.to)) list.push(e.to);
		succ.set(e.from, list);
	}
	for (const list of succ.values())
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++) {
				const dy = pos.get(list[j])!.y - pos.get(list[i])!.y;
				if (dy < -1) score += 1;
				else if (dy > 1) score -= 1;
			}
	if (score > 0) {
		for (const [id, p] of pos) pos.set(id, { x: p.x, y: -p.y });
		for (const [k, pts] of via)
			via.set(
				k,
				pts.map((p) => ({ x: p.x, y: -p.y }))
			);
	}
	return { pos, via };
}

// ---------------------------------------------------------------------------
// Pinned routing
// ---------------------------------------------------------------------------

interface Obstacle {
	c: Point;
	hw: number;
	hh: number;
	round: boolean;
	/** State the obstacle belongs to (its loop or note); ignored for that state's own edges. */
	owner?: StateId;
}

const obstacleExtent = (o: Obstacle, n: Point) =>
	o.round ? ellipseExtent({ rx: o.hw, ry: o.hh }, n) : boxExtent(o.hw * 2, o.hh * 2, n);

/** Symmetric arc from p to q, its control points pushed `h` along the unit normal `n`. */
function arcCubic(p: Point, q: Point, n: Point, h: number, frac: number): Cubic {
	const d = sub(q, p);
	return [
		p,
		{ x: p.x + d.x * frac + n.x * h, y: p.y + d.y * frac + n.y * h },
		{ x: p.x + d.x * (1 - frac) + n.x * h, y: p.y + d.y * (1 - frac) + n.y * h },
		q
	];
}

/** Position along the chord (0–1) of an arc built by arcCubic at parameter t. */
const arcAlong = (t: number, frac: number) =>
	3 * t * (1 - t) ** 2 * frac + 3 * t * t * (1 - t) * (1 - frac) + t ** 3;

function arcParamAt(f: number, frac: number): number {
	let lo = 0;
	let hi = 1;
	for (let k = 0; k < 30; k++) {
		const mid = (lo + hi) / 2;
		if (arcAlong(mid, frac) < f) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

/** Smallest bow (control-point offset) that carries the arc past every obstacle on side n. */
function requiredBow(
	p: Point,
	q: Point,
	n: Point,
	frac: number,
	obstacles: readonly Obstacle[],
	clearance: number
): number {
	const d = sub(q, p);
	const l = Math.hypot(d.x, d.y);
	if (l < 1) return 0;
	const u = { x: d.x / l, y: d.y / l };
	let h = 0;
	for (const o of obstacles) {
		const rel = sub(o.c, p);
		const along = dot(rel, u) / l;
		const ea = obstacleExtent(o, u) / l;
		if (along + ea < 0.04 || along - ea > 0.96) continue;
		const need = dot(rel, n) + obstacleExtent(o, n) + clearance;
		if (need <= 0) continue;
		for (const f of [along - ea, along, along + ea]) {
			const ff = Math.min(Math.max(f, 0.06), 0.94);
			const t = arcParamAt(ff, frac);
			h = Math.max(h, need / (3 * t * (1 - t)));
		}
	}
	return h;
}

/** Whether the straight segment p→q passes through or close to an obstacle. */
function segmentBlocked(p: Point, q: Point, obstacles: readonly Obstacle[], clearance: number) {
	const l = dist(p, q);
	const steps = Math.max(2, Math.ceil(l / 4));
	for (const o of obstacles) {
		const e: Ellipse = { x: o.c.x, y: o.c.y, rx: o.hw + clearance, ry: o.hh + clearance };
		for (let k = 1; k < steps; k++) {
			const t = k / steps;
			if (ellipseLevel({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, e) < 1) return true;
		}
	}
	return false;
}

interface Route {
	curve: Cubic[];
	/** Side the route bows toward, as a unit normal, or null when straight. */
	bow: Point | null;
}

function pinnedRoutes(
	boxes: Map<StateId, NodeBox>,
	pos: Map<StateId, Point>,
	edges: readonly MergedEdge[],
	fixed: readonly Obstacle[]
): Map<string, Route> {
	const routes = new Map<string, Route>();
	const nodeObstacle = (id: StateId): Obstacle => {
		const n = boxes.get(id)!;
		return { c: pos.get(id)!, hw: n.orx, hh: n.ory, round: true };
	};
	const loopDirs = (id: StateId): Point[] =>
		[...boxes.get(id)!.loops.values()].map((s) => ({ x: 0, y: s === 'above' ? -1 : 1 }));

	// Group edges by unordered state pair.
	const pairs = new Map<string, MergedEdge[]>();
	for (const e of edges) {
		if (e.from === e.to) continue;
		const k = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
		const list = pairs.get(k) ?? [];
		list.push(e);
		pairs.set(k, list);
	}
	const groups = [...pairs.values()].map((list) => {
		const lo = Math.min(list[0].from, list[0].to);
		const hi = Math.max(list[0].from, list[0].to);
		return { lo, hi, list, span: dist(pos.get(lo)!, pos.get(hi)!) };
	});
	// Short spans first, so longer arcs can clear the shorter ones.
	groups.sort((x, y) => x.span - y.span || x.lo - y.lo || x.hi - y.hi);

	const arcPoints: Obstacle[] = [];

	for (const { lo, hi, list } of groups) {
		const p = pos.get(lo)!;
		const q = pos.get(hi)!;
		const chord = sub(q, p);
		const span = Math.hypot(chord.x, chord.y);
		const nCanon = leftNormal(unit(chord));
		const others: Obstacle[] = [
			...[...boxes.keys()].filter((id) => id !== lo && id !== hi).map(nodeObstacle),
			...fixed.filter((o) => o.owner !== lo && o.owner !== hi)
		];
		const blocked = span > 1 && segmentBlocked(p, q, others, 6);
		list.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

		const place = (e: MergedEdge, side: number, h: number, frac: number) => {
			// side: +1 = left of the canonical direction lo→hi.
			const n = { x: nCanon.x * side, y: nCanon.y * side };
			const from = pos.get(e.from)!;
			const to = pos.get(e.to)!;
			const curve = h === 0 ? [lineCubic(from, to)] : [arcCubic(from, to, n, h, frac)];
			routes.set(e.key, { curve, bow: h === 0 ? null : n });
			if (h > 0)
				for (const s of samplePath(curve, 12)) arcPoints.push({ c: s, hw: 9, hh: 9, round: true });
		};

		if (span <= 1) {
			for (const e of list) place(e, 1, 0, 0.25);
			continue;
		}

		const gentle = Math.min(Math.max(span * 0.22, 16), 40);
		if (!blocked) {
			if (list.length === 1) {
				const e = list[0];
				const back = pos.get(e.to)!.x < pos.get(e.from)!.x - 1;
				if (!back) place(e, 1, 0, 0.25);
				else {
					// A lone back edge bows gently upward.
					const up = nCanon.y < 0 ? 1 : -1;
					place(e, Math.abs(nCanon.y) < 0.2 ? 1 : up, gentle, 0.25);
				}
				continue;
			}
			// Parallel edges fan out symmetrically: lanes 0, +1, −1, +2, … (+ = left of lo→hi).
			const lanes: number[] = list.length % 2 === 1 ? [0] : [];
			for (let m = 1; lanes.length < list.length; m++) lanes.push(m, -m);
			// Edges running lo→hi take the left lanes first, so opposite edges bow to their own left.
			const ordered = [...list].sort((x, y) => (x.from === lo ? 0 : 1) - (y.from === lo ? 0 : 1));
			ordered.forEach((e, i) => {
				const lane = lanes[i];
				place(e, lane >= 0 ? 1 : -1, Math.abs(lane) * gentle, 0.25);
			});
			continue;
		}

		// Blocked: arc around the obstacles, choosing the cheaper side.
		const obst = [...others, ...arcPoints];
		const sides = [1, -1].map((side) => {
			const n = { x: nCanon.x * side, y: nCanon.y * side };
			const h = Math.max(requiredBow(p, q, n, 0.15, obst, 14), gentle);
			let penalty = 0;
			for (const id of [lo, hi])
				for (const ld of loopDirs(id)) if (dot(ld, n) > 0.4) penalty += 400;
			return { side, n, h, penalty };
		});
		const costFor = (s: (typeof sides)[number], e: MergedEdge) => {
			const back = pos.get(e.to)!.x < pos.get(e.from)!.x - 1;
			const fwd = pos.get(e.to)!.x > pos.get(e.from)!.x + 1;
			const preferred = back ? s.n.y < 0 : fwd ? s.n.y > 0 : true;
			return s.h + s.penalty + (preferred ? 0 : 40) + (s.h > span + 240 ? 1000 : 0);
		};
		// The first edge (back edges first) takes its best side; the rest alternate and stack.
		const ordered = [...list].sort((x, y) => {
			const bx = pos.get(x.to)!.x < pos.get(x.from)!.x ? 0 : 1;
			const by = pos.get(y.to)!.x < pos.get(y.from)!.x ? 0 : 1;
			return bx - by;
		});
		const first = ordered[0];
		const bestSide = costFor(sides[0], first) <= costFor(sides[1], first) ? sides[0] : sides[1];
		const otherSide = bestSide === sides[0] ? sides[1] : sides[0];
		const stack = new Map<number, number>();
		ordered.forEach((e, i) => {
			const s = i % 2 === 0 ? bestSide : otherSide;
			const level = stack.get(s.side) ?? 0;
			stack.set(s.side, level + 1);
			place(e, s.side, s.h + level * 26, 0.15);
		});
	}
	return routes;
}

// ---------------------------------------------------------------------------
// Label placement
// ---------------------------------------------------------------------------

interface Drawn {
	edge: MergedEdge;
	pts: Point[];
	/** Preferred label side as a unit normal, or null for no preference. */
	prefer: Point | null;
	size: { width: number; height: number };
	label?: Point;
}

function placeLabels(drawn: Drawn[], nodeEllipses: readonly Ellipse[], blocked: Box[]): void {
	const placed: Box[] = [...blocked];
	const grid = new SegmentGrid();
	drawn.forEach((d, i) => grid.add(i, d.pts));
	const order = [...drawn.keys()].sort(
		(x, y) => polylineLength(drawn[x].pts) - polylineLength(drawn[y].pts)
	);
	for (const index of order) {
		const d = drawn[index];
		if (d.label) {
			placed.push(boxAt(d.label, d.size));
			continue;
		}
		let best: { cost: number; at: Point } | null = null;
		for (const s of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
			const { point, tangent } = alongPolyline(d.pts, s);
			const nl = leftNormal(tangent);
			for (const side of [1, -1]) {
				const n = { x: nl.x * side, y: nl.y * side };
				const off = boxExtent(d.size.width, d.size.height, n) + LABEL_GAP;
				const at = { x: point.x + n.x * off, y: point.y + n.y * off };
				const box = boxAt(at, d.size);
				let cost = Math.abs(s - 0.5) * 40;
				// Costs only grow, so a candidate stops as soon as it cannot beat the best.
				const beaten = () => best !== null && cost >= best.cost - 1e-6;
				if (d.prefer && dot(n, d.prefer) < 0) cost += 12;
				if (beaten()) continue;
				for (const e of nodeEllipses)
					if (boxHitsEllipse(box, { ...e, rx: e.rx + 2, ry: e.ry + 2 })) cost += 1000;
				for (const b of placed) if (boxesOverlap(box, b, 1)) cost += 600;
				if (beaten()) continue;
				grid.owners(box, 1.5, (o) => (cost += o === index ? 300 : 150));
				if (!beaten()) best = { cost, at };
			}
		}
		d.label = best!.at;
		placed.push(boxAt(d.label, d.size));
	}
}

const boxAt = (c: Point, size: { width: number; height: number }): Box => ({
	x: c.x - size.width / 2,
	y: c.y - size.height / 2,
	width: size.width,
	height: size.height
});

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Everything a layout depends on, as a string: names and decorations of the
 * states, the start, the transitions (ids, ends, labels), named sets, the start
 * label, and pinned positions.
 */
export function layoutKey(a: Automaton, opts: LayoutOptions = {}): string {
	const parts: string[] = [`${a.start}`, opts.startLabel ?? ''];
	for (const s of a.states)
		parts.push(
			`${s.name}\u0001${s.accepting ? 1 : 0}${s.trap ? 1 : 0}${s.retract ? 1 : 0}\u0001${s.note ?? ''}`
		);
	parts.push('');
	for (const t of a.transitions)
		parts.push(`${t.id}:${t.from}>${t.to}:${t.label ? t.label.key() : 'ε'}:${t.display ?? ''}`);
	parts.push('');
	for (const n of opts.names ?? []) parts.push(`${n.name}=${n.set.key()}`);
	if (opts.positions) {
		parts.push('@');
		for (const s of a.states) {
			const p = opts.positions.get(s.id);
			parts.push(p ? `${p.x},${p.y}` : '-');
		}
	}
	return parts.join('\u0002');
}

const CACHE_SIZE = 48;
const cache = new Map<string, AutomatonLayout>();

/**
 * Lays out an automaton: node geometry, edge curves with labels and arrowheads,
 * and bounds. Results are cached by `layoutKey` (the last few dozen), so the
 * same machine rebuilt as a new object costs a string key. Treat results as
 * read-only; they are shared between callers.
 */
export function layoutAutomaton(a: Automaton, opts: LayoutOptions = {}): AutomatonLayout {
	const key = layoutKey(a, opts);
	const hit = cache.get(key);
	if (hit) {
		// Most recently used last.
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	const layout = computeLayout(a, opts);
	cache.set(key, layout);
	if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
	return layout;
}

function computeLayout(a: Automaton, opts: LayoutOptions): AutomatonLayout {
	const merged = mergeTransitions(a, opts.names);
	const boxes = nodeBoxes(a, merged);
	const pinned = opts.positions !== undefined;

	// 1. Node positions (and dagre's routes in automatic mode).
	let pos: Map<StateId, Point>;
	let via = new Map<string, Point[]>();
	if (pinned) {
		pos = new Map();
		const given = opts.positions!;
		let maxY = -Infinity;
		let minX = Infinity;
		for (const s of a.states) {
			const p = given.get(s.id);
			if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
				pos.set(s.id, { x: p.x, y: p.y });
				maxY = Math.max(maxY, p.y);
				minX = Math.min(minX, p.x);
			}
		}
		let k = 0;
		for (const s of a.states) {
			if (pos.has(s.id)) continue;
			pos.set(s.id, {
				x: (Number.isFinite(minX) ? minX : 0) + k * 96,
				y: Number.isFinite(maxY) ? maxY + 96 : 0
			});
			k++;
		}
	} else {
		const r = a.states.length > 0 ? autoLayout(a, boxes, merged) : { pos: new Map(), via };
		pos = r.pos;
		via = r.via;
	}

	// 2. Node decorations.
	const nodes = new Map<StateId, NodeGeometry>();
	const noteBoxes: Box[] = [];
	for (const s of a.states) {
		const n = boxes.get(s.id)!;
		const c = pos.get(s.id)!;
		const g: NodeGeometry = {
			id: s.id,
			x: c.x,
			y: c.y,
			rx: n.rx,
			ry: n.ry,
			shape: n.shape,
			outerRx: n.orx,
			outerRy: n.ory
		};
		if (s.retract) g.retract = { x: c.x + n.orx * 0.72 + 4, y: c.y - n.ory * 0.72 - 3 };
		if (s.note && n.noteSide) {
			const h = NOTE_FONT_SIZE + 2;
			if (n.noteSide === 'right') {
				const x = c.x + n.orx + (s.retract ? 12 : 8);
				g.note = {
					text: s.note,
					x,
					y: c.y,
					anchor: 'start',
					box: { x, y: c.y - h / 2, width: n.noteWidth, height: h }
				};
			} else {
				const y = c.y + n.ory + 5 + h / 2;
				g.note = {
					text: s.note,
					x: c.x,
					y,
					anchor: 'middle',
					box: { x: c.x - n.noteWidth / 2, y: y - h / 2, width: n.noteWidth, height: h }
				};
			}
			noteBoxes.push(g.note.box);
		}
		nodes.set(s.id, g);
	}

	// 3. Self-loops: fixed geometry, labels beyond the apex.
	const drawn: Drawn[] = [];
	const loopObstacles: Obstacle[] = [];
	const loopGeometry = new Map<string, { curve: Cubic[]; label: Point }>();
	for (const e of merged) {
		if (e.from !== e.to) continue;
		const n = boxes.get(e.from)!;
		const side = n.loops.get(e.key)!;
		const curve = [loopCubic(pos.get(e.from)!, n, side)];
		const pts = samplePath(curve, 24);
		const size = labelSize(e.label);
		const c = pos.get(e.from)!;
		const apex =
			side === 'above' ? Math.min(...pts.map((p) => p.y)) : Math.max(...pts.map((p) => p.y));
		const dir = side === 'above' ? -1 : 1;
		const label = { x: c.x, y: apex + dir * (LABEL_GAP + size.height / 2) };
		loopGeometry.set(e.key, { curve, label });
		const xs = pts.map((p) => p.x);
		const top = Math.min(apex, label.y - size.height / 2);
		const bottom = Math.max(apex, label.y + size.height / 2);
		const y0 = side === 'above' ? top : c.y;
		const y1 = side === 'above' ? c.y : bottom;
		loopObstacles.push({
			c: { x: c.x, y: (y0 + y1) / 2 },
			hw: Math.max(...xs) - c.x + 2,
			hh: (y1 - y0) / 2,
			round: false,
			owner: e.from
		});
	}

	// 4. Routes between distinct states.
	const routes = new Map<string, Route>();
	if (pinned) {
		const fixed = [...loopObstacles];
		for (const n of nodes.values()) {
			if (!n.note) continue;
			const b = n.note.box;
			fixed.push({
				c: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
				hw: b.width / 2,
				hh: b.height / 2,
				round: false,
				owner: n.id
			});
		}
		for (const [k, r] of pinnedRoutes(boxes, pos, merged, fixed)) routes.set(k, r);
	} else {
		for (const e of merged) {
			if (e.from === e.to) continue;
			const pts = [pos.get(e.from)!, ...(via.get(e.key) ?? []), pos.get(e.to)!];
			routes.set(e.key, { curve: basisSpline(pts), bow: null });
		}
	}

	// 5. Clip to the outlines and add arrowheads.
	const geometry = new Map<string, { curve: CurvePath; tip: Point; angle: number; pts: Point[] }>();
	const clip = (e: MergedEdge, curve: CurvePath, loop: boolean) => {
		const src = outer(boxes.get(e.from)!, pos.get(e.from)!);
		const dst = outer(boxes.get(e.to)!, pos.get(e.to)!);
		const n = curve.length;
		let u0 = loop ? 0 : exitParam(curve, src);
		let u1 = loop ? n : enterParam(curve, dst);
		if (!(u1 - u0 > 1e-3)) {
			// Overlapping states: fall back to the whole curve.
			u0 = 0;
			u1 = n;
		}
		const tip = pathAt(curve, u1);
		const uBack = backOff(curve, u1, ARROW_LENGTH, u0);
		const back = pathAt(curve, uBack);
		const angle = dist(back, tip) > 1e-6 ? Math.atan2(tip.y - back.y, tip.x - back.x) : 0;
		const uEnd = backOff(curve, u1, ARROW_LENGTH * 0.72, u0);
		let visible = subPath(curve, u0, Math.max(uEnd, u0));
		if (visible.length === 0) visible = [lineCubic(tip, tip)];
		geometry.set(e.key, { curve: visible, tip, angle, pts: samplePath(visible, 16) });
	};
	for (const e of merged) {
		if (e.from === e.to) clip(e, loopGeometry.get(e.key)!.curve, true);
		else clip(e, routes.get(e.key)!.curve, false);
	}

	// 6. Labels.
	const neighbors = new Map<StateId, Set<StateId>>();
	for (const e of merged) {
		if (e.from === e.to) continue;
		if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
		if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
		neighbors.get(e.from)!.add(e.to);
		neighbors.get(e.to)!.add(e.from);
	}
	for (const e of merged) {
		const g = geometry.get(e.key)!;
		const size = labelSize(e.label);
		if (e.from === e.to) {
			drawn.push({
				edge: e,
				pts: g.pts,
				prefer: null,
				size,
				label: loopGeometry.get(e.key)!.label
			});
			continue;
		}
		drawn.push({
			edge: e,
			pts: g.pts,
			prefer: preferredSide(e, g.pts, routes.get(e.key)!, pos, neighbors),
			size
		});
	}
	const ellipses = [...boxes.values()].map((n) => outer(n, pos.get(n.id)!));
	placeLabels(drawn, ellipses, noteBoxes);

	const edges: EdgeGeometry[] = drawn
		.sort((x, y) => merged.indexOf(x.edge) - merged.indexOf(y.edge))
		.map((d) => {
			const g = geometry.get(d.edge.key)!;
			return {
				key: d.edge.key,
				from: d.edge.from,
				to: d.edge.to,
				transitionIds: d.edge.transitions.map((t) => t.id),
				label: d.edge.label,
				epsilon: d.edge.epsilon,
				selfLoop: d.edge.from === d.edge.to,
				path: pathToD(g.curve),
				labelPos: d.label!,
				labelSize: d.size,
				arrowTip: g.tip,
				arrowAngle: g.angle,
				points: g.pts
			};
		});

	// 7. Start arrow: in from the left, or from the first clear side.
	let start: StartArrow | null = null;
	const sb = boxes.get(a.start);
	const sp = pos.get(a.start);
	if (sb && sp) {
		const others = [...boxes.values()]
			.filter((n) => n.id !== a.start)
			.map((n) => outer(n, pos.get(n.id)!));
		const blockers: Box[] = [...noteBoxes, ...edges.map(labelBox)];
		for (const o of loopObstacles)
			blockers.push({ x: o.c.x - o.hw, y: o.c.y - o.hh, width: 2 * o.hw, height: 2 * o.hh });
		for (const n of nodes.values())
			if (n.retract)
				blockers.push({ x: n.retract.x - 5, y: n.retract.y - 6, width: 10, height: 12 });
		start = startArrow(outer(sb, sp), opts.startLabel, others, blockers, edges);
	}

	// 8. Bounds.
	const bb = new BoundsBuilder();
	for (const n of nodes.values()) {
		bb.point({ x: n.x - n.outerRx, y: n.y - n.outerRy });
		bb.point({ x: n.x + n.outerRx, y: n.y + n.outerRy });
		if (n.note) bb.box(n.note.box);
		if (n.retract) bb.point(n.retract, 7);
	}
	for (const e of edges) {
		for (const p of e.points) bb.point(p, 1);
		bb.point(e.arrowTip, 4);
		bb.box(boxAt(e.labelPos, e.labelSize));
	}
	if (start) {
		bb.point(start.tail, 4);
		bb.point(start.arrowTip, 4);
		if (start.label) {
			const w = textWidth(start.label.text, NOTE_FONT_SIZE);
			bb.box({ x: start.label.x - w / 2, y: start.label.y - 8, width: w, height: 16 });
		}
	}

	return { nodes, edges, start, bounds: bb.result(), pinned };
}

/**
 * Which side of an edge its label should prefer: outside a bow; otherwise away
 * from the endpoints' other neighbours (fans read outward), else above.
 */
function preferredSide(
	e: MergedEdge,
	pts: readonly Point[],
	route: Route,
	pos: Map<StateId, Point>,
	neighbors: Map<StateId, Set<StateId>>
): Point | null {
	if (route.bow) return route.bow;
	const p = pts[0];
	const q = pts[pts.length - 1];
	if (!p || !q) return null;
	const chord = sub(q, p);
	const nl = leftNormal(unit(chord));
	const mid = alongPolyline(pts, 0.5).point;
	const bow = dot(sub(mid, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }), nl);
	if (Math.abs(bow) > 4) return bow > 0 ? nl : { x: -nl.x, y: -nl.y };
	const others: Point[] = [];
	for (const id of [e.from, e.to])
		for (const m of neighbors.get(id) ?? [])
			if (m !== e.from && m !== e.to) others.push(pos.get(m)!);
	if (others.length > 0) {
		const cx = others.reduce((s, o) => s + o.x, 0) / others.length;
		const cy = others.reduce((s, o) => s + o.y, 0) / others.length;
		const away = dot(sub(mid, { x: cx, y: cy }), nl);
		const scaleRef = Math.max(8, dist(p, q) * 0.1);
		if (Math.abs(away) > scaleRef) return away > 0 ? nl : { x: -nl.x, y: -nl.y };
	}
	if (Math.abs(nl.y) < 0.2) return { x: nl.x > 0 ? nl.x : -nl.x, y: nl.x > 0 ? nl.y : -nl.y };
	return nl.y < 0 ? nl : { x: -nl.x, y: -nl.y };
}

/** Sides the start arrow may come in from, in order of preference (unit vectors, center → tail). */
const START_SIDES: readonly Point[] = [
	{ x: -1, y: 0 },
	{ x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
	{ x: -Math.SQRT1_2, y: Math.SQRT1_2 },
	{ x: 0, y: -1 },
	{ x: 0, y: 1 },
	{ x: Math.SQRT1_2, y: -Math.SQRT1_2 },
	{ x: Math.SQRT1_2, y: Math.SQRT1_2 },
	{ x: 1, y: 0 }
];

/**
 * The start arrow and its optional label, from the first side where neither
 * touches another state, an edge, a label, a note or a loop. When every side
 * is crowded, the side with the fewest collisions wins (earlier sides on ties).
 */
function startArrow(
	s: Ellipse,
	text: string | undefined,
	others: readonly Ellipse[],
	blockers: readonly Box[],
	edges: readonly EdgeGeometry[]
): StartArrow {
	const textW = text ? textWidth(text, NOTE_FONT_SIZE) : 0;
	const textH = 16;
	let best: { hits: number; arrow: StartArrow } | null = null;
	for (const d of START_SIDES) {
		const horizontal = Math.abs(d.x) > 0.9;
		const length = text && horizontal ? Math.max(START_ARROW + 12, textW + 20) : START_ARROW + 6;
		const tip = ellipseBoundary(s, { x: s.x + d.x, y: s.y + d.y });
		const tail = { x: tip.x + d.x * length, y: tip.y + d.y * length };
		const mid = { x: (tip.x + tail.x) / 2, y: (tip.y + tail.y) / 2 };
		let label: StartArrow['label'];
		let labelBoxAt: Box | null = null;
		if (text) {
			// Above a horizontal arrow, beside a vertical one, on the upper side of a diagonal.
			let n = leftNormal(d);
			if (n.y > 0 || (Math.abs(n.y) < 1e-9 && n.x > 0)) n = { x: -n.x, y: -n.y };
			const off = horizontal ? 10 : boxExtent(textW, textH, n) + 4;
			const c = { x: mid.x + n.x * off - (horizontal ? 2 : 0), y: mid.y + n.y * off };
			label = { text, x: c.x, y: c.y };
			labelBoxAt = { x: c.x - textW / 2, y: c.y - textH / 2, width: textW, height: textH };
		}
		// The last stretch meets the start's own outline, where its edges leave too.
		const near = { x: tip.x + d.x * 6, y: tip.y + d.y * 6 };
		let hits = 0;
		for (const e of others) {
			const grown = { ...e, rx: e.rx + 6, ry: e.ry + 6 };
			for (let k = 0; k <= 8; k++) {
				const t = k / 8;
				const p = { x: near.x + (tail.x - near.x) * t, y: near.y + (tail.y - near.y) * t };
				if (ellipseLevel(p, grown) < 1) {
					hits++;
					break;
				}
			}
			if (labelBoxAt && boxHitsEllipse(labelBoxAt, e)) hits++;
		}
		for (const b of blockers) {
			if (segmentHitsBox(near, tail, b, 3)) hits++;
			if (labelBoxAt && boxesOverlap(labelBoxAt, b, 1)) hits++;
		}
		for (const e of edges) {
			const pts = e.points;
			for (let i = 1; i < pts.length; i++)
				if (segmentsNear(near, tail, pts[i - 1], pts[i], 5)) {
					hits++;
					break;
				}
			if (labelBoxAt && polylineHitsBox(pts, labelBoxAt, 1)) hits++;
		}
		const arrow: StartArrow = {
			path: pathToD([
				lineCubic(tail, {
					x: tip.x + d.x * ARROW_LENGTH * 0.72,
					y: tip.y + d.y * ARROW_LENGTH * 0.72
				})
			]),
			tail,
			arrowTip: tip,
			arrowAngle: Math.atan2(-d.y, -d.x) || 0,
			label
		};
		if (hits === 0) return arrow;
		if (!best || hits < best.hits) best = { hits, arrow };
	}
	return best!.arrow;
}

/** The state whose outline (plus `slack`) contains p, preferring the closest center. */
export function nodeAt(layout: AutomatonLayout, p: Point, slack = 4): StateId | null {
	let best: { id: StateId; level: number } | null = null;
	for (const n of layout.nodes.values()) {
		const level = ellipseLevel(p, {
			x: n.x,
			y: n.y,
			rx: n.outerRx + slack,
			ry: n.outerRy + slack
		});
		if (level < 1 && (!best || level < best.level)) best = { id: n.id, level };
	}
	return best?.id ?? null;
}

/** State centers of a layout, e.g. to pin them for later layouts. */
export function nodePositions(layout: AutomatonLayout): Positions {
	const out: Positions = new Map();
	for (const [id, n] of layout.nodes) out.set(id, { x: n.x, y: n.y });
	return out;
}

/** Box around an edge label. */
export const labelBox = (e: EdgeGeometry): Box => boxAt(e.labelPos, e.labelSize);
