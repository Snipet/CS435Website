import { describe, expect, it } from 'vitest';
import { compile } from './pipeline';
import { PRESETS, SLIDE_4_DECLS } from './presets';
import { layoutTree } from './tree-layout';
import { annotatedForest, astForest, countNodes, parseDiagram, treeText } from './trees';

const program = (source: string) => {
	const p = compile(source, SLIDE_4_DECLS).parse?.program;
	if (!p) throw new Error('syntax error');
	return p;
};

describe('trees', () => {
	it('draws the slide’s abstract syntax tree', () => {
		const [t] = astForest(program('A= B1   +C;'));
		expect(treeText(t)).toBe('= (A, + (B1, C))');
		expect(countNodes([t])).toBe(5);
	});

	it('annotates types and the inserted int2fp', () => {
		const c = compile('A= B1   +C;', SLIDE_4_DECLS);
		const [t] = annotatedForest(c.semantic!.stmts);
		expect(treeText(t)).toBe(
			'= [float] (A [float], + [float] (int2fp [float] (B1 [int]), C [float const]))'
		);
		expect(t.children[1].children[0].tone).toBe('convert');
	});

	it('marks semantic errors in the annotated tree', () => {
		const c = compile('A = D;', SLIDE_4_DECLS);
		const [t] = annotatedForest(c.semantic!.stmts);
		expect(t.children[1]).toMatchObject({ label: 'D', tone: 'error', note: 'not declared' });
	});

	it('diagrams the if statement as on the structure slides (slide 9)', () => {
		const [t] = parseDiagram(program('if x==y then z  =1; else z= 2  ;'));
		expect(treeText(t)).toBe(
			'if-then-else (predicate (equal (x, ==, y)), then-stmt (assign (z, =, 1)), else-stmt (assign (z, =, 2)))'
		);
	});

	it('keeps parentheses as words next to the group they enclose', () => {
		const [t] = parseDiagram(program('A = (B1 + C) * 2;'));
		expect(treeText(t)).toBe('assign (A, =, times ((, plus (B1, +, C), ), *, 2))');
		const [u] = parseDiagram(program('if n > 0 then n = n - 1;'));
		expect(u.label).toBe('if-then');
	});
});

describe('layoutTree', () => {
	const overlaps = (a: { x: number; width: number }, b: { x: number; width: number }) =>
		Math.abs(a.x - b.x) < (a.width + b.width) / 2;

	it.each(PRESETS.filter((p) => !p.semanticError).map((p) => [p.id, p] as const))(
		'places the nodes of %s without overlaps',
		(_, p) => {
			const prog = compile(p.value.source, p.value.decls).parse!.program!;
			for (const [roots, opts] of [
				[astForest(prog), {}],
				[parseDiagram(prog), { orientation: 'up', alignLeaves: true }]
			] as const) {
				const layout = layoutTree(roots, opts);
				const rows = new Map<number, typeof layout.nodes>();
				for (const n of layout.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n]);
				for (const row of rows.values())
					for (let i = 0; i < row.length; i++)
						for (let j = i + 1; j < row.length; j++) expect(overlaps(row[i], row[j])).toBe(false);
				for (const n of layout.nodes) {
					expect(n.x - n.width / 2).toBeGreaterThanOrEqual(0);
					expect(n.x + n.width / 2).toBeLessThanOrEqual(layout.width);
					expect(n.y).toBeGreaterThan(0);
					expect(n.y).toBeLessThan(layout.height);
				}
			}
		}
	);

	it('puts the root on top or at the bottom', () => {
		const roots = astForest(program('A= B1   +C;'));
		const down = layoutTree(roots);
		const up = layoutTree(roots, { orientation: 'up' });
		const ys = (l: typeof down) => l.nodes.map((n) => n.y);
		expect(down.nodes[0].y).toBe(Math.min(...ys(down)));
		expect(up.nodes[0].y).toBe(Math.max(...ys(up)));
		expect(down.edges).toEqual([
			[0, 1],
			[0, 2],
			[2, 3],
			[2, 4]
		]);
	});

	it('aligns the words of a diagram in the top row', () => {
		const roots = parseDiagram(program('if x==y then z  =1; else z= 2  ;'));
		const layout = layoutTree(roots, { orientation: 'up', alignLeaves: true });
		const words = layout.nodes.filter((n) => n.node.children.length === 0);
		expect(new Set(words.map((n) => n.y)).size).toBe(1);
		expect(words[0].y).toBe(Math.min(...layout.nodes.map((n) => n.y)));
		expect(words.map((n) => n.node.label).join(' ')).toBe('x == y z = 1 z = 2');
		const xs = words.map((n) => n.x);
		expect([...xs].sort((a, b) => a - b)).toEqual(xs);
	});

	it('centers a parent over its children', () => {
		const layout = layoutTree(astForest(program('A= B1   +C;')));
		const plus = layout.nodes[2];
		expect(plus.x).toBeCloseTo((layout.nodes[3].x + layout.nodes[4].x) / 2);
	});

	it('lays out an empty forest', () => {
		expect(layoutTree([])).toMatchObject({ nodes: [], edges: [] });
	});
});
