import { describe, expect, it } from 'vitest';
import { formatItem } from '$lib/components/grammar/lr-item';
import { augment, lr1Automaton } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { itemLines, itemView, linesOf, readItems } from './items';

const augmented = (text: string) => augment(parseGrammar(text).grammar!);
const aug = augmented('E → E + ( E ) | int');

describe('itemView and itemLines', () => {
	const state4 = lr1Automaton(aug.grammar).states[4];

	it('draws an engine item', () => {
		expect(itemView(aug, { production: 0, dot: 3, lookahead: '+' })).toEqual({
			lhs: 'E',
			rhs: ['E', '+', '(', 'E', ')'],
			dot: 3,
			lookaheads: ['+']
		});
		expect(itemView(aug, { production: 1, dot: 1, lookahead: null }).lookaheads).toEqual([]);
	});

	it('lists a state one item per line, or one line per core (slide 14, state 4)', () => {
		const full = itemLines(aug, state4.items, 'full');
		expect(full.map((l) => formatItem(l.view, 'compact'))).toEqual([
			'E → E+(•E), $',
			'E → E+(•E), +',
			'E → •E+(E), )',
			'E → •int, )',
			'E → •E+(E), +',
			'E → •int, +'
		]);
		const short = itemLines(aug, state4.items, 'abbreviated');
		expect(short.map((l) => formatItem(l.view, 'compact'))).toEqual([
			'E → E+(•E), $/+',
			'E → •E+(E), )/+',
			'E → •int, )/+'
		]);
		expect(short.map((l) => l.items)).toEqual([
			[0, 1],
			[2, 4],
			[3, 5]
		]);
		expect(linesOf(short, [4])).toEqual([1]);
		expect(linesOf(short, [0, 5])).toEqual([0, 2]);
		expect(linesOf(full, [])).toEqual([]);
	});
});

describe('readItems', () => {
	it('reads the items of the slides', () => {
		expect(readItems('E → E + ( •E ), +', aug)).toEqual({
			items: [{ production: 0, dot: 3, lookahead: '+' }],
			diagnostics: []
		});
		expect(readItems('S → •E, $', aug).items).toEqual([{ production: 2, dot: 0, lookahead: '$' }]);
		// Bracketed, compact, ->, several lookaheads, the dot alone at the end.
		expect(readItems('[E → E+(•E), $/+]', aug).items).toEqual([
			{ production: 0, dot: 3, lookahead: '$' },
			{ production: 0, dot: 3, lookahead: '+' }
		]);
		expect(readItems('E -> int •, )', aug).items).toEqual([
			{ production: 1, dot: 1, lookahead: ')' }
		]);
		// One item per line; repeats are read once; blank lines are skipped.
		expect(readItems('E → •int, $\n\nE → •int, $/+', aug).items).toEqual([
			{ production: 1, dot: 0, lookahead: '$' },
			{ production: 1, dot: 0, lookahead: '+' }
		]);
	});

	it('reads . as the dot unless . is a symbol of the grammar', () => {
		expect(readItems('E → . int, $', aug).items).toEqual([
			{ production: 1, dot: 0, lookahead: '$' }
		]);
		const dotted = augmented('L → L . id | id');
		expect(readItems('L → L . id, $', dotted).diagnostics[0].message).toMatch(/Mark the dot/);
		expect(readItems('L → L • . id, $', dotted).items).toEqual([
			{ production: 0, dot: 1, lookahead: '$' }
		]);
	});

	it('reads ε-productions and comma terminals', () => {
		const eps = augmented('S → ε | id S');
		expect(readItems('S → •, $', eps).items).toEqual([{ production: 0, dot: 0, lookahead: '$' }]);
		expect(readItems('S → • ε, $', eps).items).toEqual([{ production: 0, dot: 0, lookahead: '$' }]);
		const list = augmented('L → L , id | id');
		expect(readItems('L → L • , id, ","/$', list).items).toEqual([
			{ production: 0, dot: 1, lookahead: ',' },
			{ production: 0, dot: 1, lookahead: '$' }
		]);
	});

	it('says what is wrong, with a span in the text', () => {
		const cases: [string, RegExp][] = [
			['E E + ( E ), +', /needs an arrow/],
			['E + → int, $', /one non-terminal/],
			['E → •int', /lookahead after a comma/],
			['E → •int, x', /lookahead after a comma/],
			['E → int, $', /Mark the dot/],
			['E → •int•, $', /one dot/],
			['E → •foo, $', /foo is not a symbol of the grammar/],
			['E → •int int, $', /is not a production/],
			['', /Write an item/]
		];
		for (const [text, message] of cases) {
			const read = readItems(text, aug);
			expect(read.items, text).toEqual([]);
			expect(read.diagnostics[0].message, text).toMatch(message);
			const span = read.diagnostics[0].span;
			if (span) {
				expect(span.start).toBeGreaterThanOrEqual(0);
				expect(span.end).toBeLessThanOrEqual(Math.max(1, text.length));
			}
		}
		// A problem on the second line is placed on it.
		const read = readItems('E → •int, $\nE → •foo, $', aug);
		expect(read.items).toHaveLength(1);
		expect(read.diagnostics[0].span!.start).toBe('E → •int, $\nE → •'.length);
	});
});
