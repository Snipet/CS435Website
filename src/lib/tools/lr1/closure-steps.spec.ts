import { describe, expect, it } from 'vitest';
import { augment, lr1Automaton, lrClosure } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import {
	CLOSURE_CODE,
	TRANSITION_CODE,
	betaA,
	closureRun,
	closureSetup,
	describeFrame,
	startItem,
	transitionRun
} from './closure-steps';

const grammar = (text: string) => parseGrammar(text).grammar!;
const deck15 = grammar('E → int | E + ( E )');
const aug = augment(deck15);
const reversed = { closureOrder: [1, 0] };

describe('the pseudocode', () => {
	it('is written as on slides 10 and 13', () => {
		expect(CLOSURE_CODE).toEqual([
			'Closure(Items) =',
			'  repeat',
			'    for each [X → α•Yβ, a] in Items',
			'      for each production Y → γ',
			'        for each b ∈ First(βa)',
			'          add [Y → •γ, b] to Items',
			'  until Items is unchanged'
		]);
		expect(TRANSITION_CODE).toEqual([
			'Transition (state, y)',
			'  Items ← ∅',
			'  for each [X → α•yβ, b] ∈ state',
			'    add [X → αy•β, b] to Items',
			'  return Closure(Items)'
		]);
	});
});

describe('closureRun', () => {
	const r = closureRun(aug, [startItem(aug)], reversed);

	it('ends with the closure the engine computes', () => {
		expect(r.items).toEqual(lrClosure(aug, [startItem(aug)], reversed).items);
		expect(r.items).toHaveLength(5);
		expect(r.kind).toBe('closure');
	});

	it('steps line by line: the item extended, the production, First(βa), each addition', () => {
		const lines = r.frames.map((f) => f.at.line);
		expect(lines[0]).toBe(0);
		expect(lines[lines.length - 1]).toBe(6);
		expect(lines.slice(1, 8)).toEqual([2, 3, 4, 5, 3, 4, 5]);
		// Items grow by one with each addition, at the end of the list.
		const added = r.frames.filter((f) => f.add?.added);
		expect(added.map((f) => f.size)).toEqual([2, 3, 4, 5]);
		expect(added.map((f) => f.add!.index)).toEqual([1, 2, 3, 4]);
		expect(r.frames.every((f, k) => k === 0 || f.size >= r.frames[k - 1].size)).toBe(true);
		// Extending E → •E + ( E ), + finds both of its items already there.
		expect(r.repeats).toBe(2);
		expect(r.frames.filter((f) => f.add && !f.add.added)).toHaveLength(2);
	});

	it('says what each frame does', () => {
		const texts = r.frames.map((f) => describeFrame(aug, r, f));
		expect(texts.slice(0, 5)).toEqual([
			'Closure starts from 1 item.',
			'[S → •E, $] has • before the non-terminal E.',
			'A production of E: E → E + ( E ).',
			'βa = $, so First(βa) = { $ }.',
			'Add [E → •E + ( E ), $] to Items.'
		]);
		expect(texts[texts.length - 1]).toBe(
			'Items is unchanged: another pass adds nothing. The closure has 5 items. 2 additions found the item already there.'
		);
		expect(texts.every((t) => t.length > 0)).toBe(true);
	});

	it('gives β and a of an item', () => {
		expect(betaA(aug, { production: 1, dot: 0, lookahead: ')' })).toEqual({
			beta: ['+', '(', 'E', ')'],
			a: ')'
		});
	});

	it('has just a first and a last frame when there is nothing to add', () => {
		const done = closureRun(aug, [{ production: 0, dot: 1, lookahead: '$' }]);
		expect(done.frames.map((f) => f.at.line)).toEqual([0, 6]);
		expect(describeFrame(aug, done, done.frames[1])).toBe(
			'Items is unchanged: another pass adds nothing. The closure has 1 item.'
		);
	});
});

describe('transitionRun', () => {
	const a = lr1Automaton(deck15, reversed);
	const t = transitionRun(aug, a.states[3].items, '(', { ...reversed, state: 3 });

	it('moves the dot, then closes: state 4', () => {
		expect(t.items).toEqual(a.states[4].items);
		expect(t.frames.slice(0, 4).map((f) => [f.at.code, f.at.line, f.size])).toEqual([
			['transition', 0, 0],
			['transition', 1, 0],
			['transition', 3, 1],
			['transition', 3, 2]
		]);
		const inner = t.frames.slice(4);
		expect(inner.every((f) => f.at.code === 'closure' && f.outer?.line === 4)).toBe(true);
		expect(inner[0].size).toBe(2);
	});

	it('says what it does', () => {
		expect(describeFrame(aug, t, t.frames[0])).toBe(
			'Transition(3, (): the items of the state with • before ( move the dot over it.'
		);
		expect(describeFrame(aug, t, t.frames[1])).toBe('Items ← ∅');
		expect(describeFrame(aug, t, t.frames[2])).toBe(
			'[E → E + •( E ), $] is in the state: add [E → E + ( •E ), $] to Items.'
		);
		expect(describeFrame(aug, t, t.frames[4])).toBe(
			'return Closure(Items): close the 2 items moved over (.'
		);
	});
});

describe('closureSetup', () => {
	const a = lr1Automaton(deck15, reversed);

	it('closes the start item when no items are written', () => {
		const s = closureSetup({ mode: 'closure', aug, seed: '  ', lr1: null, from: 0, symbol: '' })!;
		expect(s.kind === 'closure' && s.start).toBe(true);
		expect(s.run?.seed).toEqual([startItem(aug)]);
	});

	it('runs nothing for items with errors, and nothing without a grammar', () => {
		const s = closureSetup({
			mode: 'closure',
			aug,
			seed: 'E → •foo, $',
			lr1: null,
			from: 0,
			symbol: ''
		})!;
		expect(s.run).toBeNull();
		expect(s.kind === 'closure' && s.read.diagnostics.length).toBeGreaterThan(0);
		expect(
			closureSetup({ mode: 'closure', aug: null, seed: '', lr1: null, from: 0, symbol: '' })
		).toBeNull();
		expect(
			closureSetup({ mode: 'transition', aug, seed: '', lr1: null, from: 0, symbol: '' })
		).toBeNull();
	});

	it('takes a state and a symbol, with the first symbol by default and the state clamped', () => {
		const s = closureSetup({ mode: 'transition', aug, seed: '', lr1: a, from: 4, symbol: '' })!;
		expect(s.kind).toBe('transition');
		if (s.kind !== 'transition') return;
		expect(s.symbols).toEqual([
			{ symbol: 'int', to: 5 },
			{ symbol: 'E', to: 6 }
		]);
		expect([s.symbol, s.to]).toEqual(['int', 5]);
		const e = closureSetup({ mode: 'transition', aug, seed: '', lr1: a, from: 4, symbol: 'E' })!;
		expect(e.kind === 'transition' && e.to).toBe(6);
		const far = closureSetup({ mode: 'transition', aug, seed: '', lr1: a, from: 99, symbol: 'x' })!;
		expect(far.kind === 'transition' && [far.from, far.symbol, far.run]).toEqual([11, null, null]);
	});

	it('steps through the start state of C- quickly', () => {
		const c = augment(grammar(CMINUS_BNF));
		const t0 = performance.now();
		const s = closureSetup({ mode: 'closure', aug: c, seed: '', lr1: null, from: 0, symbol: '' })!;
		expect(performance.now() - t0).toBeLessThan(500);
		expect(s.run!.items.length).toBeGreaterThan(20);
	});
});
