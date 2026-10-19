import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAX_STATES,
	ITEM_DOT,
	augment,
	lalr1Automaton,
	lr0Automaton,
	lr1Automaton,
	lrClosure,
	lrTransition,
	mergeItems,
	printItem,
	printProduction,
	reduceLabel,
	type Augmented,
	type LrAutomaton,
	type LrItem
} from './lr';
import {
	BOTTOM_UP,
	BOTTOM_UP_REVERSED,
	DANGLING_ELSE_S,
	ID_SEQUENCE,
	LEFT_FACTORED,
	grammar
} from './test-helpers';

const deck14 = grammar(BOTTOM_UP);
const deck15 = grammar(BOTTOM_UP_REVERSED);

const show = (aug: Augmented, items: readonly LrItem[]): string[] =>
	items.map((i) => printItem(aug, i));
const merged = (aug: Augmented, items: readonly LrItem[]): string[] =>
	mergeItems(items).map((m) => printItem(aug, m));
const edges = (a: LrAutomaton): string[] => a.edges.map((e) => `${e.from}-${e.symbol}→${e.to}`);
const labels = (a: LrAutomaton): string[] =>
	a.states.map((s) =>
		[
			`${s.id}:`,
			...s.reduces.map((r) => reduceLabel(a.augmented, r)),
			...(s.accept ? ['accept on $'] : [])
		].join(' ')
	);

/** Bottom-up Parsing II, slide 17. */
const SLIDE_EDGES = [
	'0-int→1',
	'0-E→2',
	'2-+→3',
	'3-(→4',
	'4-int→5',
	'4-E→6',
	'6-)→7',
	'6-+→8',
	'8-(→9',
	'9-int→5',
	'9-E→10',
	'10-)→11',
	'10-+→8'
];
const SLIDE_LABELS = [
	'0:',
	'1: E → int on $, +',
	'2: accept on $',
	'3:',
	'4:',
	'5: E → int on ), +',
	'6:',
	'7: E → E + ( E ) on $, +',
	'8:',
	'9:',
	'10:',
	'11: E → E + ( E ) on ), +'
];

describe('augment', () => {
	it('adds S → E with a new start symbol (Bottom-up Parsing III, slide 7)', () => {
		const aug = augment(deck14);
		expect(aug.start).toBe('S');
		expect(aug.production).toEqual({ id: 2, lhs: 'S', rhs: ['E'] });
		expect(aug.productions.map(printProduction)).toEqual(['E → E + ( E )', 'E → int', 'S → E']);
		expect(aug.grammar).toBe(deck14);
	});

	it('primes the new symbol until it is unused (slide 25: S’)', () => {
		expect(augment(grammar(ID_SEQUENCE)).start).toBe('S’');
		expect(augment(grammar('S → S’ a\nS’ → b')).start).toBe('S’’');
		expect(augment(grammar('A → S')).start).toBe('S’');
	});
});

describe('printItem and mergeItems', () => {
	const aug = augment(deck14);

	it('writes items as the slides do', () => {
		expect(ITEM_DOT).toBe('•');
		expect(printItem(aug, { production: 2, dot: 0, lookahead: '$' })).toBe('S → •E, $');
		expect(printItem(aug, { production: 0, dot: 3, lookahead: ')' })).toBe('E → E + ( •E ), )');
		expect(printItem(aug, { production: 1, dot: 1, lookahead: '+' })).toBe('E → int•, +');
		expect(printItem(aug, { production: 1, dot: 0, lookahead: null })).toBe('E → •int');
		expect(printItem(aug, { production: 2, dot: 1, lookahead: '$' }, { brackets: true })).toBe(
			'[S → E•, $]'
		);
		const eps = augment(grammar(ID_SEQUENCE));
		expect(printItem(eps, { production: 0, dot: 0, lookahead: '$' }, { brackets: true })).toBe(
			'[S → •, $]'
		);
	});

	it('merges items that differ only in lookahead, $ first', () => {
		const items: LrItem[] = [
			{ production: 0, dot: 0, lookahead: ')' },
			{ production: 1, dot: 0, lookahead: ')' },
			{ production: 0, dot: 0, lookahead: '+' },
			{ production: 1, dot: 0, lookahead: '$' },
			{ production: 1, dot: 0, lookahead: '+' }
		];
		expect(mergeItems(items)).toEqual([
			{ production: 0, dot: 0, lookaheads: [')', '+'] },
			{ production: 1, dot: 0, lookaheads: ['$', ')', '+'] }
		]);
		expect(merged(aug, items)).toEqual(['E → •E + ( E ), )/+', 'E → •int, $/)/+']);
		expect(mergeItems([{ production: 1, dot: 0, lookahead: null }])).toEqual([
			{ production: 1, dot: 0, lookaheads: null }
		]);
	});
});

describe('lrClosure', () => {
	it('builds the start context of Bottom-up Parsing III, slide 11, in the slide order', () => {
		const aug = augment(deck14);
		const { items, steps } = lrClosure(aug, [{ production: 2, dot: 0, lookahead: '$' }]);
		expect(show(aug, items)).toEqual([
			'S → •E, $',
			'E → •E + ( E ), $',
			'E → •int, $',
			'E → •E + ( E ), +',
			'E → •int, +'
		]);
		expect(merged(aug, items)).toEqual(['S → •E, $', 'E → •E + ( E ), $/+', 'E → •int, $/+']);
		expect(steps).toEqual([
			{ from: 0, production: 0, first: ['$'], item: items[1], index: 1, added: true },
			{ from: 0, production: 1, first: ['$'], item: items[2], index: 2, added: true },
			{ from: 1, production: 0, first: ['+'], item: items[3], index: 3, added: true },
			{ from: 1, production: 1, first: ['+'], item: items[4], index: 4, added: true },
			{ from: 3, production: 0, first: ['+'], item: items[3], index: 3, added: false },
			{ from: 3, production: 1, first: ['+'], item: items[4], index: 4, added: false }
		]);
	});

	it('extends E → E + (• E ), + as slide 9 does', () => {
		const aug = augment(deck15);
		const { items, steps } = lrClosure(aug, [{ production: 1, dot: 3, lookahead: '+' }]);
		expect(show(aug, items)).toEqual([
			'E → E + ( •E ), +',
			'E → •int, )',
			'E → •E + ( E ), )',
			'E → •int, +',
			'E → •E + ( E ), +'
		]);
		expect(steps[0]).toMatchObject({ from: 0, production: 0, first: [')'] });
		expect(steps[2]).toMatchObject({ from: 2, production: 0, first: ['+'], added: true });
	});

	it('uses First(βa): the lookahead when β derives ε', () => {
		const g = grammar('S → A B c\nA → a\nB → b | ε');
		const aug = augment(g);
		const { items } = lrClosure(aug, [{ production: 0, dot: 0, lookahead: '$' }]);
		// T = { c, a, b } in order of appearance: First(B c $) = { c, b } in display order.
		expect(show(aug, items)).toEqual(['S → •A B c, $', 'A → •a, c', 'A → •a, b']);
		const { steps } = lrClosure(aug, [{ production: 0, dot: 0, lookahead: '$' }]);
		expect(steps[0].first).toEqual(['c', 'b']);
	});

	it('closes LR(0) items without lookaheads', () => {
		const aug = augment(deck14);
		const { items, steps } = lrClosure(aug, [{ production: 2, dot: 0, lookahead: null }]);
		expect(show(aug, items)).toEqual(['S → •E', 'E → •E + ( E )', 'E → •int']);
		expect(steps.map((s) => s.first)).toEqual([[], [], [], []]);
	});

	it('rejects items that are not items of the grammar', () => {
		const aug = augment(deck14);
		expect(() => lrClosure(aug, [{ production: 7, dot: 0, lookahead: '$' }])).toThrow();
		expect(() => lrClosure(aug, [{ production: 1, dot: 2, lookahead: '$' }])).toThrow();
	});
});

describe('lrTransition', () => {
	const a = lr1Automaton(deck14);
	const aug = a.augmented;

	it('moves the dot over y and closes (Bottom-up Parsing III, slide 13)', () => {
		const t = lrTransition(aug, a.states[0].items, 'E');
		expect(t.moved.map((m) => m.from)).toEqual([0, 1, 3]);
		expect(merged(aug, t.items)).toEqual(['S → E•, $', 'E → E •+ ( E ), $/+']);
		const four = lrTransition(aug, a.states[3].items, '(');
		expect(merged(aug, four.items)).toEqual([
			'E → E + ( •E ), $/+',
			'E → •E + ( E ), )/+',
			'E → •int, )/+'
		]);
		expect(four.items).toEqual(a.states[4].items);
	});

	it('gives the empty set when no item has •y', () => {
		expect(lrTransition(aug, a.states[1].items, '+')).toEqual({ moved: [], items: [], steps: [] });
	});
});

describe('lr1Automaton', () => {
	it('builds the 12-state DFA of Bottom-up Parsing II, slide 17 from either order of the grammar', () => {
		for (const g of [deck14, deck15]) {
			const a = lr1Automaton(g);
			expect(a.kind).toBe('lr1');
			expect(a.states).toHaveLength(12);
			expect(edges(a)).toEqual(SLIDE_EDGES);
			expect(labels(a)).toEqual(SLIDE_LABELS);
			expect(
				a.states.map((s) => s.transitions.map((t) => `${t.symbol}→${t.to}`).join(' '))
			).toEqual([
				'int→1 E→2',
				'',
				'+→3',
				'(→4',
				'int→5 E→6',
				'',
				')→7 +→8',
				'',
				'(→9',
				'int→5 E→10',
				')→11 +→8',
				''
			]);
			expect(a.truncated).toBe(false);
			expect(a.diagnostics).toEqual([]);
		}
	});

	it('has the item sets of Bottom-up Parsing III, slide 14', () => {
		const a = lr1Automaton(deck14);
		const sets = a.states.map((s) => merged(a.augmented, s.items));
		expect(sets.slice(0, 7)).toEqual([
			['S → •E, $', 'E → •E + ( E ), $/+', 'E → •int, $/+'],
			['E → int•, $/+'],
			['S → E•, $', 'E → E •+ ( E ), $/+'],
			['E → E + •( E ), $/+'],
			['E → E + ( •E ), $/+', 'E → •E + ( E ), )/+', 'E → •int, )/+'],
			['E → int•, )/+'],
			['E → E + ( E •), $/+', 'E → E •+ ( E ), )/+']
		]);
		expect(sets.slice(7)).toEqual([
			['E → E + ( E )•, $/+'],
			['E → E + •( E ), )/+'],
			['E → E + ( •E ), )/+', 'E → •E + ( E ), )/+', 'E → •int, )/+'],
			['E → E + ( E •), )/+', 'E → E •+ ( E ), )/+'],
			['E → E + ( E )•, )/+']
		]);
		expect(a.states.map((s) => s.kernel)).toEqual([1, 2, 3, 2, 2, 2, 4, 2, 2, 2, 4, 2]);
		// With E → int first the items are the same sets, closure items in the grammar's order.
		const b = lr1Automaton(deck15);
		expect(b.states.map((s) => new Set(merged(b.augmented, s.items)))).toEqual(
			sets.map((s) => new Set(s))
		);
		expect(merged(b.augmented, b.states[0].items)).toEqual([
			'S → •E, $',
			'E → •int, $/+',
			'E → •E + ( E ), $/+'
		]);
	});

	it('records every Closure and Transition step', () => {
		const a = lr1Automaton(deck14);
		expect(a.steps[0]).toMatchObject({ kind: 'start', state: 0, states: 1, edges: 0 });
		expect(a.steps[0].steps).toHaveLength(6);
		const moves = a.steps
			.slice(1)
			.map((s) =>
				s.kind === 'transition' ? `${s.from}-${s.symbol}→${s.to}${s.isNew ? ' new' : ''}` : ''
			);
		expect(moves).toEqual([
			'0-int→1 new',
			'0-E→2 new',
			'2-+→3 new',
			'3-(→4 new',
			'4-int→5 new',
			'4-E→6 new',
			'6-)→7 new',
			'6-+→8 new',
			'8-(→9 new',
			'9-int→5',
			'9-E→10 new',
			'10-)→11 new',
			'10-+→8'
		]);
		const reuse = a.steps[10];
		expect(reuse).toMatchObject({
			kind: 'transition',
			from: 9,
			symbol: 'int',
			to: 5,
			isNew: false
		});
		expect(a.steps.map((s) => s.states)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 12]);
		expect(a.steps.at(-1)!.edges).toBe(13);
		const quiet = lr1Automaton(deck14, { trace: false });
		expect(quiet.steps).toEqual([]);
		expect(quiet.states).toEqual(a.states);
	});

	it('marks reduce labels and accept per state', () => {
		const a = lr1Automaton(deck14);
		expect(a.states[1].reduces).toEqual([{ production: 1, lookaheads: ['$', '+'] }]);
		expect(a.states.filter((s) => s.accept).map((s) => s.id)).toEqual([2]);
	});

	it('cuts the construction off at maxStates', () => {
		const a = lr1Automaton(deck14, { maxStates: 5 });
		expect(a.truncated).toBe(true);
		expect(a.states).toHaveLength(5);
		expect(a.diagnostics).toEqual([
			{
				severity: 'error',
				message: 'The LR(1) automaton has more than 5 states; it was cut off there.'
			}
		]);
		expect(DEFAULT_MAX_STATES).toBe(5000);
	});

	it('warns about symbols named $ or ε', () => {
		expect(lr1Automaton(grammar('S’ → S $\nS → a')).diagnostics).toHaveLength(1);
	});

	it('builds the states of the dangling-else and identifier-sequence grammars', () => {
		const ids = lr1Automaton(grammar(ID_SEQUENCE));
		// Bottom-up Parsing III, slide 25: the start state and its id successor, in the slide's order.
		expect(show(ids.augmented, ids.states[0].items)).toEqual([
			'S’ → •S, $',
			'S → •, $',
			'S → •id, $',
			'S → •id S, $'
		]);
		expect(show(ids.augmented, ids.states[1].items)).toEqual([
			'S → id•, $',
			'S → id •S, $',
			'S → •, $',
			'S → •id, $',
			'S → •id S, $'
		]);
		expect(ids.states[1].reduces.map((r) => reduceLabel(ids.augmented, r))).toEqual([
			'S → id on $',
			'S → ε on $'
		]);
		expect(lr1Automaton(grammar(DANGLING_ELSE_S)).states).toHaveLength(17);
	});
});

describe('lr0Automaton', () => {
	it('builds the LR(0) automaton: no lookaheads, and E → int• is one state', () => {
		const a = lr0Automaton(deck14);
		expect(a.kind).toBe('lr0');
		expect(a.states).toHaveLength(7);
		expect(edges(a)).toEqual([
			'0-int→1',
			'0-E→2',
			'2-+→3',
			'3-(→4',
			'4-int→1',
			'4-E→5',
			'5-)→6',
			'5-+→3'
		]);
		expect(a.states[1].reduces).toEqual([{ production: 1, lookaheads: null }]);
		expect(reduceLabel(a.augmented, a.states[1].reduces[0])).toBe('E → int');
		expect(a.states.every((s) => s.items.every((i) => i.lookahead === null))).toBe(true);
	});
});

describe('lalr1Automaton', () => {
	it('merges the LR(1) states with the same core', () => {
		const lr1 = lr1Automaton(deck14);
		const a = lalr1Automaton(lr1);
		expect(a.kind).toBe('lalr1');
		expect(a.states.map((s) => s.merged)).toEqual([
			[0],
			[1, 5],
			[2],
			[3, 8],
			[4, 9],
			[6, 10],
			[7, 11]
		]);
		expect(edges(a)).toEqual(edges(lr0Automaton(deck14)));
		expect(labels(a)).toEqual([
			'0:',
			'1: E → int on $, +, )',
			'2: accept on $',
			'3:',
			'4:',
			'5:',
			'6: E → E + ( E ) on $, +, )'
		]);
		expect(merged(a.augmented, a.states[4].items)).toEqual([
			'E → E + ( •E ), $/+/)',
			'E → •E + ( E ), )/+',
			'E → •int, )/+'
		]);
		expect(a.states[4].kernel).toBe(3);
		expect(a.steps).toEqual([]);
	});

	it('expects an LR(1) automaton', () => {
		expect(() => lalr1Automaton(lr0Automaton(deck14))).toThrow();
	});

	it('returns plain data', () => {
		const a = lr1Automaton(grammar(LEFT_FACTORED));
		expect(structuredClone(a)).toEqual(a);
		const b = lalr1Automaton(a);
		expect(structuredClone(b)).toEqual(b);
	});
});
