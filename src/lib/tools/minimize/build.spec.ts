import { describe, expect, it } from 'vitest';
import { scannerNfa, subsetConstruction, thompson } from '$lib/theory/automata';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { buildInput, countSubsets, MAX_NFA_STATES, MAX_STATES, thompsonSize } from './build';
import { parseRules } from './rules';
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
	it('is the size of Thompson’s NFA', () => {
		for (const text of [
			'(1 | 0)*1',
			'a+ b? c^3',
			'(a | b | c)*',
			'a | b | c | d',
			"'if' | 'then'",
			'ɸ',
			'ε',
			'Σ a',
			'a^0',
			'a^{0,}',
			'a^{0,2}',
			'a^{2,4}',
			'a^{2,}',
			'(a | b)^{1,3}+',
			'((a | b)? c+)^{2,}',
			'(a^10)^10'
		]) {
			const r = re(text);
			expect(thompsonSize(r), text).toBe(thompson(r).nfa.states.length);
		}
	});

	it('does not refuse an NFA that fits', () => {
		// 2,400 NFA states, 2 DFA states.
		const star = buildInput({ ...BLANK, from: 're', re: '((a*)*)^400' });
		expect(star.problem).toBeNull();
		expect(star.dfa?.states).toHaveLength(2);
		// 1,400 NFA states build, but the DFA has 701.
		const chain = buildInput({ ...BLANK, from: 're', re: 'a^700' });
		expect(chain.problem).toEqual({ kind: 'too-big', what: 'dfa', limit: MAX_STATES });
	});

	it('sizes the scanner NFA of token rules', () => {
		const defs = parseDefinitions("digit = '0' | … | '9'\nletter = 'a' | … | 'z'");
		const { rules } = parseRules(
			"If = 'if'\nInteger = digit+\nIdentifier = letter (letter | digit)*",
			defs
		);
		const size = rules.reduce((n, r) => n + thompsonSize(r.regex), 1);
		expect(size).toBe(scannerNfa(rules).nfa.states.length);
	});
});

describe('Σ', () => {
	it('names the Σ the RE uses', () => {
		const out = buildInput({ ...BLANK, from: 're', re: '(a | b) Σ' });
		expect(out.problem).toBeNull();
		expect(out.diagnostics.re).toEqual([
			{
				severity: 'info',
				message: 'Σ = { a, b } here: the symbols the RE uses.',
				span: { start: 8, end: 9, source: null }
			}
		]);
	});

	it('warns when Σ is empty', () => {
		for (const text of ['Σ', 'Σ*']) {
			const out = buildInput({ ...BLANK, from: 're', re: text });
			expect(out.diagnostics.re, text).toEqual([
				{
					severity: 'warning',
					message: 'Σ is empty here: the RE uses no other symbols, so Σ matches nothing.',
					span: { start: 0, end: 1, source: null }
				}
			]);
		}
		// Σ inside a definition: the note has no span in the RE.
		const viaDef = buildInput({ ...BLANK, from: 're', re: 'x', defs: 'x = Σ Σ' });
		expect(viaDef.diagnostics.re).toEqual([
			{
				severity: 'warning',
				message: 'Σ is empty here: the RE uses no other symbols, so Σ matches nothing.'
			}
		]);
	});

	it('names the Σ of token rules, located in the rules text', () => {
		const out = buildInput({ ...BLANK, from: 'rules', rules: "A = 'a'\nAny = Σ Σ" });
		expect(out.problem).toBeNull();
		expect(out.diagnostics.rules).toEqual([
			{
				severity: 'info',
				message: 'Σ = { a } here: the symbols the rules use.',
				span: { start: 14, end: 15, source: null }
			}
		]);
	});

	it('adds nothing when Σ is not used', () => {
		const out = buildInput({ ...BLANK, from: 're', re: '(a | b)* a' });
		expect(out.diagnostics.re).toEqual([]);
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
