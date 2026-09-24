import { describe, expect, it } from 'vitest';
import { parseRegex } from '$lib/theory/regex';
import { thompson } from '$lib/theory/automata';
import {
	MAX_DFA_STATES,
	buildSpec,
	dfaFitsWithin,
	estimateNfaStates,
	ruleLabel,
	ruleName
} from './spec';
import { DIGIT_LETTER } from './presets';

const re = (t: string) => {
	const r = parseRegex(t);
	if (!r.ok) throw new Error(t);
	return r.regex;
};

describe('ruleLabel', () => {
	it("shows a single literal as written, like '+' in R", () => {
		expect(ruleLabel('Plus', "'+'")).toBe("'+'");
		expect(ruleLabel('New', " 'new' ")).toBe("'new'");
		expect(ruleLabel('Tab', "'\\t'")).toBe("'\\t'");
		expect(ruleLabel('Quote', "'\\''")).toBe("'\\''");
		expect(ruleLabel('Curly', '‘if’')).toBe('‘if’');
	});

	it('shows the name otherwise', () => {
		expect(ruleLabel('Keyword', "'if' | 'else'")).toBe('Keyword');
		expect(ruleLabel('Integer', 'digit+')).toBe('Integer');
		expect(ruleLabel('Plus', "'+'+")).toBe('Plus');
	});

	it('ruleName falls back to Rn', () => {
		expect(ruleName('  ', 2)).toBe('R3');
		expect(ruleName(' ID ', 0)).toBe('ID');
	});
});

describe('buildSpec', () => {
	it('builds the slide-7 R with helper definitions', () => {
		const spec = buildSpec(DIGIT_LETTER, [
			{ name: 'Whitespace', re: "' '+" },
			{ name: 'Integer', re: 'digit+' },
			{ name: 'Identifier', re: 'letter (letter | digit)*' },
			{ name: 'Plus', re: "'+'" }
		]);
		expect(spec.ok).toBe(true);
		expect(spec.rules.map((r) => r.label)).toEqual(['Whitespace', 'Integer', 'Identifier', "'+'"]);
		expect(spec.tokenRules.map((r) => r.name)).toEqual([
			'Whitespace',
			'Integer',
			'Identifier',
			'Plus'
		]);
	});

	it('marks rules with errors and lets them match nothing', () => {
		const spec = buildSpec('', [
			{ name: 'A', re: "'a" },
			{ name: '', re: "'b'" },
			{ name: 'A', re: "'c'", drop: true }
		]);
		expect(spec.ok).toBe(false);
		expect(spec.rules[0].problem).toBe('error');
		expect(spec.rules[0].diagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(spec.tokenRules[0].regex.kind).toBe('empty');
		expect(spec.rules[1]).toMatchObject({ name: 'R2', nameError: 'Name the rule' });
		expect(spec.rules[2]).toMatchObject({ nameWarning: 'R1 has the same name', drop: true });
		expect(spec.tokenRules[2].skip).toBe(true);
	});

	it('treats a new, blank rule as incomplete rather than wrong', () => {
		const spec = buildSpec('', [
			{ name: 'A', re: "'a'" },
			{ name: '', re: '  ' }
		]);
		expect(spec.rules[1]).toMatchObject({
			problem: 'blank',
			nameError: null,
			diagnostics: [],
			regex: null
		});
		expect(spec.tokenRules[1].regex.kind).toBe('empty');
		expect(spec.ok).toBe(true);
	});

	it('reports uses of broken definitions as errors', () => {
		const spec = buildSpec("digit = '0' | \nnum = digit+", [{ name: 'N', re: 'num' }]);
		expect(spec.defs.diagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(spec.rules[0].problem).toBe('error');
	});

	it('leaves out rules whose DFA is too large', () => {
		const spec = buildSpec('', [
			{ name: 'Big', re: '(0 | 1)* 1 (0 | 1)^12' },
			{ name: 'Huge', re: "('a'^{1000})^{1000}" },
			{ name: 'Small', re: "'0'" }
		]);
		expect(spec.rules.map((r) => r.problem)).toEqual(['too-large', 'too-large', null]);
		expect(spec.ok).toBe(false);
	});
});

describe('size guards', () => {
	it('estimateNfaStates bounds the Thompson NFA', () => {
		for (const t of ["'a'", '(1 | 0)*1', "'if' | 'iffy'", 'a+ b? c^3', 'a^{2,5}', 'a^{2,}']) {
			const r = re(t);
			expect(estimateNfaStates(r)).toBeGreaterThanOrEqual(thompson(r).nfa.states.length);
		}
		expect(estimateNfaStates(re('(1 | 0)*1'))).toBe(10);
	});

	it('dfaFitsWithin stops at the cap', () => {
		const { nfa } = thompson(re('(0 | 1)* 1 (0 | 1)^3'));
		expect(dfaFitsWithin(nfa, 17)).toBe(true);
		expect(dfaFitsWithin(nfa, 16)).toBe(false);
		expect(MAX_DFA_STATES).toBeGreaterThanOrEqual(257);
	});
});
