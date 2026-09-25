/**
 * The Subset Construction page's heavy work as one computation that runs in a
 * worker (construction.worker.ts): the NFA (Thompson's construction, or the
 * typed text), the subset construction, the diagram layouts and the DFA's
 * text for links. On every keystroke the page only parses the source
 * (`checkSource`), for its diagnostics.
 *
 * Results are plain data (they are copied between threads);
 * `reviveConstruction` turns them back into engine objects on the page.
 */
import type { Box } from '$lib/components/graph/geometry';
import { layoutAutomaton, nodePositions } from '$lib/components/graph/layout';
import {
	automatonFromPlain,
	automatonToPlain,
	formatAutomatonText,
	subsetResultFromPlain,
	subsetResultToPlain,
	type Automaton,
	type PlainAutomaton,
	type PlainSubsetResult,
	type Positions,
	type SubsetNaming
} from '$lib/theory/automata';
import {
	MAX_DRAWN_DFA,
	MAX_DRAWN_NFA_AUTO,
	buildNfa,
	construct,
	drawnDfa,
	type Construction,
	type NfaSource
} from './logic';

export interface ConstructionRequest extends NfaSource {
	naming: SubsetNaming;
	showEmpty: boolean;
	/**
	 * Key of the construction the page shows. When the request gives the same
	 * one (an edit to spaces or comments), only `{ kind: 'same' }` comes back.
	 */
	have: string | null;
}

/** A layout computed in the worker: state centers, and the box around the drawing. */
export interface PlainLayout {
	positions: Positions;
	bounds: Box;
}

export interface PlainConstruction {
	kind: 'built';
	/** Equal for two requests exactly when they give the same construction, named the same way. */
	key: string;
	/** Equal for two requests exactly when they give the same NFA, drawn the same way. */
	machine: string;
	nfa: PlainAutomaton;
	/** Thompson's grid (regular-expression source). */
	grid: Positions | null;
	/** Automatic layout of a typed NFA that is small enough to draw. */
	layout: Positions | null;
	result: PlainSubsetResult | null;
	tooLarge: boolean;
	limit: number;
	classes: number;
	/** Layout of the DFA as drawn, when it is small enough to draw. */
	dfaLayout: PlainLayout | null;
	/** The DFA in the automaton text format, for links to other tools. */
	dfaText: string | null;
}

export type ConstructionData =
	/** The source gives no NFA (the page shows its diagnostics). */
	| { kind: 'none' }
	/** The construction is the one the page shows (`have`). */
	| { kind: 'same'; key: string }
	| PlainConstruction;

/** Requests with equal keys give the same result (the source not in use and `have` do not count). */
export function requestKey(r: ConstructionRequest): string {
	const source = r.from === 're' ? [r.re, r.defs] : [r.text];
	return JSON.stringify([r.from, ...source, r.naming, r.showEmpty]);
}

export function constructionKey(machine: string, naming: SubsetNaming, showEmpty: boolean): string {
	return `${naming} ${showEmpty}\n${machine}`;
}

/** Everything the page draws for a request. */
export function computeConstruction(req: ConstructionRequest): ConstructionData {
	const build = buildNfa(req);
	if (!build.nfa || build.key === null) return { kind: 'none' };
	const machine = build.key;
	const key = constructionKey(machine, req.naming, req.showEmpty);
	if (key === req.have) return { kind: 'same', key };
	const nfa = build.nfa;
	const grid = build.positions;
	const layout =
		!grid && nfa.states.length <= MAX_DRAWN_NFA_AUTO ? nodePositions(layoutAutomaton(nfa)) : null;
	const c = construct(nfa, { naming: req.naming, includeEmpty: req.showEmpty });
	let dfaLayout: PlainLayout | null = null;
	if (c.result && c.result.dfa.states.length <= MAX_DRAWN_DFA) {
		const l = layoutAutomaton(drawnDfa(c.result));
		dfaLayout = { positions: nodePositions(l), bounds: l.bounds };
	}
	return {
		kind: 'built',
		key,
		machine,
		nfa: automatonToPlain(nfa),
		grid,
		layout,
		result: c.result ? subsetResultToPlain(c.result) : null,
		tooLarge: c.tooLarge,
		limit: c.limit,
		classes: c.classes,
		dfaLayout,
		dfaText: c.result ? formatAutomatonText(c.result.dfa) : null
	};
}

/** A construction as the page shows it. */
export interface Shown {
	key: string;
	machine: string;
	showEmpty: boolean;
	nfa: Automaton;
	grid: Positions | null;
	layout: Positions | null;
	construction: Construction;
	/** The DFA as drawn (the ∅ state, when shown, is a trap state). */
	dfa: Automaton | null;
	dfaLayout: PlainLayout | null;
	dfaText: string | null;
}

export function reviveConstruction(p: PlainConstruction, showEmpty: boolean): Shown {
	const result = p.result ? subsetResultFromPlain(p.result) : null;
	return {
		key: p.key,
		machine: p.machine,
		showEmpty,
		nfa: automatonFromPlain(p.nfa),
		grid: p.grid,
		layout: p.layout,
		construction: { result, tooLarge: p.tooLarge, limit: p.limit, classes: p.classes },
		dfa: result ? drawnDfa(result) : null,
		dfaLayout: p.dfaLayout,
		dfaText: p.dfaText
	};
}

/**
 * The new construction has other steps than the old one (another NFA, or the
 * ∅ state shown or hidden); a new naming alone keeps the steps.
 */
export function stepsChanged(before: Shown | null, after: Shown): boolean {
	return !before || before.machine !== after.machine || before.showEmpty !== after.showEmpty;
}

/** Shown when the construction for the source ran out of time. */
export const TOO_SLOW =
	'The subset construction takes too long for this NFA; its DFA would be very large.';
