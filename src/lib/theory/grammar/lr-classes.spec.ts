import { describe, expect, it } from 'vitest';
import { unproductive, unreachable } from './analyze';
import { grammarClasses, type GrammarClasses } from './lr-classes';
import {
	AMBIGUOUS,
	AMBIGUOUS_OPERATORS,
	BOTTOM_UP,
	CASCADE,
	DANGLING_ELSE_S,
	ID_SEQUENCE,
	ID_SEQUENCE_FIXED,
	LEFT_FACTORED,
	TOP_DOWN,
	grammar,
	input,
	random,
	randomGrammar
} from './test-helpers';

/** The classes a grammar is in, in the order of the Venn diagram. */
const classes = (c: GrammarClasses): string[] =>
	(
		[
			['LL(1)', c.ll1.member],
			['LR(0)', c.lr0.member],
			['SLR(1)', c.slr1.member],
			['LALR(1)', c.lalr1.member],
			['LR(1)', c.lr1.member]
		] as const
	)
		.filter(([, member]) => member)
		.map(([name]) => name);

const of = (text: string) => classes(grammarClasses(grammar(text)));

describe('grammarClasses', () => {
	it('places E → E + ( E ) | int: LR(0) and up, not LL(1)', () => {
		const c = grammarClasses(grammar(BOTTOM_UP));
		expect(classes(c)).toEqual(['LR(0)', 'SLR(1)', 'LALR(1)', 'LR(1)']);
		expect(c.ll1.conflicts).toEqual([{ nonterminal: 'E', terminal: 'int', productions: [0, 1] }]);
		expect(c.lr1.states).toBe(12);
		expect(c.lalr1.states).toBe(7);
		expect(c.lr0.states).toBe(7);
		expect(c.ambiguity).toBe('unambiguous');
		expect(c.string).toBeNull();
	});

	it('places the grammars of the decks', () => {
		expect(of(LEFT_FACTORED)).toEqual(['LL(1)', 'SLR(1)', 'LALR(1)', 'LR(1)']);
		expect(of(CASCADE)).toEqual(['SLR(1)', 'LALR(1)', 'LR(1)']);
		expect(of(TOP_DOWN)).toEqual(['SLR(1)', 'LALR(1)', 'LR(1)']);
		expect(of(ID_SEQUENCE_FIXED)).toEqual(['LL(1)', 'SLR(1)', 'LALR(1)', 'LR(1)']);
		expect(of(ID_SEQUENCE)).toEqual([]);
		expect(of(DANGLING_ELSE_S)).toEqual([]);
		expect(of(AMBIGUOUS_OPERATORS)).toEqual([]);
	});

	it('tells LALR(1) from SLR(1) and LR(1) from LALR(1)', () => {
		// The classic assignment grammar: LALR(1), not SLR(1).
		expect(of('S → L = R | R\nL → * R | id\nR → L')).toEqual(['LALR(1)', 'LR(1)']);
		// Merging the two states of A → c• and B → c• makes a reduce/reduce conflict.
		const c = grammarClasses(grammar('S → a A d | b B d | a B e | b A e\nA → c\nB → c'));
		expect(classes(c)).toEqual(['LR(1)']);
		expect(c.lalr1.conflicts.map((x) => x.kind)).toEqual(['reduce/reduce', 'reduce/reduce']);
	});

	it('finds a string with two parse trees', () => {
		const c = grammarClasses(grammar(AMBIGUOUS), {
			tokens: input(grammar(AMBIGUOUS), 'int + int + int')
		});
		expect(c.string).toEqual({
			tokens: ['int', '+', 'int', '+', 'int'],
			trees: 2,
			ambiguous: true
		});
		expect(c.ambiguity).toBe('ambiguous');
		const one = grammarClasses(grammar(AMBIGUOUS), { tokens: ['int'] });
		expect(one.string!.ambiguous).toBe(false);
		expect(one.ambiguity).toBe('unknown');
		expect(grammarClasses(grammar(AMBIGUOUS)).ambiguity).toBe('unknown');
	});

	it('leaves the LR classes undecided when the automaton is cut off', () => {
		const c = grammarClasses(grammar(BOTTOM_UP), { maxStates: 3 });
		expect(c.lr1.member).toBeNull();
		expect(c.lalr1.member).toBeNull();
		expect(c.lr0.member).toBeNull();
		expect(c.ll1.member).toBe(false);
		expect(c.diagnostics.map((d) => d.severity)).toEqual(['error', 'error']);
	});

	it('nests the classes as the Venn diagram of slide 26 does', () => {
		const next = random(26);
		const seen = new Set<string>();
		for (let i = 0; i < 400; i++) {
			const g = randomGrammar(next);
			const c = grammarClasses(g);
			const where = JSON.stringify(g.productions.map((p) => [p.lhs, p.rhs]));
			if (c.lr0.member) expect(c.slr1.member, where).toBe(true);
			if (c.slr1.member) expect(c.lalr1.member, where).toBe(true);
			if (c.lalr1.member) expect(c.lr1.member, where).toBe(true);
			// LL(1) ⊂ LR(1) holds for grammars whose non-terminals are all reachable and productive.
			const reduced = unproductive(g).length === 0 && unreachable(g).length === 0;
			if (c.ll1.member && reduced) expect(c.lr1.member, where).toBe(true);
			seen.add(classes(c).join(' '));
		}
		expect(seen.size).toBeGreaterThan(3);
	});

	it('can call a grammar with a non-terminal that derives nothing LL(1) but not LR(1)', () => {
		// First(S) = First(B) = { }: the LL(1) table is empty.
		const c = grammarClasses(grammar('S → B a | S a A | A c S\nA → A b\nB → B A B | S | S b a'));
		expect(c.ll1.member).toBe(true);
		expect(c.lr1.member).toBe(false);
	});

	it('returns plain data', () => {
		const c = grammarClasses(grammar(AMBIGUOUS_OPERATORS), { tokens: ['int'] });
		expect(structuredClone(c)).toEqual(c);
	});
});
