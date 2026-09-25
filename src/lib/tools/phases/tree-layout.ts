/**
 * Layout of small trees (and forests) for `TreeView`: every subtree gets a
 * horizontal band at least as wide as its root and its children's bands, a
 * parent is centered over its children, and rows go by depth. `orientation:
 * 'up'` puts the root at the bottom; `alignLeaves` puts every leaf in the row
 * farthest from the root (the words of a sentence diagram).
 */
import type { DisplayNode } from './trees';

export interface TreeLayoutOptions {
	orientation?: 'down' | 'up';
	alignLeaves?: boolean;
	/** Width of one label character in px (monospace). */
	charWidth?: number;
	/** Width of one note character in px. */
	noteCharWidth?: number;
	/** Distance between the centers of adjacent rows. */
	levelHeight?: number;
	/** Horizontal space between neighboring subtrees. */
	gap?: number;
	padding?: number;
}

export interface PlacedNode {
	node: DisplayNode;
	/** Center. */
	x: number;
	y: number;
	width: number;
	height: number;
	depth: number;
	parent: number | null;
}

export interface TreeLayout {
	nodes: PlacedNode[];
	/** [parent index, child index] pairs. */
	edges: [number, number][];
	width: number;
	height: number;
}

const LABEL_LINE = 18;
const NOTE_LINE = 14;
const PAD_X = 8;
const PAD_Y = 4;

export function nodeSize(
	n: DisplayNode,
	charWidth: number,
	noteCharWidth: number
): { width: number; height: number } {
	const label = [...n.label].length * charWidth;
	const note = n.note ? [...n.note].length * noteCharWidth : 0;
	return {
		width: Math.ceil(Math.max(label, note) + 2 * PAD_X),
		height: LABEL_LINE + (n.note ? NOTE_LINE : 0) + 2 * PAD_Y
	};
}

export function layoutTree(
	roots: readonly DisplayNode[],
	options: TreeLayoutOptions = {}
): TreeLayout {
	const {
		orientation = 'down',
		alignLeaves = false,
		charWidth = 7.9,
		noteCharWidth = 6.2,
		levelHeight = 58,
		gap = 14,
		padding = 8
	} = options;

	const sizes = new Map<DisplayNode, { width: number; height: number }>();
	const band = new Map<DisplayNode, number>();
	const measure = (n: DisplayNode): number => {
		const size = nodeSize(n, charWidth, noteCharWidth);
		sizes.set(n, size);
		const kids = n.children.map(measure);
		const kidsWidth = kids.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1);
		const w = Math.max(size.width, kidsWidth);
		band.set(n, w);
		return w;
	};

	const nodes: PlacedNode[] = [];
	const edges: [number, number][] = [];
	let maxDepth = 0;

	const place = (n: DisplayNode, left: number, depth: number, parent: number | null): number => {
		const size = sizes.get(n)!;
		const w = band.get(n)!;
		const index = nodes.length;
		nodes.push({ node: n, x: 0, y: 0, ...size, depth, parent });
		if (parent !== null) edges.push([parent, index]);
		maxDepth = Math.max(maxDepth, depth);
		if (n.children.length === 0) {
			nodes[index].x = left + w / 2;
			return index;
		}
		const kidsWidth =
			n.children.reduce((a, c) => a + band.get(c)!, 0) + gap * (n.children.length - 1);
		let x = left + (w - kidsWidth) / 2;
		const placed: number[] = [];
		for (const c of n.children) {
			placed.push(place(c, x, depth + 1, index));
			x += band.get(c)! + gap;
		}
		const center = (nodes[placed[0]].x + nodes[placed[placed.length - 1]].x) / 2;
		nodes[index].x = Math.min(Math.max(center, left + size.width / 2), left + w - size.width / 2);
		return index;
	};

	let left = padding;
	for (const r of roots) {
		const w = measure(r);
		place(r, left, 0, null);
		left += w + gap * 2;
	}
	const width = roots.length ? left - gap * 2 + padding : 2 * padding;

	const rowHalf = (LABEL_LINE + NOTE_LINE + 2 * PAD_Y) / 2;
	for (const p of nodes) {
		const leafRow = alignLeaves && p.node.children.length === 0;
		const level = leafRow ? maxDepth : p.depth;
		const row = orientation === 'down' ? level : maxDepth - level;
		p.y = padding + rowHalf + row * levelHeight;
	}
	const height = roots.length ? 2 * padding + 2 * rowHalf + maxDepth * levelHeight : 2 * padding;
	return { nodes, edges, width: Math.ceil(width), height: Math.ceil(height) };
}
