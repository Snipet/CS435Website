import { describe, expect, it } from 'vitest';
import { lalr1Automaton, lr0Automaton, lr1Automaton } from '$lib/theory/grammar/lr';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { buildSteps, describeBuildStep, stepMaking } from './construction';

const g = parseGrammar('E → E + ( E ) | int').grammar!;
const a = lr1Automaton(g);

describe('buildSteps', () => {
	const steps = buildSteps(a);

	it('starts with state 0, adds an edge per step, and ends when every state is worked on', () => {
		expect(steps).toHaveLength(1 + 13 + 1);
		expect(steps[0]).toMatchObject({ kind: 'start', to: 0, states: 1, edges: 0 });
		expect(steps[steps.length - 1]).toMatchObject({ kind: 'done', states: 12, edges: 13 });
		const made = steps.filter((s) => s.isNew && s.kind === 'transition').map((s) => s.to);
		expect(made).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		// 9 →int 5 and 10 →+ 8 lead to states made before.
		expect(
			steps.filter((s) => s.kind === 'transition' && !s.isNew).map((s) => [s.from, s.symbol, s.to])
		).toEqual([
			[9, 'int', 5],
			[10, '+', 8]
		]);
		for (let k = 1; k < steps.length; k++) {
			expect(steps[k].states).toBeGreaterThanOrEqual(steps[k - 1].states);
			expect(steps[k].edges).toBeGreaterThanOrEqual(steps[k - 1].edges);
		}
	});

	it('agrees with the engine’s own trace', () => {
		const traced = a.steps.map((s) => (s.kind === 'start' ? [0, 1, 0] : [s.to, s.states, s.edges]));
		const ours = steps.slice(0, -1).map((s) => [s.to, s.states, s.edges]);
		expect(ours).toEqual(traced);
	});

	it('has no steps for LALR(1), and steps for LR(0)', () => {
		expect(buildSteps(lalr1Automaton(a))).toEqual([]);
		const lr0 = lr0Automaton(g);
		expect(buildSteps(lr0)).toHaveLength(lr0.edges.length + 2);
	});

	it('finds the step that made a state', () => {
		expect(steps[stepMaking(steps, 6)]).toMatchObject({ from: 4, symbol: 'E', to: 6 });
		expect(stepMaking(steps, 0)).toBe(0);
		expect(stepMaking(steps, 99)).toBe(steps.length - 1);
	});

	it('says what each step does', () => {
		expect(describeBuildStep(a, steps[0])).toBe('State 0 = Closure({ S → •E, $ }).');
		expect(describeBuildStep(a, steps[4])).toBe('Transition(3, () is a new set of items: state 4.');
		expect(describeBuildStep(a, steps[10])).toBe(
			'Transition(9, int) has the items of state 5: an edge to it, no new state.'
		);
		expect(describeBuildStep(a, steps[steps.length - 1])).toBe(
			'Every state’s transitions are made: 12 states, 13 edges.'
		);
		const lr0 = lr0Automaton(g);
		expect(describeBuildStep(lr0, buildSteps(lr0)[0])).toBe('State 0 = Closure({ S → •E }).');
		const cut = lr1Automaton(g, { maxStates: 5 });
		const last = buildSteps(cut).at(-1)!;
		expect(describeBuildStep(cut, last)).toMatch(/^The construction was cut off at 5 states/);
	});
});
