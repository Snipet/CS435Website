import { describe, expect, it } from 'vitest';
import { formatCitation } from '$lib/lectures';
import { hasErrors } from '$lib/theory/diagnostics';
import { minimize, type Automaton } from '$lib/theory/automata';
import { edgeList } from '$lib/theory/automata/test-helpers';
import { blowupNfaText, buildNfa, construct, runSideBySide, setText } from './logic';
import { DEFAULT_PRESET, PRESETS, presetFor, type SubsetPreset } from './presets';
import { presetFields } from './state';

function load(p: SubsetPreset, opts = { includeEmpty: false }) {
	const build = buildNfa(presetFields(p.value));
	const diagnostics = [...build.reDiagnostics, ...build.defsDiagnostics, ...build.textDiagnostics];
	expect(hasErrors(diagnostics), `${p.id}: ${diagnostics.map((d) => d.message).join('; ')}`).toBe(
		false
	);
	expect(build.nfa, p.id).not.toBeNull();
	const nfa = build.nfa!;
	const c = construct(nfa, { naming: 'discovery', includeEmpty: opts.includeEmpty });
	expect(c.tooLarge, p.id).toBe(false);
	return { nfa, build, result: c.result! };
}

const byId = (id: string) => {
	const p = PRESETS.find((x) => x.id === id);
	if (!p) throw new Error(`no preset ${id}`);
	return p;
};

const names = (a: Automaton) => a.states.map((s) => s.name);

describe('presets', () => {
	it('have unique ids and load without errors or warnings', () => {
		expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
		for (const p of PRESETS) {
			const { build } = load(p);
			const all = [...build.reDiagnostics, ...build.defsDiagnostics, ...build.textDiagnostics];
			expect(
				all.filter((d) => d.severity !== 'info'),
				p.id
			).toEqual([]);
		}
	});

	it('default to (1 | 0)*1', () => {
		expect(DEFAULT_PRESET.id).toBe('l08-ones');
		expect(DEFAULT_PRESET.value).toMatchObject({ from: 're', re: '(1 | 0)*1' });
	});

	it('cite existing decks, and slide questions render as citations', () => {
		for (const p of PRESETS) {
			if (p.cite) expect(formatCitation(p.cite)).toMatch(/slides? \d+/);
			if (p.question) expect(formatCitation(p.question.cite)).toMatch(/slides? \d+/);
		}
		// The NFA (slide 6) through the DFA (slide 10).
		expect(formatCitation(byId('l08-ones').cite!)).toBe('Lexical Analysis IV · slides 6–10');
		expect(formatCitation(byId('l08-ones').question!.cite)).toBe('Lexical Analysis IV · slide 11');
	});

	it('are found again from their own source', () => {
		for (const p of PRESETS) expect(presetFor(presetFields(p.value))?.id).toBe(p.id);
		expect(presetFor({ from: 're', re: '(1 | 0)*1 1', defs: '', text: '' })).toBeUndefined();
	});

	it('run their sample inputs with the NFA and the DFA in step', () => {
		for (const p of PRESETS) {
			const { nfa, result } = load(p);
			const run = runSideBySide(nfa, result.dfa, p.value.input ?? '');
			expect(
				run.steps.every((s) => s.same),
				p.id
			).toBe(true);
			expect(run.dfaAccepts).toBe(run.nfaAccepts);
		}
	});
});

describe('Lexical Analysis IV, slides 6–11: (1 | 0)*1', () => {
	const { nfa, result } = load(byId('l08-ones'));

	it('builds the slide-6 NFA A–J', () => {
		expect(names(nfa)).toEqual('ABCDEFGHIJ'.split(''));
		expect(nfa.transitions).toHaveLength(11);
	});

	it('gives ABCDHI, FGABCDHI, EJGABCDHI with the slide-10 edges', () => {
		expect(names(result.dfa)).toEqual(['ABCDHI', 'FGABCDHI', 'EJGABCDHI']);
		expect(result.dfa.states.map((s) => s.accepting)).toEqual([false, false, true]);
		expect(edgeList(result.dfa)).toEqual([
			'ABCDHI-0->FGABCDHI',
			'ABCDHI-1->EJGABCDHI',
			'FGABCDHI-0->FGABCDHI',
			'FGABCDHI-1->EJGABCDHI',
			'EJGABCDHI-0->FGABCDHI',
			'EJGABCDHI-1->EJGABCDHI'
		]);
	});

	it('answers slide 11: the DFA is not minimal (2 states)', () => {
		const q = byId('l08-ones').question!;
		expect(q.prompt).toBe('Is the previous DFA minimal?');
		expect(q.minimizeLink).toBe(true);
		const m = minimize(result.dfa);
		expect(m.dfa.states).toHaveLength(2);
		expect(m.blockOf.get(0)).toBe(m.blockOf.get(1));
		expect(q.answer(names(result.dfa))).toBe(
			'No. ABCDHI and FGABCDHI are both non-accepting, and on every symbol they go to the same state (0 → FGABCDHI, 1 → EJGABCDHI), so they can be merged. The minimal DFA has 2 states.'
		);
	});

	it('answers slide 11 with the DFA state names in use, and the answer holds', () => {
		const q = byId('l08-ones').question!;
		const nfa = load(byId('l08-ones')).nfa;
		for (const naming of ['discovery', 'sorted-set', 'numbered'] as const) {
			for (const includeEmpty of [false, true]) {
				const { dfa } = construct(nfa, { naming, includeEmpty }).result!;
				const [start, on0, on1] = names(dfa);
				const answer = q.answer(names(dfa));
				expect(answer, naming).toContain(`${start} and ${on0} are both non-accepting`);
				expect(answer, naming).toContain(`(0 → ${on0}, 1 → ${on1})`);
				// What it says: states 0 and 1 reject and go to the same states on 0 and on 1.
				expect(dfa.states.map((s) => s.accepting)).toEqual([false, false, true]);
				// Targets on 0, then on 1 (transitions are added in symbol order).
				const out = (id: number) =>
					dfa.transitions.filter((t) => t.from === id).map((t) => dfa.states[t.to].name);
				expect(out(0)).toEqual([on0, on1]);
				expect(out(1)).toEqual([on0, on1]);
			}
		}
		expect(q.answer(['D0', 'D1', 'D2'])).toContain('D0 and D1');
	});
});

describe('Lexical Analysis III NFAs', () => {
	it('slide 9: A →1 A, A →1 B gives A and AB, plus ∅ on 0 when shown', () => {
		const { result } = load(byId('l06-s9'));
		expect(names(result.dfa)).toEqual(['A', 'AB']);
		expect(edgeList(result.dfa)).toEqual(['A-1->AB', 'AB-1->AB']);
		const withEmpty = load(byId('l06-s9'), { includeEmpty: true }).result;
		expect(names(withEmpty.dfa)).toEqual(['A', '∅', 'AB']);
		expect(edgeList(withEmpty.dfa)).toEqual([
			'A-0->∅',
			'A-1->AB',
			'∅-0->∅',
			'∅-1->∅',
			'AB-0->∅',
			'AB-1->AB'
		]);
	});

	it('slide 13: input 1 0 1 ends in { A, C } on the NFA and in AC on the DFA', () => {
		const { nfa, result } = load(byId('l06-s13'));
		expect(names(result.dfa)).toEqual(['A', 'AB', 'AC']);
		const run = runSideBySide(nfa, result.dfa, '101');
		const sets = run.steps.map((s) => setText(nfa, s.nfaActive));
		expect(sets).toEqual(['{ A }', '{ A }', '{ A, B }', '{ A, C }']);
		expect(run.steps.at(-1)!.dfaState).toBe(2);
		expect(run.nfaAccepts).toBe(true);
	});

	it('slide 15: 2³ = 8 possible subsets, 3 reachable', () => {
		const p = byId('l06-s15');
		const { nfa, result } = load(p);
		expect(nfa.states).toHaveLength(3);
		expect(2 ** nfa.states.length).toBe(8);
		expect(names(result.dfa)).toEqual(['A', 'AB', 'ABC']);
		expect(p.question!.prompt).toBe('How many possible states in corresponding DFA?');
		const answer = p.question!.answer(names(result.dfa));
		expect(answer).toContain('2³ = 8');
		expect(answer).toContain('3 of them: A, AB and ABC.');
		const numbered = construct(nfa, { naming: 'numbered', includeEmpty: true }).result!.dfa;
		expect(p.question!.answer(names(numbered))).toContain('3 of them: D0, D1 and D2.');
	});

	it('slide 16: (0 | 1)* 1 (0|1)² has 4 NFA states and 8 DFA states, already minimal', () => {
		const p = byId('l06-s16');
		const { nfa, result } = load(p);
		expect(nfa.states).toHaveLength(4);
		expect(names(result.dfa)).toEqual(['A', 'AB', 'AC', 'ABC', 'AD', 'ABD', 'ACD', 'ABCD']);
		expect(result.dfa.states.filter((s) => s.accepting)).toHaveLength(4);
		expect(minimize(result.dfa).dfa.states).toHaveLength(8);
		if (p.value.from !== 'nfa') throw new Error('expected an NFA preset');
		expect(p.value.text).toBe(blowupNfaText(2));
	});
});

describe('more examples', () => {
	it('a | b*', () => {
		const { result } = load(byId('a-or-b-star'));
		expect(result.dfa.states.filter((s) => s.accepting).length).toBe(result.dfa.states.length);
	});

	it('(a|b)*abb has 5 DFA states and one accepting state', () => {
		const { nfa, result } = load(byId('abb'));
		expect(result.dfa.states).toHaveLength(5);
		expect(result.dfa.states.filter((s) => s.accepting)).toHaveLength(1);
		for (const [input, ok] of [
			['abb', true],
			['babb', true],
			['ab', false],
			['abba', false]
		] as const)
			expect(runSideBySide(nfa, result.dfa, input).dfaAccepts, input).toBe(ok);
	});
});
