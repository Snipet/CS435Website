import { describe, expect, it } from 'vitest';
import type { ParseNode } from '$lib/theory/grammar/types';
import {
	bottomUpSlideTree,
	bottomUpTree,
	branch,
	cascadeTree,
	emptyParensTree,
	instanceLabels,
	instanceTree,
	leaf,
	parenTree,
	shiftReduceForest,
	sumTrees
} from './fixtures';
import {
	BOX_SIZE,
	CHAR_WIDTH,
	CLEAR_TOP,
	CLEAR_X,
	FONT_SIZE,
	LABEL_GAP,
	LABEL_HEIGHT,
	LEVEL_HEIGHT,
	MARKER_GAP,
	MARKER_LENGTH,
	MIN_TARGET,
	SUB_SCALE,
	boxWidth,
	describeForest,
	describeTree,
	isEpsilonNode,
	labelWidth,
	layoutForest,
	layoutTree,
	neighborOf,
	nodeAtPath,
	pathKey,
	revealScroll,
	splitSubscript,
	treeSizing,
	type TreeLayout
} from './tree-layout';

const EPS = 0.011; // positions are rounded to 1/100

/** Deterministic pseudo-random trees with labels of several widths. */
function randomTree(seed: number): ParseNode {
	let s = seed >>> 0;
	const next = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
	const names = ['E', 'T', 'EXPR', 'NounPhrase', 'S’'];
	const tokens = ['int', '+', '(', 'the cat', 'id'];
	const pick = (list: string[]) => list[Math.floor(next() * list.length)];
	const build = (depth: number): ParseNode => {
		if (depth >= 5 || next() < 0.3) return leaf(pick(tokens));
		const count = next() < 0.15 ? 0 : 1 + Math.floor(next() * 4);
		return branch(pick(names), 0, ...Array.from({ length: count }, () => build(depth + 1)));
	};
	return branch('S', 0, build(1), build(1), build(1));
}

const samples: [string, ParseNode][] = [
	['left-nested sum', sumTrees.left],
	['right-nested sum', sumTrees.right],
	['precedence cascade', cascadeTree],
	['( int )', parenTree],
	['int * int', instanceTree],
	['( ) with an ε-production', emptyParensTree],
	...Array.from({ length: 12 }, (_, i): [string, ParseNode] => [`random ${i}`, randomTree(i + 1)])
];

function levels(layout: TreeLayout) {
	const byDepth = new Map<number, TreeLayout['nodes']>();
	for (const n of layout.nodes) {
		const level = byDepth.get(n.depth) ?? [];
		level.push(n);
		byDepth.set(n.depth, level);
	}
	return [...byDepth.values()];
}

describe('layoutTree', () => {
	it.each(samples)('keeps the labels of a level apart: %s', (_, tree) => {
		const layout = layoutTree(tree);
		for (const level of levels(layout)) {
			// Preorder lists a level from left to right.
			for (let i = 1; i < level.length; i++) {
				const a = level[i - 1];
				const b = level[i];
				expect(b.x - b.width / 2 - (a.x + a.width / 2)).toBeGreaterThanOrEqual(LABEL_GAP - EPS);
			}
		}
	});

	it.each(samples)('keeps subtrees apart on every level: %s', (_, tree) => {
		const layout = layoutTree(tree);
		// Extent of each subtree per depth.
		const extent = layout.nodes.map(() => new Map<number, [number, number]>());
		for (let i = layout.nodes.length - 1; i >= 0; i--) {
			const n = layout.nodes[i];
			extent[i].set(n.depth, [n.x - n.width / 2, n.x + n.width / 2]);
			for (const c of n.children) {
				for (const [d, [lo, hi]] of extent[c]) {
					const own = extent[i].get(d);
					extent[i].set(d, own ? [Math.min(own[0], lo), Math.max(own[1], hi)] : [lo, hi]);
				}
			}
		}
		for (const n of layout.nodes) {
			for (let j = 1; j < n.children.length; j++) {
				const before = extent[n.children[j - 1]];
				const after = extent[n.children[j]];
				for (const [d, [lo]] of after) {
					const other = before.get(d);
					if (other) expect(lo - other[1]).toBeGreaterThanOrEqual(LABEL_GAP - EPS);
				}
			}
		}
	});

	it.each(samples)('centers parents over their first and last child: %s', (_, tree) => {
		const layout = layoutTree(tree);
		for (const n of layout.nodes) {
			if (!n.children.length) continue;
			const first = layout.nodes[n.children[0]];
			const last = layout.nodes[n.children[n.children.length - 1]];
			expect(Math.abs(n.x - (first.x + last.x) / 2)).toBeLessThanOrEqual(EPS);
		}
	});

	it.each(samples)('puts a single child directly below its parent: %s', (_, tree) => {
		const layout = layoutTree(tree);
		const single = layout.nodes.filter((n) => n.children.length === 1);
		for (const n of single) expect(layout.nodes[n.children[0]].x).toBe(n.x);
		expect(single.every((n) => layout.nodes[n.children[0]].y === n.y + LEVEL_HEIGHT)).toBe(true);
	});

	it.each(samples)('draws children left to right, one level below the parent: %s', (_, tree) => {
		const layout = layoutTree(tree);
		for (const n of layout.nodes) {
			const kids = n.children.map((c) => layout.nodes[c]);
			for (const k of kids) expect(k.y).toBe(n.y + LEVEL_HEIGHT);
			for (let j = 1; j < kids.length; j++) expect(kids[j].x).toBeGreaterThan(kids[j - 1].x);
			expect(kids.map((k) => k.path[k.path.length - 1])).toEqual(kids.map((_, j) => j));
		}
	});

	it('does not align the leaves on a baseline', () => {
		const layout = layoutTree(sumTrees.right);
		const leaves = layout.nodes.filter((n) => !n.children.length);
		expect(leaves.map((n) => n.text)).toEqual(['int', '+', 'int', '+', 'int']);
		expect(leaves.map((n) => n.depth)).toEqual([2, 1, 3, 2, 3]);
		expect(new Set(leaves.map((n) => n.y)).size).toBe(3);
		for (const n of leaves) expect(n.y).toBe(layout.nodes[n.parent!].y + LEVEL_HEIGHT);
	});

	it('centers an operator between its operands', () => {
		const layout = layoutTree(sumTrees.left);
		const [left, plus, right] = layout.nodes[0].children.map((c) => layout.nodes[c]);
		expect(plus.text).toBe('+');
		expect(plus.x).toBeCloseTo((left.x + right.x) / 2, 1);
		// The wide left operand pushes the right one out, past the minimum spacing.
		expect(right.x - plus.x).toBeGreaterThan(CHAR_WIDTH + LABEL_GAP);
	});

	it('spreads several inner children evenly', () => {
		const wide = () => branch('A', 0, leaf('aaaaaaaaaa'), leaf('bbbbbbbbbb'));
		const layout = layoutTree(branch('S', 0, wide(), leaf('x'), leaf('y'), wide()));
		const xs = layout.nodes[0].children.map((c) => layout.nodes[c].x);
		const gaps = [xs[1] - xs[0], xs[2] - xs[1], xs[3] - xs[2]];
		expect(gaps[1]).toBeCloseTo(gaps[0], 1);
		expect(gaps[2]).toBeCloseTo(gaps[0], 1);
	});

	it('is deterministic and does not change the tree', () => {
		const tree = randomTree(7);
		const copy = structuredClone(tree);
		expect(layoutTree(tree)).toEqual(layoutTree(structuredClone(tree)));
		expect(tree).toEqual(copy);
	});

	it('fits every label inside the drawing', () => {
		for (const [, tree] of samples) {
			const layout = layoutTree(tree, { padding: 10 });
			for (const n of layout.nodes) {
				expect(n.x - n.width / 2).toBeGreaterThanOrEqual(10 - EPS);
				expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width - 10 + EPS);
				expect(n.y - LABEL_HEIGHT / 2).toBeGreaterThanOrEqual(10 - EPS);
				expect(n.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(layout.height - 10 + EPS);
			}
		}
	});

	it('runs each edge from under the parent to above the child', () => {
		const layout = layoutTree(parenTree);
		expect(layout.edges).toHaveLength(layout.nodes.length - 1);
		for (const e of layout.edges) {
			const parent = layout.nodes[e.parent];
			const child = layout.nodes[e.child];
			expect([e.x1, e.x2]).toEqual([parent.x, child.x]);
			expect(e.y1).toBeGreaterThan(parent.y + LABEL_HEIGHT / 2);
			expect(e.y2).toBeLessThan(child.y - LABEL_HEIGHT / 2);
			expect(e.y2).toBeGreaterThan(e.y1);
		}
		// The three lines under T fan out from one point.
		const fan = layout.edges.filter((e) => layout.nodes[e.parent].id === '0');
		expect(fan).toHaveLength(3);
		expect(new Set(fan.map((e) => `${e.x1},${e.y1}`)).size).toBe(1);
	});

	it('lists nodes in preorder with paths, ids and kinds', () => {
		const layout = layoutTree(parenTree);
		expect(layout.nodes.map((n) => `${n.id}:${n.text}`)).toEqual([
			':E',
			'0:T',
			'0.0:(',
			'0.1:E',
			'0.1.0:T',
			'0.1.0.0:int',
			'0.2:)'
		]);
		expect(layout.nodes.map((n) => n.kind)).toEqual([
			'nonterminal',
			'nonterminal',
			'terminal',
			'nonterminal',
			'nonterminal',
			'terminal',
			'terminal'
		]);
		expect(layout.nodes.every((n, i) => n.index === i)).toBe(true);
		for (const n of layout.nodes) expect(nodeAtPath(parenTree, n.path)).toBe(n.node);
	});

	it('draws an ε leaf under an ε-production', () => {
		const layout = layoutTree(emptyParensTree);
		const inner = layout.nodes.find((n) => n.id === '1')!;
		expect(inner.text).toBe('S');
		expect(inner.children).toHaveLength(1);
		const eps = layout.nodes[inner.children[0]];
		expect(eps).toMatchObject({ text: 'ε', kind: 'epsilon', node: null, path: [1, 0] });
		expect(eps.x).toBe(inner.x);
		expect(eps.y).toBe(inner.y + LEVEL_HEIGHT);
	});

	it('leaves a non-terminal that is not expanded yet without an ε leaf', () => {
		const pending: ParseNode = { symbol: 'E', terminal: false, children: [] };
		expect(isEpsilonNode(pending)).toBe(false);
		expect(layoutTree(branch('S', 0, pending)).nodes).toHaveLength(2);
	});

	it('uses label overrides and measures their subscripts', () => {
		const labels = (_: ParseNode, path: number[]) => instanceLabels[pathKey(path)];
		const layout = layoutTree(instanceTree, { labels });
		expect(layout.nodes.map((n) => n.text)).toEqual(['E0', 'T1', 'int', '*', 'T2', 'int']);
		expect(layout.nodes[0].label).toEqual({ base: 'E', sub: '0' });
		expect(layout.nodes[0].width).toBeCloseTo(CHAR_WIDTH * (1 + SUB_SCALE));
		expect(layout.nodes[2].label).toEqual({ base: 'int', sub: '' });
		// The key follows the symbol, so numbering instances does not remake the nodes.
		expect(layout.nodes.map((n) => n.key)).toEqual(
			layoutTree(instanceTree).nodes.map((n) => n.key)
		);
	});

	it('draws a grammar symbol that ends in a digit as written', () => {
		const layout = layoutTree(branch('E1', 0, leaf('x2')));
		expect(layout.nodes.map((n) => n.label)).toEqual([
			{ base: 'E1', sub: '' },
			{ base: 'x2', sub: '' }
		]);
	});

	it('widens the tree for wide labels', () => {
		const narrow = layoutTree(branch('E', 0, leaf('a'), leaf('b')));
		const wide = layoutTree(branch('E', 0, leaf('the cat'), leaf('the mat')));
		expect(wide.width).toBeGreaterThan(narrow.width);
		expect(wide.height).toBe(narrow.height);
	});

	it('handles a single node and a very deep tree', () => {
		const one = layoutTree(leaf('int'));
		expect(one.nodes).toHaveLength(1);
		expect(one.edges).toEqual([]);
		expect(one.width).toBeCloseTo(3 * CHAR_WIDTH + 16);

		let deep: ParseNode = leaf('a');
		// A long chain: the walk keeps its own stack instead of recursing.
		for (let i = 0; i < 4000; i++) deep = branch('A', 0, deep);
		const layout = layoutTree(deep);
		expect(layout.nodes).toHaveLength(4001);
		expect(new Set(layout.nodes.map((n) => n.x)).size).toBe(1);
		expect(describeTree(deep).startsWith('A ( A ( A')).toBe(true);
	});
});

describe('splitSubscript', () => {
	it('splits trailing digits after a letter or a prime', () => {
		expect(splitSubscript('E0')).toEqual({ base: 'E', sub: '0' });
		expect(splitSubscript('T12')).toEqual({ base: 'T', sub: '12' });
		expect(splitSubscript('EXPR3')).toEqual({ base: 'EXPR', sub: '3' });
		expect(splitSubscript('S’1')).toEqual({ base: 'S’', sub: '1' });
		expect(splitSubscript("S'2")).toEqual({ base: "S'", sub: '2' });
		expect(splitSubscript('x86a1')).toEqual({ base: 'x86a', sub: '1' });
	});

	it('reads subscript digits as digits', () => {
		expect(splitSubscript('E₁₀')).toEqual({ base: 'E', sub: '10' });
	});

	it('keeps labels without an instance number whole', () => {
		for (const label of ['int', 'E', '0', '10', '+', '+1', '(', 'ε', '', 'the cat', '$']) {
			expect(splitSubscript(label)).toEqual({ base: label, sub: '' });
		}
	});
});

describe('labelWidth', () => {
	it('counts characters, with subscripts narrower', () => {
		expect(labelWidth({ base: 'int', sub: '' })).toBeCloseTo(3 * CHAR_WIDTH);
		expect(labelWidth({ base: 'E', sub: '12' })).toBeCloseTo(CHAR_WIDTH * (1 + 2 * SUB_SCALE));
		expect(labelWidth({ base: '', sub: '' })).toBeCloseTo(CHAR_WIDTH);
		expect(labelWidth({ base: 'S’', sub: '' })).toBeCloseTo(2 * CHAR_WIDTH);
	});
});

describe('boxWidth', () => {
	it('leaves room around the label and is never narrower than it is high', () => {
		expect(boxWidth(3 * CHAR_WIDTH)).toBeCloseTo(3 * CHAR_WIDTH + 12);
		expect(boxWidth(CHAR_WIDTH)).toBe(BOX_SIZE);
		expect(boxWidth(CHAR_WIDTH, 30)).toBe(30);
		expect(boxWidth(40, 30)).toBe(52);
	});
});

describe('treeSizing', () => {
	const labelSizes = [8, 10, 12, 14, 15, 16, 18, 20, 24, 32];
	const minSizes = [6, 11, 16, 40];
	const cases = labelSizes.flatMap((size) => minSizes.map((min): [number, number] => [size, min]));

	it('lets a tree that is only looked at shrink to the smallest label size', () => {
		expect(treeSizing(16, 11, false)).toEqual({
			scale: 1,
			minScale: 11 / FONT_SIZE,
			target: BOX_SIZE,
			gap: LABEL_GAP,
			levelHeight: LEVEL_HEIGHT
		});
		expect(treeSizing(20, 11, false).scale).toBe(1.25);
		// The smallest size is never above the natural one.
		expect(treeSizing(10, 11, false).minScale).toBe(10 / FONT_SIZE);
	});

	// A wide tree at 360 px: shrunk to 11 px labels, a one-character node would
	// be a 16.5 px target.
	it('stops a tree with clickable nodes from shrinking below 24 px targets', () => {
		const looked = treeSizing(16, 11, false);
		expect(boxWidth(CHAR_WIDTH, looked.target) * looked.minScale).toBeCloseTo(16.5);
		const clicked = treeSizing(16, 11, true);
		expect(clicked.minScale).toBe(1);
		expect(boxWidth(CHAR_WIDTH, clicked.target) * clicked.minScale).toBeGreaterThanOrEqual(
			MIN_TARGET
		);
		expect(clicked.target * clicked.minScale).toBeGreaterThanOrEqual(MIN_TARGET);
	});

	it.each(cases)('keeps every target at least 24 px: labels %d px, smallest %d px', (size, min) => {
		const s = treeSizing(size, min, true);
		expect(s.target * s.minScale).toBeGreaterThanOrEqual(MIN_TARGET);
		expect(s.target).toBeGreaterThanOrEqual(BOX_SIZE);
		expect(s.minScale).toBeLessThanOrEqual(s.scale);
		// Clickable nodes never let a tree shrink further than it otherwise would.
		expect(s.minScale).toBeGreaterThanOrEqual(treeSizing(size, min, false).minScale);
		expect(s.levelHeight).toBeGreaterThanOrEqual(s.target);
	});

	it('shrinks a tree with larger labels as far as the targets allow', () => {
		const s = treeSizing(24, 11, true);
		expect(s.scale).toBe(1.5);
		expect(s.minScale).toBe(1);
	});

	it('does not change the drawing at the default label size', () => {
		const s = treeSizing(16, 11, true);
		expect(s.gap).toBe(LABEL_GAP);
		expect(s.levelHeight).toBe(LEVEL_HEIGHT);
		for (const [, tree] of samples) {
			expect(layoutTree(tree, { gap: s.gap, levelHeight: s.levelHeight })).toEqual(
				layoutTree(tree)
			);
		}
	});

	it('moves smaller labels apart as far as their targets need', () => {
		const s = treeSizing(12, 11, true);
		expect(s.minScale).toBe(0.75);
		expect(s.target).toBeGreaterThan(BOX_SIZE);
		expect(s.gap).toBeGreaterThan(LABEL_GAP);
		expect(treeSizing(12, 11, false).gap).toBe(LABEL_GAP);
	});

	it.each(samples)('keeps the targets of a level apart at every label size: %s', (_, tree) => {
		for (const size of labelSizes) {
			const s = treeSizing(size, 11, true);
			const layout = layoutTree(tree, { gap: s.gap, levelHeight: s.levelHeight });
			for (const level of levels(layout)) {
				for (let i = 1; i < level.length; i++) {
					const a = level[i - 1];
					const b = level[i];
					const apart =
						b.x - boxWidth(b.width, s.target) / 2 - (a.x + boxWidth(a.width, s.target) / 2);
					expect(apart).toBeGreaterThanOrEqual(1 - EPS);
				}
			}
			// Rows are a level apart, and a target is no higher than that.
			for (const n of layout.nodes) {
				if (n.parent !== null)
					expect(n.y - layout.nodes[n.parent].y).toBeGreaterThanOrEqual(s.target);
			}
		}
	});

	it('stays finite for sizes that make no sense', () => {
		for (const s of [treeSizing(0, 0, true), treeSizing(-4, 11, true), treeSizing(16, -1, false)]) {
			expect(Object.values(s).every((v) => Number.isFinite(v) && v > 0)).toBe(true);
		}
	});
});

describe('revealScroll', () => {
	const sizing = { scale: 1, minScale: 0.625 };
	const drawing = { width: 4000, height: 2000 };

	it('puts the point in the middle across and a fifth of the way down a box it overflows', () => {
		// At the smallest size: 2500 × 1250 px in a 1000 × 500 box; the point at (1000, 500).
		expect(
			revealScroll({ x: 1600, y: 800 }, drawing, sizing, { width: 1000, height: 500 })
		).toEqual({ left: 500, top: 400 });
	});

	it('stops at the edges of the drawing', () => {
		const box = { width: 1000, height: 500 };
		expect(revealScroll({ x: 10, y: 10 }, drawing, sizing, box)).toEqual({ left: 0, top: 0 });
		expect(revealScroll({ x: 3990, y: 1990 }, drawing, sizing, box)).toEqual({
			left: 1500,
			top: 750
		});
	});

	it('does not scroll a drawing that fits, centered in a wider box', () => {
		const small = { width: 400, height: 200 };
		expect(revealScroll({ x: 390, y: 190 }, small, sizing, { width: 1000, height: 500 })).toEqual({
			left: 0,
			top: 0
		});
	});

	it('scrolls only down when the drawing shrinks to the width of the box', () => {
		// Drawn 1000 px wide (scale 0.8), 800 px high, in a 1000 × 300 box.
		const tall = { width: 1250, height: 1000 };
		expect(revealScroll({ x: 625, y: 500 }, tall, sizing, { width: 1000, height: 300 })).toEqual({
			left: 0,
			top: 340
		});
	});
});

describe('neighborOf', () => {
	const layout = layoutTree(parenTree);
	const at = (id: string) => layout.nodes.findIndex((n) => n.id === id);
	const go = (id: string, d: Parameters<typeof neighborOf>[2]) => {
		const i = neighborOf(layout, at(id), d);
		return i === null ? null : layout.nodes[i].id;
	};

	it('moves to the parent and the first child', () => {
		expect(go('', 'up')).toBeNull();
		expect(go('0.1', 'up')).toBe('0');
		expect(go('', 'down')).toBe('0');
		expect(go('0', 'down')).toBe('0.0');
		expect(go('0.0', 'down')).toBeNull();
	});

	it('moves along a level', () => {
		expect(go('0.0', 'right')).toBe('0.1');
		expect(go('0.1', 'right')).toBe('0.2');
		expect(go('0.2', 'right')).toBeNull();
		expect(go('0.2', 'left')).toBe('0.1');
		expect(go('0.0', 'left')).toBeNull();
	});

	it('crosses to a cousin on the same level', () => {
		const sum = layoutTree(sumTrees.left);
		const from = sum.nodes.findIndex((n) => n.id === '0.2');
		const to = neighborOf(sum, from, 'right');
		expect(to === null ? null : sum.nodes[to].id).toBe('2.0');
	});

	it('skips ε leaves', () => {
		const eps = layoutTree(emptyParensTree);
		const inner = eps.nodes.findIndex((n) => n.id === '1');
		expect(neighborOf(eps, inner, 'down')).toBeNull();
		expect(neighborOf(eps, 99, 'up')).toBeNull();
	});
});

describe('describeTree', () => {
	it('writes each non-terminal with its children in parentheses', () => {
		expect(describeTree(sumTrees.right)).toBe('E ( E ( int ) + E ( E ( int ) + E ( int ) ) )');
		expect(describeTree(leaf('int'))).toBe('int');
	});

	it('shows ε-productions and label overrides', () => {
		expect(describeTree(emptyParensTree)).toBe('S ( ( S ( ε ) ) )');
		const labels = (_: ParseNode, path: number[]) => instanceLabels[pathKey(path)];
		expect(describeTree(instanceTree, labels)).toBe('E0 ( T1 ( int * T2 ( int ) ) )');
	});
});

describe('pathKey', () => {
	it('joins child indices', () => {
		expect(pathKey([])).toBe('');
		expect(pathKey([0, 2, 1])).toBe('0.2.1');
	});
});

// ───────────────────────── baseline layout (bottom-up trees) ─────────────────────────

/** Trees side by side, as the stack of a shift-reduce parse plus tokens still to come. */
function randomForest(seed: number): ParseNode[] {
	return [...randomTree(seed).children, randomTree(seed + 100), leaf('x'), leaf('the dog')];
}

const forests: [string, ParseNode[]][] = [
	['int + ( int )', [bottomUpTree]],
	['int + ( int ) + ( int )', [bottomUpSlideTree]],
	['E + ( int I ) $', shiftReduceForest.roots],
	...samples.map(([name, tree]): [string, ParseNode[]] => [name, [tree]]),
	...Array.from({ length: 24 }, (_, i): [string, ParseNode[]] => [
		`random forest ${i}`,
		randomForest(i + 40)
	])
];

/** A single tree through layoutTree, several through layoutForest. */
const baseline = (roots: ParseNode[], opts: { marker?: number; minRows?: number } = {}) =>
	roots.length === 1
		? layoutTree(roots[0], { ...opts, layout: 'baseline' })
		: layoutForest(roots, opts);

/** The leaves of the trees, left to right: terminals, ε, unexpanded non-terminals. */
function leafTexts(roots: ParseNode[]): string[] {
	const out: string[] = [];
	const visit = (n: ParseNode) => {
		if (isEpsilonNode(n)) out.push('ε');
		else if (!n.children.length) out.push(n.symbol);
		n.children.forEach(visit);
	};
	roots.forEach(visit);
	return out;
}

interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** The text of a label with the room lines keep from it (shrunk by the rounding). */
const glyphBox = (n: TreeLayout['nodes'][number]): Box => ({
	left: n.x - n.width / 2 - CLEAR_X + EPS,
	right: n.x + n.width / 2 + CLEAR_X - EPS,
	top: n.y - CLEAR_TOP + EPS,
	bottom: n.y + LABEL_HEIGHT / 2
});

/** Whether a segment meets a box (Liang–Barsky clipping). */
function segmentMeetsBox(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
	let t0 = 0;
	let t1 = 1;
	const dx = x2 - x1;
	const dy = y2 - y1;
	const sides: [number, number][] = [
		[-dx, x1 - b.left],
		[dx, b.right - x1],
		[-dy, y1 - b.top],
		[dy, b.bottom - y1]
	];
	for (const [p, q] of sides) {
		if (p === 0) {
			if (q < 0) return false;
			continue;
		}
		const r = q / p;
		if (p < 0) t0 = Math.max(t0, r);
		else t1 = Math.min(t1, r);
		if (t0 > t1) return false;
	}
	return true;
}

/** Whether two segments cross or touch. */
function segmentsMeet(
	a: { x1: number; y1: number; x2: number; y2: number },
	b: { x1: number; y1: number; x2: number; y2: number }
): boolean {
	const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
		(bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
	const d1 = cross(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
	const d2 = cross(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
	const d3 = cross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
	const d4 = cross(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
	if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
		// On one line (a parent right above its middle child, and a chain
		// under that child): they meet when their extents overlap.
		const overlap = (p1: number, p2: number, q1: number, q2: number) =>
			Math.max(Math.min(p1, p2), Math.min(q1, q2)) <= Math.min(Math.max(p1, p2), Math.max(q1, q2));
		return overlap(a.x1, a.x2, b.x1, b.x2) && overlap(a.y1, a.y2, b.y1, b.y2);
	}
	return d1 * d2 <= 0 && d3 * d4 <= 0;
}

describe('layoutTree with layout: baseline, and layoutForest', () => {
	it.each(forests)(
		'puts every leaf on the last row, in input order, evenly spaced: %s',
		(_, roots) => {
			const layout = baseline(roots);
			const leaves = layout.leaves.map((i) => layout.nodes[i]);
			expect(layout.kind).toBe('baseline');
			expect(leaves.map((n) => n.text)).toEqual(leafTexts(roots));
			expect(leaves.every((n) => n.y === layout.baseline && n.row === layout.rows - 1)).toBe(true);
			const steps = leaves.slice(1).map((n, k) => n.x - leaves[k].x);
			for (const step of steps) {
				expect(step).toBeGreaterThan(0);
				expect(Math.abs(step - steps[0])).toBeLessThanOrEqual(2 * EPS);
			}
			// No other node is on the leaves' row.
			const inner = layout.nodes.filter((n) => n.children.length);
			expect(inner.every((n) => n.row < layout.rows - 1)).toBe(true);
		}
	);

	it.each(forests)('centers each parent over its children, above all of them: %s', (_, roots) => {
		const layout = baseline(roots);
		expect(layout.edges).toHaveLength(layout.nodes.length - roots.length);
		for (const n of layout.nodes) {
			if (!n.children.length) continue;
			const kids = n.children.map((c) => layout.nodes[c]);
			const first = kids[0];
			const last = kids[kids.length - 1];
			expect(Math.abs(n.x - (first.x + last.x) / 2)).toBeLessThanOrEqual(EPS);
			for (const k of kids) expect(k.row).toBeGreaterThan(n.row);
			// One row above the highest child, or higher.
			expect(Math.min(...kids.map((k) => k.row))).toBeGreaterThanOrEqual(n.row + 1);
			for (let j = 1; j < kids.length; j++) expect(kids[j].x).toBeGreaterThan(kids[j - 1].x);
		}
	});

	it.each(forests)('keeps the labels of a row apart: %s', (_, roots) => {
		const layout = baseline(roots);
		const byRow = new Map<number, TreeLayout['nodes']>();
		for (const n of layout.nodes) byRow.set(n.row, [...(byRow.get(n.row) ?? []), n]);
		for (const row of byRow.values()) {
			// Preorder lists a row from left to right.
			for (let i = 1; i < row.length; i++) {
				const a = row[i - 1];
				const b = row[i];
				expect(b.x - b.width / 2 - (a.x + a.width / 2)).toBeGreaterThanOrEqual(LABEL_GAP - EPS);
			}
		}
	});

	it.each(forests)('runs every line clear of the other labels: %s', (_, roots) => {
		const layout = baseline(roots);
		expect(layout.edges).toHaveLength(layout.nodes.length - roots.length);
		for (const e of layout.edges) {
			for (const n of layout.nodes) {
				if (n.index === e.parent || n.index === e.child) continue;
				expect(segmentMeetsBox(e.x1, e.y1, e.x2, e.y2, glyphBox(n)), `${e.key} / ${n.key}`).toBe(
					false
				);
			}
		}
	});

	it.each(forests)('never crosses two lines: %s', (_, roots) => {
		const layout = baseline(roots);
		expect(layout.edges).toHaveLength(layout.nodes.length - roots.length);
		const { edges } = layout;
		for (let i = 0; i < edges.length; i++) {
			for (let j = i + 1; j < edges.length; j++) {
				const a = edges[i];
				const b = edges[j];
				if (a.parent === b.parent || a.child === b.parent || b.child === a.parent) continue;
				expect(segmentsMeet(a, b), `${a.key} / ${b.key}`).toBe(false);
			}
		}
	});

	it.each(forests)('fits every label and the marker inside the drawing: %s', (_, roots) => {
		for (const marker of [undefined, 0, 3]) {
			const layout = baseline(roots, { marker });
			for (const n of layout.nodes) {
				expect(n.x - n.width / 2).toBeGreaterThanOrEqual(8 - EPS);
				expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width - 8 + EPS);
				expect(n.y - LABEL_HEIGHT / 2).toBeGreaterThanOrEqual(8 - EPS);
				expect(n.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(layout.height - 8 + EPS);
			}
			if (layout.marker) {
				expect(layout.marker.x).toBeGreaterThan(8);
				expect(layout.marker.x).toBeLessThan(layout.width - 8);
				expect(layout.marker.y2).toBeLessThanOrEqual(layout.height - 8 + EPS);
			}
		}
	});

	it('grows the tree of int + ( int ) + ( int ) upward, as Bottom-Up Parsing, slide 10 draws it', () => {
		const layout = layoutTree(bottomUpSlideTree, { layout: 'baseline' });
		const leaves = layout.leaves.map((i) => layout.nodes[i]);
		expect(leaves.map((n) => n.text).join(' ')).toBe('int + ( int ) + ( int )');
		// Rows above the leaves: each E over an int one row up, the inner E
		// higher than its E children, the root at the top, right of the inner E.
		const above = (id: string) => layout.rows - 1 - layout.nodes.find((n) => n.id === id)!.row;
		expect(['0.0', '0.3', '3'].map(above)).toEqual([1, 1, 1]);
		expect(above('0')).toBeGreaterThan(1);
		expect(above('')).toBe(layout.rows - 1);
		expect(above('')).toBeGreaterThan(above('0'));
		const [root, inner] = [layout.nodes[0], layout.nodes[1]];
		expect(root.x).toBeGreaterThan(inner.x);
		// A single child sits directly below its parent.
		for (const n of layout.nodes) {
			if (n.children.length === 1) expect(layout.nodes[n.children[0]].x).toBe(n.x);
		}
	});

	it('keeps each node in place while a shift-reduce parse grows the tree', () => {
		// int + ( int ): the partial trees after each reduction (Bottom-up Parsing II, slides 4–14).
		const E = (production: number, ...children: ParseNode[]) =>
			branch('E', production, ...children);
		const steps: ParseNode[][] = [
			[leaf('int'), leaf('+'), leaf('('), leaf('int'), leaf(')')],
			[E(1, leaf('int')), leaf('+'), leaf('('), leaf('int'), leaf(')')],
			[E(1, leaf('int')), leaf('+'), leaf('('), E(1, leaf('int')), leaf(')')],
			[bottomUpTree]
		];
		const final = layoutTree(bottomUpTree, { layout: 'baseline', marker: 5 });
		const at = new Map(final.nodes.map((n) => [n.key, n]));
		steps.forEach((roots, i) => {
			const layout = layoutForest(roots, { marker: i, minRows: final.rows });
			expect([layout.width, layout.height, layout.baseline]).toEqual([
				final.width,
				final.height,
				final.baseline
			]);
			for (const n of layout.nodes) {
				const same = at.get(n.key);
				expect(same, n.key).toBeDefined();
				expect([n.x, n.y, n.text]).toEqual([same!.x, same!.y, same!.text]);
			}
		});
	});

	it('numbers the paths of a forest from the index of each tree', () => {
		const { roots } = shiftReduceForest;
		const layout = layoutForest(roots);
		expect(layout.nodes.map((n) => `${n.id}:${n.text}`)).toEqual([
			'0:E',
			'0.0:int',
			'1:+',
			'2:(',
			'3:int',
			'4:)'
		]);
		expect(layout.nodes.map((n) => n.root)).toEqual([0, 0, 1, 2, 3, 4]);
		expect(layout.nodes.map((n) => n.depth)).toEqual([0, 1, 0, 0, 0, 0]);
		expect(layout.nodes.filter((n) => n.parent === null).map((n) => n.id)).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4'
		]);
		for (const n of layout.nodes) {
			expect(nodeAtPath(roots[n.path[0]], n.path.slice(1))).toBe(n.node);
		}
		// Labels see the same paths.
		const labeled = layoutForest(roots, {
			labels: (_, path) => (path.length === 1 ? `${roots[path[0]].symbol}${path[0]}` : null)
		});
		expect(labeled.nodes.map((n) => n.text)).toEqual(['E0', 'int', '+1', '(2', 'int3', ')4']);
		expect(labeled.nodes[0].label).toEqual({ base: 'E', sub: '0' });
	});

	it('puts the marker under the divider and keeps the size when it moves', () => {
		const { roots, marker } = shiftReduceForest;
		const plain = layoutForest(roots);
		expect(plain.marker).toBeNull();
		const layouts = [0, 1, 2, 3, 4, 5].map((k) => layoutForest(roots, { marker: k }));
		const leaves = layouts[0].leaves.map((i) => layouts[0].nodes[i]);
		const step = leaves[1].x - leaves[0].x;
		for (const [k, layout] of layouts.entries()) {
			expect([layout.width, layout.height]).toEqual([layouts[0].width, layouts[0].height]);
			const m = layout.marker!;
			expect(m.leaves).toBe(k);
			const expected =
				k === 0
					? leaves[0].x - step / 2
					: k === leaves.length
						? leaves[leaves.length - 1].x + step / 2
						: (leaves[k - 1].x + leaves[k].x) / 2;
			expect(m.x).toBeCloseTo(expected, 1);
			expect(m.y1).toBeCloseTo(layout.baseline! + LABEL_HEIGHT / 2 + MARKER_GAP, 1);
			expect(m.y2 - m.y1).toBeCloseTo(MARKER_LENGTH, 1);
		}
		// Room for the arrow under the leaves.
		expect(layouts[0].height).toBeCloseTo(plain.height + MARKER_GAP + MARKER_LENGTH, 1);
		// E + ( int I ) $: four leaves on the stack side.
		expect(layoutForest(roots, { marker }).marker!.x).toBeCloseTo(
			(leaves[3].x + leaves[4].x) / 2,
			1
		);
	});

	it('clamps the marker to the leaves and ignores one that is not a number', () => {
		const { roots } = shiftReduceForest;
		expect(layoutForest(roots, { marker: -3 }).marker!.leaves).toBe(0);
		expect(layoutForest(roots, { marker: 99 }).marker!.leaves).toBe(5);
		expect(layoutForest(roots, { marker: 2.4 }).marker!.leaves).toBe(2);
		expect(layoutForest(roots, { marker: Number.NaN }).marker).toBeNull();
		// The top-down layout has no baseline and no marker.
		const tree = layoutTree(bottomUpTree, { marker: 2 });
		expect([tree.kind, tree.baseline, tree.marker]).toEqual(['tree', null, null]);
	});

	it('keeps at least minRows rows, with the leaves on the last', () => {
		const layout = layoutTree(bottomUpTree, { layout: 'baseline', minRows: 9 });
		expect(layout.rows).toBe(9);
		expect(layout.nodes[0].row).toBe(
			9 - 1 - (layoutTree(bottomUpTree, { layout: 'baseline' }).rows - 1)
		);
		expect(layout.height).toBeCloseTo(2 * 8 + LABEL_HEIGHT + 8 * LEVEL_HEIGHT, 1);
		// Fewer rows than the tree needs change nothing.
		expect(layoutTree(bottomUpTree, { layout: 'baseline', minRows: 1 })).toEqual(
			layoutTree(bottomUpTree, { layout: 'baseline' })
		);
	});

	it('draws an ε leaf on the baseline, one row under its ε-production', () => {
		const layout = layoutTree(emptyParensTree, { layout: 'baseline' });
		const leaves = layout.leaves.map((i) => layout.nodes[i]);
		expect(leaves.map((n) => n.text)).toEqual(['(', 'ε', ')']);
		const eps = leaves[1];
		const parent = layout.nodes[eps.parent!];
		expect([eps.kind, parent.text, parent.x, parent.row]).toEqual([
			'epsilon',
			'S',
			eps.x,
			eps.row - 1
		]);
	});

	it('handles an empty forest, a single leaf and a very deep tree', () => {
		const empty = layoutForest([], { marker: 0 });
		expect([empty.nodes, empty.edges, empty.leaves]).toEqual([[], [], []]);
		expect(empty.width).toBeGreaterThan(0);
		expect(empty.marker!.leaves).toBe(0);

		const one = layoutForest([leaf('int')], { marker: 1 });
		expect(one.nodes).toHaveLength(1);
		expect(one.marker!.x).toBeGreaterThan(one.nodes[0].x + one.nodes[0].width / 2);

		let deep: ParseNode = leaf('a');
		for (let i = 0; i < 4000; i++) deep = branch('A', 0, deep);
		const layout = layoutTree(deep, { layout: 'baseline' });
		expect(layout.rows).toBe(4001);
		expect(new Set(layout.nodes.map((n) => n.x)).size).toBe(1);
		expect(new Set(layout.nodes.map((n) => n.key)).size).toBe(4001);
	});

	it('lays out a long left-nested input', () => {
		// int + ( int ) + ( int ) + … with 400 reductions by E → E + ( E ).
		let tree: ParseNode = branch('E', 1, leaf('int'));
		for (let i = 0; i < 400; i++) {
			tree = branch('E', 0, tree, leaf('+'), leaf('('), branch('E', 1, leaf('int')), leaf(')'));
		}
		const layout = layoutTree(tree, { layout: 'baseline' });
		expect(layout.leaves).toHaveLength(1 + 400 * 4);
		expect(new Set(layout.nodes.map((n) => n.key)).size).toBe(layout.nodes.length);
		for (const n of layout.nodes) {
			for (const c of n.children) expect(layout.nodes[c].row).toBeGreaterThan(n.row);
		}
	});

	it('is deterministic and does not change the trees', () => {
		const roots = randomForest(3);
		const copy = structuredClone(roots);
		expect(layoutForest(roots, { marker: 2 })).toEqual(
			layoutForest(structuredClone(roots), { marker: 2 })
		);
		expect(roots).toEqual(copy);
	});

	it('moves along a row with the arrow keys, across the trees of a forest', () => {
		const layout = layoutForest(shiftReduceForest.roots);
		const at = (id: string) => layout.nodes.findIndex((n) => n.id === id);
		const go = (id: string, d: Parameters<typeof neighborOf>[2]) => {
			const i = neighborOf(layout, at(id), d);
			return i === null ? null : layout.nodes[i].id;
		};
		expect(go('0.0', 'right')).toBe('1');
		expect(go('1', 'right')).toBe('2');
		expect(go('4', 'right')).toBeNull();
		expect(go('1', 'left')).toBe('0.0');
		expect(go('0', 'up')).toBeNull();
		expect(go('0', 'down')).toBe('0.0');
		expect(go('0', 'right')).toBeNull();
		// In a tree, left and right follow the rows of the drawing.
		const tree = layoutTree(bottomUpSlideTree, { layout: 'baseline' });
		const from = tree.nodes.findIndex((n) => n.id === '0.0');
		const to = neighborOf(tree, from, 'right');
		expect(to === null ? null : tree.nodes[to].id).toBe('0.3');
	});

	it('describes a forest tree by tree', () => {
		expect(describeForest(shiftReduceForest.roots)).toBe('E ( int ), +, (, int, )');
		expect(describeForest([])).toBe('');
		const labels = (_: ParseNode, path: number[]) => (path.join('.') === '0' ? 'E1' : null);
		expect(describeForest(shiftReduceForest.roots, labels)).toBe('E1 ( int ), +, (, int, )');
	});
});
