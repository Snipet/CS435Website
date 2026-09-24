import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import {
	MAX_DFA_STATES,
	buildRuleDfa,
	charSetOf,
	compileRules,
	namedSets,
	numberStates,
	subsetStateCount
} from './rules';
import { scannerNfa, subsetConstruction } from '$lib/theory/automata';
import { LEX2_DEFS, LEX2_RULES } from './presets';

describe('compileRules', () => {
	it('builds the rules in order, with drop flags', () => {
		const c = compileRules(LEX2_DEFS, [
			...LEX2_RULES.slice(0, 1).map((r) => ({ ...r, drop: true })),
			...LEX2_RULES.slice(1)
		]);
		expect(c.rules!.map((r) => r.name)).toEqual(['Whitespace', 'Integer', 'Identifier', 'Plus']);
		expect(c.rules!.map((r) => r.skip)).toEqual([true, false, false, false]);
		expect(c.names.map((n) => n.name)).toEqual(['digit', 'letter']);
	});

	it('reports empty names, empty and invalid expressions', () => {
		const c = compileRules('', [
			{ name: '', re: "'a'" },
			{ name: 'B', re: '' },
			{ name: 'C', re: '(a' },
			{ name: 'D', re: "'d'" }
		]);
		expect(c.rules).toBeNull();
		expect(c.rows[0].nameError).toBeDefined();
		expect(c.rows[1].diagnostics[0].severity).toBe('error');
		expect(c.rows[2].diagnostics.some((d) => d.severity === 'error')).toBe(true);
		expect(c.rows[3]).toEqual({ diagnostics: [] });
	});

	it('needs at least one rule', () => {
		expect(compileRules('', []).rules).toBeNull();
	});

	it('warns about rules that match the empty string', () => {
		const c = compileRules('', [{ name: 'A', re: "'a'*" }]);
		expect(c.rules).not.toBeNull();
		expect(c.rows[0].diagnostics.map((d) => d.severity)).toEqual(['warning']);
	});

	it('reports uses of definitions that failed', () => {
		const c = compileRules('digit = (', [{ name: 'N', re: 'digit+' }]);
		expect(c.defs.diagnostics.length).toBeGreaterThan(0);
		expect(c.rules).toBeNull();
	});
});

describe('named sets', () => {
	it('keep definitions that stand for one character from a set', () => {
		const d = parseDefinitions(`${LEX2_DEFS}\nnumber = digit digit*\nx = 'x'`);
		expect(namedSets(d.defs)).toEqual([
			{ name: 'digit', set: CharSet.range('0', '9') },
			{ name: 'letter', set: CharSet.range('A', 'Z').union(CharSet.range('a', 'z')) }
		]);
		const r = parseRegex("'a' | [b-c]");
		if (!r.ok) throw new Error('parse');
		expect(charSetOf(r.regex)?.equals(CharSet.range('a', 'c'))).toBe(true);
	});
});

describe('buildRuleDfa', () => {
	it('numbers the states from 0 (the start state)', () => {
		const c = compileRules(LEX2_DEFS, LEX2_RULES);
		const b = buildRuleDfa(c.rules!, { minimal: false });
		if (!b.ok) throw new Error('too large');
		expect(b.dfa.start).toBe(0);
		expect(b.dfa.states.map((s) => s.name)).toEqual(b.dfa.states.map((s) => String(s.id)));
		expect(b.full.states).toHaveLength(11);
		expect(b.minimal.states).toHaveLength(5);
		const m = buildRuleDfa(c.rules!, { minimal: true });
		if (!m.ok) throw new Error('too large');
		expect(m.dfa).toBe(m.minimal);
		expect(
			m.dfa.states
				.filter((s) => s.accepting)
				.map((s) => s.accept?.token)
				.sort()
		).toEqual(['Identifier', 'Integer', 'Plus', 'Whitespace']);
	});

	it('refuses DFAs above the limit', () => {
		const c = compileRules('', [{ name: 'R', re: '(0 | 1)* 1 (0 | 1)^9' }]);
		const b = buildRuleDfa(c.rules!, { minimal: false });
		expect(b.ok).toBe(false);
		if (!b.ok) {
			expect(b.reason).toBe('dfa');
			expect(b.count).toBeGreaterThan(MAX_DFA_STATES);
		}
	});

	it('counts subset states like the subset construction', () => {
		const c = compileRules(LEX2_DEFS, LEX2_RULES);
		const { nfa } = scannerNfa(c.rules!);
		expect(subsetStateCount(nfa, 1000)).toBe(subsetConstruction(nfa).dfa.states.length);
		expect(subsetStateCount(nfa, 3)).toBe(4);
	});

	it('numberStates renames the states and notes the tokens', () => {
		const c = compileRules('', [{ name: 'R', re: '(1 | 0)*1' }]);
		const dfa = subsetConstruction(scannerNfa(c.rules!).nfa).dfa;
		const n = numberStates(dfa);
		expect(n.states.map((s) => s.name)).toEqual(['0', '1', '2']);
		expect(n.transitions).toBe(dfa.transitions);
		expect(n.states[2].accept).toEqual({ rule: 0, token: 'R' });
		expect(n.states.map((s) => s.note)).toEqual([undefined, undefined, 'R']);
	});
});
