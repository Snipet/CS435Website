import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, star, sym } from '../regex/ast';
import {
	acceptingStates,
	alphabetOf,
	analyzeDeterminism,
	automatonFromText,
	complete,
	compareNames,
	coReachableStates,
	formatAutomatonText,
	formatLabelText,
	incoming,
	isDeterministic,
	isLabeled,
	labelUnion,
	letterName,
	outgoing,
	outgoingIndex,
	parseAutomatonText,
	reachableStates,
	removeUnreachable,
	restrictStates,
	sortByName,
	stateNamed,
	symbolClasses,
	transitionTable
} from './core';
import { minimize } from './minimize';
import { subsetConstruction } from './subset';
import { edgeList, id, names } from './test-helpers';
import { thompson } from './thompson';
import type { Automaton } from './types';

const lectureNfa = () => thompson(cat(star(alt(sym('1'), sym('0'))), sym('1'))).nfa;

describe('letterName', () => {
	it('counts A … Z, AA, AB, …', () => {
		expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letterName)).toEqual([
			'A',
			'B',
			'Z',
			'AA',
			'AB',
			'AZ',
			'BA',
			'ZZ',
			'AAA'
		]);
	});
});

describe('compareNames / sortByName / stateNamed', () => {
	it('orders digit runs numerically and letter names like letterName', () => {
		const sorted = ['q10', 'q2', 'AA', 'Z', 'B', 'q1', 'trap'].sort(compareNames);
		expect(sorted).toEqual(['B', 'Z', 'AA', 'q1', 'q2', 'q10', 'trap']);
		expect(compareNames('A', 'A')).toBe(0);
		expect(compareNames('q01', 'q1')).toBeGreaterThan(0);
		expect(compareNames('s', 's1')).toBeLessThan(0);
	});

	it('is a total order (transitive and antisymmetric), so sorting ignores input order', () => {
		const sample = [
			'Z',
			'AA',
			'AA0',
			'B1',
			'AB',
			'Ab',
			'ab',
			'A',
			'A1',
			'A01',
			'A10',
			'a1',
			'q0',
			'q00',
			"q0'",
			'q10',
			'{A, B}',
			'{AA, B}',
			'∅',
			'trap',
			'trap2',
			'',
			'1',
			'01',
			'_',
			'@',
			' x',
			'ABCDHI',
			'EJGABCDHI',
			'FGABCDHI'
		];
		const sign = (x: number) => Math.sign(x);
		for (const x of sample) {
			expect(compareNames(x, x)).toBe(0);
			for (const y of sample) {
				if (x !== y) expect(compareNames(x, y)).not.toBe(0);
				expect(sign(compareNames(x, y)) + sign(compareNames(y, x))).toBe(0);
				for (const z of sample)
					if (compareNames(x, y) < 0 && compareNames(y, z) < 0)
						expect(compareNames(x, z), `${x} < ${y} < ${z}`).toBeLessThan(0);
			}
		}
		// The cycles Z < AA < AA0 < Z and Z < AA < B1 < Z are gone.
		expect(['AA0', 'Z', 'AA'].sort(compareNames)).toEqual(['Z', 'AA', 'AA0']);
		const machine = automatonFromText('states: Z AA B1\nstart: Z');
		const orders = [
			[0, 1, 2],
			[1, 2, 0],
			[2, 0, 1],
			[2, 1, 0]
		].map((perm) => names(machine, sortByName(machine, perm)).join(' '));
		expect(new Set(orders)).toEqual(new Set(['B1 Z AA']));
	});

	it('sorts ids by name and finds states', () => {
		const a = automatonFromText('start: q10\nq10 a q2\nq2 a q1');
		expect(names(a, sortByName(a, [0, 1, 2]))).toEqual(['q1', 'q2', 'q10']);
		expect(stateNamed(a, 'q2')).toBe(1);
		expect(stateNamed(a, 'nope')).toBeUndefined();
	});
});

describe('alphabet, classes, adjacency', () => {
	const a = automatonFromText(`
		start: A
		accept: B
		A [a-z] B
		A i C
		C ε B
	`);

	it('alphabetOf is the union of labels, plus the declared Σ', () => {
		expect(alphabetOf(a).equals(CharSet.range('a', 'z'))).toBe(true);
		const declared = { ...a, alphabet: CharSet.range('0', '9') };
		expect(
			alphabetOf(declared).equals(CharSet.range('0', '9').union(CharSet.range('a', 'z')))
		).toBe(true);
	});

	it('symbolClasses splits overlapping labels into disjoint classes', () => {
		const classes = symbolClasses(a);
		expect(classes).toHaveLength(2);
		expect(classes[0].equals(CharSet.range('a', 'z').subtract(CharSet.single('i')))).toBe(true);
		expect(classes[1].equals(CharSet.single('i'))).toBe(true);
		expect(symbolClasses(a, [CharSet.range('a', 'c')])).toHaveLength(3);
	});

	it('outgoing / incoming / acceptingStates', () => {
		expect(outgoing(a, 0).map((t) => t.id)).toEqual([0, 1]);
		expect(incoming(a, 1).map((t) => t.id)).toEqual([0, 2]);
		expect(acceptingStates(a)).toEqual([1]);
	});

	it('isLabeled is true only for transitions with a non-empty label', () => {
		const t = (label: CharSet | null) => ({ id: 0, from: 0, to: 1, label });
		expect(isLabeled(t(null))).toBe(false);
		expect(isLabeled(t(CharSet.EMPTY))).toBe(false);
		expect(isLabeled(t(CharSet.single('a')))).toBe(true);
	});

	it('labelUnion joins overlapping labels and ignores ε and the declared Σ', () => {
		const b = automatonFromText('start: A\nalphabet: [0-9]\nA [a-f] B\nA [d-k] C\nB ε C\nC x A');
		expect(labelUnion(b).equals(CharSet.range('a', 'k').union(CharSet.single('x')))).toBe(true);
		expect(labelUnion(automatonFromText('start: A\nA ε B')).isEmpty).toBe(true);
	});

	it('outgoingIndex lists each state’s transitions by creation id', () => {
		const b: Automaton = {
			states: [0, 1, 2].map((id) => ({ id, name: letterName(id), accepting: false })),
			// Stored out of id order, plus one transition from a state that does not exist.
			transitions: [
				{ id: 3, from: 0, to: 2, label: null },
				{ id: 1, from: 0, to: 1, label: CharSet.single('a') },
				{ id: 2, from: 2, to: 0, label: CharSet.single('b') },
				{ id: 0, from: 0, to: 0, label: CharSet.single('c') },
				{ id: 4, from: 7, to: 0, label: null }
			],
			start: 0
		};
		const out = outgoingIndex(b);
		expect(out.map((ts) => ts.map((t) => t.id))).toEqual([[0, 1, 3], [], [2]]);
		expect(outgoingIndex(automatonFromText('states: A\nstart: A'))).toEqual([[]]);
	});
});

describe('analyzeDeterminism', () => {
	it('recognizes a total DFA', () => {
		const a = automatonFromText('start: A\naccept: B\nA 0 B\nA 1 A\nB 0,1 B');
		expect(analyzeDeterminism(a)).toEqual({
			kind: 'dfa',
			epsilonMoves: [],
			conflicts: [],
			missing: []
		});
		expect(isDeterministic(a)).toBe(true);
	});

	it('recognizes a partial DFA and lists missing symbols', () => {
		const a = automatonFromText('start: q0\naccept: q1\nq0 1 q0\nq0 0 q1');
		const r = analyzeDeterminism(a);
		expect(r.kind).toBe('partial-dfa');
		expect(r.missing).toHaveLength(1);
		expect(r.missing[0].state).toBe(1);
		expect(r.missing[0].symbols.equals(CharSet.of('01'))).toBe(true);
		expect(analyzeDeterminism({ ...a, alphabet: CharSet.of('012') }).missing[0].symbols.size).toBe(
			1
		);
	});

	it('reports ε-moves and conflicts', () => {
		const r = analyzeDeterminism(lectureNfa());
		expect(r.kind).toBe('nfa');
		expect(r.epsilonMoves).toHaveLength(8);
		const b = automatonFromText('start: A\nA [a-c] B\nA [b-d] C\nA x B\nA x B');
		const rb = analyzeDeterminism(b);
		expect(rb.kind).toBe('nfa');
		expect(rb.conflicts).toHaveLength(1);
		expect(rb.conflicts[0].symbols.equals(CharSet.of('bc'))).toBe(true);
		expect(rb.conflicts[0].transitions.map((t) => t.id)).toEqual([0, 1]);
		expect(isDeterministic(b)).toBe(false);
	});

	it('does not count duplicate transitions to the same state as a conflict', () => {
		const a = automatonFromText('start: A\nA 0 B\nA 0,1 B\nB 0,1 B');
		expect(analyzeDeterminism(a).kind).toBe('dfa');
	});
});

describe('complete', () => {
	it('adds a trap for missing symbols', () => {
		const a = automatonFromText('start: q0\naccept: q1\nq0 1 q0\nq0 0 q1');
		const { automaton, trap } = complete(a);
		expect(trap).toBe(2);
		expect(automaton.states[2]).toEqual({ id: 2, name: 'trap', accepting: false, trap: true });
		expect(edgeList(automaton).slice(2)).toEqual(['q1-0,1->trap', 'trap-0,1->trap']);
		expect(analyzeDeterminism(automaton).kind).toBe('dfa');
		expect(a.states).toHaveLength(2);
	});

	it('picks a fresh trap name', () => {
		const a = automatonFromText('start: trap\ntrap 0 x');
		expect(complete(a).automaton.states.at(-1)!.name).toBe('trap2');
		expect(complete(a, { trapName: '∅' }).automaton.states.at(-1)!.name).toBe('∅');
	});

	it('returns total machines unchanged', () => {
		const a = automatonFromText('start: A\nA 0 A');
		expect(complete(a)).toEqual({ automaton: a, trap: null });
	});
});

describe('reachability', () => {
	const a = automatonFromText(`
		states: A B C D
		start: A
		accept: C
		A x B
		B ε C
		D x C
		A [] D
	`);

	it('reachableStates follows ε and labeled transitions', () => {
		expect([...reachableStates(a)].sort()).toEqual([0, 1, 2]);
	});

	it('coReachableStates finds states that can reach acceptance', () => {
		expect([...coReachableStates(a)].sort()).toEqual([0, 1, 2, 3]);
	});

	it('removeUnreachable renumbers and maps ids', () => {
		const { automaton, removed, map } = removeUnreachable(a);
		expect(
			names(
				automaton,
				automaton.states.map((s) => s.id)
			)
		).toEqual(['A', 'B', 'C']);
		expect(removed).toEqual([3]);
		expect([...map]).toEqual([
			[0, 0],
			[1, 1],
			[2, 2]
		]);
		expect(automaton.transitions.map((t) => t.id)).toEqual([0, 1]);
	});

	it('restrictStates keeps the start', () => {
		expect(() => restrictStates(a, new Set([1]))).toThrow();
	});
});

describe('transitionTable', () => {
	it('lays out the lecture NFA with an ε column', () => {
		const nfa = lectureNfa();
		const { classes, rows } = transitionTable(nfa);
		expect(classes.map((c) => c.firstChar())).toEqual(['0', '1']);
		const view = rows.map(
			(r) =>
				`${nfa.states[r.state].name}: ${r.cells.map((c) => names(nfa, c).join('') || '-').join(' ')} ε=${names(nfa, r.epsilon).join('')}`
		);
		expect(view).toEqual([
			'A: - - ε=BH',
			'B: - - ε=CD',
			'C: - E ε=',
			'D: F - ε=',
			'E: - - ε=G',
			'F: - - ε=G',
			'G: - - ε=A',
			'H: - - ε=I',
			'I: - J ε=',
			'J: - - ε='
		]);
	});

	it('uses given classes', () => {
		const a = automatonFromText('start: A\nA [a-z] B');
		const { rows } = transitionTable(a, [CharSet.range('a', 'm'), CharSet.range('n', 'z')]);
		expect(rows[0].cells).toEqual([[1], [1]]);
	});
});

describe('parseAutomatonText', () => {
	it('reads states, start, accept, and transitions in order of first mention', () => {
		const { automaton, diagnostics } = parseAutomatonText(`
			# a comment
			start: q0
			accept: q2   # trailing comment
			q0 0,1 q0
			q0 0 q1
			q1 1 q2
		`);
		expect(diagnostics).toEqual([]);
		expect(automaton!.states.map((s) => [s.name, s.accepting])).toEqual([
			['q0', false],
			['q2', true],
			['q1', false]
		]);
		expect(edgeList(automaton!)).toEqual(['q0-0,1->q0', 'q0-0->q1', 'q1-1->q2']);
	});

	it('reads ε, quoted symbols, classes, and the arrow form', () => {
		const a = automatonFromText(`
			start: A
			A ε B
			A eps C
			B ' ' C
			B ',' D
			C [a-z] D
			D [^\\n] E
			E -0,1-> F
			F -ε-> G
			G '\\'' H
			H 'x',y,[0-2] I
		`);
		const labels = a.transitions.map((t) => t.label);
		expect(labels[0]).toBeNull();
		expect(labels[1]).toBeNull();
		expect(labels[2]!.equals(CharSet.single(' '))).toBe(true);
		expect(labels[3]!.equals(CharSet.single(','))).toBe(true);
		expect(labels[4]!.equals(CharSet.range('a', 'z'))).toBe(true);
		expect(labels[5]!.equals(CharSet.single('\n').complement())).toBe(true);
		expect(labels[6]!.equals(CharSet.of('01'))).toBe(true);
		expect(labels[7]).toBeNull();
		expect(labels[8]!.equals(CharSet.single("'"))).toBe(true);
		expect(labels[9]!.equals(CharSet.of('xy012'))).toBe(true);
	});

	it('splits a mixed ε and symbol label into two transitions', () => {
		const a = automatonFromText('start: A\nA ε,a B\nA b,ε C');
		expect(edgeList(a)).toEqual(['A-ε->B', 'A-a->B', 'A-b->C', 'A-ε->C']);
	});

	it('reads a states line, double-quoted names, and an alphabet', () => {
		const a = automatonFromText(`
			states: "{A, B}" "" x
			start: x
			accept: "{A, B}", x
			alphabet: 0,1
			"{A, B}" 0 ""
		`);
		expect(a.states.map((s) => s.name)).toEqual(['{A, B}', '', 'x']);
		expect(a.start).toBe(2);
		expect(acceptingStates(a)).toEqual([0, 2]);
		expect(a.alphabet!.equals(CharSet.of('01'))).toBe(true);
	});

	it('defaults the start to the first state with a warning', () => {
		const { automaton, diagnostics } = parseAutomatonText('B 0 C');
		expect(automaton!.start).toBe(0);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].severity).toBe('warning');
	});

	it('reports errors with spans', () => {
		const text = "start: A\nA ab B\nA 'x C\nfoo: A\nA 0\nstart: B\nA [b-a] B";
		const { automaton, diagnostics } = parseAutomatonText(text);
		expect(automaton).toBeNull();
		const errors = diagnostics.filter((d) => d.severity === 'error');
		expect(errors).toHaveLength(6);
		const at = (i: number) => text.slice(errors[i].span!.start, errors[i].span!.end);
		expect(at(0)).toBe('ab');
		expect(errors[0].message).toContain('not one symbol');
		expect(errors[1].message).toContain('Unterminated');
		expect(at(2)).toBe('foo:');
		expect(at(3)).toBe('A 0');
		expect(at(4)).toBe('B');
		expect(at(5)).toBe('[b-a]');
	});

	it('explains other mistakes', () => {
		const msg = (text: string) => parseAutomatonText(text).diagnostics[0]?.message ?? '';
		expect(msg('')).toContain('No states');
		expect(msg('start: A B')).toContain('exactly one');
		expect(msg("start: A\nA 'ab' B")).toContain('exactly one symbol');
		expect(msg('start: A\nA -> B')).toContain('inside the arrow');
		expect(msg("start: A\n'A' 0 B")).toContain('double quotes');
		expect(msg('start: A\nA 0,,1 B')).toContain('Empty symbol');
		expect(msg('alphabet: ε')).toContain('not a symbol');
		expect(parseAutomatonText('start: A\nA [] B').diagnostics[0].severity).toBe('warning');
	});

	it('reads primed names bare; quotes open only at the start of a word or item', () => {
		const { automaton, diagnostics } = parseAutomatonText(
			"start: q0\naccept: q0',q1\nq0 0 q0'\nq0' 1 q1\nq1 -'x',y-> q0''"
		);
		expect(diagnostics).toEqual([]);
		expect(automaton!.states.map((s) => s.name)).toEqual(['q0', "q0'", 'q1', "q0''"]);
		expect(acceptingStates(automaton!)).toEqual([1, 2]);
		expect(automaton!.transitions[2].label!.equals(CharSet.of('xy'))).toBe(true);
		expect(formatAutomatonText(automaton!)).toContain("q0' 1 q1");
	});

	it('automatonFromText throws on errors', () => {
		expect(() => automatonFromText('A ab B')).toThrow(/not one symbol/);
	});
});

describe('formatAutomatonText', () => {
	const roundTrip = (a: Automaton) => {
		const text = formatAutomatonText(a);
		const { automaton, diagnostics } = parseAutomatonText(text);
		// An empty label round-trips as [] with a warning.
		expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
		expect(automaton!.states.map((s) => [s.id, s.name, s.accepting])).toEqual(
			a.states.map((s) => [s.id, s.name, s.accepting])
		);
		expect(automaton!.start).toBe(a.start);
		expect(automaton!.transitions.map((t) => [t.id, t.from, t.to, t.label?.key() ?? null])).toEqual(
			a.transitions.map((t, i) => [i, t.from, t.to, t.label?.key() ?? null])
		);
		expect(automaton!.alphabet?.key()).toBe(a.alphabet?.key());
		return text;
	};

	it('writes the simple format', () => {
		const a = automatonFromText('start: q0\naccept: q1\nq0 1 q0\nq0 0 q1');
		expect(formatAutomatonText(a)).toBe('start: q0\naccept: q1\nq0 1 q0\nq0 0 q1\n');
	});

	it('round-trips the Thompson NFA (with a states line)', () => {
		const text = roundTrip(lectureNfa());
		expect(text.split('\n')[0]).toBe('states: A B C D E F G H I J');
		expect(text).toContain('A ε B');
	});

	it('round-trips subset and minimized DFAs', () => {
		const dfa = subsetConstruction(lectureNfa(), { naming: 'sorted-set', includeEmpty: true }).dfa;
		expect(roundTrip(dfa)).toContain('"{A, B, C, D, H, I}"');
		roundTrip(minimize(dfa).dfa);
	});

	it('round-trips awkward names and symbols', () => {
		const labels = [
			CharSet.single(' '),
			CharSet.of(',#'),
			CharSet.single("'"),
			CharSet.single('"'),
			CharSet.single('-'),
			CharSet.of('->'),
			CharSet.single('\n'),
			CharSet.single('\t').complement(),
			CharSet.range('a', 'z'),
			CharSet.of('[]\\'),
			CharSet.single(':'),
			CharSet.single('ε'),
			CharSet.single('😀'),
			CharSet.range(0, 0x20),
			CharSet.EMPTY
		];
		const stateNames = ['start', '', 'a b', 'q"x', '#1', '-', 'x:', 'ε', 'A,B'];
		const a: Automaton = {
			states: stateNames.map((name, id) => ({ id, name, accepting: id % 2 === 0 })),
			transitions: labels.map((label, id) => ({
				id,
				from: id % stateNames.length,
				to: (id * 7 + 3) % stateNames.length,
				label
			})),
			start: 3,
			alphabet: CharSet.range(0, 0x7f)
		};
		a.transitions.push({ id: labels.length, from: 0, to: 1, label: null });
		roundTrip(a);
	});

	it('gives empty and repeated names fresh names instead of merging states', () => {
		const blank = automatonFromText('states: A B C\nstart: A\naccept: C\nA 0 B\nB 1 C');
		for (const s of blank.states) s.name = '';
		const text = formatAutomatonText(blank);
		expect(text).toBe('states: A B C\nstart: A\naccept: C\nA 0 B\nB 1 C\n');
		const back = automatonFromText(text);
		expect(back.states).toHaveLength(3);
		expect(edgeList(back)).toEqual(['A-0->B', 'B-1->C']);

		// The first "x" keeps its name; the second is renamed past the taken "B".
		const dup: Automaton = {
			states: [
				{ id: 0, name: 'x', accepting: false },
				{ id: 1, name: 'x', accepting: true },
				{ id: 2, name: 'B', accepting: false }
			],
			transitions: [
				{ id: 0, from: 0, to: 1, label: CharSet.single('a') },
				{ id: 1, from: 1, to: 2, label: null }
			],
			start: 0
		};
		const again = automatonFromText(formatAutomatonText(dup));
		expect(again.states.map((s) => s.name)).toEqual(['x', 'B2', 'B']);
		expect(again.transitions.map((t) => [t.from, t.to])).toEqual([
			[0, 1],
			[1, 2]
		]);
		expect(acceptingStates(again)).toEqual([1]);

		// A single '' is a valid name and is kept.
		const one = { ...dup, states: dup.states.map((s, i) => ({ ...s, name: ['', 'y', 'z'][i] })) };
		expect(automatonFromText(formatAutomatonText(one)).states.map((s) => s.name)).toEqual([
			'',
			'y',
			'z'
		]);
	});

	it('formats labels', () => {
		expect(formatLabelText(CharSet.of('01'))).toBe('0,1');
		expect(formatLabelText(CharSet.single(' '))).toBe("' '");
		expect(formatLabelText(CharSet.range('a', 'z'))).toBe('[a-z]');
		expect(formatLabelText(CharSet.EMPTY)).toBe('[]');
	});
});

describe('id helper', () => {
	it('finds states by name', () => {
		expect(id(lectureNfa(), 'J')).toBe(9);
	});
});
