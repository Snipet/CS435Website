/**
 * Step-by-step runs for the Finite Automata tool (Lexical Analysis III,
 * slides 4, 6, 12–13).
 *
 * A DFA (or partial DFA) has one current state; a missing transition either
 * sends it to the trap state (it keeps reading) or crashes it (it stops). An
 * NFA keeps a set of active states: move on the symbol, then ε-closure,
 * optionally shown as two separate steps.
 */
import { showChar } from '$lib/theory/chars';
import { alphabetOf, analyzeDeterminism, complete, sortByName } from '$lib/theory/automata/core';
import { runDfa, runNfa } from '$lib/theory/automata/simulate';
import type { Automaton, StateId } from '$lib/theory/automata/types';
import { hasStates, quoteSymbol, stateName, stateSetText } from './model';

export type MissingMode = 'trap' | 'crash';

/** A piece of a caption, typed so the page can style names, sets and symbols. */
export type Seg =
	| { kind: 'text'; text: string }
	| { kind: 'state'; text: string }
	| { kind: 'set'; text: string }
	/** A quoted symbol in running text: '1'. */
	| { kind: 'symbol'; text: string }
	/** An arrow with the symbol as a superscript: →¹ (a space shows as ␣). */
	| { kind: 'arrow'; text: string };

export interface RunStep {
	kind: 'start' | 'closure' | 'read' | 'stuck';
	/** Input read so far: input.slice(0, pos). */
	pos: number;
	/** The symbol just read, `[start, end)` in the input. */
	read: { start: number; end: number; char: string } | null;
	/** States to fill. */
	active: StateId[];
	/** Transitions to draw as just taken. */
	taken: number[];
	/** DFA: the state the symbol was read in. */
	from: StateId | null;
	caption: Seg[];
}

export interface TraceItem {
	/** The last step this item stands for; the item covers the steps after the previous item's. */
	step: number;
	/** Symbol on the arrow into this item, as shown (␣ for a space; absent for the first item). */
	symbol?: string;
	/** A state name, or a set such as `{ A, B }`. */
	text: string;
	isSet: boolean;
	/** No transition: the run stopped here. */
	stuck?: boolean;
}

export interface RunModel {
	kind: 'dfa' | 'nfa';
	/** The machine the run is on: the completed machine when missing transitions go to the trap. */
	automaton: Automaton;
	steps: RunStep[];
	trace: TraceItem[];
	accepted: boolean;
	outcome: Seg[];
	/** Outcome fill of the states at the last step. */
	tones: Map<StateId, 'accept' | 'reject'>;
	/** The trap state of `automaton`, when the run is on the completed machine. */
	trap: StateId | null;
	/** The run moved into the trap state. */
	usesTrap: boolean;
}

export interface RunOptions {
	/** Partial DFAs: go to the trap state (default) or crash. */
	missing?: MissingMode;
	/** NFAs: show move and ε-closure as separate steps. */
	separateClosure?: boolean;
	/** `complete(a)`, if the caller already has it (its ids are then shared). */
	completed?: { automaton: Automaton; trap: StateId | null };
}

const text = (t: string): Seg => ({ kind: 'text', text: t });
const state = (a: Automaton, id: StateId): Seg => ({ kind: 'state', text: stateName(a, id) });
const set = (a: Automaton, ids: readonly StateId[]): Seg => ({
	kind: 'set',
	text: stateSetText(a, ids)
});
const symbol = (ch: string): Seg => ({ kind: 'symbol', text: quoteSymbol(ch) });
/** A symbol on an arrow: visible even when it is a space, a tab or a newline. */
const onArrow = (ch: string): string => showChar(ch, 'label');
const arrow = (ch: string): Seg => ({ kind: 'arrow', text: onArrow(ch) });

/** Plain text of a caption: "Read '1': A →1 B." */
export function segText(segs: readonly Seg[]): string {
	return segs.map((s) => (s.kind === 'arrow' ? ` →${s.text} ` : s.text)).join('');
}

/** Index of the trace item that contains `step`. */
export function traceIndexAt(trace: readonly TraceItem[], step: number): number {
	const i = trace.findIndex((t) => t.step >= step);
	return i < 0 ? trace.length - 1 : i;
}

/** The run of `a` on `input`, or null when the machine has no states. */
export function buildRun(a: Automaton, input: string, opts: RunOptions = {}): RunModel | null {
	if (!hasStates(a)) return null;
	const kind = analyzeDeterminism(a).kind;
	if (kind === 'nfa') return nfaRun(a, input, opts.separateClosure ?? false);
	if (kind === 'partial-dfa' && (opts.missing ?? 'trap') === 'trap') {
		const c = opts.completed ?? complete(a);
		return dfaRun(c.automaton, input, c.trap);
	}
	return dfaRun(a, input, null);
}

function dfaRun(a: Automaton, input: string, trap: StateId | null): RunModel {
	const run = runDfa(a, input);
	const sigma = alphabetOf(a);
	const steps: RunStep[] = [];
	const trace: TraceItem[] = [];
	let trapEntry: { from: StateId; char: string } | null = null;
	run.steps.forEach((s, i) => {
		if (i === 0) {
			steps.push({
				kind: 'start',
				pos: 0,
				read: null,
				active: [s.state!],
				taken: [],
				from: null,
				caption: [text('Start in state '), state(a, s.state!), text('.')]
			});
			trace.push({ step: 0, text: stateName(a, s.state!), isSet: false });
			return;
		}
		const prev = run.steps[i - 1];
		const from = prev.state!;
		const char = s.char!;
		const read = { start: prev.pos, end: s.pos, char };
		if (s.state === null) {
			steps.push({
				kind: 'stuck',
				pos: s.pos,
				read,
				active: [from],
				taken: [],
				from,
				caption: sigma.has(char)
					? [
							text('Read '),
							symbol(char),
							text(': '),
							state(a, from),
							text(' has no transition on '),
							symbol(char),
							text(', so the machine crashes.')
						]
					: [
							text('Read '),
							symbol(char),
							text(': '),
							symbol(char),
							text(' is not a symbol of Σ, so the machine crashes.')
						]
			});
			trace.push({
				step: i,
				symbol: onArrow(char),
				text: 'no transition',
				isSet: false,
				stuck: true
			});
			return;
		}
		const to = s.state;
		const intoTrap = trap !== null && to === trap && from !== trap;
		if (intoTrap && !trapEntry) trapEntry = { from, char };
		steps.push({
			kind: 'read',
			pos: s.pos,
			read,
			active: [to],
			taken: s.via === undefined ? [] : [s.via],
			from,
			caption: intoTrap
				? [
						text('Read '),
						symbol(char),
						text(': '),
						state(a, from),
						text(' has no transition on '),
						symbol(char),
						text(', so the machine moves to the trap state.')
					]
				: [
						text('Read '),
						symbol(char),
						text(': '),
						state(a, from),
						arrow(char),
						state(a, to),
						text('.')
					]
		});
		trace.push({ step: i, symbol: onArrow(char), text: stateName(a, to), isSet: false });
	});

	const tones = new Map<StateId, 'accept' | 'reject'>();
	const last = run.steps[run.steps.length - 1];
	let outcome: Seg[];
	if (run.outcome === 'stuck') {
		const from = run.steps[run.steps.length - 2].state!;
		tones.set(from, 'reject');
		outcome = sigma.has(last.char!)
			? [text('Reject: no transition from '), state(a, from), text(' on '), symbol(last.char!)]
			: [text('Reject: '), symbol(last.char!), text(' is not a symbol of Σ')];
	} else {
		const end = last.state!;
		tones.set(end, run.accepted ? 'accept' : 'reject');
		const entry = trapEntry as { from: StateId; char: string } | null;
		if (run.accepted)
			outcome = [text('Accept: the input ended in accepting state '), state(a, end)];
		else if (trap !== null && end === trap && entry)
			outcome = [
				text('Reject: the input ended in the trap state (no transition from '),
				state(a, entry.from),
				text(' on '),
				symbol(entry.char),
				text(')')
			];
		else outcome = [text('Reject: the input ended in non-accepting state '), state(a, end)];
	}
	return {
		kind: 'dfa',
		automaton: a,
		steps,
		trace,
		accepted: run.accepted,
		outcome,
		tones,
		trap,
		usesTrap: trapEntry !== null
	};
}

function nfaRun(a: Automaton, input: string, separate: boolean): RunModel {
	const run = runNfa(a, input);
	const hasEpsilon = a.transitions.some((t) => t.label === null);
	const steps: RunStep[] = [];
	const trace: TraceItem[] = [];
	const unique = (xs: number[]) => [...new Set(xs)];

	run.steps.forEach((s, i) => {
		const grew = s.active.length > s.moved.length;
		if (i === 0) {
			if (separate) {
				steps.push({
					kind: 'start',
					pos: 0,
					read: null,
					active: s.moved,
					taken: [],
					from: null,
					caption: [text('Start in state '), state(a, a.start), text('.')]
				});
				steps.push({
					kind: 'closure',
					pos: 0,
					read: null,
					active: s.active,
					taken: s.closure,
					from: null,
					caption: closureCaption(a, s.moved, s.active)
				});
			} else {
				steps.push({
					kind: 'start',
					pos: 0,
					read: null,
					active: s.active,
					taken: s.closure,
					from: null,
					caption:
						hasEpsilon && grew
							? [
									text('Start: ε-closure('),
									set(a, s.moved),
									text(') = '),
									set(a, s.active),
									text('.')
								]
							: [text('Start in '), set(a, s.active), text('.')]
				});
			}
			trace.push({ step: steps.length - 1, text: stateSetText(a, s.active), isSet: true });
			return;
		}
		const prev = run.steps[i - 1];
		const char = s.char!;
		const read = { start: prev.pos, end: s.pos, char };
		const moveSegs: Seg[] =
			s.moved.length === 0
				? [
						text('Read '),
						symbol(char),
						text(': no active state has a transition on '),
						symbol(char),
						text(', so the set is empty')
					]
				: [
						text('Read '),
						symbol(char),
						text(': move('),
						set(a, prev.active),
						text(', '),
						symbol(char),
						text(') = '),
						set(a, s.moved)
					];
		if (separate) {
			steps.push({
				kind: 'read',
				pos: s.pos,
				read,
				active: s.moved,
				taken: s.taken,
				from: null,
				caption: [...moveSegs, text('.')]
			});
			steps.push({
				kind: 'closure',
				pos: s.pos,
				read,
				active: s.active,
				taken: s.closure,
				from: null,
				caption: closureCaption(a, s.moved, s.active)
			});
		} else {
			steps.push({
				kind: 'read',
				pos: s.pos,
				read,
				active: s.active,
				taken: unique([...s.taken, ...s.closure]),
				from: null,
				caption: grew
					? [...moveSegs, text(', and its ε-closure is '), set(a, s.active), text('.')]
					: [...moveSegs, text('.')]
			});
		}
		trace.push({
			step: steps.length - 1,
			symbol: onArrow(char),
			text: stateSetText(a, s.active),
			isSet: true
		});
	});

	const final = run.steps[run.steps.length - 1].active;
	const accepting = sortByName(
		a,
		final.filter((id) => a.states[id].accepting)
	);
	const tones = new Map<StateId, 'accept' | 'reject'>();
	let outcome: Seg[];
	if (run.accepted) {
		for (const id of accepting) tones.set(id, 'accept');
		outcome = [
			text('Accept: the final set '),
			set(a, final),
			text(accepting.length > 1 ? ' contains accepting states ' : ' contains accepting state '),
			...accepting.flatMap((id, k) => (k === 0 ? [state(a, id)] : [text(', '), state(a, id)]))
		];
	} else {
		for (const id of final) tones.set(id, 'reject');
		outcome =
			final.length === 0
				? [text('Reject: the final set is empty')]
				: [text('Reject: the final set '), set(a, final), text(' contains no accepting state')];
	}
	return {
		kind: 'nfa',
		automaton: a,
		steps,
		trace,
		accepted: run.accepted,
		outcome,
		tones,
		trap: null,
		usesTrap: false
	};
}

function closureCaption(a: Automaton, moved: StateId[], active: StateId[]): Seg[] {
	if (active.length === moved.length)
		return [text('ε-closure('), set(a, moved), text(') adds no states.')];
	return [text('ε-closure('), set(a, moved), text(') = '), set(a, active), text('.')];
}
