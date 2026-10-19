import { describe, expect, it } from 'vitest';
import { annotationText } from '$lib/components/grammar/lr-item';
import { boxesOverlap, segmentHitsBox, type Box } from '$lib/components/graph/geometry';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import { lr1Automaton, type LrAutomaton } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	layoutBoxes,
	type BoxEdgeInput,
	type BoxLayout,
	type BoxNodeInput,
	type Point
} from './box-layout';
import { MAX_RANGE, boxLines, estimateBox, monoWidth, shownRange, stateNotes } from './diagram';

/** The layout's input for states first…last of an automaton, with estimated sizes. */
function input(a: LrAutomaton, first = 0, last = a.states.length - 1) {
	const notes = stateNotes(a, 'lr1');
	const ids = a.states.map((s) => s.id).filter((s) => s >= first && s <= last);
	const nodes: BoxNodeInput[] = ids.map((s) => {
		const est = estimateBox(boxLines(a, s, 'abbreviated'), notes[s].map(annotationText));
		return { id: s, ...est, attach: est.width - 39 };
	});
	const edges: BoxEdgeInput[] = a.edges
		.filter((e) => ids.includes(e.from) && ids.includes(e.to))
		.map((e) => ({
			from: e.from,
			to: e.to,
			label: e.symbol,
			labelWidth: monoWidth(e.symbol.length) + 6
		}));
	return { nodes, edges, start: ids.includes(0) ? 0 : null };
}

const onBoundary = (p: Point, b: Box) => {
	const inX = p.x >= b.x - 0.5 && p.x <= b.x + b.width + 0.5;
	const inY = p.y >= b.y - 0.5 && p.y <= b.y + b.height + 0.5;
	const onX = Math.abs(p.x - b.x) < 0.5 || Math.abs(p.x - b.x - b.width) < 0.5;
	const onY = Math.abs(p.y - b.y) < 0.5 || Math.abs(p.y - b.y - b.height) < 0.5;
	return (inX && onY) || (inY && onX);
};

const strictlyInside = (p: Point, b: Box) =>
	p.x > b.x + 0.5 && p.x < b.x + b.width - 0.5 && p.y > b.y + 0.5 && p.y < b.y + b.height - 0.5;

/** The points of an SVG path made of M and L commands. */
const pathPoints = (d: string): Point[] =>
	[...d.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

const shrink = (b: Box, by: number): Box => ({
	x: b.x + by,
	y: b.y + by,
	width: Math.max(0, b.width - 2 * by),
	height: Math.max(0, b.height - 2 * by)
});

/** Every property the drawing relies on. */
function check(layout: BoxLayout, nodes: readonly BoxNodeInput[], edges: readonly BoxEdgeInput[]) {
	const byId = new Map(layout.nodes.map((n) => [n.id, n]));
	expect(layout.nodes.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
	// Sizes are kept.
	for (const n of nodes) {
		const p = byId.get(n.id)!;
		expect(p.frame.width).toBe(n.width);
		expect(p.frame.height).toBe(n.height);
		if (n.note) expect([p.note!.width, p.note!.height]).toEqual([n.note.width, n.note.height]);
	}
	// No two nodes overlap (frames, notes, loops and start arrows included).
	for (let i = 0; i < layout.nodes.length; i++)
		for (let j = i + 1; j < layout.nodes.length; j++)
			expect(
				boxesOverlap(layout.nodes[i].bounds, layout.nodes[j].bounds),
				`states ${layout.nodes[i].id} and ${layout.nodes[j].id}`
			).toBe(false);
	const solid: Box[] = layout.nodes.flatMap((n) => [n.frame, ...(n.note ? [n.note] : [])]);
	for (const e of layout.edges) {
		const from = byId.get(e.from)!;
		const to = byId.get(e.to)!;
		// Edges run from frame to frame…
		expect(onBoundary(e.points[0], from.frame), `edge ${e.from}→${e.to} leaves its state`).toBe(
			true
		);
		expect(
			onBoundary(e.points[e.points.length - 1], to.frame),
			`edge ${e.from}→${e.to} ends at its state`
		).toBe(true);
		// The arrowhead's tip is on the frame and the rest of it outside, where it shows (the
		// frames are drawn over the edges).
		if (e.kind !== 'loop') {
			const [tip, ...rest] = pathPoints(e.arrow);
			expect(onBoundary(tip, to.frame), `the head of ${e.from}→${e.to} touches its state`).toBe(
				true
			);
			for (const q of rest)
				expect(
					strictlyInside(q, to.frame),
					`the head of ${e.from}→${e.to} is inside state ${e.to}`
				).toBe(false);
		}
		// …through no other box.
		for (const n of layout.nodes) {
			const boxes = [n.frame, ...(n.note ? [n.note] : [])];
			for (const b of boxes) {
				const own = n.id === e.from || n.id === e.to;
				if (own && b === n.frame) continue;
				for (let k = 0; k + 1 < e.points.length; k++)
					expect(
						segmentHitsBox(e.points[k], e.points[k + 1], shrink(b, 1)),
						`edge ${e.from}→${e.to} crosses state ${n.id}`
					).toBe(false);
			}
		}
		// Labels touch no box and no other label.
		for (const b of solid)
			expect(boxesOverlap(e.labelBox, b), `label of ${e.from}→${e.to}`).toBe(false);
		for (const f of layout.edges)
			if (f !== e)
				expect(
					boxesOverlap(e.labelBox, f.labelBox),
					`labels of ${e.from}→${e.to} and ${f.from}→${f.to}`
				).toBe(false);
		// Everything is inside the drawing.
		for (const p of e.points) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(layout.width);
			expect(p.y).toBeLessThanOrEqual(layout.height);
		}
		expect(e.labelBox.x).toBeGreaterThanOrEqual(0);
		expect(e.labelBox.x + e.labelBox.width).toBeLessThanOrEqual(layout.width);
		expect(e.labelBox.y + e.labelBox.height).toBeLessThanOrEqual(layout.height);
		expect(e.d.startsWith('M')).toBe(true);
		expect(e.arrow.endsWith('Z')).toBe(true);
	}
	for (const n of layout.nodes) {
		expect(n.bounds.x).toBeGreaterThanOrEqual(0);
		expect(n.bounds.y).toBeGreaterThanOrEqual(0);
		expect(n.bounds.x + n.bounds.width).toBeLessThanOrEqual(layout.width);
		expect(n.bounds.y + n.bounds.height).toBeLessThanOrEqual(layout.height);
	}
	expect(layout.edges).toHaveLength(edges.filter((e) => byId.has(e.from) && byId.has(e.to)).length);
}

/** A small deterministic generator (mulberry32). */
function random(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('layoutBoxes', () => {
	const deck = lr1Automaton(parseGrammar('E → E + ( E ) | int').grammar!);

	it('lays out the 12 states of the decks in layers from the start state', () => {
		const { nodes, edges, start } = input(deck);
		const layout = layoutBoxes(nodes, edges, { start });
		check(layout, nodes, edges);
		const layer = new Map(layout.nodes.map((n) => [n.id, n.layer]));
		// Each state one layer below the state that made it (breadth first).
		expect([...layer.values()]).toEqual([0, 1, 1, 2, 3, 4, 4, 5, 5, 6, 7, 8]);
		const top = (s: number) => layout.nodes[s].frame.y;
		expect(top(0)).toBeLessThan(top(2));
		expect(top(2)).toBeLessThan(top(3));
		// 9 →int 5 and 10 →+ 8 go back up.
		expect(layout.edges.filter((e) => e.kind === 'up').map((e) => [e.from, e.to])).toEqual([
			[9, 5],
			[10, 8]
		]);
		expect(layout.start).not.toBeNull();
		// The same input gives the same drawing.
		expect(layoutBoxes(nodes, edges, { start })).toEqual(layout);
	});

	it('ends edges into the bottom of a box at its border (E → E + E | E * E | int)', () => {
		const a = lr1Automaton(parseGrammar('E → E + E | E * E | int').grammar!);
		const { nodes, edges, start } = input(a);
		const layout = layoutBoxes(nodes, edges, { start });
		check(layout, nodes, edges);
		// 3 →int 1 and 4 →int 1 go back up into the one-line box of 1, and 5 →+ 3, 5 →* 4,
		// 6 →+ 3 and 6 →* 4 into the bottom of the four-line boxes of 3 and 4.
		const up = layout.edges.filter((e) => e.kind === 'up');
		expect(up.map((e) => `${e.from}→${e.to}`).sort()).toEqual([
			'3→1',
			'4→1',
			'5→3',
			'5→4',
			'6→3',
			'6→4'
		]);
		for (const e of up) {
			const frame = layout.nodes.find((n) => n.id === e.to)!.frame;
			expect(e.points.at(-1)!.y).toBeCloseTo(frame.y + frame.height, 5);
		}
	});

	it('draws a loop on the left of a state and an edge within a layer under it', () => {
		const nodes: BoxNodeInput[] = [
			{ id: 0, width: 160, height: 60, note: null },
			{ id: 1, width: 120, height: 40, note: { width: 110, height: 21 } },
			{ id: 2, width: 140, height: 40 }
		];
		const edges: BoxEdgeInput[] = [
			{ from: 0, to: 1, label: 'a', labelWidth: 14 },
			{ from: 0, to: 2, label: 'b', labelWidth: 14 },
			{ from: 1, to: 1, label: 'a', labelWidth: 14 },
			{ from: 1, to: 2, label: 'c', labelWidth: 14 },
			{ from: 2, to: 0, label: 'X', labelWidth: 14 }
		];
		const layout = layoutBoxes(nodes, edges, { start: 0 });
		check(layout, nodes, edges);
		expect(layout.edges.map((e) => e.kind)).toEqual(['down', 'down', 'loop', 'side', 'up']);
		const loop = layout.edges[2];
		const frame = layout.nodes[1].frame;
		expect(Math.min(...loop.points.map((p) => p.x))).toBeLessThan(frame.x);
		expect(loop.labelBox.x + loop.labelBox.width).toBeLessThan(frame.x);
		const side = layout.edges[3];
		expect(Math.max(...side.points.map((p) => p.y))).toBeGreaterThan(frame.y + frame.height);
	});

	it('keeps to the edges of the item box (not the number beside it)', () => {
		const nodes: BoxNodeInput[] = [
			{ id: 0, width: 200, height: 60, attach: 160 },
			{ id: 1, width: 200, height: 40, attach: 160 }
		];
		const layout = layoutBoxes(nodes, [{ from: 0, to: 1, label: 'x', labelWidth: 14 }], {});
		const [p, q] = [layout.edges[0].points[0], layout.edges[0].points.at(-1)!];
		expect(p.x).toBeLessThanOrEqual(layout.nodes[0].frame.x + 160);
		expect(q.x).toBeLessThanOrEqual(layout.nodes[1].frame.x + 160);
	});

	it('fills a layer up to the width it is given, then goes on below', () => {
		const nodes: BoxNodeInput[] = Array.from({ length: 9 }, (_, i) => ({
			id: i,
			width: 300,
			height: 40
		}));
		const edges: BoxEdgeInput[] = nodes
			.slice(1)
			.map((n) => ({ from: 0, to: n.id, label: `t${n.id}`, labelWidth: 26 }));
		const layout = layoutBoxes(nodes, edges, { start: 0, maxWidth: 700 });
		check(layout, nodes, edges);
		const perLayer = new Map<number, number>();
		for (const n of layout.nodes) perLayer.set(n.layer, (perLayer.get(n.layer) ?? 0) + 1);
		expect(Math.max(...perLayer.values())).toBeLessThanOrEqual(2);
		// Far narrower than one layer of eight (2700): the edges that pass a layer take some room too.
		expect(layout.width).toBeLessThan(1700);
	});

	it('leaves out edges to states it is not given, and handles no states', () => {
		const nodes: BoxNodeInput[] = [{ id: 3, width: 100, height: 40 }];
		const layout = layoutBoxes(nodes, [{ from: 3, to: 4, label: 'x', labelWidth: 14 }], {
			start: 0
		});
		expect(layout.edges).toEqual([]);
		expect(layout.start).toBeNull();
		expect(layoutBoxes([], [], {})).toMatchObject({ nodes: [], edges: [], start: null });
	});

	const cminus = lr1Automaton(parseGrammar(CMINUS_BNF).grammar!, { trace: false });

	it.each([0, 16, 32, 100, 200, 300, 356])(
		'lays out C- states %i–%i+15 in a fraction of a second',
		(first) => {
			const { nodes, edges, start } = input(cminus, first, first + 15);
			const t0 = performance.now();
			const layout = layoutBoxes(nodes, edges, { start });
			expect(performance.now() - t0).toBeLessThan(400);
			check(layout, nodes, edges);
		}
	);

	it.each([0, MAX_RANGE, 340])(
		'lays out MAX_RANGE C- states from %i, the most the page draws, in a fraction of a second',
		(first) => {
			const [from, to] = shownRange(cminus.states.length, [first, first + 10_000]);
			expect(to - from + 1).toBeLessThanOrEqual(MAX_RANGE);
			const { nodes, edges, start } = input(cminus, from, to);
			const t0 = performance.now();
			const layout = layoutBoxes(nodes, edges, { start });
			expect(performance.now() - t0).toBeLessThan(1000);
			check(layout, nodes, edges);
		}
	);

	it.each(Array.from({ length: 40 }, (_, i) => i))('lays out random automaton %i', (seed) => {
		const rnd = random(seed + 1);
		const n = 2 + Math.floor(rnd() * 13);
		const nodes: BoxNodeInput[] = Array.from({ length: n }, (_, i) => ({
			id: i * 3,
			width: Math.round(60 + rnd() * 340),
			height: Math.round(30 + rnd() * 90),
			note: rnd() < 0.4 ? { width: Math.round(40 + rnd() * 160), height: 21 } : null,
			attach: undefined
		}));
		const edges: BoxEdgeInput[] = [];
		const seen = new Set<string>();
		const m = Math.floor(rnd() * n * 2.2);
		// A spanning set first, so most states are reached from the first.
		for (let i = 1; i < n; i++) {
			const from = Math.floor(rnd() * i);
			seen.add(`${from} ${i}`);
			edges.push({ from: nodes[from].id, to: nodes[i].id, label: `s${i}`, labelWidth: 20 });
		}
		for (let k = 0; k < m; k++) {
			const from = Math.floor(rnd() * n);
			const to = Math.floor(rnd() * n);
			if (seen.has(`${from} ${to}`)) continue;
			seen.add(`${from} ${to}`);
			const label = 'xyzw'.slice(0, 1 + Math.floor(rnd() * 4));
			edges.push({
				from: nodes[from].id,
				to: nodes[to].id,
				label,
				labelWidth: 9 * label.length + 6
			});
		}
		const layout = layoutBoxes(nodes, edges, { start: rnd() < 0.8 ? 0 : null });
		check(layout, nodes, edges);
	});
});
