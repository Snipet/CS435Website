import { describe, expect, it } from 'vitest';
import { automatonFromText, minimize, stateNamed, type Automaton } from '$lib/theory/automata';
import { formatLabel, formatString } from '$lib/theory/chars';
import { buildInput } from './build';
import { presets } from './presets';
import {
	listText,
	pairCheck,
	reasonText,
	refinementView,
	roundSummary,
	setText,
	type RefinementView
} from './refinement';
import { fromSaved } from './state';

const ABB = presets.find((p) => p.id === 'abb')!.value.text!;

function viewOf(text: string, byToken = true): RefinementView {
	return refinementView(minimize(automatonFromText(text), { splitByToken: byToken }));
}

const nameIn = (a: Automaton) => (s: number) => a.states[s].name;
const blockNames = (view: RefinementView, r: number) =>
	view.rounds[r].partition.blocks.map(
		(b) => `${b.id}:${b.states.map(nameIn(view.input)).join('')}`
	);

describe('refinementView: (a | b)* a b b', () => {
	const view = viewOf(ABB);
	const id = (n: string) => stateNamed(view.input, n)!;

	it('numbers blocks stably: the part with the first state keeps the number', () => {
		expect(view.rounds.map((_, r) => blockNames(view, r))).toEqual([
			['1:ABCD', '2:E'],
			['1:ABC', '3:D', '2:E'],
			['1:AC', '4:B', '3:D', '2:E'],
			['1:AC', '4:B', '3:D', '2:E']
		]);
		for (const round of view.rounds)
			for (const b of round.partition.blocks) expect(b.tone).toBe((b.id - 1) % 6);
	});

	it('explains each split with the engine witness', () => {
		const [split] = view.rounds[1].splits;
		expect(split.block?.id).toBe(1);
		expect(split.parts).toEqual([1, 3]);
		const [reason] = split.reasons;
		expect(reason).toMatchObject({
			p: id('A'),
			q: id('D'),
			part: 3,
			pTo: id('C'),
			qTo: id('E'),
			pToBlock: 1,
			qToBlock: 2,
			witness: 'b',
			pEnd: id('C'),
			qEnd: id('E')
		});
		const text = reasonText(reason, nameIn(view.input), (c) => formatLabel(c), formatString);
		expect(text).toBe(
			'A and D split on b: A →b C (block 1) but D →b E (block 2); distinguishing string "b"'
		);
		const later = view.rounds[2].splits[0].reasons[0];
		expect(reasonText(later, nameIn(view.input), (c) => formatLabel(c), formatString)).toBe(
			'A and B split on b: A →b C (block 1) but B →b D (block 3); distinguishing string "bb"'
		);
	});

	it('builds signature tables against the previous partition', () => {
		const groups = view.rounds[1].groups;
		expect(groups.map((g) => g.block.id)).toEqual([1, 2]);
		const [g] = groups;
		expect(g.into).toEqual([1, 3]);
		expect(g.rows.map((row) => view.input.states[row.state].name)).toEqual(['A', 'B', 'C', 'D']);
		expect(g.rows.map((row) => row.cells.map((c) => c.block).join(''))).toEqual([
			'11',
			'11',
			'11',
			'12'
		]);
		expect(g.differing).toEqual([false, true]);
		expect(view.rounds[3].groups.every((grp) => grp.into.length === 1)).toBe(true);
	});

	it('lists how states start in round 0', () => {
		expect(
			view.rounds[0].initial.map((row) => `${nameIn(view.input)(row.state)}${row.block}`)
		).toEqual(['A1', 'B1', 'C1', 'D1', 'E2']);
		expect(view.rounds[0].groups).toEqual([]);
	});

	it('summarizes rounds', () => {
		expect(view.rounds.map((_, r) => roundSummary(view, r))).toEqual([
			'Round 0: the non-accepting states form block 1; the accepting states form block 2.',
			'Round 1: block 1 splits into blocks 1 and 3.',
			'Round 2: block 1 splits into blocks 1 and 4.',
			'Round 3: no block splits, so the partition is final: 4 blocks, 4 states in the minimal DFA.'
		]);
	});

	it('maps minimal DFA states to their final blocks', () => {
		expect(view.resultBlocks.map((b) => b.id)).toEqual([1, 4, 3, 2]);
	});

	it('checks pairs', () => {
		expect(pairCheck(view, id('A'), id('A'), true)).toEqual({ kind: 'same' });
		expect(pairCheck(view, id('A'), id('C'), true)).toEqual({ kind: 'equivalent', block: 1 });
		expect(pairCheck(view, id('A'), id('B'), true)).toEqual({
			kind: 'distinct',
			witness: 'bb',
			pRun: [id('A'), id('C'), id('C')],
			qRun: [id('B'), id('D'), id('E')]
		});
	});
});

describe('refinementView: other machines', () => {
	it('round 0 with tokens', () => {
		const preset = presets.find((p) => p.id === 'scanner')!;
		const dfa = buildInput(fromSaved(preset.value)).dfa!;
		const view = refinementView(minimize(dfa));
		expect(view.hasTokens).toBe(true);
		expect(roundSummary(view, 0)).toBe(
			'Round 0: the non-accepting states form block 1; the accepting states form one block per token: Integer (block 2), Identifier (block 3) and If (block 4).'
		);
		expect(view.rounds[0].initial.filter((r) => r.token === 'If')).toHaveLength(1);
		expect(roundSummary(view, 1)).toBe(
			'Round 1: block 1 splits into blocks 1 and 6; block 3 splits into blocks 3 and 5.'
		);
		// Keeping tokens apart splits the identifier block on f.
		const reason = view.rounds[1].splits.find((s) => s.block?.id === 3)!.reasons[0];
		expect(reason.witness).toBe('f');
		expect(view.input.states[reason.qEnd].accept?.token).toBe('If');
		expect(view.input.states[reason.pEnd].accept?.token).toBe('Identifier');
		const flat = refinementView(minimize(dfa, { splitByToken: false }));
		expect(roundSummary(flat, 0)).toBe(
			'Round 0: the non-accepting states form block 1; the accepting states form block 2.'
		);
	});

	it('machines with one block', () => {
		const none = viewOf('start: A\nA x B\nB x A');
		expect(roundSummary(none, 0)).toBe(
			'Round 0: no state accepts, so every state starts in block 1.'
		);
		const all = viewOf('start: A\naccept: A B\nA x B\nB x A');
		expect(roundSummary(all, 0)).toBe(
			'Round 0: every state accepts, so every state starts in block 1.'
		);
		expect(roundSummary(all, 1)).toBe(
			'Round 1: no block splits, so the partition is final: 1 block, 1 state in the minimal DFA.'
		);
	});

	it('the slide-10 DFA', () => {
		const preset = presets.find((p) => p.id === 'subset-dfa')!;
		const view = refinementView(minimize(buildInput(fromSaved(preset.value)).dfa!));
		expect(view.rounds.map((_, r) => blockNames(view, r))).toEqual([
			['1:ABCDHIFGABCDHI', '2:EJGABCDHI'],
			['1:ABCDHIFGABCDHI', '2:EJGABCDHI']
		]);
		expect(pairCheck(view, 0, 2, true)).toEqual({
			kind: 'distinct',
			witness: '',
			pRun: [0],
			qRun: [2]
		});
	});

	it('the trap is a state of the partitioned machine', () => {
		const view = viewOf('start: q0\naccept: q1\nq0 1 q0\nq0 0 q1');
		expect(view.input.states.map((s) => s.name)).toEqual(['q0', 'q1', 'trap']);
		expect(view.resultBlocks).toHaveLength(2);
		expect(view.classes.map((c) => formatLabel(c))).toEqual(['0', '1']);
		expect(view.delta[2]).toEqual([2, 2]);
	});
});

describe('setText', () => {
	it('writes sets with spaces inside the braces that do not break', () => {
		expect(setText([])).toBe('{ }');
		expect(setText(['A', 'C'])).toBe('{\u00a0A, C\u00a0}');
		expect(setText(['A', 'C']).replace(/\u00a0/g, ' ')).toBe('{ A, C }');
	});
});

describe('listText', () => {
	it('joins with commas and "and"', () => {
		expect(listText([])).toBe('');
		expect(listText(['a'])).toBe('a');
		expect(listText(['a', 'b'])).toBe('a and b');
		expect(listText(['a', 'b', 'c'])).toBe('a, b and c');
	});
});
