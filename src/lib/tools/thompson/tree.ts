/**
 * Layout of the compact syntax tree: one node per AST node (definitions
 * expanded at each use, as Thompson's construction builds them), numbered in
 * post-order, which is the construction's step order. Subtrees are packed
 * left to right against each other's contours, and each parent sits centered
 * over its children.
 */
import { formatLabel, showChar } from '$lib/theory/chars';
import { children, type Regex } from '$lib/theory/regex';
import { pathKey } from './construction';

/** Node box height; single-symbol nodes are circles of this diameter. */
export const NODE_H = 26;
/** Vertical distance between levels. */
export const LEVEL = 50;
/** Horizontal gap between neighbouring subtrees. */
export const GAP = 12;
/** Advance of one character of the 13px monospace label. */
export const CHAR_W = 7.9;
/** Advance of one digit of the 10px step number. */
export const NUM_W = 6.2;
const PAD_X = 9;
const MARGIN = 6;
const MAX_LABEL = 10;

export interface TreeNode {
	key: string;
	path: number[];
	node: Regex;
	/** Operator or symbol shown in the node. */
	label: string;
	/** Step index that builds this node, or null (e.g. the operand of A⁰, which is never built). */
	step: number | null;
	/** Center. */
	x: number;
	y: number;
	/** Box width (equal to NODE_H for circles). */
	w: number;
	circle: boolean;
	parent: string | null;
	children: string[];
}

export interface TreeLayout {
	/** In post-order. */
	nodes: TreeNode[];
	byKey: Map<string, TreeNode>;
	width: number;
	height: number;
}

const truncate = (s: string) =>
	[...s].length <= MAX_LABEL ? s : `${[...s].slice(0, MAX_LABEL - 1).join('')}…`;

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (n: number) =>
	String(n)
		.split('')
		.map((d) => SUP[Number(d)])
		.join('');

/** What a node shows: the operator for inner nodes, the symbol for leaves. */
export function nodeLabel(node: Regex): string {
	switch (node.kind) {
		case 'empty':
			return 'ɸ';
		case 'epsilon':
			return 'ε';
		case 'any':
			return 'Σ';
		case 'chars':
			if (node.set.isSingleton) {
				const text = node.text;
				return truncate(text && [...text].length <= 4 ? text : showChar(node.set.first()!));
			}
			return truncate(formatLabel(node.set));
		case 'concat':
			return '·';
		case 'alt':
			return '|';
		case 'star':
			return '*';
		case 'plus':
			return '+';
		case 'optional':
			return '?';
		case 'repeat':
			return node.min === node.max
				? superscript(node.min)
				: `{${node.min},${node.max === null ? '' : node.max}}`;
		case 'ref':
			return truncate(node.name);
	}
}

const labelWidth = (label: string) => [...label].length * CHAR_W;
const numberWidth = (step: number | null) =>
	step === null ? 0 : String(step + 1).length * NUM_W + 3;

interface Placed {
	node: TreeNode;
	x: number;
}

interface Sub {
	placed: Placed[];
	/** Extents per relative depth, with the subtree's root at x = 0. */
	left: number[];
	right: number[];
}

/** Lays out the syntax tree of `r`; `stepByPath` maps path keys to construction steps. */
export function layoutTree(r: Regex, stepByPath: ReadonlyMap<string, number>): TreeLayout {
	const byKey = new Map<string, TreeNode>();
	const post: TreeNode[] = [];
	let maxDepth = 0;

	function lay(node: Regex, path: number[], parent: string | null, depth: number): Sub {
		maxDepth = Math.max(maxDepth, depth);
		const key = pathKey(path);
		const label = nodeLabel(node);
		const textW = labelWidth(label) + 2 * PAD_X;
		const circle = textW <= NODE_H + 2;
		const w = circle ? NODE_H : textW;
		const step = stepByPath.get(key) ?? null;
		const tn: TreeNode = {
			key,
			path,
			node,
			label,
			step,
			x: 0,
			y: MARGIN + depth * LEVEL + NODE_H / 2 + 8,
			w,
			circle,
			parent,
			children: []
		};
		const kids = children(node).map((k, i) => lay(k, [...path, i], key, depth + 1));
		tn.children = kids.map((k) => k.placed[0].node.key);
		post.push(tn);
		byKey.set(key, tn);
		const halfL = w / 2;
		const halfR = w / 2 + numberWidth(step);
		if (kids.length === 0) return { placed: [{ node: tn, x: 0 }], left: [-halfL], right: [halfR] };

		const offsets = [0];
		const accL = [...kids[0].left];
		const accR = [...kids[0].right];
		for (const sub of kids.slice(1)) {
			let off = -Infinity;
			const common = Math.min(accR.length, sub.left.length);
			for (let d = 0; d < common; d++) off = Math.max(off, accR[d] - sub.left[d] + GAP);
			offsets.push(off);
			for (let d = 0; d < sub.left.length; d++) {
				if (d >= accR.length) accL[d] = sub.left[d] + off;
				accR[d] = sub.right[d] + off;
			}
		}
		const rootX = (offsets[0] + offsets[offsets.length - 1]) / 2;
		const placed: Placed[] = [{ node: tn, x: 0 }];
		kids.forEach((sub, k) => {
			for (const p of sub.placed) placed.push({ node: p.node, x: p.x + offsets[k] - rootX });
		});
		return {
			placed,
			left: [-halfL, ...accL.map((v) => v - rootX)],
			right: [halfR, ...accR.map((v) => v - rootX)]
		};
	}

	const root = lay(r, [], null, 0);
	const minX = Math.min(...root.left);
	const maxX = Math.max(...root.right);
	for (const p of root.placed) p.node.x = p.x - minX + MARGIN;
	return {
		nodes: post,
		byKey,
		width: maxX - minX + 2 * MARGIN,
		height: MARGIN + maxDepth * LEVEL + NODE_H + 8 + MARGIN
	};
}

/** Keys of the nodes in the subtree rooted at `key` (including it). */
export function subtreeKeys(layout: TreeLayout, key: string): Set<string> {
	const out = new Set<string>();
	const stack = [key];
	while (stack.length) {
		const k = stack.pop()!;
		if (out.has(k)) continue;
		out.add(k);
		const n = layout.byKey.get(k);
		if (n) stack.push(...n.children);
	}
	return out;
}
