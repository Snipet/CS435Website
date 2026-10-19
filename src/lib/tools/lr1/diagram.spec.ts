import { describe, expect, it } from 'vitest';
import { annotationText } from '$lib/components/grammar/lr-item';
import { layoutAutomaton } from '$lib/components/graph/layout';
import { lalr1Automaton, lr0Automaton, lr1Automaton } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	DRAW_ALL,
	MAX_RANGE,
	WINDOW,
	boxLines,
	circleColumns,
	circleDrawing,
	estimateBox,
	inRange,
	monoWidth,
	placeCircles,
	rangeWith,
	shownRange,
	stateNotes,
	windowAround
} from './diagram';

const g = parseGrammar('E → E + ( E ) | int').grammar!;
const a = lr1Automaton(g);

describe('ranges', () => {
	it('draws a small automaton whole, a large one a window at a time', () => {
		expect(shownRange(12, null)).toEqual([0, 11]);
		expect(shownRange(DRAW_ALL, null)).toEqual([0, DRAW_ALL - 1]);
		expect(shownRange(372, null)).toEqual([0, WINDOW - 1]);
		expect(shownRange(12, [3, 7])).toEqual([3, 7]);
		expect(shownRange(12, [9, 40])).toEqual([9, 11]);
		expect(shownRange(12, [50, 60])).toEqual([11, 11]);
		expect(shownRange(0, null)).toEqual([0, -1]);
	});

	it('shows at most MAX_RANGE states, whatever range is asked for', () => {
		expect(MAX_RANGE).toBeGreaterThanOrEqual(DRAW_ALL);
		expect(shownRange(372, [0, 10_000_000])).toEqual([0, MAX_RANGE - 1]);
		expect(shownRange(372, [0, 371])).toEqual([0, MAX_RANGE - 1]);
		expect(shownRange(372, [360, 10_000_000])).toEqual([360, 371]);
		expect(shownRange(372, [10_000_000, 10_000_000])).toEqual([371, 371]);
		expect(shownRange(30, [0, 29])).toEqual([0, 29]);
	});

	it('keeps the end of a range that was typed and moves the other', () => {
		expect(rangeWith([0, 15], 'last', 371)).toEqual([371 - MAX_RANGE + 1, 371]);
		expect(rangeWith([0, 15], 'last', 20)).toEqual([0, 20]);
		expect(rangeWith([10, 15], 'last', 4)).toEqual([4, 4]);
		expect(rangeWith([0, 15], 'first', 20)).toEqual([20, 20]);
		expect(rangeWith([0, 15], 'first', 3)).toEqual([3, 15]);
		expect(rangeWith([0, 100], 'first', 3)).toEqual([3, 3 + MAX_RANGE - 1]);
		expect(rangeWith([0, 15], 'first', -4)).toEqual([0, 15]);
	});

	it('finds the window of a state', () => {
		expect(windowAround(5, 372)).toEqual([0, 15]);
		expect(windowAround(16, 372)).toEqual([16, 31]);
		expect(windowAround(370, 372)).toEqual([368, 371]);
		expect(inRange([3, 7], 3)).toBe(true);
		expect(inRange([3, 7], 8)).toBe(false);
	});
});

describe('stateNotes', () => {
	it('labels LR(1) states with their reductions on the lookaheads, and accept on $', () => {
		const notes = stateNotes(a, 'lr1').map((n) => n.map(annotationText));
		expect(notes[1]).toEqual(['E → int on $, +']);
		expect(notes[2]).toEqual(['accept on $']);
		expect(notes[11]).toEqual(['E → E + (E) on ), +']);
		expect(notes[0]).toEqual([]);
	});

	it('labels LALR(1) states with the merged lookaheads', () => {
		const notes = stateNotes(lalr1Automaton(a), 'lalr1').map((n) => n.map(annotationText));
		expect(notes[1]).toEqual(['E → int on $, +, )']);
	});

	it('labels LR(0) states without lookaheads and SLR(1) states with Follow', () => {
		const lr0 = lr0Automaton(g);
		const plain = stateNotes(lr0, 'lr0').map((n) => n.map(annotationText));
		expect(plain[1]).toEqual(['E → int']);
		expect(plain[2]).toEqual(['accept']);
		const slr = stateNotes(lr0, 'slr1').map((n) => n.map(annotationText));
		expect(slr[1]).toEqual(['E → int on $, +, )']);
		expect(slr[2]).toEqual(['accept on $']);
	});
});

describe('estimateBox', () => {
	it('sizes a box from its longest item and its notes', () => {
		const one = estimateBox(boxLines(a, 1, 'abbreviated'), ['E → int on $, +']);
		const four = estimateBox(boxLines(a, 4, 'abbreviated'), []);
		expect(four.height).toBeGreaterThan(one.height);
		expect(four.width).toBeGreaterThan(one.width);
		expect(one.note).toEqual({ width: monoWidth(15), height: 21 });
		expect(four.note).toBeNull();
		expect(estimateBox(boxLines(a, 4, 'full'), []).height).toBeGreaterThan(four.height);
	});
});

describe('circleDrawing', () => {
	const notes = stateNotes(a, 'lr1');

	it('draws slide 17: numbered plain circles, the start arrow into 0, symbol labels, notes', () => {
		const d = circleDrawing(a, notes, [0, 11]);
		expect(d.automaton.states.map((s) => s.name)).toEqual(
			Array.from({ length: 12 }, (_, i) => String(i))
		);
		expect(d.automaton.states.every((s) => !s.accepting)).toBe(true);
		expect(d.automaton.start).toBe(0);
		expect(d.automaton.states[2].note).toBe('accept on $');
		expect(d.automaton.states[7].note).toBe('E → E + (E) on $, +');
		expect(
			d.automaton.transitions.map((t) => `${d.states[t.from]} ${t.display} ${d.states[t.to]}`)
		).toEqual(a.edges.map((e) => `${e.from} ${e.symbol} ${e.to}`));
		// One label per symbol, kept apart.
		const keys = new Map<string, string>();
		for (const t of d.automaton.transitions) keys.set(t.display!, t.label!.key());
		expect(new Set(keys.values()).size).toBe(keys.size);
		const layout = layoutAutomaton(d.automaton);
		expect(layout.start).not.toBeNull();
	});

	it('draws a window without the edges that leave it, and no start arrow without state 0', () => {
		const d = circleDrawing(a, notes, [3, 7]);
		expect(d.states).toEqual([3, 4, 5, 6, 7]);
		expect(d.edges.map((k) => a.edges[k]).map((e) => `${e.from} ${e.symbol} ${e.to}`)).toEqual([
			'3 ( 4',
			'4 int 5',
			'4 E 6',
			'6 ) 7'
		]);
		expect(d.automaton.start).toBe(-1);
		expect(layoutAutomaton(d.automaton).start).toBeNull();
	});

	it('draws the states and edges made so far', () => {
		const d = circleDrawing(a, notes, [0, 11], { states: 4, edges: 3 });
		expect(d.states).toEqual([0, 1, 2, 3]);
		expect(d.edges).toEqual([0, 1, 2]);
	});
});

describe('placeCircles', () => {
	const notes = stateNotes(a, 'lr1');
	const deck = circleDrawing(a, notes, [0, 11]);
	const lr = (rows: number[][], states: readonly number[]) =>
		rows.map((r) => r.map((k) => states[k]));

	it('places the 12 states of slide 17 in rows, each going on with the state it leads to', () => {
		expect(lr(placeCircles(deck.automaton, 4).rows, deck.states)).toEqual([
			[0, 1],
			[2, 3, 4, 5],
			[6, 7],
			[8, 9, 10, 11]
		]);
		// A longer chain goes on in the next row.
		expect(lr(placeCircles(deck.automaton, 2).rows, deck.states)).toEqual([
			[0, 1],
			[2, 3],
			[4, 5],
			[6, 7],
			[8, 9],
			[10, 11]
		]);
	});

	it('starts a row where its edges from the rows above are short and clear', () => {
		const { positions } = placeCircles(deck.automaton, 6);
		const x = (s: number) => positions.get(deck.states.indexOf(s))!.x;
		const y = (s: number) => positions.get(deck.states.indexOf(s))!.y;
		// 4 →E 6 goes straight down; the row of 8 starts under 3, so 9 →int 5 passes
		// between 6 and 7 rather than through 7.
		expect(x(6)).toBe(x(4));
		expect(x(8)).toBe(x(3));
		expect(x(9)).toBe(x(4));
		expect(x(7)).toBe(x(5));
		expect([y(0), y(2), y(6), y(8)]).toEqual([...[y(0), y(2), y(6), y(8)]].sort((p, q) => p - q));
		expect(new Set([y(0), y(2), y(6), y(8)]).size).toBe(4);
	});

	it('ends a row with each state that has no edges out (its label goes on its right)', () => {
		const hasOut = new Set(deck.automaton.transitions.map((t) => t.from));
		for (const k of [2, 3, 4, 6])
			for (const row of placeCircles(deck.automaton, k).rows)
				for (const id of row.slice(0, -1)) expect(hasOut.has(id), `state ${id}`).toBe(true);
	});

	it('draws a two-dimensional picture whose states and labels keep apart', () => {
		const placement = placeCircles(deck.automaton, circleColumns(deck.automaton, 1100));
		const layout = layoutAutomaton(deck.automaton, { positions: placement.positions });
		// Not a strip: slide 17 is about as tall as it is wide.
		expect(layout.bounds.width).toBeLessThan(1100);
		expect(layout.bounds.width / layout.bounds.height).toBeLessThan(2.5);
		const circles = [...layout.nodes.values()];
		for (let i = 0; i < circles.length; i++)
			for (let j = i + 1; j < circles.length; j++)
				expect(
					Math.hypot(circles[i].x - circles[j].x, circles[i].y - circles[j].y),
					`states ${i} and ${j}`
				).toBeGreaterThan(80);
		const noteBoxes = circles.flatMap((n) => (n.note ? [n.note.box] : []));
		expect(noteBoxes).toHaveLength(5);
		for (const b of noteBoxes)
			for (const n of circles) {
				const over =
					n.x + n.outerRx > b.x &&
					n.x - n.outerRx < b.x + b.width &&
					n.y + n.outerRy > b.y &&
					n.y - n.outerRy < b.y + b.height;
				expect(over, `a note over state ${n.id}`).toBe(false);
			}
	});

	it('puts as many states in a row as the width allows, from 2 to 6', () => {
		const wide = circleColumns(deck.automaton, 1100);
		expect(wide).toBeGreaterThanOrEqual(4);
		expect(placeCircles(deck.automaton, wide).width).toBeLessThanOrEqual(1100);
		expect(circleColumns(deck.automaton, 200)).toBe(2);
		expect(circleColumns(deck.automaton, 0)).toBe(4);
		// A window of states keeps the edges it holds.
		const window = circleDrawing(a, notes, [3, 7]);
		expect(lr(placeCircles(window.automaton, 4).rows, window.states)).toEqual([
			[3, 4, 5],
			[6, 7]
		]);
	});
});
