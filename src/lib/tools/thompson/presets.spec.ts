import { describe, expect, it } from 'vitest';
import { decks } from '$lib/lectures';
import { formatLabel } from '$lib/theory/chars';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { accepts, enumerate, type Automaton } from '$lib/theory/automata';
import {
	MAX_STATES,
	buildConstruction,
	describeStep,
	formulaTotal,
	sizeStats,
	stepView,
	type Construction
} from './construction';
import { DEFAULT_PRESET_ID, presetFor, presets } from './presets';
import { ruleCard } from './rules';
import { DEFAULT_STATE } from './state';
import { layoutTree } from './tree';

const edges = (a: Automaton) =>
	a.transitions.map(
		(t) =>
			`${a.states[t.from].name}-${t.label ? formatLabel(t.label) : 'ε'}->${a.states[t.to].name}`
	);

function load(id: string): Construction {
	const p = presets.find((x) => x.id === id)!;
	const o = buildConstruction(p.value.re, p.value.defs ?? '');
	if (o.status !== 'ok') throw new Error(`${id}: ${o.status}`);
	return o.construction;
}

describe('every preset', () => {
	it.each(presets.map((p) => [p.id, p] as const))('%s loads cleanly', (_, p) => {
		const d = parseDefinitions(p.value.defs ?? '');
		expect(d.diagnostics).toEqual([]);
		const r = parseRegex(p.value.re, { defs: d.defs, invalid: d.invalid });
		expect(r.ok).toBe(true);
		expect(r.diagnostics).toEqual([]);

		const o = buildConstruction(p.value.re, p.value.defs ?? '');
		expect(o.status).toBe('ok');
		if (o.status !== 'ok') return;
		const c = o.construction;
		expect(c.result.nfa.states.length).toBeLessThanOrEqual(MAX_STATES);
		// Every step can be described, drawn and explained.
		c.result.steps.forEach((_, i) => {
			expect(describeStep(c, i).detail).toMatch(/\.$/);
			expect(stepView(c, i).automaton.states.length).toBeGreaterThan(0);
			expect(ruleCard(c, i).formula).toBeTruthy();
		});
		expect(layoutTree(c.regex, c.stepByPath).nodes.length).toBeGreaterThanOrEqual(
			c.result.steps.length
		);
	});

	it('has unique ids, lecture citations, and the expression as its label', () => {
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.label).toBe(p.value.re);
			if (p.cite) expect(decks[p.cite.deck]).toBeDefined();
			expect(p.description).toBeTruthy();
			expect(p.group).toBeTruthy();
		}
		expect(presetFor('(1 | 0)*1', '')?.id).toBe(DEFAULT_PRESET_ID);
		expect(presetFor('(1 | 0)*1', 'x = a')).toBeUndefined();
	});

	it('starts on the worked example, finished', () => {
		const p = presets.find((x) => x.id === DEFAULT_PRESET_ID)!;
		expect(DEFAULT_STATE).toEqual({ re: p.value.re, defs: '', step: null });
	});
});

describe('construction rules (Lexical Analysis IV, slides 3–5)', () => {
	it('ε and a ∈ Σ', () => {
		expect(edges(load('rule-epsilon').result.nfa)).toEqual(['A-ε->B']);
		expect(edges(load('rule-symbol').result.nfa)).toEqual(['A-a->B']);
		expect(presets.find((p) => p.id === 'rule-epsilon')!.cite).toEqual({ deck: '08', slide: 3 });
	});

	it('A B joins A’s final to B’s start with no new states', () => {
		const c = load('rule-concat');
		expect(edges(c.result.nfa)).toEqual(['A-a->B', 'C-b->D', 'B-ε->C']);
		expect(c.result.steps[2].newStates).toEqual([]);
	});

	it('A | B adds a new start and final with four ε-moves', () => {
		const c = load('rule-alt');
		expect(edges(c.result.nfa)).toEqual([
			'B-a->D',
			'C-b->E',
			'A-ε->B',
			'A-ε->C',
			'D-ε->F',
			'E-ε->F'
		]);
	});

	it('A* goes back to the new start and has no A.final →ε f', () => {
		const c = load('rule-star');
		expect(edges(c.result.nfa)).toEqual(['B-a->C', 'A-ε->B', 'C-ε->A', 'A-ε->D']);
		expect(ruleCard(c, 1).adds).toEqual([
			['s', 'ε', 'A.start'],
			['A.final', 'ε', 's'],
			['s', 'ε', 'f']
		]);
	});
});

describe('lecture examples', () => {
	it('(1 | 0)*1 is exactly the NFA A–J, and the answer lists its edges', () => {
		const p = presets.find((x) => x.id === 'lecture-10-star-1')!;
		expect(p.cite).toEqual({ deck: '08', slide: 6 });
		const c = load(p.id);
		const { nfa } = c.result;
		expect(nfa.states.map((s) => s.name).join('')).toBe('ABCDEFGHIJ');
		expect(nfa.states[nfa.start].name).toBe('A');
		expect(nfa.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['J']);
		const answer = p.question!.edges!.map(([a, s, b]) => `${a}-${s}->${b}`);
		expect(new Set(edges(nfa))).toEqual(new Set(answer));
		expect(answer).toHaveLength(nfa.transitions.length);
		expect(p.question!.prompt).toContain('NFA is ?');
	});

	it('(0 | 1)*00 accepts the strings that end in 00', () => {
		const { nfa } = load('lecture-ends-00').result;
		expect(nfa.states).toHaveLength(12);
		for (const s of ['00', '100', '0100']) expect(accepts(nfa, s)).toBe(true);
		for (const s of ['', '0', '10', '001']) expect(accepts(nfa, s)).toBe(false);
	});

	it('(0 | 1)* 1 (0|1)^2 accepts strings whose third symbol from the end is 1', () => {
		const c = load('lecture-third-from-last');
		expect(c.result.nfa.states).toHaveLength(22);
		for (const s of ['100', '0111', '11100']) expect(accepts(c.result.nfa, s)).toBe(true);
		for (const s of ['', '10', '011', '0001', '11010'])
			expect(accepts(c.result.nfa, s)).toBe(false);
		expect(c.result.steps.some((s) => s.clause === 'Fixed iteration')).toBe(true);
	});

	it('\'if\' | \'then\' | \'else\' is { "if", "then", "else" }', () => {
		const c = load('lecture-keywords');
		expect(c.result.nfa.states).toHaveLength(24);
		expect(enumerate(c.result.nfa, { maxLength: 5, limit: 10 }).strings).toEqual([
			'if',
			'else',
			'then'
		]);
		expect(formulaTotal(sizeStats(c).formula!)).toBe(24);
	});

	it('digit digit* uses one 0–9 transition per use of digit', () => {
		const c = load('lecture-number');
		expect(c.result.nfa.states).toHaveLength(6);
		expect(edges(c.result.nfa).filter((e) => e.includes('0–9'))).toHaveLength(2);
	});

	it('every expression built from symbols, |, * and concatenation meets 2 × (symbols + | + *)', () => {
		for (const p of presets) {
			const s = sizeStats(load(p.id));
			if (s.formula) expect(formulaTotal(s.formula)).toBe(s.states);
		}
	});
});

describe('derived forms', () => {
	it('a+ = a a* with a fresh copy', () => {
		const c = load('derived-plus');
		expect(c.result.nfa.states).toHaveLength(6);
		expect(ruleCard(c, 1).formula).toBe('A+ = A A*');
	});

	it('a? = a | ε', () => {
		const c = load('derived-optional');
		expect(c.result.nfa.states).toHaveLength(6);
		expect(ruleCard(c, 1).formula).toBe('A? = A | ε');
	});
});
