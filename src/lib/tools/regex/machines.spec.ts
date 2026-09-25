import { describe, expect, it } from 'vitest';
import {
	parseAutomatonText,
	regexToDfa,
	subsetConstruction,
	thompson,
	type Automaton
} from '$lib/theory/automata';
import { formatAutomatonText } from '$lib/theory/automata';
import { parseDefinitions, parseRegex, type Regex } from '$lib/theory/regex';
import {
	buildLanguage,
	MAX_DFA_STATES,
	MAX_NFA_STATES,
	productSize,
	subsetSize,
	thompsonStateCount,
	withoutTrap
} from './machines';

const DIGIT_FULL = "digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'";

function re(text: string, defs = ''): Regex {
	const r = parseRegex(text, { defs: parseDefinitions(defs).defs });
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return r.regex;
}

describe('thompsonStateCount', () => {
	it('matches the construction', () => {
		const cases = [
			"'c'",
			'ε',
			'ɸ',
			'(1 | 0)*1',
			"'if' | 'then'",
			'a+ b?',
			'a^3',
			'a^0',
			'(a | b)^{2,4}',
			'a^{2,}',
			'd d*',
			'(a+)+ | (b?)*',
			// Alternations of three or more options (folded two at a time).
			'a|b|c',
			'a|b|c|d',
			"'if' | 'then' | 'else'",
			'(a|b|c)*',
			'(a|b|c)^{1,3} | ε | d?'
		];
		for (const text of cases) {
			const r = re(text, 'd = 0 | 1');
			expect(thompsonStateCount(r), text).toBe(thompson(r).nfa.states.length);
		}
		for (const text of ['digit', 'digit digit*', 'digit+', 'digit^3', 'digit^{0,4}']) {
			const r = re(text, DIGIT_FULL);
			expect(thompsonStateCount(r), text).toBe(thompson(r).nfa.states.length);
		}
	});

	it('stops counting past the cap', () => {
		expect(thompsonStateCount(re('(a^1000)^1000'), 100)).toBe(101);
	});

	it('keeps the NFA limit for many-option alternations', () => {
		// 1680 states: the old count (1040) let this NFA be built.
		const r = re('digit^{0,40}', DIGIT_FULL);
		expect(thompsonStateCount(r, Infinity)).toBe(1680);
		expect(buildLanguage(r)).toEqual({ ok: false, stage: 'nfa', limit: MAX_NFA_STATES });
	});
});

describe('subsetSize', () => {
	it('matches the construction below the limits', () => {
		const nfa = thompson(re('(0 | 1)* 1 (0|1)^2')).nfa;
		const size = subsetSize(nfa);
		expect(size.ok && size.states).toBe(subsetConstruction(nfa).dfa.states.length);
	});

	it('stops at the state limit', () => {
		const big = thompson(re('(0 | 1)* 1 (0|1)^12')).nfa;
		expect(subsetSize(big, { maxStates: 100 })).toEqual({ ok: false, reason: 'states' });
	});

	it('stops at the work limit when the state sets are large', () => {
		// Few DFA states, but each holds hundreds of NFA states.
		const nfa = thompson(re('digit^{1,20}', DIGIT_FULL)).nfa;
		expect(subsetSize(nfa, { maxStates: 1000, maxWork: Infinity })).toMatchObject({
			ok: true,
			states: 201
		});
		expect(subsetSize(nfa)).toEqual({ ok: false, reason: 'work' });
	});
});

describe('buildLanguage', () => {
	it('builds all three machines', () => {
		const b = buildLanguage(re('(1 | 0)*1'));
		expect(b.ok && [b.nfa.states.length, b.dfa.states.length, b.min.states.length]).toEqual([
			10, 3, 2
		]);
	});

	it('reports which machine is too large', () => {
		expect(buildLanguage(re('a^900 a^900'))).toEqual({ ok: false, stage: 'nfa', limit: 1500 });
		expect(buildLanguage(re('(0 | 1)* 1 (0|1)^10'))).toEqual({
			ok: false,
			stage: 'dfa',
			limit: MAX_DFA_STATES
		});
		expect(buildLanguage(re('digit^{1,30}', DIGIT_FULL))).toEqual({
			ok: false,
			stage: 'work',
			limit: 40_000
		});
	});

	it('leaves room for the largest presets', () => {
		for (const [text, defs] of [
			['digit digit*', DIGIT_FULL],
			['digit+', DIGIT_FULL],
			['(0|1)* 1 (0|1)^7', '']
		]) {
			const nfa = thompson(re(text, defs)).nfa;
			const size = subsetSize(nfa, { maxWork: Infinity });
			expect(size.ok && size.work, text).toBeLessThan(30_000);
		}
	});
});

describe('productSize', () => {
	const min = (text: string): Automaton => regexToDfa(re(text), { minimal: true });

	it('counts the pairs of states the product reaches', () => {
		// Lengths modulo 5 and modulo 3 run through all 15 pairs.
		expect(productSize(min("('a'^5)*"), min("('a'^3)*"))).toBe(15);
		expect(productSize(min('(0|1)*01'), min('(0|1)*01'))).toBe(3);
	});

	it('counts pairs where one side has no move', () => {
		// "" and "a" in both; "b" only in the second, whose first DFA has no move on b.
		expect(productSize(min("'a'"), min("'a' | 'b'"))).toBe(3);
	});

	it('stops past the cap', () => {
		expect(productSize(min("('a'^50)*"), min("('a'^41)*"))).toBe(2001);
		expect(productSize(min("('a'^50)*"), min("('a'^41)*"), 100)).toBe(101);
	});
});

describe('withoutTrap', () => {
	it('drops states that cannot reach an accepting state', () => {
		const b = buildLanguage(re("'a' ɸ | 'b'"));
		if (!b.ok) throw new Error('not built');
		expect(b.min.states).toHaveLength(3);
		const m = withoutTrap(b.min);
		expect(m.states).toHaveLength(2);
		expect(parseAutomatonText(formatAutomatonText(m)).automaton?.states).toHaveLength(2);
		const partial = buildLanguage(re("'1' '0'*"));
		if (!partial.ok) throw new Error('not built');
		expect(withoutTrap(partial.min)).toBe(partial.min);
	});

	it('keeps a trap that is the start state', () => {
		const b = buildLanguage(re('ɸ'));
		if (!b.ok) throw new Error('not built');
		expect(withoutTrap(b.min).states).toHaveLength(1);
	});
});
