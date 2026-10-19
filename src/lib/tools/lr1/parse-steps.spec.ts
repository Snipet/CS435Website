import { describe, expect, it } from 'vitest';
import { lr1Automaton } from '$lib/theory/grammar/lr';
import { lrParse } from '$lib/theory/grammar/lr-parse';
import { lrTable } from '$lib/theory/grammar/lr-table';
import { parseGrammar } from '$lib/theory/grammar/parse';
import {
	LR_CODE,
	entryItems,
	frameConfiguration,
	frameForest,
	leafCount,
	parseFrames,
	statesVisited
} from './parse-steps';

const setup = (grammar: string, input: string) => {
	const a = lr1Automaton(parseGrammar(grammar).grammar!);
	const t = lrTable(a);
	const p = lrParse(t, input.split(' ').filter(Boolean));
	return { a, t, p, frames: parseFrames(t, p) };
};

const { a, t, p, frames } = setup('E → E + ( E ) | int', 'int + ( int ) + ( int )');

describe('the pseudocode', () => {
	it('is written as on slide 21', () => {
		expect(LR_CODE).toEqual([
			'Let I = w $',
			'Let j = 0',
			'Let DFA state 0 be the start state',
			'Let stack = < dummy, 0 >',
			'  repeat',
			'    case action[top_state(stack), I[j]] of',
			'      shift k : push < I[j++], k >',
			'      reduce X → α :',
			'        pop |α| pairs,',
			'        push < X, Goto[top_state(stack), X] >',
			'      accept: halt normally',
			'      error: halt and report error'
		]);
	});
});

describe('parseFrames', () => {
	it('starts with the stack < dummy, 0 > and j = 0', () => {
		expect(frames[0]).toMatchObject({ phase: 'init', lines: [0, 1, 2, 3], j: 0, state: 0 });
		expect(frames[0].stack).toEqual([{ symbol: null, state: 0 }]);
		expect(frames[0].text).toBe('I = int + (int) + (int)$, j = 0, stack = < dummy, 0 >');
	});

	it('looks up action[top_state(stack), I[j]], then shifts, or pops and pushes the Goto entry', () => {
		const phases = frames.map((f) => f.phase);
		// 9 shifts (2 frames each), 5 reductions (3 frames each), accept (2), and the first frame.
		expect(phases.filter((x) => x === 'shift')).toHaveLength(9);
		expect(phases.filter((x) => x === 'pop')).toHaveLength(5);
		expect(phases.filter((x) => x === 'goto')).toHaveLength(5);
		expect(frames).toHaveLength(1 + 18 + 15 + 2);
		expect(frames.slice(1, 6).map((f) => [f.phase, f.lines, f.text])).toEqual([
			['lookup', [5], 'action[0, int] = shift 1'],
			['shift', [6], 'shift 1: push < int, 1 >, j = 1'],
			['lookup', [5], 'action[1, +] = reduce E → int'],
			['pop', [7, 8], 'reduce E → int: pop 1 pair'],
			['goto', [9], 'push < E, Goto[0, E] > = < E, 2 >']
		]);
		const last = frames[frames.length - 1];
		expect(last).toMatchObject({ phase: 'accept', lines: [10], text: 'accept: halt normally' });
		expect(statesVisited(frames)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	});

	it('marks the cell looked up and the DFA edge followed', () => {
		const shift = frames[2];
		expect(frames[1].cell).toEqual({
			state: 0,
			kind: 'action',
			column: t.terminals.indexOf('int')
		});
		expect(shift.edge).toEqual({ from: 0, symbol: 'int', to: 1 });
		const g = frames[5];
		expect(g.cell).toEqual({ state: 0, kind: 'goto', column: 0 });
		expect(g.edge).toEqual({ from: 0, symbol: 'E', to: 2 });
		expect(g.pushed).toBe(true);
		const pop = frames.find((f) => f.phase === 'pop' && f.popping === 5)!;
		expect(pop.text).toBe('reduce E → E + (E): pop 5 pairs');
		expect(pop.marked).toEqual([0, 1, 2, 3, 4]);
	});

	it('counts the DFA transitions of both ways of slide 20', () => {
		const end = frames[frames.length - 1].transitions;
		// One transition per push with stored states; the length of the stack per push otherwise.
		expect(end.stored).toBe(14);
		expect(end.rerun).toBe(40);
		for (let k = 1; k < frames.length; k++) {
			expect(frames[k].transitions.stored).toBeGreaterThanOrEqual(frames[k - 1].transitions.stored);
			expect(frames[k].transitions.rerun).toBeGreaterThanOrEqual(frames[k].transitions.stored);
		}
	});

	it('gives the divider configuration and the forest of each frame', () => {
		const f = frames.find((x) => x.phase === 'lookup' && x.state === 5)!;
		expect(frameConfiguration(p, f)).toEqual({ left: 'E + (int', right: ') + (int)$' });
		const forest = frameForest(p, f);
		expect(forest.marker).toBe(4);
		expect(forest.roots.map((r) => r.symbol)).toEqual([
			'E',
			'+',
			'(',
			'int',
			')',
			'+',
			'(',
			'int',
			')'
		]);
		expect(frameConfiguration(p, frames[frames.length - 1])).toEqual({ left: 'E', right: '$' });
		expect(frameConfiguration(p, frames[0])).toEqual({ left: '', right: 'int + (int) + (int)$' });
	});

	it('marks the items behind each entry', () => {
		const lookup = frames[1];
		const items = entryItems(a, t, lookup).get(0)!;
		expect(items.map((k) => a.states[0].items[k].production)).toEqual([1, 1]);
		const reduce = frames[3];
		expect(entryItems(a, t, reduce).get(1)).toEqual([1]);
		const g = frames[5];
		expect(entryItems(a, t, g).get(0)!.length).toBe(3);
		const accept = frames[frames.length - 1];
		expect(entryItems(a, t, accept).get(2)).toEqual([0]);
		expect(entryItems(a, t, frames[0]).size).toBe(0);
	});

	it('stops on a blank entry', () => {
		const bad = setup('E → E + ( E ) | int', 'int +');
		const last = bad.frames[bad.frames.length - 1];
		expect(last).toMatchObject({ phase: 'error', lines: [11] });
		expect(bad.frames[bad.frames.length - 2].text).toBe('action[3, $] is blank');
		// The error step names the blank entry it stops on, which the table marks.
		expect(last.text).toBe('action[3, $] is blank: error, halt and report error');
		expect(last.cell).toEqual({ state: 3, kind: 'action', column: bad.t.terminals.indexOf('$') });
	});

	it('pops no pairs for an ε-production and counts its ε leaf', () => {
		const eps = setup('S → ε | id S', 'id');
		const pop = eps.frames.find((f) => f.phase === 'pop')!;
		expect(pop.popping).toBe(0);
		expect(pop.marked).toEqual([]);
		const after = eps.frames[eps.frames.indexOf(pop) + 1];
		expect(frameForest(eps.p, after).marker).toBe(2);
		expect(leafCount(after.forest[1])).toBe(1);
	});

	it('says why a run stops at its limit', () => {
		const long = setup('S → ε | id S', 'id id id id');
		const cut = parseFrames(long.t, lrParse(long.t, ['id', 'id', 'id', 'id'], { maxSteps: 3 }));
		expect(cut[cut.length - 1]).toMatchObject({
			phase: 'limit',
			text: 'The run stopped after 2 steps.'
		});
	});
});
