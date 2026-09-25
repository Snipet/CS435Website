/**
 * Every preset loads cleanly and reproduces what its slide shows.
 */
import { describe, expect, it } from 'vitest';
import {
	analyzeDeterminism,
	formatAutomatonText,
	parseAutomatonText,
	transitionTable
} from '$lib/theory/automata/core';
import { compareLanguages, enumerate, regexToDfa } from '$lib/theory/automata/language';
import { minimize } from '$lib/theory/automata/minimize';
import { runDfa, runNfa } from '$lib/theory/automata/simulate';
import { subsetConstruction } from '$lib/theory/automata/subset';
import { thompson } from '$lib/theory/automata/thompson';
import { edgeList } from '$lib/theory/automata/test-helpers';
import { parseRegex } from '$lib/theory/regex/lecture';
import type { Automaton } from '$lib/theory/automata/types';
import { decodeMachine, decodePositions, encodeMachine } from './codec';
import { buildRun } from './run';
import { DEFAULT_PRESET_ID, presetById, presetEdited, presets } from './presets';
import { mergeTextEdit } from './text-sync';
import { isSavedState, loadSaved, presetView, saveState, DEFAULT_VIEW } from './state';
import { parseBatch } from './batch';

const machine = (id: string) => presetById(id)!.value.machine;
const re = (text: string) => {
	const r = parseRegex(text);
	if (!r.ok) throw new Error(r.diagnostics.map((d) => d.message).join('; '));
	return r.regex;
};
const sameLanguage = (a: Automaton, text: string) =>
	compareLanguages(a, regexToDfa(re(text))).equivalent;

describe('presets', () => {
	it('have unique ids, cite a slide, and include the default', () => {
		const ids = presets.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain(DEFAULT_PRESET_ID);
		for (const p of presets) expect(p.cite?.slide).toBeTypeOf('number');
	});

	for (const p of presets) {
		describe(p.id, () => {
			const v = p.value;
			it('reads back from the text format without diagnostics', () => {
				const text = formatAutomatonText(v.machine);
				const parsed = parseAutomatonText(text);
				expect(parsed.diagnostics).toEqual([]);
				expect(formatAutomatonText(parsed.automaton!)).toBe(text);
			});

			it('survives the URL codec and the saved state', () => {
				const back = decodeMachine(encodeMachine(v.machine));
				expect(back).toEqual(v.machine);
				if (v.positions) {
					expect(v.positions).toHaveLength(v.machine.states.length);
					expect(decodePositions(v.positions, v.machine.states.length)).not.toBeNull();
				}
				const view = presetView(p.id, v, DEFAULT_VIEW);
				const saved = JSON.parse(JSON.stringify(saveState(v.machine, null, view)));
				expect(isSavedState(saved)).toBe(true);
				const loaded = loadSaved(saved);
				expect(loaded.machine).toEqual(v.machine);
				expect(loaded.view).toEqual(view);
				// A reloaded link still shows the example's card and question.
				expect(presetEdited(v, loaded.machine!)).toBe(false);
			});

			it('runs its input and batch strings', () => {
				expect(buildRun(v.machine, v.input)).not.toBeNull();
				expect(
					parseBatch(presetView(p.id, v, DEFAULT_VIEW).batch).lines.map((l) => l.input)
				).toEqual(v.batch);
			});
		});
	}
});

describe('edited presets', () => {
	const v = presetById('06-8')!.value;

	it('count an edit to the machine, not to its positions or view', () => {
		expect(presetEdited(v, v.machine)).toBe(false);
		const text = formatAutomatonText(v.machine);
		const same = mergeTextEdit(v.machine, null, parseAutomatonText(text).automaton!).machine;
		expect(presetEdited(v, same)).toBe(false);
		const more = parseAutomatonText(`${text}\nC 2 D`).automaton!;
		expect(presetEdited(v, mergeTextEdit(v.machine, null, more).machine)).toBe(true);
		const renamed = {
			...v.machine,
			states: v.machine.states.map((s) => ({ ...s, name: s.name + "'" }))
		};
		expect(presetEdited(v, renamed)).toBe(true);
		const start = { ...v.machine, start: 1 };
		expect(presetEdited(v, start)).toBe(true);
	});

	it('keep the notes and other labels of relop in the comparison', () => {
		const relop = presetById('08-16')!.value;
		const plain = {
			...relop.machine,
			transitions: relop.machine.transitions.map((t) => ({ ...t, display: undefined }))
		};
		expect(presetEdited(relop, plain)).toBe(true);
	});
});

describe('Lexical Analysis III', () => {
	it('slide 6: L(M) = { "1" } over Σ = { 1 }', () => {
		const a = machine('06-6');
		expect(a.alphabet?.chars()).toEqual(['1']);
		expect(enumerate(a, { maxLength: 6, limit: 10 })).toEqual({ strings: ['1'], truncated: false });
		expect(analyzeDeterminism(a).kind).toBe('partial-dfa');
	});

	it('slide 7: accepts "1110" but not "110…"', () => {
		const a = machine('06-7');
		expect(runDfa(a, '1110').accepted).toBe(true);
		expect(runDfa(a, '1101').outcome).toBe('stuck');
		expect(runDfa(a, '1100').outcome).toBe('stuck');
		expect(sameLanguage(a, '1*0')).toBe(true);
	});

	it('slide 8: a total DFA for (0 | 1)*00', () => {
		const a = machine('06-8');
		expect(analyzeDeterminism(a).kind).toBe('dfa');
		expect(sameLanguage(a, '(0 | 1)*00')).toBe(true);
		expect(transitionTable(a).rows.map((r) => r.cells.map((c) => a.states[c[0]].name))).toEqual([
			['B', 'A'],
			['C', 'A'],
			['C', 'A']
		]);
	});

	it('slide 9: two transitions on 1 from A', () => {
		const r = analyzeDeterminism(machine('06-9'));
		expect(r.kind).toBe('nfa');
		expect(r.conflicts).toHaveLength(1);
		expect(sameLanguage(machine('06-9'), '1 1*')).toBe(true);
	});

	it('slide 10: an ε-move from A to B', () => {
		const a = machine('06-10');
		expect(analyzeDeterminism(a).epsilonMoves).toHaveLength(1);
		expect(runNfa(a, '').steps[0].active.map((id) => a.states[id].name)).toEqual(['A', 'B']);
	});

	it('slide 13: active sets {A} → {A} → {A, B} → {A, C} on 1 0 1', () => {
		const a = machine('06-13');
		const sets = runNfa(a, '101').steps.map((s) =>
			s.active
				.map((id) => a.states[id].name)
				.sort()
				.join('')
		);
		expect(sets).toEqual(['A', 'A', 'AB', 'AC']);
		expect(sameLanguage(a, '(0|1)*01')).toBe(true);
	});

	it('slide 15: the NFA for (0 | 1)*00 has 3 reachable subsets of 8', () => {
		const a = machine('06-15');
		expect(sameLanguage(a, '(0 | 1)*00')).toBe(true);
		expect(subsetConstruction(a).dfa.states).toHaveLength(3);
		expect(compareLanguages(a, machine('06-8')).equivalent).toBe(true);
	});

	it('slide 16: (0 | 1)* 1 (0|1)^2 needs 8 DFA states', () => {
		const a = machine('06-16');
		expect(a.states).toHaveLength(4);
		expect(sameLanguage(a, '(0 | 1)* 1 (0|1)^2')).toBe(true);
		expect(minimize(subsetConstruction(a).dfa).dfa.states).toHaveLength(8);
	});
});

describe('Lexical Analysis IV', () => {
	it('slide 10: the subset construction of Thompson((1 | 0)*1)', () => {
		const built = subsetConstruction(thompson(re('(1 | 0)*1')).nfa).dfa;
		const a = machine('08-10');
		expect(a.states.map((s) => s.name)).toEqual(built.states.map((s) => s.name));
		expect(edgeList(a).sort()).toEqual(edgeList(built).sort());
		expect(a.states.filter((s) => s.accepting).map((s) => s.name)).toEqual(['EJGABCDHI']);
		// Slide 11: not minimal.
		expect(minimize(a).dfa.states).toHaveLength(2);
	});

	it('slide 14: the S/T/U table', () => {
		const a = machine('08-14');
		const answer = presetById('08-14')!.value.question!.answer[0];
		const table = transitionTable(a);
		const rows = table.rows.map((r) => [
			a.states[r.state].name,
			...r.cells.map((c) => a.states[c[0]].name)
		]);
		expect(answer).toEqual({ kind: 'table', head: ['', '0', '1'], rows });
	});

	it('slide 16: relop returns the six tokens', () => {
		const a = machine('08-16');
		const end = (s: string) => {
			const run = runDfa(a, s);
			const last = run.steps[run.steps.length - 1].state;
			return last === null ? null : a.states[last];
		};
		expect(end('<=')?.note).toBe('return LE');
		expect(end('<>')?.note).toBe('return NE');
		expect(end('<x')).toMatchObject({ note: 'return LT', retract: true });
		expect(end('=')?.note).toBe('return EQ');
		expect(end('>=')?.note).toBe('return GE');
		expect(end('>a')).toMatchObject({ note: 'return GT', retract: true });
		expect(a.transitions.filter((t) => t.display === 'other').map((t) => [t.from, t.to])).toEqual([
			[1, 4],
			[6, 8]
		]);
		expect(runDfa(a, '==').outcome).toBe('stuck');
	});
});
