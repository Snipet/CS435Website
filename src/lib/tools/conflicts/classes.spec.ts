import { describe, expect, it } from 'vitest';
import { formatItem } from '$lib/components/grammar/lr-item';
import { grammarClasses } from '$lib/theory/grammar/lr-classes';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { classPoint, insideRegion, LL_REGIONS } from '$lib/components/grammar/grammar-classes';
import { CLASS_CONFLICTS, classesView, llkOf } from './classes';
import { NOT_LALR } from './presets';

const view = (text: string, tokens?: string[]) => {
	const g = parseGrammar(text).grammar!;
	return classesView(g, grammarClasses(g, { tokens }));
};
const members = (v: ReturnType<typeof view>) => v.rows.map((r) => [r.name, r.member]);

describe('classesView', () => {
	it('places S → ε | id S: SLR but not LR(0), and LL(1) (slide 25)', () => {
		const v = view('S → ε | id S', ['id', 'id']);
		expect(members(v)).toEqual([
			['LL(1)', true],
			['LR(0)', false],
			['SLR(1)', true],
			['LALR(1)', true],
			['LR(1)', true]
		]);
		expect(v.place).toEqual({ lr: 'slr', ll: 'll1', ambiguous: false });
		expect(v.ambiguity).toBe('unambiguous');
		// LR(0) items have no lookahead.
		const lr0 = v.rows[1];
		expect(lr0.count).toBe(2);
		expect(lr0.conflicts[0].items.map((i) => formatItem(i))).toEqual(['[S → • id S]', '[S → •]']);
	});

	it('places an ambiguous grammar among the ambiguous ones when a string has two trees', () => {
		const v = view('E → E + E | E * E | int', ['int', '+', 'int', '*', 'int']);
		expect(v.rows.every((r) => r.member === false)).toBe(true);
		expect(v.string).toEqual({
			tokens: ['int', '+', 'int', '*', 'int'],
			trees: 2,
			ambiguous: true
		});
		expect(v.place).toEqual({ lr: null, ll: null, ambiguous: true });
		const lr1 = v.rows[4];
		expect(lr1.count).toBe(4);
		expect(lr1.conflicts).toHaveLength(CLASS_CONFLICTS);
		expect(lr1.states).toBe(7);
		// Without a string with two trees, it is not known to be ambiguous.
		expect(view('E → E + E | E * E | int', ['int']).place.ambiguous).toBe(false);
	});

	it('names the LL(1) entries with two productions', () => {
		const v = view('E → T + E | T\nT → int');
		const ll1 = v.rows[0];
		expect(ll1.conflicts[0]).toEqual({
			state: null,
			terminal: 'int',
			kind: 'LL(1)',
			items: [],
			entry: { nonterminal: 'E', productions: ['E → T + E', 'E → T'] }
		});
		// Not LL(1), not left-recursive, an infinite language: LL(k) is not decided (it is LL(2)).
		expect(v.place).toEqual({ lr: 'slr', ll: null, ambiguous: false });
		expect(v.llk).toBeNull();
	});

	it('tells LL(0) and LR(1) without LALR(1)', () => {
		expect(view('S → a B\nB → b').place).toEqual({ lr: 'lr0', ll: 'll0', ambiguous: false });
		const v = view(NOT_LALR);
		expect(v.rows[3].conflicts.map((c) => c.kind)).toEqual(['reduce/reduce', 'reduce/reduce']);
	});

	it('places the LR(1) grammar that is not LALR(1) inside LL(k): its language is finite', () => {
		const v = view(NOT_LALR);
		expect(v.place).toEqual({ lr: 'lr1', ll: 'llk', ambiguous: false });
		expect(v.llk).toEqual({ kind: 'finite', k: 3 });
		const p = classPoint(v.place)!;
		expect(p.x2).toBeUndefined();
		expect(LL_REGIONS.map((r) => insideRegion(r, true, p))).toEqual([true, false]);
	});

	it('places a left-recursive grammar outside LL(k)', () => {
		const v = view('E → E + T | T\nT → int');
		expect(v.place).toEqual({ lr: 'lr0', ll: 'none', ambiguous: false });
		expect(v.llk).toEqual({ kind: 'left-recursive', nonterminal: 'E' });
		const p = classPoint(v.place)!;
		expect(LL_REGIONS.map((r) => insideRegion(r, true, p))).toEqual([false, false]);
	});

	it('decides nothing about LL(k) for an LL(1) grammar, an ambiguous one or one with useless symbols', () => {
		expect(view('S → ε | id S').llk).toBeNull();
		expect(view('E → E + E | int', ['int', '+', 'int', '+', 'int']).llk).toBeNull();
		// B derives nothing: E is left-recursive, but the grammar is not reduced.
		expect(llkOf(parseGrammar('E → E + T | T | B\nT → int\nB → B b').grammar!)).toBeNull();
	});
});
