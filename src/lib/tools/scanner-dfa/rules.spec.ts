import { describe, expect, it } from 'vitest';
import { CharSet } from '$lib/theory/charset';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import {
	MAX_DFA_STATES,
	boundedSubsetDfa,
	buildRuleDfa,
	charSetOf,
	compileRules,
	minimalRuleDfa,
	nameGroups,
	namedSets,
	numberStates,
	structureKey,
	withTokenNames
} from './rules';
import {
	minimize,
	scannerDfa,
	scannerNfa,
	subsetConstruction,
	type Automaton
} from '$lib/theory/automata';
import { ENDS_IN_1_RULES, LEX2_DEFS, LEX2_RULES, NEW_RULES } from './presets';

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

/** The DFA without names or trace-only fields, for comparing constructions. */
function shape(a: Automaton) {
	return {
		start: a.start,
		states: a.states.map((s) => ({
			id: s.id,
			accepting: s.accepting,
			accept: s.accept,
			subset: s.subset ? [...s.subset].sort((x, y) => x - y) : undefined
		})),
		transitions: a.transitions.map((t) => ({ id: t.id, from: t.from, to: t.to, label: t.label }))
	};
}

const SETS: [string, string, { name: string; re: string }[]][] = [
	['LEX2', LEX2_DEFS, LEX2_RULES],
	['new', LEX2_DEFS, NEW_RULES],
	['(1 | 0)*1', '', ENDS_IN_1_RULES],
	[
		'keywords',
		LEX2_DEFS,
		[
			{ name: 'If', re: "'if'" },
			{ name: 'Iffy', re: "'iffy'" },
			{ name: 'Id', re: 'letter (letter | digit)*' },
			{ name: 'Str', re: `'"' [^"]* '"'` },
			{ name: 'Any', re: 'Σ' }
		]
	],
	['relop', '', [{ name: 'Relop', re: "'<' | '<=' | '<>' | '>' | '>=' | '='" }]]
];

describe('buildRuleDfa', () => {
	it('numbers the states from 0 (the start state)', () => {
		const c = compileRules(LEX2_DEFS, LEX2_RULES);
		const b = buildRuleDfa(c.rules!);
		if (!b.ok) throw new Error('too large');
		expect(b.full.start).toBe(0);
		expect(b.full.states.map((s) => s.name)).toEqual(b.full.states.map((s) => String(s.id)));
		expect(b.full.states).toHaveLength(11);
		const m = minimalRuleDfa(b.full, nameGroups(c.rules!.map((r) => r.name)));
		expect(m.states).toHaveLength(5);
		expect(m.states.map((s) => s.name)).toEqual(m.states.map((s) => String(s.id)));
		expect(
			m.states
				.filter((s) => s.accepting)
				.map((s) => s.accept?.token)
				.sort()
		).toEqual(['0', '1', '2', '3']);
	});

	it('builds the same DFA as scannerDfa, and the same minimal DFA', () => {
		for (const [name, defs, rows] of SETS) {
			const c = compileRules(defs, rows);
			expect(c.rules, name).not.toBeNull();
			const b = buildRuleDfa(c.rules!);
			if (!b.ok) throw new Error(`${name}: too large`);
			const reference = scannerDfa(c.rules!);
			expect(shape(b.full), name).toEqual(shape(reference));
			const names = c.rules!.map((r) => r.name);
			const min = withTokenNames(minimalRuleDfa(b.full, nameGroups(names)), names);
			const refMin = minimize(reference, { splitByToken: true }).dfa;
			expect(shape(min), name).toEqual(shape(refMin));
		}
	});

	it('refuses DFAs above the limit', () => {
		const c = compileRules('', [{ name: 'R', re: '(0 | 1)* 1 (0 | 1)^9' }]);
		const b = buildRuleDfa(c.rules!);
		expect(b.ok).toBe(false);
		if (!b.ok) {
			expect(b.reason).toBe('dfa');
			expect(b.count).toBe(MAX_DFA_STATES + 1);
		}
	});

	it('builds a large DFA quickly, and refuses a larger one without finishing it', () => {
		const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
		const alt = `(${chars.map((ch) => `'${ch}'`).join(' | ')})`;
		const time = (re: string) => {
			const c = compileRules('', [{ name: 'X', re }]);
			const t = performance.now();
			const b = buildRuleDfa(c.rules!);
			return { b, ms: performance.now() - t };
		};
		const big = time(`${alt} ${alt}*`);
		expect(big.b.ok).toBe(true);
		if (big.b.ok) expect(big.b.full.states).toHaveLength(125);
		const bigger = time(`${alt} ${alt} ${alt} ${alt} ${alt}`);
		expect(bigger.b.ok).toBe(false);
		// The traced construction took about a second for these; generous bounds for slow machines.
		expect(big.ms).toBeLessThan(400);
		expect(bigger.ms).toBeLessThan(400);
	});
});

describe('boundedSubsetDfa', () => {
	it('matches the subset construction up to the limit', () => {
		const c = compileRules(LEX2_DEFS, LEX2_RULES);
		const { nfa } = scannerNfa(c.rules!);
		const full = boundedSubsetDfa(nfa, 1000);
		expect(full.count).toBe(11);
		expect(shape(full.dfa!)).toEqual(shape(subsetConstruction(nfa).dfa));
		expect(boundedSubsetDfa(nfa, 11).dfa).not.toBeNull();
		expect(boundedSubsetDfa(nfa, 10)).toEqual({ dfa: null, count: 11 });
		expect(boundedSubsetDfa(nfa, 3)).toEqual({ dfa: null, count: 4 });
	});
});

describe('names applied after the build', () => {
	it('the build depends on the definitions and REs only', () => {
		const renamed = LEX2_RULES.map((r, i) => ({ ...r, name: `T${i}`, drop: i === 0 }));
		expect(structureKey(LEX2_DEFS, renamed)).toBe(structureKey(LEX2_DEFS, LEX2_RULES));
		const moved = [LEX2_RULES[1], LEX2_RULES[0], ...LEX2_RULES.slice(2)];
		expect(structureKey(LEX2_DEFS, moved)).not.toBe(structureKey(LEX2_DEFS, LEX2_RULES));
		expect(structureKey('', LEX2_RULES)).not.toBe(structureKey(LEX2_DEFS, LEX2_RULES));
	});

	it('withTokenNames renames the tokens and notes by rule', () => {
		const c = compileRules(LEX2_DEFS, LEX2_RULES);
		const b = buildRuleDfa(c.rules!);
		if (!b.ok) throw new Error('too large');
		const names = ['WS', 'Int', 'Id', 'Plus'];
		const renamed = withTokenNames(b.full, names);
		const tokens = (a: Automaton) =>
			a.states.flatMap((s) => (s.accepting ? [[s.accept!.rule, s.accept!.token, s.note]] : []));
		expect(new Set(tokens(b.full).map(([rule]) => rule))).toEqual(new Set([0, 1, 2, 3]));
		expect(tokens(renamed)).toEqual(
			tokens(b.full).map(([rule]) => [rule, names[rule as number], names[rule as number]])
		);
		expect(renamed.transitions).toBe(b.full.transitions);
		expect(
			withTokenNames(
				b.full,
				c.rules!.map((r) => r.name)
			).states
		).toEqual(b.full.states);
	});

	it('the minimal DFA merges rules that share a name', () => {
		const rows = [
			{ name: 'A', re: "'a'" },
			{ name: 'A', re: "'b'" }
		];
		const c = compileRules('', rows);
		const b = buildRuleDfa(c.rules!);
		if (!b.ok) throw new Error('too large');
		expect(nameGroups(['A', 'A'])).toEqual([0, 0]);
		expect(nameGroups(['A', 'B', 'A'])).toEqual([0, 1, 0]);
		expect(minimalRuleDfa(b.full, [0, 0]).states).toHaveLength(2);
		expect(minimalRuleDfa(b.full, [0, 1]).states).toHaveLength(3);
		const named = withTokenNames(minimalRuleDfa(b.full, [0, 0]), ['A', 'A']);
		expect(named.states.filter((s) => s.accepting).map((s) => s.accept?.token)).toEqual(['A']);
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
