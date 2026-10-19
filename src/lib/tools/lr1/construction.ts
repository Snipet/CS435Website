/**
 * The construction of the parsing DFA as the decks number it (Bottom-up
 * Parsing II, slide 17; Bottom-up Parsing III, slide 14): state 0 is
 * Closure({ [S → •E, $] }); the states are worked on in the order they are
 * made, and from each, the edges on terminals come first, then those on
 * non-terminals. The engine lists the edges in the order it made them, and a
 * new state takes the next number, so the steps follow from the edges alone.
 */
import { formatItem, symbolText } from '$lib/components/grammar/lr-item';
import type { LrAutomaton } from '$lib/theory/grammar/lr';
import { startItem } from './closure-steps';
import { itemView } from './items';

export interface BuildStep {
	/** 'done': every state's transitions are made (the last step). */
	kind: 'start' | 'transition' | 'done';
	/** The state worked on and the symbol of its edge (null for the start). */
	from: number | null;
	symbol: string | null;
	/** The state the edge leads to, its index, and whether the step made that state. */
	to: number;
	edge: number | null;
	isNew: boolean;
	/** States and edges made through this step. */
	states: number;
	edges: number;
}

/** The steps of the construction; none for LALR(1), which merges a finished LR(1) automaton. */
export function buildSteps(a: LrAutomaton): BuildStep[] {
	if (a.kind === 'lalr1' || a.states.length === 0) return [];
	const steps: BuildStep[] = [
		{ kind: 'start', from: null, symbol: null, to: 0, edge: null, isNew: true, states: 1, edges: 0 }
	];
	let states = 1;
	a.edges.forEach((e, k) => {
		const isNew = e.to === states;
		if (isNew) states++;
		steps.push({
			kind: 'transition',
			from: e.from,
			symbol: e.symbol,
			to: e.to,
			edge: k,
			isNew,
			states,
			edges: k + 1
		});
	});
	steps.push({
		kind: 'done',
		from: null,
		symbol: null,
		to: states - 1,
		edge: null,
		isNew: false,
		states,
		edges: a.edges.length
	});
	return steps;
}

/** What a step does, in words. */
export function describeBuildStep(a: LrAutomaton, step: BuildStep): string {
	if (step.kind === 'start') {
		const item = { ...startItem(a.augmented), ...(a.kind === 'lr0' ? { lookahead: null } : {}) };
		return `State 0 = Closure({ ${formatItem(itemView(a.augmented, item), 'bracketed')} }).`;
	}
	if (step.kind === 'done') {
		const edges = `${step.edges} ${step.edges === 1 ? 'edge' : 'edges'}`;
		return a.truncated
			? `The construction was cut off at ${step.states} states (${edges}).`
			: `Every state’s transitions are made: ${step.states} ${step.states === 1 ? 'state' : 'states'}, ${edges}.`;
	}
	const head = `Transition(${step.from}, ${symbolText(step.symbol!)})`;
	return step.isNew
		? `${head} is a new set of items: state ${step.to}.`
		: `${head} has the items of state ${step.to}: an edge to it, no new state.`;
}

/** The step that made a state, or the last step. */
export function stepMaking(steps: readonly BuildStep[], state: number): number {
	const k = steps.findIndex((s) => s.isNew && s.to === state);
	return k < 0 ? steps.length - 1 : k;
}
