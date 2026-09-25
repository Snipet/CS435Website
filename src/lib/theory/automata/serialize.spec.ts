import { describe, expect, it } from 'vitest';
import { CharSet } from '../charset';
import { alt, cat, chars, star, sym } from '../regex/ast';
import { epsilonClosureTrace } from './closure';
import { automatonFromText } from './core';
import {
	automatonFromPlain,
	automatonToPlain,
	charSetFromPlain,
	charSetToPlain,
	CharSetInterner,
	closureEventsFromPlain,
	closureEventsToPlain,
	subsetResultFromPlain,
	subsetResultToPlain
} from './serialize';
import { accepts } from './simulate';
import { subsetConstruction } from './subset';
import { thompson } from './thompson';

const lectureNfa = () => thompson(cat(star(alt(sym('1'), sym('0'))), sym('1'))).nfa;

describe('CharSet plain form', () => {
	it('round-trips through its ranges', () => {
		const set = CharSet.of('abc').union(CharSet.range('0', '9'));
		const plain = charSetToPlain(set);
		expect(plain).toEqual([
			[48, 57],
			[97, 99]
		]);
		const back = charSetFromPlain(structuredClone(plain));
		expect(back).toBeInstanceOf(CharSet);
		expect(back.equals(set)).toBe(true);
	});

	it('revives a CharSet that went through structured clone', () => {
		const cloned = structuredClone(CharSet.of('xy'));
		// The clone keeps the ranges but not the class.
		expect(cloned).not.toBeInstanceOf(CharSet);
		expect('has' in cloned).toBe(false);
		const back = charSetFromPlain(cloned);
		expect(back.has('x')).toBe(true);
		expect(back.has('z')).toBe(false);
	});

	it('gives CharSet.EMPTY for no ranges and returns a real CharSet unchanged', () => {
		expect(charSetFromPlain([])).toBe(CharSet.EMPTY);
		const set = CharSet.single('q');
		expect(charSetFromPlain(set)).toBe(set);
	});

	it('interns equal sets as one object', () => {
		const seed = CharSet.of('01');
		const intern = new CharSetInterner([seed]);
		expect(intern.get([[48, 49]])).toBe(seed);
		const a = intern.get([[97, 97]]);
		expect(intern.get({ ranges: [[97, 97]] })).toBe(a);
		expect(intern.add(CharSet.single('a'))).toBe(a);
	});
});

describe('automaton plain form', () => {
	it('round-trips through structured clone with working labels', () => {
		const a = automatonFromText('start: A\naccept: B\nalphabet: 0,1,2\nA 0,1 B\nB ε A\nB [a-c] B');
		const back = automatonFromPlain(structuredClone(automatonToPlain(a)));
		expect(back).toStrictEqual(a);
		expect(back.transitions[0].label).toBeInstanceOf(CharSet);
		expect(back.alphabet).toBeInstanceOf(CharSet);
		expect(back.transitions[1].label).toBeNull();
		expect(accepts(back, '1')).toBe(true);
		expect(accepts(back, '1ba')).toBe(true);
		expect(accepts(back, '2')).toBe(false);
	});

	it('keeps state details (subsets, tokens, traps)', () => {
		const a = automatonFromText('start: A\naccept: B\nA x B');
		a.states[1] = { ...a.states[1], accept: { rule: 0, token: 'ID' }, subset: [3, 1], trap: true };
		const back = automatonFromPlain(structuredClone(automatonToPlain(a)));
		expect(back.states[1]).toEqual(a.states[1]);
	});

	it('shares one CharSet among equal labels', () => {
		const a = automatonFromText('start: A\naccept: B\nA 0 B\nB 0 A');
		const back = automatonFromPlain(automatonToPlain(a));
		expect(back.transitions[0].label).toBe(back.transitions[1].label);
	});
});

describe('closure events plain form', () => {
	it('round-trips seeds, follows and skips exactly', () => {
		const nfa = automatonFromText('start: A\naccept: C\nA ε B\nB ε A\nB ε C\nC 0 A');
		const { events } = epsilonClosureTrace(nfa, [nfa.start]);
		expect(events.map((e) => e.kind)).toEqual(['seed', 'follow', 'skip', 'follow']);
		const plain = closureEventsToPlain(events);
		expect(plain.every((n) => typeof n === 'number')).toBe(true);
		expect(closureEventsFromPlain(structuredClone(plain))).toStrictEqual(events);
	});

	it('handles no events', () => {
		expect(closureEventsFromPlain(closureEventsToPlain([]))).toEqual([]);
	});
});

describe('subset construction plain form', () => {
	it('round-trips the lecture construction through structured clone', () => {
		const r = subsetConstruction(lectureNfa());
		const back = subsetResultFromPlain(structuredClone(subsetResultToPlain(r)));
		expect(back).toStrictEqual(r);
	});

	it('makes every step symbol and DFA label one of the class objects', () => {
		const r = subsetConstruction(lectureNfa(), { includeEmpty: true });
		const back = subsetResultFromPlain(structuredClone(subsetResultToPlain(r)));
		for (const s of back.steps)
			if (s.kind === 'move' || s.kind === 'closure' || s.kind === 'target')
				expect(back.classes.indexOf(s.symbol)).toBeGreaterThanOrEqual(0);
		for (const t of back.dfa.transitions) expect(back.classes).toContain(t.label);
		expect(back.empty).toBe(r.empty);
	});

	it('keeps a symbol that is not one of the classes', () => {
		const r = subsetConstruction(thompson(star(chars(CharSet.of('ab')))).nfa);
		const odd = CharSet.single('z');
		const steps = r.steps.map((s) => (s.kind === 'move' ? { ...s, symbol: odd } : s));
		const back = subsetResultFromPlain(structuredClone(subsetResultToPlain({ ...r, steps })));
		const move = back.steps.find((s) => s.kind === 'move');
		expect(move?.kind === 'move' && move.symbol.equals(odd)).toBe(true);
	});

	it('is much smaller to clone than the result itself', () => {
		const nfa = thompson(cat(star(alt(sym('a'), sym('b'))), sym('a'), alt(sym('a'), sym('b')))).nfa;
		const r = subsetConstruction(nfa);
		const plain = subsetResultToPlain(r);
		expect(JSON.stringify(plain).length).toBeLessThan(JSON.stringify(r).length);
	});
});
