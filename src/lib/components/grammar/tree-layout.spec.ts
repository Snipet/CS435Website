import { describe, expect, it } from 'vitest';
import type { ParseNode } from '$lib/theory/grammar/types';
import {
	branch,
	cascadeTree,
	emptyParensTree,
	instanceLabels,
	instanceTree,
	leaf,
	parenTree,
	sumTrees
} from './fixtures';
import {
	BOX_SIZE,
	CHAR_WIDTH,
	FONT_SIZE,
	LABEL_GAP,
	LABEL_HEIGHT,
	LEVEL_HEIGHT,
	MIN_TARGET,
	SUB_SCALE,
	boxWidth,
	describeTree,
	isEpsilonNode,
	labelWidth,
	layoutTree,
	neighborOf,
	nodeAtPath,
	pathKey,
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
