import { describe, expect, it } from 'vitest';
import {
	automatonFromText,
	compareLanguages,
	distinguish,
	formatAutomatonText,
	minimize,
	scannerDfa,
	stateNamed,
	subsetConstruction,
	thompson,
	type Automaton
} from '$lib/theory/automata';
import { parseDefinitions, parseRegex } from '$lib/theory/regex';
import { buildInput } from './build';
import { DEFAULT_PRESET, presets } from './presets';
import { parseRules } from './rules';
import { fromSaved, inputKey, isSavedState } from './state';

const byId = (id: string) => presets.find((p) => p.id === id)!;

function load(id: string): Automaton {
	const result = buildInput(fromSaved(byId(id).value));
	expect(result.problem).toBeNull();
	return result.dfa!;
}

const names = (a: Automaton, ids: readonly number[] = a.states.map((s) => s.id)) =>
	ids.map((i) => a.states[i].name);

describe('presets', () => {
	it('load without errors or warnings', () => {
		for (const preset of presets) {
			const result = buildInput(fromSaved(preset.value));
			const all = Object.values(result.diagnostics).flat();
			expect(
				all.filter((d) => d.severity !== 'info'),
				preset.id
			).toEqual([]);
			expect(result.problem, preset.id).toBeNull();
			expect(result.dfa, preset.id).not.toBeNull();
		}
	});

	it('are valid saved states with distinct inputs and ids', () => {
		for (const preset of presets) expect(isSavedState(preset.value), preset.id).toBe(true);
		const keys = presets.map((p) => inputKey(fromSaved(p.value)));
		expect(new Set(keys).size).toBe(presets.length);
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
	});

	it('name existing states for the pair check', () => {
		for (const preset of presets) {
			const dfa = load(preset.id);
			for (const n of [preset.value.p, preset.value.q])
				if (n) expect(stateNamed(minimize(dfa).input, n), `${preset.id}: ${n}`).toBeDefined();
		}
	});

	it('default to the slide-10 DFA', () => {
		expect(DEFAULT_PRESET.id).toBe('subset-dfa');
	});
});

describe('Lexical Analysis IV presets', () => {
	it('slide 10: the subset DFA ABCDHI, FGABCDHI, EJGABCDHI', () => {
		const dfa = load('subset-dfa');
		expect(names(dfa)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(dfa.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['EJGABCDHI']);
	});

	it('slide 11: it is not minimal; ABCDHI and FGABCDHI merge', () => {
		const dfa = load('subset-dfa');
		const result = minimize(dfa);
		expect(result.dfa.states).toHaveLength(2);
		expect(names(dfa, result.dfa.states[0].merged)).toEqual(['ABCDHI', 'FGABCDHI']);
		expect(distinguish(dfa, 0, 1)).toEqual({ equivalent: true });
		expect(byId('subset-dfa').question?.cite).toEqual({ deck: '08', slide: 11 });
	});

	it('slide 14: S and T merge', () => {
		const dfa = load('stu');
		expect(names(dfa)).toEqual(['S', 'T', 'U']);
		const result = minimize(dfa);
		expect(result.dfa.states.map((s) => names(dfa, s.merged).join(''))).toEqual(['ST', 'U']);
		// The same machine as slide 10, renamed.
		expect(compareLanguages(dfa, load('subset-dfa')).equivalent).toBe(true);
	});
});

describe('Lexical Analysis III presets', () => {
	it('slide 8: (0 | 1)*00 is already minimal', () => {
		const dfa = load('ends-00');
		expect(names(dfa)).toEqual(['q0', 'q1', 'q2']);
		expect(minimize(dfa).dfa.states).toHaveLength(3);
		const re = parseRegex('(0 | 1)*00');
		if (!re.ok) throw new Error('bad RE');
		expect(compareLanguages(dfa, thompson(re.regex).nfa).equivalent).toBe(true);
	});

	it('slide 16: the 8-state subset DFA of the slide NFA is minimal', () => {
		const nfa = automatonFromText('start: A\naccept: D\nA 0,1 A\nA 1 B\nB 0,1 C\nC 0,1 D');
		const subset = subsetConstruction(nfa).dfa;
		expect(byId('third-from-last').value.text).toBe(formatAutomatonText(subset));
		const dfa = load('third-from-last');
		expect(dfa.states).toHaveLength(8);
		expect(minimize(dfa).dfa.states).toHaveLength(8);
		const re = parseRegex('(0 | 1)* 1 (0|1)^2');
		if (!re.ok) throw new Error('bad RE');
		expect(compareLanguages(dfa, thompson(re.regex).nfa).equivalent).toBe(true);
	});

	it('slide 7: a trap is added for the partial DFA and dropped again', () => {
		const dfa = load('one-star-zero');
		const result = minimize(dfa);
		expect(result.trap).not.toBeNull();
		expect(result.input.states).toHaveLength(3);
		expect(names(result.dfa)).toEqual(['q0', 'q1']);
	});
});

describe('other presets', () => {
	it('(a | b)* a b b: the subset DFA with states renamed A–E; 5 → 4 states', () => {
		const re = parseRegex('(a | b)* a b b');
		if (!re.ok) throw new Error('bad RE');
		const subset = subsetConstruction(thompson(re.regex).nfa).dfa;
		const rename = new Map(subset.states.map((s, i) => [s.name, 'ABCDE'[i]]));
		const renamed = automatonFromText(
			formatAutomatonText(subset).replace(/[A-Z]{3,}/g, (m) => rename.get(m) ?? m)
		);
		expect(formatAutomatonText(renamed)).toBe(byId('abb').value.text);
		const result = minimize(load('abb'));
		expect(result.dfa.states).toHaveLength(4);
		expect(names(load('abb'), result.dfa.states[0].merged)).toEqual(['A', 'C']);
	});

	it('scanner: the scannerDfa machine, with token-separated initial blocks', () => {
		const value = byId('scanner').value;
		const defs = parseDefinitions(value.defs!);
		const rules = parseRules(value.rules!, defs).rules;
		expect(rules.map((r) => r.name)).toEqual(['If', 'Integer', 'Identifier']);
		const dfa = load('scanner');
		const reference = scannerDfa(rules);
		expect(formatAutomatonText(dfa)).toBe(formatAutomatonText(reference));
		expect(dfa.states.map((s) => s.accept?.token)).toEqual(
			reference.states.map((s) => s.accept?.token)
		);
		const result = minimize(dfa);
		const tokenOf = (b: number[]) => result.input.states[b[0]].accept?.token ?? '-';
		expect(result.rounds[0].blocks.map(tokenOf)).toEqual(['-', 'Integer', 'Identifier', 'If']);
		expect(result.dfa.states).toHaveLength(5);
		// Without the token split, the If state merges with the identifier states.
		expect(minimize(dfa, { splitByToken: false }).dfa.states).toHaveLength(3);
	});
});
