import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, star, sym } from '../regex/ast';
import { ClosureIndex, epsilonClosure, epsilonClosureTrace, move } from './closure';
import { automatonFromText } from './core';
import { id, names } from './test-helpers';
import { thompson } from './thompson';

const { nfa } = thompson(cat(star(alt(sym('1'), sym('0'))), sym('1')));
const ids = (...ns: string[]) => ns.map((n) => id(nfa, n));
const closureNames = (...seeds: string[]) =>
	names(nfa, epsilonClosure(nfa, ids(...seeds))).join(',');

describe('epsilonClosure: lecture golden', () => {
	it('closure(A) = A,B,C,D,H,I', () => {
		expect(closureNames('A')).toBe('A,B,C,D,H,I');
	});

	it('closure(F) = F,G,A,B,C,D,H,I', () => {
		expect(closureNames('F')).toBe('F,G,A,B,C,D,H,I');
	});

	it('closure([E, J]) = E,J,G,A,B,C,D,H,I (seeds first, then DFS preorder)', () => {
		expect(closureNames('E', 'J')).toBe('E,J,G,A,B,C,D,H,I');
	});

	it('keeps seed order and ignores duplicate seeds', () => {
		expect(closureNames('J', 'E', 'J')).toBe('J,E,G,A,B,C,D,H,I');
		expect(closureNames()).toBe('');
		expect(closureNames('C')).toBe('C');
	});

	it('is depth-first, not breadth-first', () => {
		// BFS would give A,B,H,C,D,I.
		expect(closureNames('A')).not.toBe('A,B,H,C,D,I');
	});
});

describe('epsilonClosureTrace', () => {
	it('records seeds, followed edges, and skipped edges', () => {
		const { order, events } = epsilonClosureTrace(nfa, ids('F'));
		expect(names(nfa, order).join('')).toBe('FGABCDHI');
		const view = events.map(
			(e) => `${e.kind}:${nfa.states[e.state].name}${e.via === undefined ? '' : `@${e.via}`}`
		);
		expect(view).toEqual([
			'seed:F',
			'follow:G@5',
			'follow:A@7',
			'follow:B@6',
			'follow:C@2',
			'follow:D@3',
			'follow:H@8',
			'follow:I@10'
		]);
	});

	it('reports ε-edges into states already in the closure', () => {
		const { events } = epsilonClosureTrace(nfa, ids('E', 'G'));
		expect(events.map((e) => e.kind)).toContain('skip');
		const skip = events.find((e) => e.kind === 'skip')!;
		expect(nfa.states[skip.state].name).toBe('G');
	});

	it('follows ε-edges in creation order', () => {
		const a = automatonFromText(`
			start: S
			S ε Y
			S ε X
			X ε Z
		`);
		expect(names(a, epsilonClosure(a, [0]))).toEqual(['S', 'Y', 'X', 'Z']);
	});

	it('handles ε-cycles', () => {
		const a = automatonFromText(`
			start: A
			A ε B
			B ε C
			C ε A
		`);
		expect(names(a, epsilonClosure(a, [id(a, 'B')]))).toEqual(['B', 'C', 'A']);
	});
});

describe('move', () => {
	it('moves on one symbol without ε-closure', () => {
		expect(names(nfa, move(nfa, epsilonClosure(nfa, ids('A')), '1').targets)).toEqual(['E', 'J']);
		expect(names(nfa, move(nfa, epsilonClosure(nfa, ids('A')), '0').targets)).toEqual(['F']);
		expect(move(nfa, ids('E', 'G'), '1').targets).toEqual([]);
	});

	it('reports the transitions taken', () => {
		const r = move(nfa, ids('C', 'I'), CharSet.single('1'));
		expect(r.via).toEqual([0, 9]);
	});

	it('scans states in name order regardless of the order given', () => {
		expect(names(nfa, move(nfa, ids('I', 'C'), '1').targets)).toEqual(['E', 'J']);
	});

	it('uses natural name order (q2 before q10)', () => {
		const a = automatonFromText(`
			start: q10
			q10 a x
			q2 a y
			q2 a x
		`);
		const r = move(a, [id(a, 'q10'), id(a, 'q2')], 'a');
		expect(names(a, r.targets)).toEqual(['y', 'x']);
		expect(r.via).toEqual([1, 2, 0]);
	});

	it('moves on symbol classes', () => {
		const a = automatonFromText(`
			start: A
			A [a-z] B
			A [a-f] C
		`);
		expect(names(a, move(a, [0], CharSet.range('a', 'f')).targets)).toEqual(['B', 'C']);
		expect(names(a, move(a, [0], CharSet.range('g', 'z')).targets)).toEqual(['B']);
		expect(move(a, [0], CharSet.EMPTY).targets).toEqual([]);
	});

	it('moves on every symbol of a set that is not a class (union of the moves)', () => {
		const a = automatonFromText(`
			start: A
			A a B
			A b C
			A [x-z] D
		`);
		const r = move(a, [0], CharSet.of('ab'));
		expect(names(a, r.targets)).toEqual(['B', 'C']);
		expect(r.via).toEqual([0, 1]);
		expect(names(a, move(a, [0], CharSet.range('a', 'y')).targets)).toEqual(['B', 'C', 'D']);
		expect(move(a, [0], CharSet.of('cw')).targets).toEqual([]);
	});
});

describe('ClosureIndex', () => {
	it('ranks states by name', () => {
		const index = new ClosureIndex(nfa);
		expect(index.rank).toEqual(nfa.states.map((s) => s.id));
		expect(index.closure(ids('A'))).toEqual(epsilonClosure(nfa, ids('A')));
	});
});
