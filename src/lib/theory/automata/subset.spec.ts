import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, star, sym } from '../regex/ast';
import { analyzeDeterminism, automatonFromText } from './core';
import { accepts } from './simulate';
import { subsetAccept, subsetConstruction } from './subset';
import { edgeList, names } from './test-helpers';
import { thompson } from './thompson';

const lectureNfa = () => thompson(cat(star(alt(sym('1'), sym('0'))), sym('1'))).nfa;

describe('subsetConstruction: lecture golden', () => {
	const nfa = lectureNfa();
	const { dfa, classes, empty, steps } = subsetConstruction(nfa);

	it('has exactly ABCDHI (start), FGABCDHI, EJGABCDHI (accepting)', () => {
		expect(dfa.states.map((s) => s.name)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(dfa.states[dfa.start].name).toBe('ABCDHI');
		expect(dfa.states.map((s) => s.accepting)).toEqual([false, false, true]);
		expect(empty).toBeNull();
	});

	it('has exactly the slide’s six transitions', () => {
		expect(edgeList(dfa)).toEqual([
			'ABCDHI-0->FGABCDHI',
			'ABCDHI-1->EJGABCDHI',
			'FGABCDHI-0->FGABCDHI',
			'FGABCDHI-1->EJGABCDHI',
			'EJGABCDHI-0->FGABCDHI',
			'EJGABCDHI-1->EJGABCDHI'
		]);
		expect(analyzeDeterminism(dfa).kind).toBe('dfa');
	});

	it('keeps each subset in discovery order', () => {
		expect(names(nfa, dfa.states[2].subset!).join('')).toBe('EJGABCDHI');
		expect(classes.map((c) => c.firstChar())).toEqual(['0', '1']);
	});

	it('records start, move, closure, target, done steps with running totals', () => {
		expect(steps[0].kind).toBe('start');
		expect(steps.at(-1)!.kind).toBe('done');
		expect(steps.map((s) => s.kind).slice(1, 4)).toEqual(['move', 'closure', 'target']);
		// 3 states × 2 classes × 3 steps + start + done
		expect(steps).toHaveLength(20);
		const targets = steps.filter((s) => s.kind === 'target');
		expect(targets.map((t) => (t.kind === 'target' ? t.isNew : null))).toEqual([
			true,
			true,
			false,
			false,
			false,
			false
		]);
		expect(steps.map((s) => s.dfaStates)).toEqual([
			1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3
		]);
		expect(steps.at(-1)!.dfaTransitions).toBe(6);
		const move = steps[1];
		if (move.kind !== 'move') throw new Error('expected a move step');
		expect(names(nfa, move.targets)).toEqual(['F']);
		expect(move.via).toEqual([1]);
	});

	it('accepts the same language as the NFA', () => {
		for (const s of ['', '0', '1', '01', '10', '0101', '1110'])
			expect(accepts(dfa, s)).toBe(accepts(nfa, s));
	});
});

describe('subsetConstruction: textbook NFAs', () => {
	it('(0|1)*00 needs 3 DFA states', () => {
		const nfa = automatonFromText(`
			start: n0
			accept: n2
			n0 0,1 n0
			n0 0 n1
			n1 0 n2
		`);
		const { dfa } = subsetConstruction(nfa);
		expect(dfa.states).toHaveLength(3);
		expect(dfa.states.filter((s) => s.accepting)).toHaveLength(1);
		expect(accepts(dfa, '100')).toBe(true);
		expect(accepts(dfa, '1001')).toBe(false);
	});

	it('(0|1)*1(0|1)(0|1) needs 8 DFA states, 4 accepting', () => {
		const nfa = automatonFromText(`
			start: n0
			accept: n3
			n0 0,1 n0
			n0 1 n1
			n1 0,1 n2
			n2 0,1 n3
		`);
		const { dfa } = subsetConstruction(nfa);
		expect(dfa.states).toHaveLength(8);
		expect(dfa.states.filter((s) => s.accepting)).toHaveLength(4);
		expect(analyzeDeterminism(dfa).kind).toBe('dfa');
		// Names are too long for concatenation, so set notation is used.
		expect(dfa.states[0].name).toBe('{n0}');
	});
});

describe('subsetConstruction: options', () => {
	const nfa = automatonFromText(`
		start: A
		accept: C
		A a B
		A a C
		B b C
	`);

	it('names states by sorted set or number', () => {
		expect(subsetConstruction(nfa, { naming: 'sorted-set' }).dfa.states.map((s) => s.name)).toEqual(
			['{A}', '{B, C}', '{C}']
		);
		expect(subsetConstruction(nfa, { naming: 'numbered' }).dfa.states.map((s) => s.name)).toEqual([
			'D0',
			'D1',
			'D2'
		]);
		expect(subsetConstruction(nfa).dfa.states.map((s) => s.name)).toEqual(['A', 'BC', 'C']);
	});

	it('omits the empty set by default', () => {
		const { dfa, empty } = subsetConstruction(nfa);
		expect(empty).toBeNull();
		expect(analyzeDeterminism(dfa).kind).toBe('partial-dfa');
		const target = subsetConstruction(nfa).steps.find((s) => s.kind === 'target' && s.to === null);
		expect(target).toBeDefined();
	});

	it('adds one ∅ state with self-loops when asked', () => {
		const { dfa, empty } = subsetConstruction(nfa, { includeEmpty: true, naming: 'numbered' });
		expect(empty).not.toBeNull();
		expect(dfa.states[empty!].name).toBe('∅');
		expect(dfa.states[empty!].subset).toEqual([]);
		expect(dfa.states.filter((s) => s.name === '∅')).toHaveLength(1);
		const loops = dfa.transitions.filter((t) => t.from === empty);
		expect(loops.every((t) => t.to === empty)).toBe(true);
		expect(loops).toHaveLength(2);
		expect(analyzeDeterminism(dfa).kind).toBe('dfa');
		expect(dfa.states.map((s) => s.name)).toEqual(['D0', 'D1', '∅', 'D2']);
	});

	it('uses set notation when an NFA name is longer than one character', () => {
		const a = automatonFromText(`
			start: AA
			accept: B
			AA x B
			AA x AA
		`);
		expect(subsetConstruction(a).dfa.states.map((s) => s.name)).toEqual(['{AA}', '{B, AA}']);
	});

	it('merges symbols into classes', () => {
		const a = automatonFromText(`
			start: A
			accept: B
			A [a-z] B
			A x C
		`);
		const { classes, dfa } = subsetConstruction(a);
		expect(classes).toHaveLength(2);
		expect(classes[1].equals(CharSet.single('x'))).toBe(true);
		expect(dfa.states.map((s) => s.name)).toEqual(['A', 'B', 'BC']);
	});
});

describe('subsetAccept', () => {
	it('reports the lowest rule index among accepting NFA states', () => {
		const a = automatonFromText(`
			start: S
			accept: X Y
			S ε X
			S ε Y
		`);
		a.states[1].accept = { rule: 3, token: 'Identifier' };
		a.states[2].accept = { rule: 1, token: 'If' };
		expect(subsetAccept(a, [1, 2])).toEqual({ rule: 1, token: 'If' });
		expect(subsetAccept(a, [0])).toBeUndefined();
		const { dfa } = subsetConstruction(a);
		expect(dfa.states[0].accept).toEqual({ rule: 1, token: 'If' });
	});
});
