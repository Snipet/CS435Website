import { describe, expect, it } from 'vitest';
import { alt, cat, star, sym } from '../regex/ast';
import { analyzeDeterminism, automatonFromText } from './core';
import { compareLanguages } from './language';
import { distinguish, minimize, type MinimizeResult } from './minimize';
import { runDfa } from './simulate';
import { subsetConstruction } from './subset';
import { edgeList, id, names } from './test-helpers';
import { thompson } from './thompson';
import type { Automaton, StateId } from './types';

const lectureDfa = () =>
	subsetConstruction(thompson(cat(star(alt(sym('1'), sym('0'))), sym('1'))).nfa).dfa;

/** Runs `w` from state `s` of a total DFA. */
function acceptsFrom(a: Automaton, s: StateId, w: string): boolean {
	return runDfa({ ...a, start: s }, w).accepted;
}

/** Every recorded witness really separates the parts it claims to separate. */
function checkWitnesses(result: MinimizeResult) {
	const { input } = result;
	for (const [r, round] of result.rounds.entries()) {
		for (const split of round.splits) {
			expect(split.witnesses).toHaveLength(split.parts.length - 1);
			expect(split.witness).toBe(split.witnesses[0].witness);
			for (const w of split.witnesses) {
				const p = split.parts[0][0];
				const q = split.parts[w.part][0];
				if (r === 0) {
					expect(w.witness).toBe('');
					continue;
				}
				expect(w.witness.length).toBeLessThanOrEqual(r);
				expect(w.symbol.has(w.witness[0])).toBe(true);
				const sameAccept = acceptsFrom(input, p, w.witness) === acceptsFrom(input, q, w.witness);
				const tokenOf = (s: StateId) => {
					const end = runDfa({ ...input, start: s }, w.witness).steps.at(-1)!.state!;
					return input.states[end].accept?.token;
				};
				expect(!sameAccept || tokenOf(p) !== tokenOf(q)).toBe(true);
			}
		}
	}
}

describe('minimize: lecture golden', () => {
	const dfa = lectureDfa();
	const result = minimize(dfa);

	it('merges ABCDHI and FGABCDHI into 2 states', () => {
		expect(result.dfa.states.map((s) => s.name)).toEqual(['ABCDHI', 'EJGABCDHI']);
		expect(result.dfa.states[0].merged).toEqual([0, 1]);
		expect(result.dfa.states[1].merged).toEqual([2]);
		expect(result.dfa.states[result.dfa.start].name).toBe('ABCDHI');
		expect(edgeList(result.dfa)).toEqual([
			'ABCDHI-0->ABCDHI',
			'ABCDHI-1->EJGABCDHI',
			'EJGABCDHI-0->ABCDHI',
			'EJGABCDHI-1->EJGABCDHI'
		]);
	});

	it('records the rounds', () => {
		expect(result.rounds.map((r) => r.blocks)).toEqual([
			[[0, 1], [2]],
			[[0, 1], [2]]
		]);
		expect(result.rounds[0].splits).toHaveLength(1);
		expect(result.rounds[1].splits).toEqual([]);
		expect(result.trap).toBeNull();
		expect(result.removed).toEqual([]);
		expect([...result.blockOf]).toEqual([
			[0, 0],
			[1, 0],
			[2, 1]
		]);
	});

	it('keeps the language', () => {
		expect(compareLanguages(dfa, result.dfa).equivalent).toBe(true);
	});
});

describe('minimize: refinement', () => {
	// (a|b)*abb from the subset construction: 5 states, minimal has 4.
	const dfa = automatonFromText(`
		states: A B C D E
		start: A
		accept: E
		A a B
		A b C
		B a B
		B b D
		C a B
		C b C
		D a B
		D b E
		E a B
		E b C
	`);
	const result = minimize(dfa);

	it('merges A and C', () => {
		expect(result.dfa.states.map((s) => s.name)).toEqual(['A', 'B', 'D', 'E']);
		expect(result.dfa.states[0].merged).toEqual([id(dfa, 'A'), id(dfa, 'C')]);
		expect(compareLanguages(dfa, result.dfa).equivalent).toBe(true);
	});

	it('splits one block per round with a distinguishing string', () => {
		const view = result.rounds.map((r) => r.blocks.map((b) => names(dfa, b).join('')));
		expect(view).toEqual([
			['ABCD', 'E'],
			['ABC', 'D', 'E'],
			['AC', 'B', 'D', 'E'],
			['AC', 'B', 'D', 'E']
		]);
		expect(result.rounds[1].splits[0].witness).toBe('b');
		expect(result.rounds[2].splits[0].witness).toBe('bb');
		checkWitnesses(result);
	});

	it('merged transitions combine symbols with the same target', () => {
		const a = automatonFromText(`
			start: A
			accept: B C
			A 0 B
			A 1 C
			B 0,1 B
			C 0,1 C
		`);
		const m = minimize(a).dfa;
		expect(m.states.map((s) => s.name)).toEqual(['A', 'B']);
		expect(edgeList(m)).toEqual(['A-0,1->B', 'B-0,1->B']);
	});
});

describe('minimize: partial DFAs and unreachable states', () => {
	it('adds a trap to partition, then drops it again', () => {
		const a = automatonFromText(`
			start: q0
			accept: q1
			q0 1 q0
			q0 0 q1
		`);
		const result = minimize(a);
		expect(result.trap).toBe(2);
		expect(result.input.states[2].trap).toBe(true);
		expect(result.input.states[2].name).toBe('trap');
		expect(result.dfa.states.map((s) => s.name)).toEqual(['q0', 'q1']);
		expect(analyzeDeterminism(result.dfa).kind).toBe('partial-dfa');
		expect(result.blockOf.get(2)).toBe(2);
		checkWitnesses(result);
	});

	it('keeps a trap that merges with a dead state of the input', () => {
		const a = automatonFromText(`
			start: s
			accept: f
			s a f
			s b dead
			dead a,b dead
		`);
		const result = minimize(a);
		expect(result.trap).not.toBeNull();
		const dead = result.dfa.states.find((s) => s.name === 'dead')!;
		expect(dead.trap).toBe(true);
		expect(dead.merged).toContain(result.trap);
	});

	it('drops unreachable states and reports them by original id', () => {
		const a = automatonFromText(`
			start: A
			accept: B
			A x B
			B x B
			Z x A
		`);
		const result = minimize(a);
		expect(result.removed).toEqual([id(a, 'Z')]);
		expect(result.input.states.map((s) => s.name)).toEqual(['A', 'B']);
		expect(result.map.get(id(a, 'B'))).toBe(1);
		expect(result.map.has(id(a, 'Z'))).toBe(false);
	});

	it('handles machines with no accepting states', () => {
		const a = automatonFromText(`
			start: A
			A x B
			B x A
		`);
		const result = minimize(a);
		expect(result.dfa.states).toHaveLength(1);
		expect(result.rounds[0].splits).toEqual([]);
	});

	it('throws for NFAs', () => {
		expect(() => minimize(thompson(star(sym('a'))).nfa)).toThrow(/DFA/);
	});
});

describe('minimize: tokens', () => {
	const scanner = automatonFromText(`
		start: S
		accept: X Y
		S a X
		S b Y
	`);
	scanner.states[1].accept = { rule: 0, token: 'A' };
	scanner.states[2].accept = { rule: 1, token: 'B' };

	it('keeps accepting states with different tokens apart by default', () => {
		const result = minimize(scanner);
		expect(result.dfa.states).toHaveLength(3);
		expect(result.rounds[0].blocks).toHaveLength(3);
		expect(result.dfa.states.map((s) => s.accept?.token)).toEqual([undefined, 'A', 'B']);
		checkWitnesses(result);
	});

	it('merges them when splitByToken is false, keeping the lowest rule', () => {
		const result = minimize(scanner, { splitByToken: false });
		expect(result.dfa.states).toHaveLength(2);
		expect(result.dfa.states[1].accept).toEqual({ rule: 0, token: 'A' });
	});
});

describe('minimize: textbook DFA from (0|1)*1(0|1)(0|1)', () => {
	it('is already minimal (8 states)', () => {
		const nfa = automatonFromText(`
			start: n0
			accept: n3
			n0 0,1 n0
			n0 1 n1
			n1 0,1 n2
			n2 0,1 n3
		`);
		const dfa = subsetConstruction(nfa).dfa;
		const result = minimize(dfa);
		expect(result.dfa.states).toHaveLength(8);
		checkWitnesses(result);
	});
});

describe('distinguish', () => {
	const dfa = lectureDfa();

	it('finds equivalent states', () => {
		expect(distinguish(dfa, 0, 1)).toEqual({ equivalent: true });
		expect(distinguish(dfa, 2, 2)).toEqual({ equivalent: true });
	});

	it('returns "" when one state accepts and the other does not', () => {
		expect(distinguish(dfa, 0, 2)).toEqual({ equivalent: false, witness: '', accepts: 2 });
	});

	it('returns the shortest witness, shortlex-first', () => {
		const a = automatonFromText(`
			start: A
			accept: E
			A a B
			A b C
			B a B
			B b D
			C a B
			C b C
			D a B
			D b E
			E a B
			E b C
		`);
		expect(distinguish(a, id(a, 'A'), id(a, 'B'))).toEqual({
			equivalent: false,
			witness: 'bb',
			accepts: id(a, 'B')
		});
		expect(distinguish(a, id(a, 'B'), id(a, 'D'))).toEqual({
			equivalent: false,
			witness: 'b',
			accepts: id(a, 'D')
		});
		expect(distinguish(a, id(a, 'A'), id(a, 'C'))).toEqual({ equivalent: true });
	});

	it('treats missing transitions as the trap', () => {
		const a = automatonFromText(`
			start: p
			accept: f
			p x f
			q y f
		`);
		expect(distinguish(a, id(a, 'p'), id(a, 'q'))).toEqual({
			equivalent: false,
			witness: 'x',
			accepts: id(a, 'p')
		});
	});

	it('prefers the lexicographically smaller of two shortest witnesses', () => {
		const a = automatonFromText(`
			start: p
			accept: f
			p 0,1 f
			q 1 f
			q 0 g
		`);
		expect(distinguish(a, id(a, 'p'), id(a, 'q'))).toMatchObject({ witness: '0' });
	});

	it('throws for NFAs', () => {
		expect(() => distinguish(thompson(star(sym('a'))).nfa, 0, 1)).toThrow();
	});
});
