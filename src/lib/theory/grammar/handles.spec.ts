import { describe, expect, it } from 'vitest';
import { parseTrees } from './earley';
import { handlesFromParse, handlesFromTree, type HandleStep } from './handles';
import { lr1Automaton } from './lr';
import { lrParse, printCompact } from './lr-parse';
import { lrTable } from './lr-table';
import {
	AMBIGUOUS_OPERATORS,
	BOTTOM_UP,
	ID_SEQUENCE_FIXED,
	LEFT_FACTORED,
	bruteForce,
	grammar,
	input,
	random,
	randomGrammar
} from './test-helpers';
import type { Grammar } from './types';

const g = grammar(BOTTOM_UP);

/** Each form with its handle in [brackets], as Bottom-Up Parsing marks it in red. */
const marked = (steps: HandleStep[]): string[] =>
	steps.map(({ form, handle }) =>
		handle
			? [
					printCompact(form.slice(0, handle.start)),
					`[${printCompact(form.slice(handle.start, handle.end))}]`,
					printCompact(form.slice(handle.end))
				]
					.filter((part) => part !== 'ε')
					.join(' ')
			: printCompact(form)
	);

const parseOf = (h: Grammar, text: string) => lrParse(lrTable(lr1Automaton(h)), input(h, text));

describe('handlesFromParse', () => {
	it('reproduces the reduction of Bottom-Up Parsing, slides 5–10', () => {
		const steps = handlesFromParse(parseOf(g, 'int + (int) + (int)'))!;
		expect(steps.map((s) => printCompact(s.form))).toEqual([
			'int + (int) + (int)',
			'E + (int) + (int)',
			'E + (E) + (int)',
			'E + (int)',
			'E + (E)',
			'E'
		]);
		expect(
			steps.map((s) => (s.handle ? printCompact(s.form.slice(s.handle.start, s.handle.end)) : null))
		).toEqual(['int', 'int', 'E + (E)', 'int', 'E + (E)', null]);
		expect(steps.map((s) => s.production)).toEqual([1, 1, 0, 1, 0, null]);
		expect(marked(steps)).toEqual([
			'[int] + (int) + (int)',
			'E + ( [int] ) + (int)',
			'[E + (E)] + (int)',
			'E + ( [int] )',
			'[E + (E)]',
			'E'
		]);
		expect(steps[1].handle).toEqual({ start: 3, end: 4 });
	});

	it('is a reverse rightmost derivation: every reduction gives the next form, γ is all terminals', () => {
		const steps = handlesFromParse(parseOf(g, 'int + (int + (int)) + (int)'))!;
		const isNonterminal = new Set(g.nonterminals);
		for (let k = 0; k + 1 < steps.length; k++) {
			const { form, handle, production } = steps[k];
			const p = g.productions[production!];
			expect(form.slice(handle!.start, handle!.end)).toEqual(p.rhs);
			expect([...form.slice(0, handle!.start), p.lhs, ...form.slice(handle!.end)]).toEqual(
				steps[k + 1].form
			);
			// Bottom-Up Parsing, slide 11
			expect(form.slice(handle!.end).some((x) => isNonterminal.has(x))).toBe(false);
		}
	});

	it('marks the empty handle of an ε-reduction', () => {
		const h = grammar(ID_SEQUENCE_FIXED);
		expect(handlesFromParse(parseOf(h, 'id id'))).toEqual([
			{ form: ['id', 'id'], handle: { start: 2, end: 2 }, production: 0 },
			{ form: ['id', 'id', 'S'], handle: { start: 1, end: 3 }, production: 1 },
			{ form: ['id', 'S'], handle: { start: 0, end: 2 }, production: 1 },
			{ form: ['S'], handle: null, production: null }
		]);
		expect(handlesFromParse(parseOf(h, ''))).toEqual([
			{ form: [], handle: { start: 0, end: 0 }, production: 0 },
			{ form: ['S'], handle: null, production: null }
		]);
	});

	it('is null unless the parse accepts', () => {
		expect(handlesFromParse(parseOf(g, 'int +'))).toBeNull();
	});

	it('follows the parse the precedence declarations choose', () => {
		const h = grammar(AMBIGUOUS_OPERATORS);
		const t = lrTable(lr1Automaton(h), {
			precedence: [
				{ assoc: 'left', terminals: ['+'] },
				{ assoc: 'left', terminals: ['*'] }
			]
		});
		const steps = handlesFromParse(lrParse(t, input(h, 'int + int * int')))!;
		expect(marked(steps)).toEqual([
			'[int] + int * int',
			'E + [int] * int',
			'E + E * [int]',
			'E + [E * E]',
			'[E + E]',
			'E'
		]);
	});
});

describe('handlesFromTree', () => {
	it('reverses the rightmost derivation of a tree', () => {
		const { trees } = parseTrees(g, input(g, 'int + (int) + (int)'));
		expect(trees).toHaveLength(1);
		expect(handlesFromTree(g, trees[0])).toEqual(
			handlesFromParse(parseOf(g, 'int + (int) + (int)'))
		);
	});

	it('gives one sequence per tree of an ambiguous string', () => {
		const h = grammar(AMBIGUOUS_OPERATORS);
		const { trees } = parseTrees(h, input(h, 'int + int * int'));
		expect(trees.map((tree) => marked(handlesFromTree(h, tree)).join(' → '))).toEqual([
			'[int] + int * int → E + [int] * int → E + E * [int] → E + [E * E] → [E + E] → E',
			'[int] + int * int → E + [int] * int → [E + E] * int → E * [int] → [E * E] → E'
		]);
	});

	it('agrees with the LR parse of every sentence of an LR(1) grammar', () => {
		const next = random(13);
		let checked = 0;
		for (let i = 0; i < 300; i++) {
			const h = i === 0 ? grammar(LEFT_FACTORED) : randomGrammar(next);
			const t = lrTable(lr1Automaton(h, { trace: false }));
			if (t.conflicts.length > 0) continue;
			for (const tokens of bruteForce(h, 4).slice(0, 10)) {
				const { trees } = parseTrees(h, tokens);
				expect(handlesFromParse(lrParse(t, tokens))).toEqual(handlesFromTree(h, trees[0]));
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(100);
	});

	it('lists a partial tree’s fringe as its first form', () => {
		const tree = {
			symbol: 'E',
			terminal: false,
			production: 0,
			children: [
				{ symbol: 'E', terminal: false, children: [] },
				{ symbol: '+', terminal: true, children: [] },
				{ symbol: '(', terminal: true, children: [] },
				{
					symbol: 'E',
					terminal: false,
					production: 1,
					children: [{ symbol: 'int', terminal: true, children: [] }]
				},
				{ symbol: ')', terminal: true, children: [] }
			]
		};
		expect(marked(handlesFromTree(g, tree))).toEqual(['E + ( [int] )', '[E + (E)]', 'E']);
	});
});
