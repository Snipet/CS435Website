/**
 * Running automata on input strings.
 *
 * Positions (`pos`) are code-unit offsets into the input, so `input.slice(0, pos)`
 * is the part read so far. Symbols are whole code points.
 */
import { outgoingIndex } from './core';
import { ClosureIndex, type ClosureEvent } from './closure';
import { codePoints, compile, edgeOn } from './internal';
import type { Automaton, StateId } from './types';

export interface DfaStep {
	/** Input read so far: input.slice(0, pos). */
	pos: number;
	/** Current state; null once the machine is stuck. */
	state: StateId | null;
	/** Transition just taken. */
	via?: number;
	/** Symbol just read. */
	char?: string;
}

export interface DfaRun {
	steps: DfaStep[];
	accepted: boolean;
	/** 'stuck': a missing transition (the trap state / crash of a partial DFA). */
	outcome: 'accept' | 'reject' | 'stuck';
	/** Offset of the symbol with no transition. */
	stuckAt?: number;
}

/**
 * Runs a DFA (partial DFAs allowed). If several transitions match a symbol,
 * the first one created is taken; ε-transitions are ignored.
 */
export function runDfa(a: Automaton, input: string): DfaRun {
	const m = compile(a);
	let state = a.start;
	let pos = 0;
	const steps: DfaStep[] = [{ pos: 0, state }];
	for (const { cp, end } of codePoints(input)) {
		const char = String.fromCodePoint(cp);
		const e = edgeOn(m, state, cp);
		if (!e) {
			steps.push({ pos: end, state: null, char });
			return { steps, accepted: false, outcome: 'stuck', stuckAt: pos };
		}
		state = e.to;
		pos = end;
		steps.push({ pos, state, via: e.id, char });
	}
	const accepted = a.states[state].accepting;
	return { steps, accepted, outcome: accepted ? 'accept' : 'reject' };
}

export interface NfaStep {
	pos: number;
	/** Symbol just read (absent for the initial step). */
	char?: string;
	/** move(previous active, char); for the initial step, [start]. */
	moved: StateId[];
	/** ε-closure(moved), in closure order. */
	active: StateId[];
	/** Labeled transitions taken by the move. */
	taken: number[];
	/** ε-transitions examined by the closure. */
	closure: number[];
}

export interface NfaRun {
	steps: NfaStep[];
	accepted: boolean;
}

const epsilonIds = (events: ClosureEvent[]) => [
	...new Set(events.flatMap((e) => (e.via === undefined ? [] : [e.via])))
];

/** Runs an NFA by tracking the set of active states. steps[0] is ε-closure({ start }) at pos 0. */
export function runNfa(a: Automaton, input: string): NfaRun {
	const index = new ClosureIndex(a);
	const first = index.closureTrace([a.start]);
	const steps: NfaStep[] = [
		{ pos: 0, moved: [a.start], active: first.order, taken: [], closure: epsilonIds(first.events) }
	];
	let active = first.order;
	for (const { cp, end } of codePoints(input)) {
		const moved = index.moveWhere(active, (label) => label.has(cp));
		const closed = index.closureTrace(moved.targets);
		active = closed.order;
		steps.push({
			pos: end,
			char: String.fromCodePoint(cp),
			moved: moved.targets,
			active,
			taken: moved.via,
			closure: epsilonIds(closed.events)
		});
	}
	return { steps, accepted: active.some((s) => a.states[s].accepting) };
}

export interface PathNode {
	state: StateId;
	pos: number;
	/** Transition that led here (absent at the root). */
	via?: number;
	children: PathNode[];
	/** All input read and the state accepts. */
	accepting: boolean;
	/** A path that ends without accepting (no way to continue). */
	dead: boolean;
}

/**
 * Every computation path of the machine on `input`, breadth first, as a tree.
 * ε-cycles are cut (a path never revisits a state without reading a symbol).
 * Stops after `maxNodes` nodes (default 400) and reports `truncated`.
 */
export function pathTree(
	a: Automaton,
	input: string,
	opts: { maxNodes?: number } = {}
): { root: PathNode; truncated: boolean } {
	const maxNodes = opts.maxNodes ?? 400;
	const out = outgoingIndex(a);
	const cps = codePoints(input);
	const end = input.length;
	interface Work {
		node: PathNode;
		index: number;
		sameStep: Set<StateId>;
	}
	const makeNode = (state: StateId, pos: number, via?: number): PathNode => {
		const node: PathNode = { state, pos, children: [], accepting: false, dead: false };
		if (via !== undefined) node.via = via;
		return node;
	};
	const root = makeNode(a.start, 0);
	const queue: Work[] = [{ node: root, index: 0, sameStep: new Set([a.start]) }];
	let count = 1;
	let truncated = false;
	const unexpanded = new Set<PathNode>();
	for (let i = 0; i < queue.length; i++) {
		const { node, index, sameStep } = queue[i];
		const cp = index < cps.length ? cps[index].cp : undefined;
		const next: Work[] = [];
		for (const t of out[node.state]) {
			if (t.label === null) {
				if (sameStep.has(t.to)) continue;
				const child = makeNode(t.to, node.pos, t.id);
				next.push({ node: child, index, sameStep: new Set([...sameStep, t.to]) });
			} else if (cp !== undefined && t.label.has(cp)) {
				const child = makeNode(t.to, cps[index].end, t.id);
				next.push({ node: child, index: index + 1, sameStep: new Set([t.to]) });
			}
		}
		for (const work of next) {
			if (count >= maxNodes) {
				truncated = true;
				unexpanded.add(node);
				break;
			}
			count++;
			node.children.push(work.node);
			queue.push(work);
		}
	}
	for (const { node } of queue) {
		node.accepting = node.pos === end && a.states[node.state].accepting;
		node.dead = node.children.length === 0 && !node.accepting && !unexpanded.has(node);
	}
	return { root, truncated };
}

/** True when the machine (DFA or NFA) accepts `input`. */
export function accepts(a: Automaton, input: string): boolean {
	const index = new ClosureIndex(a);
	let active = index.closure([a.start]);
	for (const { cp } of codePoints(input)) {
		if (active.length === 0) return false;
		active = index.closure(index.moveWhere(active, (label) => label.has(cp)).targets);
	}
	return active.some((s) => a.states[s].accepting);
}
