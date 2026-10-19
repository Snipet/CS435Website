/**
 * Layouts for parse trees drawn as on the lecture slides (docs/ARCHITECTURE.md
 * §3.10). Two kinds:
 *
 * - `tree` (top-down trees, the default): root at the top, children left to
 *   right, every node one level below its own parent, so leaves do not share a
 *   baseline. A tidy tree: subtrees never overlap, a parent is centered over
 *   its first and last child (a single child sits directly below it), and
 *   children between two wide subtrees are spread over the room between them.
 * - `baseline` (bottom-up trees, Bottom-Up Parsing slides 5–10, Bottom-up
 *   Parsing II slides 4–14): every leaf sits on one bottom row in input order,
 *   evenly spaced, and every interior node is centered over its first and last
 *   child, at least one row above the highest of them, so the tree grows
 *   upward. A node is raised further when a line from it to a child would
 *   otherwise pass through or under another child's subtree. Several trees can
 *   share one baseline (`layoutForest`): the partial tree of a shift-reduce
 *   parse, with an optional marker under the divider.
 *
 * Label widths come from the text length; the labels are set in the mono font.
 * Pure and deterministic. Lengths are in layout units: the label font size is
 * FONT_SIZE units, so one unit is one CSS pixel at the natural size.
 */
import { EPSILON, type ParseNode } from '$lib/theory/grammar/types';

/** Child indices from the root; `[]` is the root. */
export type TreePath = readonly number[];

/** Label override; return null or undefined to keep the node's symbol. */
export type TreeLabeler = (node: ParseNode, path: number[]) => string | null | undefined;

export const FONT_SIZE = 16;
/** Advance width of one character of the mono font (0.6 em). */
export const CHAR_WIDTH = 9.6;
/** Font size of a subscript, relative to the label's. */
export const SUB_SCALE = 0.72;
/** Height of the box a label is centered in. */
export const LABEL_HEIGHT = 22;
/** Distance between the label centers of a parent and its children. */
export const LEVEL_HEIGHT = 44;
/** Least horizontal space between two neighboring labels of one level. */
export const LABEL_GAP = 16;
/** Space between a label box and the end of an edge. */
export const EDGE_INSET = 2;
/** Room on each side of a label inside its box (mark, hover and click area). */
export const BOX_INSET = 6;
/** Least side of a label's box. */
export const BOX_SIZE = LABEL_HEIGHT + 2;
/** Least width and height, in CSS px, of a node that can be clicked. */
export const MIN_TARGET = 24;
const TARGET_SLACK = 0.25;

export interface LabelParts {
	base: string;
	/** Digits drawn as a subscript; '' when there are none. */
	sub: string;
}

const SUBSCRIPT = /^(.*[\p{L}’'′])([0-9]+|[₀-₉]+)$/u;

/**
 * Splits an instance or function number off a label: `E0` → E with subscript
 * 0, `T12` → T with 12, `S’1` → S’ with 1. Only digits that follow a letter
 * or a prime are a subscript, so `0`, `10` and `+1` stay whole.
 */
export function splitSubscript(label: string): LabelParts {
	const m = SUBSCRIPT.exec(label);
	if (!m) return { base: label, sub: '' };
	const sub = m[2].replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080));
	return { base: m[1], sub };
}

const length = (s: string) => [...s].length;

/** Width of a label in layout units. */
export function labelWidth(label: LabelParts): number {
	return Math.max(1, length(label.base)) * CHAR_WIDTH + length(label.sub) * CHAR_WIDTH * SUB_SCALE;
}

/** Key of a path, e.g. `0.2`; the root's is `''`. */
export function pathKey(path: TreePath): string {
	return path.join('.');
}

/** An ε-production: a non-terminal with a production applied and no children. */
export function isEpsilonNode(node: ParseNode): boolean {
	return !node.terminal && node.children.length === 0 && node.production !== undefined;
}

export function nodeAtPath(tree: ParseNode, path: TreePath): ParseNode | undefined {
	let node: ParseNode | undefined = tree;
	for (const i of path) {
		node = node?.children[i];
		if (!node) return undefined;
	}
	return node;
}

export interface TreeLayoutNode {
	/** Position in `TreeLayout.nodes` (preorder: a parent comes before its subtree). */
	index: number;
	/** `pathKey(path)`. */
	id: string;
	/** Identity for keyed rendering: the path plus the symbol at it. */
	key: string;
	path: number[];
	/** The tree node, or null for the ε leaf drawn under an ε-production (path = its parent's + 0). */
	node: ParseNode | null;
	kind: 'nonterminal' | 'terminal' | 'epsilon';
	/** Label as text, e.g. `E0`. */
	text: string;
	label: LabelParts;
	/** Center of the label. */
	x: number;
	y: number;
	width: number;
	/** Number of ancestors (in a forest, within the node's own tree). */
	depth: number;
	/**
	 * Row of the drawing, counted from the top from 0. In a `tree` layout it is
	 * the depth; in a `baseline` layout every leaf is on the last row.
	 */
	row: number;
	/** Index of the node's tree in a forest; 0 in a single tree. */
	root: number;
	parent: number | null;
	children: number[];
}

export interface TreeLayoutEdge {
	key: string;
	parent: number;
	child: number;
	/** From the point under the parent's label … */
	x1: number;
	y1: number;
	/** … to the point above the child's label. */
	x2: number;
	y2: number;
}

/** `tree`: top-down, leaves under their parents; `baseline`: leaves on one bottom row. */
export type TreeLayoutKind = 'tree' | 'baseline';

/** The up-arrow under the baseline that marks the divider of a shift-reduce parse. */
export interface TreeMarker {
	/** Number of leaves to the left of the arrow. */
	leaves: number;
	x: number;
	/** Tip of the arrow (top) … */
	y1: number;
	/** … and the end of its shaft. */
	y2: number;
}

export interface TreeLayout {
	kind: TreeLayoutKind;
	nodes: TreeLayoutNode[];
	edges: TreeLayoutEdge[];
	/** Indices of the nodes without children (terminals, ε leaves, unexpanded non-terminals), left to right. */
	leaves: number[];
	/** Number of rows. */
	rows: number;
	/** y of the leaves' centers in a `baseline` layout; null in a `tree` layout. */
	baseline: number | null;
	marker: TreeMarker | null;
	width: number;
	height: number;
}

export interface TreeLayoutOptions {
	labels?: TreeLabeler;
	levelHeight?: number;
	/** Least space between neighboring labels. */
	gap?: number;
	/** Space around the drawing. */
	padding?: number;
	/** `tree` (default) or `baseline`; `layoutForest` always uses `baseline`. */
	layout?: TreeLayoutKind;
	/**
	 * Baseline layouts: draw an up-arrow under the baseline after this many
	 * leaves (0 = before the first). Every leaf counts, ε leaves included. When
	 * it is set, the drawing keeps room for the arrow at either end, so moving
	 * it never changes the size.
	 */
	marker?: number;
	/**
	 * Baseline layouts: the least number of rows, so a tree that grows from a
	 * partial parse keeps its height (pass the row count of the finished tree).
	 */
	minRows?: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Offsets of sibling subtrees, the first at 0. `lefts[i][d]` and `rights[i][d]`
 * are the extent of subtree i at depth d, relative to its root.
 */
function placeChildren(lefts: number[][], rights: number[][], gap: number): number[] {
	const n = lefts.length;
	const pos = new Array<number>(n).fill(0);
	if (n === 1) return pos;

	// Left to right: each subtree as far left as the ones before it allow.
	const reach = rights[0].slice();
	for (let i = 1; i < n; i++) {
		const l = lefts[i];
		const r = rights[i];
		let shift = -Infinity;
		const shared = Math.min(reach.length, l.length);
		for (let d = 0; d < shared; d++) shift = Math.max(shift, reach[d] + gap - l[d]);
		pos[i] = shift;
		for (let d = 0; d < r.length; d++) {
			const v = r[d] + shift;
			if (d < reach.length) reach[d] = Math.max(reach[d], v);
			else reach.push(v);
		}
	}

	// Right to left: an inner subtree may have room up to the ones after it (a
	// `+` between two wide operands). Share that room evenly; every position
	// stays between the leftmost and rightmost one that avoid an overlap.
	if (n > 2) {
		const limit = lefts[n - 1].map((v) => v + pos[n - 1]);
		for (let i = n - 2; i >= 1; i--) {
			const l = lefts[i];
			const r = rights[i];
			let max = Infinity;
			const shared = Math.min(limit.length, r.length);
			for (let d = 0; d < shared; d++) max = Math.min(max, limit[d] - gap - r[d]);
			pos[i] += Math.max(0, max - pos[i]) * (i / (i + 1));
			for (let d = 0; d < l.length; d++) {
				const v = l[d] + pos[i];
				if (d < limit.length) limit[d] = Math.min(limit[d], v);
				else limit.push(v);
			}
		}
	}
	return pos;
}

/**
 * The nodes of one tree, or of several side by side, in preorder (a parent
 * before its subtree, the trees in order), with an ε leaf under each
 * ε-production. In a forest every path starts with the index of its tree.
 */
function collectNodes(
	roots: readonly ParseNode[],
	forest: boolean,
	labels: TreeLabeler | undefined
): TreeLayoutNode[] {
	// Built with a stack: derivations of long inputs are deep.
	const nodes: TreeLayoutNode[] = [];
	interface Pending {
		node: ParseNode | null;
		path: number[];
		parent: number | null;
		depth: number;
		root: number;
	}
	const stack: Pending[] = [];
	// Pushed right to left, so the leftmost tree is laid out first.
	for (let r = roots.length - 1; r >= 0; r--) {
		stack.push({ node: roots[r], path: forest ? [r] : [], parent: null, depth: 0, root: r });
	}
	while (stack.length) {
		const item = stack.pop()!;
		const { node, path, root } = item;
		const index = nodes.length;
		const id = pathKey(path);
		const override = node ? labels?.(node, path) : null;
		const text = override ?? (node ? node.symbol : EPSILON);
		// Only an override is split: a grammar symbol such as x1 is drawn as written.
		const label =
			override === null || override === undefined ? { base: text, sub: '' } : splitSubscript(text);
		nodes.push({
			index,
			id,
			key: `${id}|${node ? node.symbol : EPSILON}`,
			path,
			node,
			kind: !node ? 'epsilon' : node.terminal ? 'terminal' : 'nonterminal',
			text,
			label,
			x: 0,
			y: 0,
			width: labelWidth(label),
			depth: item.depth,
			row: item.depth,
			root,
			parent: item.parent,
			children: []
		});
		if (item.parent !== null) nodes[item.parent].children.push(index);
		if (!node) continue;
		const depth = item.depth + 1;
		if (isEpsilonNode(node)) {
			stack.push({ node: null, path: [...path, 0], parent: index, depth, root });
		}
		// Pushed right to left, so the leftmost child is laid out next.
		for (let i = node.children.length - 1; i >= 0; i--) {
			stack.push({ node: node.children[i], path: [...path, i], parent: index, depth, root });
		}
	}
	return nodes;
}

/** One edge per child, from the point under the parent's label to the point above the child's. */
function edgesOf(nodes: readonly TreeLayoutNode[]): TreeLayoutEdge[] {
	const reachY = LABEL_HEIGHT / 2 + EDGE_INSET;
	const edges: TreeLayoutEdge[] = [];
	for (const child of nodes) {
		if (child.parent === null) continue;
		const parent = nodes[child.parent];
		edges.push({
			key: child.key,
			parent: parent.index,
			child: child.index,
			x1: parent.x,
			y1: round(parent.y + reachY),
			x2: child.x,
			y2: round(child.y - reachY)
		});
	}
	return edges;
}

const leavesOf = (nodes: readonly TreeLayoutNode[]) =>
	nodes.filter((n) => n.children.length === 0).map((n) => n.index);

/**
 * Lays out a parse tree: top-down (`layout: 'tree'`, the default) or with the
 * leaves on a common baseline (`layout: 'baseline'`, see `layoutForest`).
 */
export function layoutTree(tree: ParseNode, opts: TreeLayoutOptions = {}): TreeLayout {
	const nodes = collectNodes([tree], false, opts.labels);
	return opts.layout === 'baseline' ? placeBaseline(nodes, opts) : placeTopDown(nodes, opts);
}

/**
 * Lays out several trees side by side over one baseline, e.g. the partial
 * parse of a shift-reduce parser: a subtree for each stack symbol, then a bare
 * leaf for each token still to come. Paths start with the index of the tree
 * (`[2]` is the third tree's root, `[2, 0]` its first child), so highlights
 * and labels can name nodes of every tree.
 */
export function layoutForest(
	roots: readonly ParseNode[],
	opts: Omit<TreeLayoutOptions, 'layout'> = {}
): TreeLayout {
	return placeBaseline(collectNodes(roots, true, opts.labels), opts);
}

function placeTopDown(nodes: TreeLayoutNode[], opts: TreeLayoutOptions): TreeLayout {
	const levelHeight = opts.levelHeight ?? LEVEL_HEIGHT;
	const gap = opts.gap ?? LABEL_GAP;
	const padding = opts.padding ?? 8;

	// Bottom up: place the children of each node, then record the subtree's
	// extent per level (relative to the node) for its own parent.
	const n = nodes.length;
	const lefts = new Array<number[] | null>(n).fill(null);
	const rights = new Array<number[] | null>(n).fill(null);
	const offset = new Float64Array(n);
	for (let i = n - 1; i >= 0; i--) {
		const half = nodes[i].width / 2;
		const kids = nodes[i].children;
		const l = [-half];
		const r = [half];
		if (kids.length) {
			const pos = placeChildren(
				kids.map((k) => lefts[k]!),
				kids.map((k) => rights[k]!),
				gap
			);
			const mid = (pos[0] + pos[pos.length - 1]) / 2;
			kids.forEach((k, j) => {
				const dx = pos[j] - mid;
				offset[k] = dx;
				const cl = lefts[k]!;
				const cr = rights[k]!;
				for (let d = 0; d < cl.length; d++) {
					if (d + 1 >= l.length) {
						l.push(cl[d] + dx);
						r.push(cr[d] + dx);
					} else {
						l[d + 1] = Math.min(l[d + 1], cl[d] + dx);
						r[d + 1] = Math.max(r[d + 1], cr[d] + dx);
					}
				}
				lefts[k] = rights[k] = null;
			});
		}
		lefts[i] = l;
		rights[i] = r;
	}

	// Top down: absolute positions, then move the drawing into view.
	const xs = new Float64Array(n);
	let minX = Infinity;
	let maxX = -Infinity;
	let maxDepth = 0;
	for (let i = 0; i < n; i++) {
		const node = nodes[i];
		if (node.parent !== null) xs[i] = xs[node.parent] + offset[i];
		minX = Math.min(minX, xs[i] - node.width / 2);
		maxX = Math.max(maxX, xs[i] + node.width / 2);
		maxDepth = Math.max(maxDepth, node.depth);
	}
	for (let i = 0; i < n; i++) {
		const node = nodes[i];
		node.x = round(xs[i] - minX + padding);
		node.y = round(padding + LABEL_HEIGHT / 2 + node.depth * levelHeight);
	}

	return {
		kind: 'tree',
		nodes,
		edges: edgesOf(nodes),
		leaves: leavesOf(nodes),
		rows: maxDepth + 1,
		baseline: null,
		marker: null,
		width: round(maxX - minX + 2 * padding),
		height: round(2 * padding + LABEL_HEIGHT + maxDepth * levelHeight)
	};
}

/**
 * Room a line keeps from a label in a baseline layout: beyond the text on
 * either side, and above the label's center (capitals reach about 7 units up).
 */
export const CLEAR_X = 2;
export const CLEAR_TOP = 8;
/** Distance from a label's center to the end of an edge. */
const REACH = LABEL_HEIGHT / 2 + EDGE_INSET;
/** Space between the leaves' labels and the tip of the marker. */
export const MARKER_GAP = 4;
/** Length of the marker from its tip. */
export const MARKER_LENGTH = 22;
/** Half the width of the marker's arrowhead. */
export const MARKER_HALF = 5;

function placeBaseline(nodes: TreeLayoutNode[], opts: TreeLayoutOptions): TreeLayout {
	const levelHeight = opts.levelHeight ?? LEVEL_HEIGHT;
	const gap = opts.gap ?? LABEL_GAP;
	const padding = opts.padding ?? 8;
	const n = nodes.length;
	const leaves = leavesOf(nodes);
	const m = leaves.length;

	// One spacing for every pair of neighboring leaves. It also keeps any two
	// interior nodes of one row apart: they cover different leaves, and a node
	// sits between its first and last leaf, so they are a spacing apart or more.
	let step = 0;
	for (let k = 1; k < m; k++) {
		step = Math.max(step, (nodes[leaves[k - 1]].width + nodes[leaves[k]].width) / 2 + gap);
	}
	for (const node of nodes) if (node.children.length) step = Math.max(step, node.width + gap);
	if (m === 1) step = Math.max(step, nodes[leaves[0]].width + gap);
	if (step === 0) step = 2 * gap;

	// Leaves in preorder are in input order. A parent is centered over its
	// first and last child. `first`/`last` are the leaves a node covers;
	// `chain` counts the single-child nodes below it that cover the same leaves.
	const xs = new Float64Array(n);
	const first = new Int32Array(n);
	const last = new Int32Array(n);
	const chain = new Int32Array(n);
	leaves.forEach((i, k) => {
		xs[i] = k * step;
		first[i] = last[i] = k;
	});
	for (let i = n - 1; i >= 0; i--) {
		const kids = nodes[i].children;
		if (!kids.length) continue;
		const a = kids[0];
		const b = kids[kids.length - 1];
		xs[i] = (xs[a] + xs[b]) / 2;
		first[i] = first[a];
		last[i] = last[b];
		chain[i] = kids.length === 1 ? chain[a] + 1 : 0;
	}

	// Rows above the baseline, bottom up. A parent starts one row above its
	// highest child. Each line from it to a child C must pass above every node
	// of the other children's subtrees between the parent and C (and so above
	// their lines too); the parent is raised until it does. `lo`/`hi` are the
	// horizontal extent of a subtree's labels with their clearance.
	const half = (i: number) => nodes[i].width / 2 + CLEAR_X;
	const lo = new Float64Array(n);
	const hi = new Float64Array(n);
	const up = new Int32Array(n);
	const pending: number[] = [];
	for (let i = n - 1; i >= 0; i--) {
		const kids = nodes[i].children;
		lo[i] = xs[i] - half(i);
		hi[i] = xs[i] + half(i);
		for (const c of kids) {
			lo[i] = Math.min(lo[i], lo[c]);
			hi[i] = Math.max(hi[i], hi[c]);
		}
		if (!kids.length) continue;
		// Height of the parent's center above the leaves' centers.
		let h = 0;
		for (const c of kids) h = Math.max(h, (up[c] + 1) * levelHeight);
		for (const c of kids) {
			const dx = xs[c] - xs[i];
			// A vertical line: the other subtrees are at least a spacing away.
			if (Math.abs(dx) < 1e-9) continue;
			const end = up[c] * levelHeight + REACH;
			const spanLo = Math.min(xs[i], xs[c]);
			const spanHi = Math.max(xs[i], xs[c]);
			// The line falls from the parent toward C, so over an interval it is
			// lowest at the end nearer C; `rise` is that end's share of the way up.
			const rise = (a: number, b: number) => Math.abs(xs[c] - (dx > 0 ? b : a)) / Math.abs(dx);
			for (const o of kids) if (o !== c) pending.push(o);
			while (pending.length) {
				const o = pending.pop()!;
				const a = Math.max(lo[o], spanLo);
				const b = Math.min(hi[o], spanHi);
				if (a > b) continue;
				// Above the label, and deeper in the subtree also above the end of
				// the line that comes into the node from its own parent (a child of
				// the parent being placed has its line from that parent). Nothing
				// of the subtree is higher than these two.
				const top = up[o] * levelHeight + CLEAR_TOP;
				const attach = nodes[o].parent === i ? -Infinity : up[o] * levelHeight + REACH;
				const highest = Math.max(top, attach);
				if (highest <= end || end + (h - REACH - end) * rise(a, b) >= highest) continue;
				const oa = Math.max(xs[o] - half(o), spanLo);
				const ob = Math.min(xs[o] + half(o), spanHi);
				if (oa <= ob) {
					const f = rise(oa, ob);
					if (f > 1e-9) h = Math.max(h, REACH + end + (top - end) / f);
				}
				if (attach > end && xs[o] >= spanLo && xs[o] <= spanHi) {
					const f = rise(xs[o], xs[o]);
					if (f > 1e-9) h = Math.max(h, REACH + end + (attach - end) / f);
				}
				for (const k of nodes[o].children) pending.push(k);
			}
		}
		up[i] = Math.ceil(h / levelHeight - 1e-9);
	}

	let rows = 1;
	for (let i = 0; i < n; i++) rows = Math.max(rows, up[i] + 1);
	if (opts.minRows !== undefined && Number.isFinite(opts.minRows)) {
		rows = Math.max(rows, Math.floor(opts.minRows));
	}

	const marked = opts.marker !== undefined && Number.isFinite(opts.marker);
	const firstX = m ? xs[leaves[0]] - step / 2 : 0;
	const lastX = m ? xs[leaves[m - 1]] + step / 2 : 0;
	let minX = Infinity;
	let maxX = -Infinity;
	for (let i = 0; i < n; i++) {
		minX = Math.min(minX, xs[i] - nodes[i].width / 2);
		maxX = Math.max(maxX, xs[i] + nodes[i].width / 2);
	}
	if (marked) {
		minX = Math.min(minX, firstX - MARKER_HALF);
		maxX = Math.max(maxX, lastX + MARKER_HALF);
	}
	if (minX > maxX) minX = maxX = 0;

	const top = padding + LABEL_HEIGHT / 2;
	for (let i = 0; i < n; i++) {
		const node = nodes[i];
		node.row = rows - 1 - up[i];
		node.x = round(xs[i] - minX + padding);
		node.y = round(top + node.row * levelHeight);
		// The leaves a node covers stay the same while a bottom-up parse grows
		// the tree above them, so a node keeps its key from step to step.
		node.key = `${first[i]}:${last[i]}:${chain[i]}|${node.node ? node.node.symbol : EPSILON}`;
	}
	const baseline = round(top + (rows - 1) * levelHeight);

	let marker: TreeMarker | null = null;
	if (marked) {
		const k = Math.min(m, Math.max(0, Math.round(opts.marker!)));
		const x = k === 0 ? firstX : k === m ? lastX : (xs[leaves[k - 1]] + xs[leaves[k]]) / 2;
		const y1 = round(baseline + LABEL_HEIGHT / 2 + MARKER_GAP);
		marker = { leaves: k, x: round(x - minX + padding), y1, y2: round(y1 + MARKER_LENGTH) };
	}

	return {
		kind: 'baseline',
		nodes,
		edges: edgesOf(nodes),
		leaves,
		rows,
		baseline,
		marker,
		width: round(maxX - minX + 2 * padding),
		height: round(
			2 * padding +
				LABEL_HEIGHT +
				(rows - 1) * levelHeight +
				(marked ? MARKER_GAP + MARKER_LENGTH : 0)
		)
	};
}

/** Width of the box around a label of `width`: the label with room, at least `least` wide. */
export function boxWidth(width: number, least: number = BOX_SIZE): number {
	return Math.max(width + 2 * BOX_INSET, least);
}

export interface TreeSizing {
	/** CSS px per layout unit when the tree has room. */
	scale: number;
	/** The same at the smallest size the tree is drawn at; narrower than that, it scrolls. */
	minScale: number;
	/** Least width, and the height, of a node's click area in layout units. */
	target: number;
	/** `gap` and `levelHeight` for `layoutTree` that keep those areas apart. */
	gap: number;
	levelHeight: number;
}

/**
 * How far a tree with labels of `labelSize` px may shrink. A tree that is only
 * looked at shrinks to labels of `minLabelSize` px. One with clickable nodes
 * stops where a node's click area would get smaller than MIN_TARGET px a side;
 * with labels below FONT_SIZE px the areas are larger than the label boxes
 * instead, and the labels stand as far apart as the areas need.
 */
export function treeSizing(
	labelSize: number,
	minLabelSize: number,
	interactive: boolean
): TreeSizing {
	const size = Math.max(1, labelSize);
	const scale = size / FONT_SIZE;
	let minScale = Math.max(1, Math.min(minLabelSize, size)) / FONT_SIZE;
	let target = BOX_SIZE;
	if (interactive) {
		minScale = Math.min(scale, Math.max(minScale, MIN_TARGET / BOX_SIZE));
		// A little over, so an area the browser snaps to its layout grid is not under.
		target = Math.max(BOX_SIZE, (MIN_TARGET + TARGET_SLACK) / minScale);
	}
	return {
		scale,
		minScale,
		target,
		// Two one-character labels side by side are the closest two areas get;
		// this leaves one unit between them.
		gap: Math.max(LABEL_GAP, target - CHAR_WIDTH + 1),
		levelHeight: Math.max(LEVEL_HEIGHT, target)
	};
}

/**
 * The scroll offsets of a tree's box that put a point of the drawing (in
 * layout units) in the middle of the box across and a fifth of the way down,
 * so the subtree under a node shows too, as far as the box can scroll. The
 * drawing fills the box's width between its `minScale` and `scale` sizes and
 * is centered when narrower (ParseTreeView's CSS); `box` is the visible part.
 */
export function revealScroll(
	at: { x: number; y: number },
	drawing: { width: number; height: number },
	sizing: Pick<TreeSizing, 'scale' | 'minScale'>,
	box: { width: number; height: number }
): { left: number; top: number } {
	const s = Math.min(sizing.scale, Math.max(sizing.minScale, box.width / drawing.width));
	const width = drawing.width * s;
	const height = drawing.height * s;
	const x = Math.max(0, (box.width - width) / 2) + at.x * s;
	const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
	return {
		left: clamp(x - box.width / 2, width - box.width),
		top: clamp(at.y * s - box.height / 5, height - box.height)
	};
}

export type TreeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * The node reached from `index` with an arrow key: the parent, the first
 * child, or the previous / next node on the same row. ε leaves are skipped.
 * In a forest, a root has no parent and the leaves' row joins the trees.
 */
export function neighborOf(
	layout: TreeLayout,
	index: number,
	direction: TreeDirection
): number | null {
	const node = layout.nodes[index];
	if (!node) return null;
	if (direction === 'up') return node.parent;
	if (direction === 'down') {
		return node.children.find((c) => layout.nodes[c].node !== null) ?? null;
	}
	// Preorder lists each row from left to right: two nodes of one row are
	// never ancestor and descendant.
	const step = direction === 'left' ? -1 : 1;
	for (let i = index + step; i >= 0 && i < layout.nodes.length; i += step) {
		const other = layout.nodes[i];
		if (other.row === node.row && other.node !== null) return i;
	}
	return null;
}

/**
 * The tree as text, e.g. `E ( E ( int ) + E ( int ) )`: each non-terminal is
 * followed by its children in parentheses.
 */
export function describeTree(tree: ParseNode, labels?: TreeLabeler): string {
	return describe(tree, [], labels);
}

/**
 * Several trees as text, separated by commas: `E ( int ), +, (`. Paths passed
 * to `labels` start with the index of the tree, as in `layoutForest`.
 */
export function describeForest(roots: readonly ParseNode[], labels?: TreeLabeler): string {
	return roots.map((root, i) => describe(root, [i], labels)).join(', ');
}

function describe(tree: ParseNode, at: number[], labels?: TreeLabeler): string {
	const out: string[] = [];
	const stack: ({ node: ParseNode; path: number[] } | string)[] = [{ node: tree, path: at }];
	while (stack.length) {
		const item = stack.pop()!;
		if (typeof item === 'string') {
			out.push(item);
			continue;
		}
		const { node, path } = item;
		out.push(labels?.(node, path) ?? node.symbol);
		if (isEpsilonNode(node)) out.push('(', EPSILON, ')');
		if (!node.children.length) continue;
		out.push('(');
		stack.push(')');
		for (let i = node.children.length - 1; i >= 0; i--) {
			stack.push({ node: node.children[i], path: [...path, i] });
		}
	}
	return out.join(' ');
}
