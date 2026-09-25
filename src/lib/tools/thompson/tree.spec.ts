import { describe, expect, it } from 'vitest';
import { buildConstruction, type Construction } from './construction';
import { CHAR_W, NODE_H, NUM_W, layoutTree, nodeLabel, subtreeKeys, type TreeLayout } from './tree';
import { parseRegex } from '$lib/theory/regex';

function build(re: string, defs = ''): Construction {
	const o = buildConstruction(re, defs);
	if (o.status !== 'ok') throw new Error(o.status);
	return o.construction;
}

const tree = (re: string, defs = '') => {
	const c = build(re, defs);
	return layoutTree(c.regex, c.stepByPath);
};

/** Nodes on one level never overlap, step numbers included. */
function expectNoOverlap(t: TreeLayout) {
	const levels = new Map<number, [number, number][]>();
	for (const n of t.nodes) {
		const num = n.step === null ? 0 : String(n.step + 1).length * NUM_W + 3;
		const row = levels.get(n.y) ?? [];
		row.push([n.x - n.w / 2, n.x + n.w / 2 + num]);
		levels.set(n.y, row);
	}
	for (const row of levels.values()) {
		row.sort((a, b) => a[0] - b[0]);
		for (let i = 1; i < row.length; i++) expect(row[i][0]).toBeGreaterThanOrEqual(row[i - 1][1]);
	}
	for (const n of t.nodes) {
		expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
		expect(n.x + n.w / 2).toBeLessThanOrEqual(t.width);
		expect(n.y + NODE_H / 2).toBeLessThanOrEqual(t.height);
	}
}

describe('layoutTree', () => {
	it('numbers (1 | 0)*1 in post-order, which is the step order', () => {
		const t = tree('(1 | 0)*1');
		expect(t.nodes.map((n) => n.key)).toEqual(['0.0.0', '0.0.1', '0.0', '0', '1', '']);
		expect(t.nodes.map((n) => n.step)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(t.nodes.map((n) => n.label)).toEqual(['1', '0', '|', '*', '1', '·']);
		expectNoOverlap(t);
	});

	it('centers each parent over its children and puts children one level down', () => {
		const t = tree('(1 | 0)*1');
		for (const n of t.nodes) {
			if (!n.children.length) continue;
			const kids = n.children.map((k) => t.byKey.get(k)!);
			const first = kids[0];
			const last = kids[kids.length - 1];
			expect(n.x).toBeCloseTo((first.x + last.x) / 2);
			for (const k of kids) expect(k.y).toBeGreaterThan(n.y);
		}
		expect(t.byKey.get('0.0.0')!.x).toBeLessThan(t.byKey.get('0.0.1')!.x);
	});

	it('packs wider trees without overlaps', () => {
		expectNoOverlap(tree("'if' | 'then' | 'else'"));
		expectNoOverlap(tree('(0 | 1)* 1 (0|1)^2'));
		expectNoOverlap(tree('((a | b) c | d e f)* (g | h+)? [a-z]^{2,3}'));
	});

	it('expands definitions at each use', () => {
		const t = tree('digit digit*', "digit = '0' | '1' | '2' | … | '9'");
		expect(t.nodes.map((n) => n.label)).toEqual(['0–9', 'digit', '0–9', 'digit', '*', '·']);
		expectNoOverlap(t);
	});

	it('shows the operand of A⁰ without a step', () => {
		const t = tree('a^0 b');
		expect(t.nodes.map((n) => [n.label, n.step])).toEqual([
			['a', null],
			['⁰', 0],
			['b', 1],
			['·', 2]
		]);
	});

	it('lists a subtree', () => {
		const t = tree('(1 | 0)*1');
		expect([...subtreeKeys(t, '0')].sort()).toEqual(['0', '0.0', '0.0.0', '0.0.1']);
	});
});

describe('nodeLabel', () => {
	const label = (re: string) => {
		const r = parseRegex(re);
		if (!r.ok) throw new Error(re);
		return nodeLabel(r.regex);
	};
	it('uses operators for inner nodes and symbols for leaves', () => {
		expect(label('ε')).toBe('ε');
		expect(label('ɸ')).toBe('ɸ');
		expect(label('Σ')).toBe('Σ');
		expect(label("'x'")).toBe("'x'");
		expect(label('[a-z]')).toBe('a–z');
		expect(label('a+')).toBe('+');
		expect(label('a?')).toBe('?');
		expect(label('a^3')).toBe('³');
		expect(label('a^{2,5}')).toBe('{2,5}');
		expect(label('a^{2,}')).toBe('{2,}');
		expect(label("' '")).toBe("' '");
		expect(label("'\\t'")).toBe("'\\t'");
		expect(CHAR_W).toBeGreaterThan(0);
	});
});
