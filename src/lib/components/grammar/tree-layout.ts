/**
 * Layout for parse trees drawn as on the lecture slides (docs/ARCHITECTURE.md
 * §3.10): root at the top, children left to right, every node one level below
 * its own parent, so leaves do not share a baseline.
 *
 * The layout is a tidy tree: subtrees never overlap, a parent is centered over
 * its first and last child (a single child sits directly below it), and
 * children between two wide subtrees are spread over the room between them.
 * Label widths come from the text length; the labels are set in the mono font.
 *
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
	depth: number;
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

export interface TreeLayout {
	nodes: TreeLayoutNode[];
	edges: TreeLayoutEdge[];
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

export function layoutTree(tree: ParseNode, opts: TreeLayoutOptions = {}): TreeLayout {
	const levelHeight = opts.levelHeight ?? LEVEL_HEIGHT;
	const gap = opts.gap ?? LABEL_GAP;
	const padding = opts.padding ?? 8;

	// Preorder list, built with a stack: derivations of long inputs are deep.
	const nodes: TreeLayoutNode[] = [];
	interface Pending {
		node: ParseNode | null;
		path: number[];
		parent: number | null;
		depth: number;
	}
	const stack: Pending[] = [{ node: tree, path: [], parent: null, depth: 0 }];
	while (stack.length) {
		const item = stack.pop()!;
		const { node, path } = item;
		const index = nodes.length;
		const id = pathKey(path);
		const override = node ? opts.labels?.(node, path) : null;
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
			parent: item.parent,
			children: []
		});
		if (item.parent !== null) nodes[item.parent].children.push(index);
		if (!node) continue;
		const depth = item.depth + 1;
		if (isEpsilonNode(node)) stack.push({ node: null, path: [...path, 0], parent: index, depth });
		// Pushed right to left, so the leftmost child is laid out next.
		for (let i = node.children.length - 1; i >= 0; i--) {
			stack.push({ node: node.children[i], path: [...path, i], parent: index, depth });
		}
	}

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

	const reachY = LABEL_HEIGHT / 2 + EDGE_INSET;
	const edges: TreeLayoutEdge[] = [];
	for (let i = 1; i < n; i++) {
		const child = nodes[i];
		const parent = nodes[child.parent!];
		edges.push({
			key: child.key,
			parent: parent.index,
			child: i,
			x1: parent.x,
			y1: round(parent.y + reachY),
			x2: child.x,
			y2: round(child.y - reachY)
		});
	}

	return {
		nodes,
		edges,
		width: round(maxX - minX + 2 * padding),
		height: round(2 * padding + LABEL_HEIGHT + maxDepth * levelHeight)
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

export type TreeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * The node reached from `index` with an arrow key: the parent, the first
 * child, or the previous / next node on the same level. ε leaves are skipped.
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
	// Preorder lists each level from left to right.
	const step = direction === 'left' ? -1 : 1;
	for (let i = index + step; i >= 0 && i < layout.nodes.length; i += step) {
		const other = layout.nodes[i];
		if (other.depth === node.depth && other.node !== null) return i;
	}
	return null;
}

/**
 * The tree as text, e.g. `E ( E ( int ) + E ( int ) )`: each non-terminal is
 * followed by its children in parentheses.
 */
export function describeTree(tree: ParseNode, labels?: TreeLabeler): string {
	const out: string[] = [];
	const stack: ({ node: ParseNode; path: number[] } | string)[] = [{ node: tree, path: [] }];
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
