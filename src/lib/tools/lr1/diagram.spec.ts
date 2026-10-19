import { describe, expect, it } from 'vitest';
import { annotationText } from '$lib/components/grammar/lr-item';
import { layoutAutomaton } from '$lib/components/graph/layout';
import { lalr1Automaton, lr0Automaton, lr1Automaton } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	DRAW_ALL,
	WINDOW,
	boxLines,
	circleDrawing,
	estimateBox,
	inRange,
	monoWidth,
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
