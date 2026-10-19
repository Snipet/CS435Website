import { describe, expect, it } from 'vitest';
import {
	ITEM_DOT,
	annotationText,
	formatItem,
	itemParts,
	joinSymbols,
	lookaheadText,
	mergeLookaheads,
	productionText,
	splitLookaheads,
	stateAnnotations,
	symbolSeparators,
	type ItemView
} from './lr-item';

/** An item from its right side, written with • where the dot is: item('E', 'E + • ( E )', '+'). */
function item(lhs: string, rhs: string, ...lookaheads: string[]): ItemView {
	const symbols = rhs.split(' ').filter(Boolean);
	const dot = symbols.indexOf(ITEM_DOT);
	if (dot < 0) throw new Error(`no dot in ${rhs}`);
	symbols.splice(dot, 1);
	return { lhs, rhs: symbols, dot, lookaheads };
}

/** Bottom-up Parsing III, slide 11: Closure({ S → •E, $ }) in full, in the slide's order. */
const startFull = [
	item('S', '• E', '$'),
	item('E', '• E + ( E )', '$'),
	item('E', '• int', '$'),
	item('E', '• E + ( E )', '+'),
	item('E', '• int', '+')
];

/** Bottom-up Parsing III, slide 14: states 0–6 as the boxes list them. */
const slideStates: { items: ItemView[]; lines: string[]; notes: string[] }[] = [
	{
		items: startFull,
		lines: ['S → •E, $', 'E → •E+(E), $/+', 'E → •int, $/+'],
		notes: []
	},
	{ items: [item('E', 'int •', '$', '+')], lines: ['E → int•, $/+'], notes: ['E → int on $, +'] },
	{
		items: [item('S', 'E •', '$'), item('E', 'E • + ( E )', '$', '+')],
		lines: ['S → E•, $', 'E → E•+(E), $/+'],
		notes: ['accept on $']
	},
	{ items: [item('E', 'E + • ( E )', '$', '+')], lines: ['E → E+•(E), $/+'], notes: [] },
	{
		items: [
			item('E', 'E + ( • E )', '$', '+'),
			item('E', '• E + ( E )', ')', '+'),
			item('E', '• int', ')', '+')
		],
		lines: ['E → E+(•E), $/+', 'E → •E+(E), )/+', 'E → •int, )/+'],
		notes: []
	},
	{ items: [item('E', 'int •', ')', '+')], lines: ['E → int•, )/+'], notes: ['E → int on ), +'] },
	{
		items: [item('E', 'E + ( E • )', '$', '+'), item('E', 'E • + ( E )', ')', '+')],
		lines: ['E → E+(E•), $/+', 'E → E•+(E), )/+'],
		notes: []
	}
];

describe('formatItem', () => {
	it('writes bracketed items as the definition and conflict slides do', () => {
		// Bottom-up Parsing III, slides 16–18, 25.
		expect(formatItem(item('E', 'E * • E', '+'))).toBe('[E → E * • E, +]');
		expect(formatItem(item('E', '• E + E', '+'))).toBe('[E → • E + E, +]');
		expect(formatItem(item('E', 'E * E •', '+'))).toBe('[E → E * E •, +]');
		expect(formatItem(item('S', '•', '$'))).toBe('[S → •, $]');
		expect(formatItem(item('S', 'id •', '$'))).toBe('[S → id •, $]');
		expect(formatItem(item('S', '• id S', '$'))).toBe('[S → • id S, $]');
		expect(formatItem(item('S’', '• S', '$'))).toBe('[S’ → • S, $]');
		expect(formatItem(item('S', 'if E then S •', 'else'))).toBe('[S → if E then S •, else]');
	});

	it('writes the spaced form without brackets', () => {
		// Bottom-up Parsing III, slide 8.
		expect(formatItem(item('E', 'E + • ( E )', '+'), 'spaced')).toBe('E → E + • ( E ), +');
		expect(formatItem(item('E', 'E + ( E ) •', '+'), 'spaced')).toBe('E → E + ( E ) •, +');
	});

	it('writes the compact form of the state boxes', () => {
		for (const state of slideStates) {
			expect(mergeLookaheads(state.items).map((it) => formatItem(it, 'compact'))).toEqual(
				state.lines
			);
		}
		expect(formatItem(item('S', '•', '$'), 'compact')).toBe('S → •, $');
		// Two names next to each other keep a space; the dot needs none.
		expect(formatItem(item('T', 'int • Y', '$'), 'compact')).toBe('T → int •Y, $');
		expect(formatItem(item('S', 'id S •', '$'), 'compact')).toBe('S → id S•, $');
		expect(formatItem(item('E', 'E - • T', '$'), 'compact')).toBe('E → E - •T, $');
	});

	it('leaves out the lookahead of an LR(0) item', () => {
		expect(formatItem({ lhs: 'E', rhs: ['int'], dot: 1, lookaheads: [] })).toBe('[E → int •]');
		expect(formatItem({ lhs: 'E', rhs: ['int'], dot: 0, lookaheads: [] }, 'compact')).toBe(
			'E → •int'
		);
	});

	it('quotes symbols as the grammar text does, and separators among the lookaheads', () => {
		const cat: ItemView = { lhs: 'S', rhs: ['the cat', 'N'], dot: 1, lookaheads: ['$'] };
		expect(formatItem(cat)).toBe('[S → "the cat" • N, $]');
		expect(formatItem(cat, 'compact')).toBe('S → "the cat" •N, $');
		expect(formatItem(item('L', 'L • , id', ',', '$'), 'compact')).toBe('L → L•,id, ","/$');
		expect(lookaheadText(['/', '$'])).toBe('"/"/$');
	});

	it('keeps the dot inside the right side', () => {
		expect(formatItem({ lhs: 'E', rhs: ['int'], dot: 7, lookaheads: ['$'] })).toBe(
			'[E → int •, $]'
		);
		expect(formatItem({ lhs: 'E', rhs: ['int'], dot: -2, lookaheads: ['$'] })).toBe(
			'[E → • int, $]'
		);
	});
});

describe('itemParts', () => {
	it('splits an item into pieces with exactly one dot', () => {
		for (const style of ['bracketed', 'spaced', 'compact'] as const) {
			for (const state of slideStates) {
				for (const it of state.items) {
					const parts = itemParts(it, style);
					expect(parts.map((p) => p.text).join('')).toBe(formatItem(it, style));
					expect(parts.filter((p) => p.kind === 'dot').map((p) => p.text)).toEqual([ITEM_DOT]);
					expect(parts.every((p) => p.text.length > 0)).toBe(true);
				}
			}
		}
		expect(itemParts(item('E', 'E • + ( E )', '$', '+'), 'compact').map((p) => p.kind)).toEqual([
			'lhs',
			'space',
			'arrow',
			'space',
			'symbol',
			'dot',
			'symbol',
			'symbol',
			'symbol',
			'symbol',
			'comma',
			'lookahead'
		]);
	});
});

describe('mergeLookaheads and splitLookaheads', () => {
	it('abbreviates the start state as slide 11 does', () => {
		expect(mergeLookaheads(startFull).map((it) => formatItem(it, 'spaced'))).toEqual([
			'S → • E, $',
			'E → • E + ( E ), $/+',
			'E → • int, $/+'
		]);
	});

	it('orders the lookaheads by first appearance, or by a given order', () => {
		const items = [item('E', '• int', '+'), item('E', '• int', ')'), item('E', '• int', '+')];
		expect(mergeLookaheads(items)[0].lookaheads).toEqual(['+', ')']);
		expect(mergeLookaheads(items, { order: [')', '+'] })[0].lookaheads).toEqual([')', '+']);
		expect(mergeLookaheads(items, { order: ['$'] })[0].lookaheads).toEqual(['+', ')']);
	});

	it('splits merged items back into the full list', () => {
		const merged = mergeLookaheads(startFull);
		expect(splitLookaheads(merged).map((it) => formatItem(it))).toEqual(
			[startFull[0], startFull[1], startFull[3], startFull[2], startFull[4]].map((it) =>
				formatItem(it)
			)
		);
		expect(splitLookaheads([{ lhs: 'E', rhs: [], dot: 0, lookaheads: [] }])).toHaveLength(1);
	});

	it('does not change its input', () => {
		const copy = structuredClone(startFull);
		mergeLookaheads(startFull, { order: ['+', '$'] });
		splitLookaheads(startFull);
		expect(startFull).toEqual(copy);
	});
});

describe('stateAnnotations and annotationText', () => {
	it('labels the states of the slide 14 DFA', () => {
		for (const state of slideStates) {
			expect(stateAnnotations(state.items, { start: 'S' }).map(annotationText)).toEqual(
				state.notes
			);
		}
	});

	it('labels the reductions by E → E + ( E ) as Bottom-up Parsing II, slide 17 does', () => {
		const seven = [item('E', 'E + ( E ) •', '$', '+')];
		const eleven = [item('E', 'E + ( E ) •', ')'), item('E', 'E + ( E ) •', '+')];
		expect(stateAnnotations(seven).map(annotationText)).toEqual(['E → E + (E) on $, +']);
		expect(stateAnnotations(eleven).map(annotationText)).toEqual(['E → E + (E) on ), +']);
	});

	it('lists every reduction of a state with a reduce/reduce conflict', () => {
		// Bottom-up Parsing III, slide 25: the state after id.
		const state = [
			item('S', 'id •', '$'),
			item('S', 'id • S', '$'),
			item('S', '•', '$'),
			item('S', '• id', '$'),
			item('S', '• id S', '$')
		];
		expect(stateAnnotations(state, { start: 'S’' }).map(annotationText)).toEqual([
			'S → id on $',
			'S → ε on $'
		]);
		// Without a start symbol, the start item is a reduction too.
		expect(stateAnnotations([item('S', 'E •', '$')]).map(annotationText)).toEqual(['S → E on $']);
		expect(annotationText({ kind: 'accept', lookaheads: [] })).toBe('accept');
	});

	it('accepts on $ only, and reduces a complete start item on any other lookahead', () => {
		// S → A, A → ( S ) | x: no augmentation, so the start symbol also occurs inside parentheses.
		const notes = (...items: ItemView[]) =>
			stateAnnotations(items, { start: 'S' }).map(annotationText);
		expect(notes(item('S', 'A •', ')'))).toEqual(['S → A on )']);
		expect(notes(item('S', 'A •', '$'))).toEqual(['accept on $']);
		expect(notes(item('S', 'A •', ')', '$', '+'))).toEqual(['accept on $', 'S → A on ), +']);
		expect(notes(item('S', 'A •', ')'), item('S', 'A •', '$'))).toEqual([
			'accept on $',
			'S → A on )'
		]);
		expect(stateAnnotations([item('S', 'A •', ')', '$')], { start: 'S' })).toEqual([
			{ kind: 'accept', lookaheads: ['$'] },
			{ kind: 'reduce', lhs: 'S', rhs: ['A'], lookaheads: [')'] }
		]);
		// Other complete items keep their place around it.
		expect(notes(item('A', 'x •', '$'), item('S', 'A •', '$', ')'), item('B', '•', '$'))).toEqual([
			'A → x on $',
			'accept on $',
			'S → A on )',
			'B → ε on $'
		]);
	});

	it('accepts an LR(0) start item without a lookahead', () => {
		const lr0 = { lhs: 'S', rhs: ['E'], dot: 1, lookaheads: [] };
		expect(stateAnnotations([lr0], { start: 'S' }).map(annotationText)).toEqual(['accept']);
		expect(stateAnnotations([lr0]).map(annotationText)).toEqual(['S → E']);
	});
});

describe('joinSymbols and productionText', () => {
	it('joins symbols spaced, compact, or hugging parentheses', () => {
		const form = ['int', '+', '(', 'int', ')', '+', '(', 'int', ')'];
		expect(joinSymbols(form)).toBe('int + ( int ) + ( int )');
		expect(joinSymbols(form, 'hug')).toBe('int + (int) + (int)');
		expect(joinSymbols(['E', '+', '(', 'E', ')'], 'compact')).toBe('E+(E)');
		expect(joinSymbols(['int', 'Y'], 'compact')).toBe('int Y');
		expect(joinSymbols([], 'hug')).toBe('ε');
		expect(symbolSeparators(['E', '+', '(', 'E', ')'], 'hug')).toEqual(['', ' ', ' ', '', '']);
	});

	it('writes productions with a spaced arrow', () => {
		expect(productionText('E', ['E', '+', '(', 'E', ')'])).toBe('E → E + ( E )');
		expect(productionText('E', ['E', '+', '(', 'E', ')'], 'hug')).toBe('E → E + (E)');
		expect(productionText('E', ['E', '+', '(', 'E', ')'], 'compact')).toBe('E → E+(E)');
		expect(productionText('S', [])).toBe('S → ε');
	});
});
