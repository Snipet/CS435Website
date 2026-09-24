import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import {
	alt,
	any,
	cat,
	chars,
	empty,
	eps,
	opt,
	plus,
	pow,
	ref,
	repeat,
	star,
	sym,
	type Regex
} from '../regex/ast';
import { enumerate } from './language';
import { accepts } from './simulate';
import { edgeList, names } from './test-helpers';
import { thompson, thompsonStatesThrough } from './thompson';

const lecture = () => cat(star(alt(sym('1'), sym('0'))), sym('1'));
const lang = (r: Regex, maxLength = 4, alphabet?: CharSet) =>
	enumerate(thompson(r, { alphabet }).nfa, { maxLength, limit: 100 }).strings;

describe('thompson: lecture golden (1 | 0)*1', () => {
	const { nfa, steps, positions, fragments } = thompson(lecture());

	it('has exactly the states A–J, start A, accept J', () => {
		expect(
			names(
				nfa,
				nfa.states.map((s) => s.id)
			)
		).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
		expect(nfa.states[nfa.start].name).toBe('A');
		expect(nfa.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['J']);
		nfa.states.forEach((s, i) => expect(s.id).toBe(i));
	});

	it('has exactly the slide’s 11 edges', () => {
		expect(new Set(edgeList(nfa))).toEqual(
			new Set([
				'A-ε->B',
				'A-ε->H',
				'B-ε->C',
				'B-ε->D',
				'C-1->E',
				'D-0->F',
				'E-ε->G',
				'F-ε->G',
				'G-ε->A',
				'H-ε->I',
				'I-1->J'
			])
		);
		expect(nfa.transitions).toHaveLength(11);
	});

	it('creates transitions in construction order', () => {
		expect(edgeList(nfa)).toEqual([
			'C-1->E',
			'D-0->F',
			'B-ε->C',
			'B-ε->D',
			'E-ε->G',
			'F-ε->G',
			'A-ε->B',
			'G-ε->A',
			'A-ε->H',
			'I-1->J',
			'H-ε->I'
		]);
		nfa.transitions.forEach((t, i) => expect(t.id).toBe(i));
	});

	it('lays states out on the grid (C above D, E above F)', () => {
		const at = (n: string) => positions.get(nfa.states.find((s) => s.name === n)!.id);
		expect(at('A')).toEqual({ x: 0, y: 42 });
		expect(at('B')).toEqual({ x: 96, y: 42 });
		expect(at('C')).toEqual({ x: 192, y: 0 });
		expect(at('D')).toEqual({ x: 192, y: 84 });
		expect(at('E')).toEqual({ x: 288, y: 0 });
		expect(at('F')).toEqual({ x: 288, y: 84 });
		expect(at('G')).toEqual({ x: 384, y: 42 });
		expect(at('H')).toEqual({ x: 480, y: 42 });
		expect(at('I')).toEqual({ x: 576, y: 0 });
		expect(at('J')).toEqual({ x: 672, y: 0 });
		expect(positions.size).toBe(10);
	});

	it('records one step per AST node in post-order', () => {
		expect(steps.map((s) => s.clause)).toEqual([
			'Atomic',
			'Atomic',
			'Choice/Alternation',
			'Iteration (Kleene closure)',
			'Atomic',
			'Concatenation'
		]);
		expect(steps.map((s) => s.path)).toEqual([[0, 0, 0], [0, 0, 1], [0, 0], [0], [1], []]);
		expect(fragments).toEqual(steps.map((s) => s.fragment));
	});

	it('reports new states, new transitions, demoted finals, and totals', () => {
		const view = steps.map((s) => ({
			fragment: [nfa.states[s.fragment.start].name, nfa.states[s.fragment.final].name],
			states: names(nfa, s.fragment.states).join(''),
			newStates: names(nfa, s.newStates).join(''),
			newTransitions: s.newTransitions,
			demoted: names(nfa, s.demoted).join(''),
			counts: [s.stateCount, s.transitionCount]
		}));
		expect(view).toEqual([
			{
				fragment: ['C', 'E'],
				states: 'CE',
				newStates: 'CE',
				newTransitions: [0],
				demoted: '',
				counts: [2, 1]
			},
			{
				fragment: ['D', 'F'],
				states: 'DF',
				newStates: 'DF',
				newTransitions: [1],
				demoted: '',
				counts: [4, 2]
			},
			{
				fragment: ['B', 'G'],
				states: 'BCDEFG',
				newStates: 'BG',
				newTransitions: [2, 3, 4, 5],
				demoted: 'EF',
				counts: [6, 6]
			},
			{
				fragment: ['A', 'H'],
				states: 'ABCDEFGH',
				newStates: 'AH',
				newTransitions: [6, 7, 8],
				demoted: 'G',
				counts: [8, 9]
			},
			{
				fragment: ['I', 'J'],
				states: 'IJ',
				newStates: 'IJ',
				newTransitions: [9],
				demoted: '',
				counts: [10, 10]
			},
			{
				fragment: ['A', 'J'],
				states: 'ABCDEFGHIJ',
				newStates: '',
				newTransitions: [10],
				demoted: 'H',
				counts: [10, 11]
			}
		]);
		for (const s of steps) expect(s.note).toBeTruthy();
		expect(steps[3].note).toContain('back to A');
	});

	it('lists the states created so far', () => {
		expect(names(nfa, [...thompsonStatesThrough(thompson(lecture()), 2)]).sort()).toEqual([
			'B',
			'C',
			'D',
			'E',
			'F',
			'G'
		]);
	});

	it('accepts exactly the strings that end in 1', () => {
		for (const s of ['1', '01', '101', '0001']) expect(accepts(nfa, s)).toBe(true);
		for (const s of ['', '0', '10', '110']) expect(accepts(nfa, s)).toBe(false);
	});
});

describe('thompson: basis clauses', () => {
	it('ε is s →ε f', () => {
		const { nfa } = thompson(eps());
		expect(edgeList(nfa)).toEqual(['A-ε->B']);
		expect(nfa.states[1].accepting).toBe(true);
		expect(lang(eps())).toEqual(['']);
	});

	it('a is s →a f', () => {
		const { nfa } = thompson(sym('a'));
		expect(edgeList(nfa)).toEqual(['A-a->B']);
		expect(lang(sym('a'))).toEqual(['a']);
	});

	it('ɸ is s, f with no transition', () => {
		const { nfa, steps } = thompson(empty());
		expect(nfa.states).toHaveLength(2);
		expect(nfa.transitions).toHaveLength(0);
		expect(steps[0].clause).toBe('Empty');
		expect(lang(empty())).toEqual([]);
	});

	it('a class is one transition labeled with the whole set', () => {
		const digit = CharSet.range('0', '9');
		const { nfa } = thompson(chars(digit, '[0-9]'));
		expect(nfa.transitions).toHaveLength(1);
		expect(nfa.transitions[0].label!.equals(digit)).toBe(true);
		expect(thompson(chars(CharSet.EMPTY)).nfa.transitions).toHaveLength(0);
	});

	it('Σ is one transition labeled with the alphabet', () => {
		const sigma = CharSet.of('01');
		const { nfa } = thompson(any(), { alphabet: sigma });
		expect(nfa.transitions).toHaveLength(1);
		expect(nfa.transitions[0].label!.equals(sigma)).toBe(true);
		expect(nfa.alphabet!.equals(sigma)).toBe(true);
	});

	it('Σ without an alphabet uses the symbols of the expression', () => {
		const { nfa } = thompson(cat(sym('a'), any(), sym('b')));
		const label = nfa.transitions.find((t) => t.label?.size === 2)!.label!;
		expect(label.equals(CharSet.of('ab'))).toBe(true);
		const alone = thompson(any());
		expect(alone.nfa.transitions).toHaveLength(0);
		expect(alone.steps[0].note).toContain('Σ is empty');
	});
});

describe('thompson: inductive clauses', () => {
	it('concatenation adds A.final →ε B.start without new states', () => {
		const { nfa, steps } = thompson(cat(sym('a'), sym('b')));
		expect(edgeList(nfa)).toEqual(['A-a->B', 'C-b->D', 'B-ε->C']);
		expect(steps[2].newStates).toEqual([]);
		expect(steps[2].demoted).toEqual([1]);
	});

	it('folds n-ary concatenation left to right', () => {
		const { nfa, steps } = thompson(cat(sym('a'), sym('b'), sym('c')));
		expect(edgeList(nfa)).toEqual(['A-a->B', 'C-b->D', 'E-c->F', 'B-ε->C', 'D-ε->E']);
		expect(steps.at(-1)!.note).toBe('ε-transition B → C, D → E joins the parts.');
	});

	it('multi-character literals are concatenations', () => {
		const { nfa } = thompson(sym('if'));
		expect(edgeList(nfa)).toEqual(['A-i->B', 'C-f->D', 'B-ε->C']);
		expect(lang(sym('if'))).toEqual(['if']);
	});

	it('alternation adds new s, f with four ε-transitions', () => {
		const { nfa, positions } = thompson(alt(sym('a'), sym('b')));
		expect(edgeList(nfa)).toEqual(['B-a->D', 'C-b->E', 'A-ε->B', 'A-ε->C', 'D-ε->F', 'E-ε->F']);
		expect(positions.get(0)).toEqual({ x: 0, y: 42 });
		expect(positions.get(5)).toEqual({ x: 288, y: 42 });
	});

	it('folds n-ary alternation left to right: (A | B) | C', () => {
		const { nfa } = thompson(alt(sym('a'), sym('b'), sym('c')));
		expect(nfa.states).toHaveLength(10);
		expect(nfa.transitions.filter((t) => t.label === null)).toHaveLength(8);
		expect(lang(alt(sym('a'), sym('b'), sym('c')))).toEqual(['a', 'b', 'c']);
		// Outer start → inner union start and → c's start.
		const start = nfa.start;
		const outs = nfa.transitions.filter((t) => t.from === start).map((t) => t.to);
		expect(outs).toHaveLength(2);
	});

	it('star goes back to the new start and has no A.final →ε f', () => {
		const { nfa } = thompson(star(sym('a')));
		expect(edgeList(nfa)).toEqual(['B-a->C', 'A-ε->B', 'C-ε->A', 'A-ε->D']);
		expect(lang(star(sym('a')), 3)).toEqual(['', 'a', 'aa', 'aaa']);
	});

	it('every fragment has one start and one final; only the overall final accepts', () => {
		const r = cat(plus(alt(sym('a'), eps())), opt(sym('b')), pow(sym('c'), 2));
		const { nfa, fragments } = thompson(r);
		expect(nfa.states.filter((s) => s.accepting)).toHaveLength(1);
		for (const f of fragments) {
			expect(f.states).toContain(f.start);
			expect(f.states).toContain(f.final);
			// Nothing leaves a fragment's final inside the fragment.
			const inside = new Set(f.states);
			expect(nfa.transitions.some((t) => t.from === f.final && inside.has(t.to))).toBe(
				f.final === f.start
			);
		}
	});
});

describe('thompson: derived forms', () => {
	it('A+ = A A* with a fresh copy', () => {
		const { nfa, steps } = thompson(plus(sym('a')));
		expect(nfa.states).toHaveLength(6);
		expect(edgeList(nfa)).toEqual(['A-a->B', 'D-a->E', 'C-ε->D', 'E-ε->C', 'C-ε->F', 'B-ε->C']);
		expect(steps.map((s) => s.clause)).toEqual(['Atomic', 'Positive closure']);
		expect(steps[1].newStates).toHaveLength(4);
		expect(lang(plus(sym('a')), 3)).toEqual(['a', 'aa', 'aaa']);
	});

	it('A? = A | ε', () => {
		const { nfa } = thompson(opt(sym('a')));
		expect(nfa.states).toHaveLength(6);
		expect(lang(opt(sym('a')))).toEqual(['', 'a']);
	});

	it('A^n = n fresh copies; A^0 = ε', () => {
		const three = thompson(pow(sym('a'), 3));
		expect(three.nfa.states).toHaveLength(6);
		expect(edgeList(three.nfa)).toEqual(['A-a->B', 'C-a->D', 'E-a->F', 'B-ε->C', 'D-ε->E']);
		expect(lang(pow(sym('a'), 3))).toEqual(['aaa']);
		const zero = thompson(pow(sym('a'), 0));
		expect(edgeList(zero.nfa)).toEqual(['A-ε->B']);
		expect(zero.steps).toHaveLength(1);
		expect(lang(pow(alt(sym('0'), sym('1')), 2))).toEqual(['00', '01', '10', '11']);
		expect(thompson(pow(sym('a'), 1)).steps[1].newStates).toEqual([]);
	});

	it('A{n,m} = n copies then (m − n) copies of A?', () => {
		expect(lang(repeat(sym('a'), 2, 3), 5)).toEqual(['aa', 'aaa']);
		expect(lang(repeat(sym('a'), 0, 2), 5)).toEqual(['', 'a', 'aa']);
		// 2 copies (4) + one A? (a copy: 2, ε-fragment: 2, s/f: 2) = 10 states
		expect(thompson(repeat(sym('a'), 2, 3)).nfa.states).toHaveLength(10);
	});

	it('A{n,} = n copies then A*', () => {
		expect(lang(repeat(sym('a'), 2, null), 4)).toEqual(['aa', 'aaa', 'aaaa']);
		expect(lang(repeat(sym('a'), 0, null), 2)).toEqual(['', 'a', 'aa']);
	});

	it('definition references expand freshly per use', () => {
		const digit = chars(CharSet.range('0', '9'));
		const d = () => ref('digit', digit);
		const { nfa, steps } = thompson(cat(d(), d()));
		expect(nfa.states).toHaveLength(4);
		expect(steps.map((s) => s.clause)).toEqual([
			'Character class',
			'Regular definition',
			'Character class',
			'Regular definition',
			'Concatenation'
		]);
		expect(steps[1].newStates).toEqual([]);
		expect(steps[1].fragment.start).toBe(steps[0].fragment.start);
		expect(steps[1].note).toBe('digit stands for its definition.');
	});

	it('names states past Z as AA, AB, …', () => {
		const { nfa } = thompson(sym('abcdefghijklmn'));
		expect(nfa.states).toHaveLength(28);
		expect(nfa.states[26].name).toBe('AA');
		expect(nfa.states[27].name).toBe('AB');
	});
});
