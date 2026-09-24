import { describe, expect, it } from 'vitest';
import { subsetConstruction, thompson } from '$lib/theory/automata';
import { parseRegex } from '$lib/theory/regex';
import { buildInput, countSubsets, MAX_NFA_STATES, MAX_STATES, thompsonSize } from './build';
import { BLANK } from './state';

const re = (text: string) => {
	const r = parseRegex(text);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return r.regex;
};

describe('buildInput', () => {
	it('reports RE errors on the RE', () => {
		const out = buildInput({ ...BLANK, from: 're', re: '(0 | 1' });
		expect(out.dfa).toBeNull();
		expect(out.problem).toEqual({ kind: 'invalid' });
		expect(out.diagnostics.re.some((d) => d.severity === 'error')).toBe(true);
	});

	it('reports an empty RE', () => {
		const out = buildInput({ ...BLANK, from: 're', re: '' });
		expect(out.problem).toEqual({ kind: 'invalid' });
	});

	it('reports definition errors on the definitions', () => {
		const out = buildInput({ ...BLANK, from: 're', re: 'digit', defs: 'digit = (' });
		expect(out.problem).toEqual({ kind: 'invalid' });
		expect(out.diagnostics.defs.some((d) => d.severity === 'error')).toBe(true);
	});

	it('refuses NFAs given as text, with the reason', () => {
		const out = buildInput({ ...BLANK, from: 'dfa', text: 'start: A\naccept: B\nA 1 A\nA 1 B' });
		expect(out.dfa).toBeNull();
		expect(out.problem).toEqual({
			kind: 'nfa',
			reasons: ['two transitions from A on 1']
		});
		const eps = buildInput({ ...BLANK, from: 'dfa', text: 'start: A\naccept: B\nA ε B' });
		expect(eps.problem).toEqual({ kind: 'nfa', reasons: ['an ε-move (A →ε B)'] });
	});

	it('accepts partial DFAs', () => {
		const out = buildInput({ ...BLANK, from: 'dfa', text: 'start: q0\naccept: q1\nq0 0 q1' });
		expect(out.problem).toBeNull();
		expect(out.dfa?.states).toHaveLength(2);
	});

	it('reports text errors on the text', () => {
		const out = buildInput({ ...BLANK, from: 'dfa', text: 'A B' });
		expect(out.problem).toEqual({ kind: 'invalid' });
		expect(out.diagnostics.text.length).toBeGreaterThan(0);
	});

	it('refuses DFAs over the size limit before building them', () => {
		const big = buildInput({ ...BLANK, from: 're', re: '(0 | 1)* 1 (0 | 1)^9' });
		expect(big.problem).toEqual({ kind: 'too-big', what: 'dfa', limit: MAX_STATES });
		const huge = buildInput({ ...BLANK, from: 're', re: '((a^40)^40)^40' });
		expect(huge.problem).toEqual({ kind: 'too-big', what: 'nfa', limit: MAX_NFA_STATES });
		const lines = [
			'start: s0',
			...Array.from({ length: MAX_STATES }, (_, i) => `s${i} a s${i + 1}`)
		];
		const text = buildInput({ ...BLANK, from: 'dfa', text: lines.join('\n') });
		expect(text.problem).toMatchObject({ kind: 'too-big' });
	});

	it('builds scanner DFAs from token rules, keeping tokens', () => {
		const out = buildInput({
			...BLANK,
			from: 'rules',
			defs: "digit = '0' | … | '9'",
			rules: "Zero = '0'\nInteger = digit+"
		});
		expect(out.problem).toBeNull();
		const tokens = out.dfa!.states.flatMap((s) => (s.accept ? [s.accept.token] : []));
		expect(new Set(tokens)).toEqual(new Set(['Zero', 'Integer']));
	});

	it('reports rule errors on the rules', () => {
		const out = buildInput({ ...BLANK, from: 'rules', rules: 'Integer digit+' });
		expect(out.problem).toEqual({ kind: 'invalid' });
		expect(out.diagnostics.rules).toHaveLength(1);
	});
});

describe('thompsonSize', () => {
	it('bounds the Thompson NFA size', () => {
		for (const text of [
			'(1 | 0)*1',
			'a+ b? c^3',
			'(a | b | c)*',
			"'if' | 'then'",
			'a^{2,4}',
			'a^{2,}'
		]) {
			const r = re(text);
			expect(thompsonSize(r), text).toBeGreaterThanOrEqual(thompson(r).nfa.states.length);
		}
	});

	it('multiplies repetition', () => {
		expect(thompsonSize(re('(a^10)^10'))).toBeGreaterThan(200);
	});
});

describe('countSubsets', () => {
	it('matches the subset construction', () => {
		for (const text of ['(1 | 0)*1', '(0 | 1)* 1 (0 | 1)^2', '(a | b)* a b b']) {
			const { nfa } = thompson(re(text));
			expect(countSubsets(nfa, 1000), text).toBe(subsetConstruction(nfa).dfa.states.length);
		}
	});

	it('stops past the limit', () => {
		const { nfa } = thompson(re('(0 | 1)* 1 (0 | 1)^6'));
		expect(countSubsets(nfa, 10)).toBe(11);
	});
});
