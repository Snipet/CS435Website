import { describe, expect, it } from 'vitest';
import { automatonFromText, complete } from '$lib/theory/automata/core';
import { buildRun, segText, traceIndexAt, type RunModel } from './run';
import { presetById } from './presets';

const machine = (id: string) => presetById(id)!.value.machine;

const trace = (m: RunModel) =>
	m.trace.map((t, i) => (i === 0 ? t.text : `→${t.symbol} ${t.text}`)).join(' ');
const names = (m: RunModel, ids: number[]) => ids.map((id) => m.automaton.states[id].name);

describe('DFA runs', () => {
	it('runs the slide-8 DFA on 1100 and accepts in C', () => {
		const m = buildRun(machine('06-8'), '1100')!;
		expect(m.kind).toBe('dfa');
		expect(trace(m)).toBe('A →1 A →1 A →0 B →0 C');
		expect(m.steps).toHaveLength(5);
		expect(segText(m.steps[0].caption)).toBe('Start in state A.');
		expect(segText(m.steps[3].caption)).toBe("Read '0': A →0 B.");
		expect(m.accepted).toBe(true);
		expect(segText(m.outcome)).toBe('Accept: the input ended in accepting state C');
		expect([...m.tones]).toEqual([[2, 'accept']]);
	});

	it('highlights the edge just taken and the symbol read', () => {
		const a = machine('06-8');
		const m = buildRun(a, '10')!;
		const step = m.steps[2];
		expect(names(m, step.active)).toEqual(['B']);
		expect(step.taken.map((id) => a.transitions[id])).toMatchObject([{ from: 0, to: 1 }]);
		expect(step.read).toEqual({ start: 1, end: 2, char: '0' });
		expect(step.from).toBe(0);
	});

	it('rejects in a non-accepting state', () => {
		const m = buildRun(machine('06-8'), '001')!;
		expect(m.accepted).toBe(false);
		expect(segText(m.outcome)).toBe('Reject: the input ended in non-accepting state A');
	});

	it('accepts "1110" but not "1101" on slide 7 (trap state)', () => {
		const a = machine('06-7');
		expect(buildRun(a, '1110')!.accepted).toBe(true);
		const m = buildRun(a, '1101')!;
		expect(m.accepted).toBe(false);
		expect(m.usesTrap).toBe(true);
		expect(m.trap).toBe(2);
		expect(m.automaton.states[2].trap).toBe(true);
		expect(trace(m)).toBe('A →1 A →1 A →0 B →1 trap');
		expect(segText(m.steps[4].caption)).toBe(
			"Read '1': B has no transition on '1', so the machine moves to the trap state."
		);
		expect(segText(m.outcome)).toBe(
			"Reject: the input ended in the trap state (no transition from B on '1')"
		);
	});

	it('keeps reading in the trap state', () => {
		const m = buildRun(machine('06-7'), '0111')!;
		expect(m.steps).toHaveLength(5);
		expect(segText(m.steps[4].caption)).toBe("Read '1': trap →1 trap.");
	});

	it('shares ids with a completed machine passed in', () => {
		const a = machine('06-6');
		const completed = complete(a);
		const m = buildRun(a, '11', { completed })!;
		expect(m.automaton).toBe(completed.automaton);
	});

	it('crashes on a missing transition when asked', () => {
		const m = buildRun(machine('06-7'), '1101', { missing: 'crash' })!;
		expect(m.automaton).toBe(machine('06-7'));
		expect(m.steps).toHaveLength(5);
		expect(m.steps[4].kind).toBe('stuck');
		expect(names(m, m.steps[4].active)).toEqual(['B']);
		expect(segText(m.steps[4].caption)).toBe(
			"Read '1': B has no transition on '1', so the machine crashes."
		);
		expect(m.trace[4]).toMatchObject({ stuck: true, symbol: '1' });
		expect(segText(m.outcome)).toBe("Reject: no transition from B on '1'");
		expect([...m.tones]).toEqual([[1, 'reject']]);
	});

	it('crashes on a symbol outside Σ', () => {
		const m = buildRun(machine('06-8'), '12')!;
		expect(segText(m.steps[2].caption)).toBe(
			"Read '2': '2' is not a symbol of Σ, so the machine crashes."
		);
		expect(segText(m.outcome)).toBe("Reject: '2' is not a symbol of Σ");
	});

	it('runs the empty input', () => {
		const m = buildRun(machine('06-6'), '')!;
		expect(m.steps).toHaveLength(1);
		expect(segText(m.outcome)).toBe('Reject: the input ended in non-accepting state A');
	});

	it('returns null for a machine without states', () => {
		expect(buildRun({ states: [], transitions: [], start: 0 }, '1')).toBeNull();
	});
});

describe('NFA runs', () => {
	it('tracks the active set on 1 0 1 (Lexical Analysis III, slide 13)', () => {
		const m = buildRun(machine('06-13'), '101')!;
		expect(m.kind).toBe('nfa');
		expect(trace(m)).toBe('{ A } →1 { A } →0 { A, B } →1 { A, C }');
		expect(m.accepted).toBe(true);
		expect(segText(m.outcome)).toBe('Accept: the final set { A, C } contains accepting state C');
		expect(segText(m.steps[2].caption)).toBe("Read '0': move({ A }, '0') = { A, B }.");
		expect(names(m, m.steps[3].active).sort()).toEqual(['A', 'C']);
		expect([...m.tones]).toEqual([[2, 'accept']]);
	});

	it('rejects when the final set has no accepting state', () => {
		const m = buildRun(machine('06-13'), '110')!;
		expect(segText(m.outcome)).toBe('Reject: the final set { A, B } contains no accepting state');
	});

	it('reports an empty set', () => {
		const m = buildRun(machine('06-9'), '10')!;
		expect(segText(m.steps[2].caption)).toBe(
			"Read '0': no active state has a transition on '0', so the set is empty."
		);
		expect(segText(m.outcome)).toBe('Reject: the final set is empty');
	});

	const eps = automatonFromText('start: A\naccept: C\nA ε B\nB 1 C\nC ε A');

	it('folds the ε-closure into each step by default', () => {
		const m = buildRun(eps, '1')!;
		expect(m.steps).toHaveLength(2);
		expect(segText(m.steps[0].caption)).toBe('Start: ε-closure({ A }) = { A, B }.');
		expect(segText(m.steps[1].caption)).toBe(
			"Read '1': move({ A, B }, '1') = { C }, and its ε-closure is { A, B, C }."
		);
		expect(m.steps[1].taken).toHaveLength(3);
	});

	it('can show the ε-closure as a separate step', () => {
		const m = buildRun(eps, '1', { separateClosure: true })!;
		expect(m.steps.map((s) => s.kind)).toEqual(['start', 'closure', 'read', 'closure']);
		expect(segText(m.steps[0].caption)).toBe('Start in state A.');
		expect(segText(m.steps[1].caption)).toBe('ε-closure({ A }) = { A, B }.');
		expect(segText(m.steps[2].caption)).toBe("Read '1': move({ A, B }, '1') = { C }.");
		expect(names(m, m.steps[2].active)).toEqual(['C']);
		expect(segText(m.steps[3].caption)).toBe('ε-closure({ C }) = { A, B, C }.');
		expect(m.trace.map((t) => t.step)).toEqual([1, 3]);
		expect(traceIndexAt(m.trace, 0)).toBe(0);
		expect(traceIndexAt(m.trace, 2)).toBe(1);
	});

	it('says when the closure adds nothing', () => {
		const m = buildRun(machine('06-10'), '', { separateClosure: true })!;
		expect(segText(m.steps[1].caption)).toBe('ε-closure({ A }) = { A, B }.');
		const n = buildRun(eps, '11', { separateClosure: true })!;
		expect(segText(n.steps[5].caption)).toBe('ε-closure({ C }) = { A, B, C }.');
		const plain = automatonFromText('start: A\naccept: B\nA 1 B\nA 1 A\nA ε A');
		const p = buildRun(plain, '1', { separateClosure: true })!;
		expect(segText(p.steps[3].caption)).toBe('ε-closure({ A, B }) adds no states.');
	});
});
