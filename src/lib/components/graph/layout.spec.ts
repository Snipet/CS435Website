import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import type { Automaton, Positions } from '$lib/theory/automata/types';
import {
	edgeKey,
	edgeLabel,
	labelBox,
	layoutAutomaton,
	mergeTransitions,
	nodeAt,
	stateShape,
	type AutomatonLayout
} from './layout';
import {
	dfaEndsIn00,
	mixedNfa,
	relopDfa,
	subsetDfa,
	thompsonNfa,
	thompsonPositions
} from './fixtures';

const fixtures: [string, Automaton, Positions | undefined][] = [
	['(0|1)*00 DFA', dfaEndsIn00, undefined],
	['Thompson NFA, auto', thompsonNfa, undefined],
	['Thompson NFA, pinned', thompsonNfa, thompsonPositions],
	['subset DFA', subsetDfa, undefined],
	['relop DFA', relopDfa, undefined],
	['mixed NFA', mixedNfa, undefined],
	[
		'(0|1)*00 DFA in a row',
		dfaEndsIn00,
		new Map([
			[0, { x: 0, y: 0 }],
			[1, { x: 110, y: 0 }],
			[2, { x: 220, y: 0 }]
		])
	]
];

function numbersIn(value: unknown, out: number[] = []): number[] {
	if (typeof value === 'number') out.push(value);
	else if (typeof value === 'string') {
		for (const m of value.matchAll(/-?\d+(\.\d+)?(e-?\d+)?|NaN|Infinity/g))
			out.push(m[0] === 'NaN' ? NaN : Number(m[0]));
	} else if (value instanceof Map) for (const v of value.values()) numbersIn(v, out);
	else if (Array.isArray(value)) for (const v of value) numbersIn(v, out);
	else if (value && typeof value === 'object')
		for (const v of Object.values(value)) numbersIn(v, out);
	return out;
}

function inside(l: AutomatonLayout, x: number, y: number) {
	const b = l.bounds;
	return (
		x >= b.x - 0.01 && x <= b.x + b.width + 0.01 && y >= b.y - 0.01 && y <= b.y + b.height + 0.01
	);
}

const edge = (l: AutomatonLayout, from: number, to: number, eps = false) =>
	l.edges.find((e) => e.key === edgeKey(from, to, eps))!;

const minY = (pts: { y: number }[]) => Math.min(...pts.map((p) => p.y));
const maxY = (pts: { y: number }[]) => Math.max(...pts.map((p) => p.y));

describe('mergeTransitions', () => {
	it('merges parallel symbol transitions and keeps ε separate', () => {
		const merged = mergeTransitions(mixedNfa);
		const st = merged.filter((e) => e.from === 0 && e.to === 1);
		expect(st.map((e) => e.label)).toEqual(['0,1', 'ε']);
		expect(st[0].transitions.map((t) => t.id)).toEqual([0, 1]);
		expect(st[1].epsilon).toBe(true);
		expect(merged).toHaveLength(6);
	});

	it('joins display overrides and formats the rest', () => {
		const ts = [
			{ id: 0, from: 0, to: 1, label: CharSet.of('ab') },
			{ id: 1, from: 0, to: 1, label: CharSet.of('xyz'), display: 'other' }
		];
		expect(edgeLabel(ts)).toBe('a,b,other');
		expect(edgeLabel([{ id: 0, from: 0, to: 1, label: CharSet.range('0', '9') }])).toBe('0–9');
		const digit = { name: 'digit', set: CharSet.range('0', '9') };
		expect(edgeLabel([{ id: 0, from: 0, to: 1, label: CharSet.range('0', '9') }], [digit])).toBe(
			'digit'
		);
	});

	it('skips transitions to missing states', () => {
		const a: Automaton = {
			states: [{ id: 0, name: 'A', accepting: false }],
			transitions: [{ id: 0, from: 0, to: 3, label: CharSet.of('a') }],
			start: 0
		};
		expect(mergeTransitions(a)).toEqual([]);
		expect(layoutAutomaton(a).edges).toEqual([]);
	});
});

describe('stateShape', () => {
	it('uses circles for short names and ellipses sized to longer names', () => {
		expect(stateShape('A').shape).toBe('circle');
		expect(stateShape('').shape).toBe('circle');
		expect(stateShape('ABC')).toEqual({ rx: 22, ry: 22, shape: 'circle' });
		const long = stateShape('FGABCDHI');
		const longer = stateShape('EJGABCDHI');
		expect(long.shape).toBe('ellipse');
		expect(long.rx).toBeGreaterThan(40);
		expect(longer.rx).toBeGreaterThan(long.rx);
	});
});

describe('layoutAutomaton', () => {
	for (const [name, a, positions] of fixtures) {
		describe(name, () => {
			const l = layoutAutomaton(a, { positions, startLabel: 'start' });

			it('produces finite numbers everywhere', () => {
				const nums = numbersIn({ ...l, nodes: [...l.nodes.values()] });
				expect(nums.length).toBeGreaterThan(10);
				expect(nums.every(Number.isFinite)).toBe(true);
			});

			it('has bounds that contain every node, edge, label, and the start arrow', () => {
				for (const n of l.nodes.values()) {
					expect(inside(l, n.x - n.outerRx, n.y - n.outerRy)).toBe(true);
					expect(inside(l, n.x + n.outerRx, n.y + n.outerRy)).toBe(true);
					if (n.note) {
						expect(inside(l, n.note.box.x, n.note.box.y)).toBe(true);
						expect(inside(l, n.note.box.x + n.note.box.width, n.note.box.y)).toBe(true);
					}
				}
				for (const e of l.edges) {
					for (const p of e.points) expect(inside(l, p.x, p.y)).toBe(true);
					const b = labelBox(e);
					expect(inside(l, b.x, b.y) && inside(l, b.x + b.width, b.y + b.height)).toBe(true);
					expect(inside(l, e.arrowTip.x, e.arrowTip.y)).toBe(true);
				}
				expect(l.start).not.toBeNull();
				expect(inside(l, l.start!.tail.x, l.start!.tail.y)).toBe(true);
			});

			it('draws one edge per (from, to, ε) with arrows ending on the target outline', () => {
				expect(l.edges).toHaveLength(mergeTransitions(a).length);
				for (const e of l.edges) {
					const n = l.nodes.get(e.to)!;
					const level =
						((e.arrowTip.x - n.x) / n.outerRx) ** 2 + ((e.arrowTip.y - n.y) / n.outerRy) ** 2;
					expect(level).toBeGreaterThan(0.9);
					expect(level).toBeLessThan(1.1);
					expect(e.path.startsWith('M')).toBe(true);
				}
			});

			it('keeps labels off the states', () => {
				for (const e of l.edges) {
					const b = labelBox(e);
					for (const n of l.nodes.values()) {
						const cx = Math.min(Math.max(n.x, b.x), b.x + b.width);
						const cy = Math.min(Math.max(n.y, b.y), b.y + b.height);
						const level = ((cx - n.x) / n.outerRx) ** 2 + ((cy - n.y) / n.outerRy) ** 2;
						expect(level).toBeGreaterThanOrEqual(1);
					}
				}
			});

			if (!positions) {
				it('puts the start state in the first column', () => {
					const s = l.nodes.get(a.start)!;
					for (const n of l.nodes.values()) expect(n.x).toBeGreaterThanOrEqual(s.x - 0.5);
				});
			}
		});
	}

	it('draws self-loops above the state with the label above the loop', () => {
		const l = layoutAutomaton(dfaEndsIn00);
		const loop = edge(l, 0, 0);
		const n = l.nodes.get(0)!;
		expect(loop.selfLoop).toBe(true);
		expect(maxY(loop.points)).toBeLessThan(n.y);
		expect(loop.labelPos.y).toBeLessThan(minY(loop.points));
		expect(Math.abs(loop.labelPos.x - n.x)).toBeLessThan(1);
	});

	it('puts a second (ε) self-loop below the state', () => {
		const l = layoutAutomaton(mixedNfa);
		const n = l.nodes.get(1)!;
		expect(maxY(edge(l, 1, 1).points)).toBeLessThan(n.y);
		expect(minY(edge(l, 1, 1, true).points)).toBeGreaterThan(n.y);
	});

	it('merges into labels as on the slides', () => {
		const l = layoutAutomaton(relopDfa);
		expect(edge(l, 1, 4).label).toBe('other');
		expect(edge(l, 0, 1).label).toBe('<');
		expect(l.nodes.get(4)!.retract).toBeDefined();
		// Sinks carry their note to the right.
		const n2 = l.nodes.get(2)!;
		expect(n2.note?.anchor).toBe('start');
		expect(n2.note!.x).toBeGreaterThan(n2.x + n2.outerRx);
	});

	it('uses the pinned positions as given', () => {
		const l = layoutAutomaton(thompsonNfa, { positions: thompsonPositions });
		expect(l.pinned).toBe(true);
		for (const [id, p] of thompsonPositions) {
			expect(l.nodes.get(id)!.x).toBe(p.x);
			expect(l.nodes.get(id)!.y).toBe(p.y);
		}
	});

	it('routes the Thompson back edge G → A over the top and A → H underneath', () => {
		const l = layoutAutomaton(thompsonNfa, { positions: thompsonPositions });
		const back = edge(l, 6, 0, true);
		const skip = edge(l, 0, 7, true);
		// Clear of C/E (row −0.5) and D/F (row +0.5) with their radius.
		expect(minY(back.points)).toBeLessThan(-42 - 22 - 8);
		expect(maxY(back.points)).toBeLessThanOrEqual(1);
		expect(back.labelPos.y).toBeLessThan(minY(back.points));
		expect(maxY(skip.points)).toBeGreaterThan(42 + 22 + 8);
		expect(minY(skip.points)).toBeGreaterThanOrEqual(-1);
		expect(skip.labelPos.y).toBeGreaterThan(maxY(skip.points));
	});

	it('draws unobstructed pinned edges straight', () => {
		const l = layoutAutomaton(thompsonNfa, { positions: thompsonPositions });
		for (const [from, to] of [
			[0, 1],
			[7, 8],
			[8, 9]
		]) {
			const e = l.edges.find((x) => x.from === from && x.to === to)!;
			for (const p of e.points) expect(Math.abs(p.y)).toBeLessThan(0.01);
		}
		const bc = edge(l, 1, 2, true);
		// B → C runs diagonally from (96, 0) toward (192, −42).
		for (const p of bc.points) expect(Math.abs(p.y - (-42 * (p.x - 96)) / 96)).toBeLessThan(0.5);
	});

	it('bows opposite edges to opposite sides and sends a blocked back edge around loops', () => {
		const row = fixtures[6][2]!;
		const l = layoutAutomaton(dfaEndsIn00, { positions: row });
		const ab = edge(l, 0, 1);
		const ba = edge(l, 1, 0);
		expect(minY(ab.points)).toBeLessThan(-3);
		expect(maxY(ab.points)).toBeLessThan(1);
		expect(maxY(ba.points)).toBeGreaterThan(3);
		// C → A passes B; A and C carry loops on top, so it arcs underneath and below B → A.
		const ca = edge(l, 2, 0);
		expect(maxY(ca.points)).toBeGreaterThan(maxY(ba.points) + 5);
		expect(minY(ca.points)).toBeGreaterThan(-1);
	});

	it('handles empty machines and missing positions', () => {
		const empty: Automaton = { states: [], transitions: [], start: 0 };
		const l = layoutAutomaton(empty);
		expect(l.nodes.size).toBe(0);
		expect(l.start).toBeNull();
		expect(Number.isFinite(l.bounds.width)).toBe(true);
		const partial = layoutAutomaton(dfaEndsIn00, { positions: new Map([[0, { x: 10, y: 10 }]]) });
		expect(partial.nodes.get(0)).toMatchObject({ x: 10, y: 10 });
		expect(partial.nodes.get(1)!.y).toBeGreaterThan(10);
		const same = layoutAutomaton(dfaEndsIn00, {
			positions: new Map([
				[0, { x: 0, y: 0 }],
				[1, { x: 0, y: 0 }],
				[2, { x: 0, y: 0 }]
			])
		});
		expect(numbersIn(same.edges).every(Number.isFinite)).toBe(true);
	});

	it('finds the state under a point', () => {
		const l = layoutAutomaton(thompsonNfa, { positions: thompsonPositions });
		expect(nodeAt(l, { x: 96, y: 3 })).toBe(1);
		expect(nodeAt(l, { x: 192, y: -42 + 20 })).toBe(2);
		expect(nodeAt(l, { x: 48, y: 60 })).toBeNull();
	});
});
