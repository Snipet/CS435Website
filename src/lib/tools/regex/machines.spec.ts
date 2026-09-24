import { describe, expect, it } from 'vitest';
import { parseAutomatonText, subsetConstruction, thompson } from '$lib/theory/automata';
import { formatAutomatonText } from '$lib/theory/automata';
import { parseDefinitions, parseRegex, type Regex } from '$lib/theory/regex';
import { buildLanguage, subsetStateCount, thompsonStateCount, withoutTrap } from './machines';

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
			'(a+)+ | (b?)*'
		];
		for (const text of cases) {
			const r = re(text, 'd = 0 | 1');
			expect(thompsonStateCount(r), text).toBe(thompson(r).nfa.states.length);
		}
	});

	it('stops counting past the cap', () => {
		expect(thompsonStateCount(re('(a^1000)^1000'), 100)).toBe(101);
	});
});

describe('subsetStateCount', () => {
	it('matches the construction below the cap and stops above it', () => {
		const nfa = thompson(re('(0 | 1)* 1 (0|1)^2')).nfa;
		expect(subsetStateCount(nfa)).toBe(subsetConstruction(nfa).dfa.states.length);
		const big = thompson(re('(0 | 1)* 1 (0|1)^12')).nfa;
		expect(subsetStateCount(big, 100)).toBe(101);
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
			limit: 400
		});
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
