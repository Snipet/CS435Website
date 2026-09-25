/** Determinism strip, formal definition, and batch runs. */
import { describe, expect, it } from 'vitest';
import { automatonFromText } from '$lib/theory/automata/core';
import { batchText, parseBatch, runBatch } from './batch';
import { formalDefinition } from './definition';
import { summarizeDeterminism } from './determinism';
import { presetById } from './presets';
import { segText } from './run';

const machine = (id: string) => presetById(id)!.value.machine;

describe('determinism strip', () => {
	it('calls the slide-8 machine a DFA', () => {
		const s = summarizeDeterminism(machine('06-8'));
		expect(s).toMatchObject({ kind: 'dfa', title: 'DFA', items: [] });
		expect(summarizeDeterminism({ states: [], transitions: [], start: 0 }).title).toBe('Empty');
	});

	it('lists missing transitions of a partial DFA', () => {
		const s = summarizeDeterminism(machine('06-7'));
		expect(s.title).toBe('Partial DFA');
		expect(s.detail).toBe('Missing transitions go to a trap state.');
		expect(s.items.map((i) => segText(i.segs))).toEqual(['B on every symbol']);
		const t = summarizeDeterminism(automatonFromText('start: A\nA 0 B\nA 1 A\nB 1 A'));
		expect(t.items.map((i) => segText(i.segs))).toEqual(['B on 0']);
	});

	it('lists ε-moves and several transitions on one symbol', () => {
		expect(summarizeDeterminism(machine('06-10')).items.map((i) => segText(i.segs))).toEqual([
			'A →ε B'
		]);
		const s = summarizeDeterminism(machine('06-9'));
		expect(s.detail).toBe('It has several transitions on one symbol.');
		expect(s.items.map((i) => segText(i.segs))).toEqual(['A on 1 → { A, B }']);
		const both = summarizeDeterminism(automatonFromText('start: A\nA ε B\nA 0 A\nA 0 B'));
		expect(both.detail).toBe('It has ε-moves and several transitions on one symbol.');
	});
});

describe('formal definition', () => {
	it('writes a DFA as M = (Σ, S, s0, F, T)', () => {
		const d = formalDefinition(machine('06-8'));
		expect(d).toMatchObject({
			kind: 'dfa',
			sigma: '{ 0, 1 }',
			states: ['A', 'B', 'C'],
			start: 'A',
			finals: ['C'],
			missing: []
		});
		expect(d.moves.map((m) => `${m.from} ${m.symbol} ${m.to}`)).toEqual([
			'A 0 B',
			'A 1 A',
			'B 0 C',
			'B 1 A',
			'C 0 C',
			'C 1 A'
		]);
	});

	it('lists what a partial DFA is missing', () => {
		const d = formalDefinition(machine('06-6'));
		expect(d.sigma).toBe('{ 1 }');
		expect(d.missing).toEqual([{ state: 'B', symbols: '1' }]);
	});

	it('writes an NFA with Δ, ε last', () => {
		const d = formalDefinition(
			automatonFromText('start: A\naccept: C\nA 0 A\nA 0 B\nB 1 C\nB ε C')
		);
		expect(d.kind).toBe('nfa');
		expect(d.deltas.map((x) => `Δ(${x.state}, ${x.symbol}) = ${x.targets.join(' ')}`)).toEqual([
			'Δ(A, 0) = A B',
			'Δ(B, 1) = C',
			'Δ(B, ε) = C'
		]);
	});

	it('uses other for relop and a description for Σ', () => {
		const d = formalDefinition(machine('08-16'));
		expect(d.sigma).toBe('{ every character }');
		expect(d.moves.filter((m) => m.from === '6').map((m) => `${m.symbol} ${m.to}`)).toEqual([
			'< 8',
			'= 7',
			'> 8',
			'other 8'
		]);
	});
});

describe('batch', () => {
	it('reads one string per line with "" for the empty string', () => {
		const { lines, truncated } = parseBatch('1110\n\n""\n"1 0"\n"a\\"b"\n 1\r\n');
		expect(truncated).toBe(false);
		expect(lines).toEqual([
			{ line: 1, input: '1110' },
			{ line: 3, input: '' },
			{ line: 4, input: '1 0' },
			{ line: 5, input: 'a"b' },
			{ line: 6, input: ' 1' }
		]);
		expect(batchText(['1', ''])).toBe('1\n""');
	});

	it('caps the number of lines', () => {
		const { lines, truncated } = parseBatch(Array.from({ length: 250 }, () => '1').join('\n'));
		expect(lines).toHaveLength(200);
		expect(truncated).toBe(true);
	});

	it('runs every line', () => {
		const lines = parseBatch('1110\n1101\n""').lines;
		expect(runBatch(machine('06-7'), lines).map((r) => [r.accepted, r.detail])).toEqual([
			[true, 'ends in B'],
			[false, 'ends in the trap state'],
			[false, 'ends in A']
		]);
		expect(runBatch(machine('06-7'), lines, { missing: 'crash' })[1].detail).toBe(
			"no transition from B on '1'"
		);
		expect(runBatch(machine('06-13'), parseBatch('101').lines)[0]).toMatchObject({
			accepted: true,
			detail: 'ends in { A, C }'
		});
		expect(runBatch({ states: [], transitions: [], start: 0 }, lines)).toEqual([]);
	});
});
