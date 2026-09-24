/**
 * Pure logic behind the Subset Construction page: the NFA from the source
 * (Thompson for a regular expression, the text format for an NFA), size
 * guards, the worklist table, per-step highlights, predictions, the
 * NFA/DFA side-by-side run, and the (0 | 1)* 1 (0|1)^k blow-up numbers.
 */
import { formatLabel } from '$lib/theory/chars';
import type { CharSet } from '$lib/theory/charset';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { parseDefinitions, parseRegex, type Regex } from '$lib/theory/regex';
import {
	ClosureIndex,
	letterName,
	parseAutomatonText,
	runDfa,
	runNfa,
	subsetConstruction,
	symbolClasses,
	thompson,
	type Automaton,
	type ClosureEvent,
	type Positions,
	type StateId,
	type SubsetNaming,
	type SubsetResult,
	type SubsetTraceStep
} from '$lib/theory/automata';

/** Largest NFA the page builds (Thompson or typed). */
export const MAX_NFA_STATES = 300;
/** Largest DFA the page constructs; beyond it the construction stops. */
export const MAX_DFA_STATES = 300;
/** Largest DFA drawn as a diagram (automatic layout gets slow past this). */
export const MAX_DRAWN_DFA = 24;
/** Largest NFA drawn when it needs automatic layout (typed NFAs). */
export const MAX_DRAWN_NFA_AUTO = 60;
/** Largest NFA drawn on Thompson's grid. */
export const MAX_DRAWN_NFA_GRID = 160;
/** Longest input for the side-by-side run. */
export const MAX_RUN_INPUT = 64;
/** k range of the blow-up family (0 | 1)* 1 (0|1)^k. */
export const BLOWUP_MIN_K = 1;
export const BLOWUP_MAX_K = 8;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Display name of a state ('' becomes #id). */
export function stateName(a: Automaton, id: StateId): string {
	return a.states[id]?.name || `#${id}`;
}

/** Lecture set notation with spaces inside the braces: { A, B, C }, or { } when empty. */
export function setText(a: Automaton, ids: readonly StateId[]): string {
	return ids.length === 0 ? '{ }' : `{ ${ids.map((id) => stateName(a, id)).join(', ')} }`;
}

/** Column heading for a symbol class: 0, a, a–z, … */
export function classText(c: CharSet): string {
	return formatLabel(c);
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** 10 → '¹⁰'. */
export function superscript(n: number): string {
	return String(Math.trunc(n))
		.split('')
		.map((d) => (d === '-' ? '⁻' : SUPERSCRIPT[Number(d)]))
		.join('');
}

/** 2^n written out: '1,024' for n ≤ 40, else '≈ 1.27 × 10³⁰'. */
export function powerOfTwoText(n: number): string {
	if (n <= 40) return (2 ** n).toLocaleString('en-US');
	const exp10 = n * Math.log10(2);
	const e = Math.floor(exp10);
	const mantissa = 10 ** (exp10 - e);
	return `≈ ${mantissa.toFixed(2)} × 10${superscript(e)}`;
}

/** Set equality of two id lists. */
export function sameSet(a: readonly StateId[], b: readonly StateId[]): boolean {
	if (a.length !== b.length) return false;
	const s = new Set(a);
	return b.every((x) => s.has(x));
}

// ---------------------------------------------------------------------------
// Building the NFA
// ---------------------------------------------------------------------------

/**
 * Number of states Thompson's construction (lecture variant) makes for `r`,
 * computed without building it; results above `limit` are reported as
 * `limit + 1`. Shared definition bodies are counted once per use, as
 * Thompson expands them.
 */
export function thompsonSize(r: Regex, limit = MAX_NFA_STATES): number {
	const over = limit + 1;
	const cap = (n: number) => (n > over || !Number.isFinite(n) ? over : n);
	const memo = new Map<Regex, number>();
	const size = (n: Regex): number => {
		const hit = memo.get(n);
		if (hit !== undefined) return hit;
		let out: number;
		switch (n.kind) {
			case 'empty':
			case 'epsilon':
			case 'chars':
			case 'any':
				out = 2;
				break;
			case 'concat':
				out = n.parts.reduce((s, p) => cap(s + size(p)), 0);
				break;
			case 'alt':
				out = n.options.reduce((s, p) => cap(s + size(p)), 2);
				break;
			case 'star':
				out = cap(size(n.body) + 2);
				break;
			case 'plus':
				out = cap(2 * size(n.body) + 2);
				break;
			case 'optional':
				out = cap(size(n.body) + 4);
				break;
			case 'repeat': {
				const total = n.max === null ? n.min + 1 : n.max;
				if (total <= 0) {
					out = 2;
					break;
				}
				const b = size(n.body);
				out = cap(n.min * b + (n.max === null ? b + 2 : (n.max - n.min) * (b + 4)));
				break;
			}
			case 'ref':
				out = size(n.body);
				break;
		}
		memo.set(n, out);
		return out;
	};
	return size(r);
}

export interface NfaSource {
	from: 're' | 'nfa';
	re: string;
	defs: string;
	text: string;
}

export interface NfaBuild {
	nfa: Automaton | null;
	/** Thompson's grid (regular-expression source); null means automatic layout. */
	positions: Positions | null;
	/** Problems in the regular expression (spans index into `re`). */
	reDiagnostics: Diagnostic[];
	/** Problems in the regular definitions (spans index into `defs`). */
	defsDiagnostics: Diagnostic[];
	/** Problems in the NFA text (spans index into `text`). */
	textDiagnostics: Diagnostic[];
	/** The NFA would have more than MAX_NFA_STATES states (it is not built). */
	tooLarge: number | null;
}

/** The NFA for the current source, or diagnostics explaining why there is none. */
export function buildNfa(src: NfaSource): NfaBuild {
	const empty: NfaBuild = {
		nfa: null,
		positions: null,
		reDiagnostics: [],
		defsDiagnostics: [],
		textDiagnostics: [],
		tooLarge: null
	};
	if (src.from === 're') {
		const d = parseDefinitions(src.defs);
		const r = parseRegex(src.re, { defs: d.defs, invalid: d.invalid });
		const base = { ...empty, reDiagnostics: r.diagnostics, defsDiagnostics: d.diagnostics };
		if (!r.ok) return base;
		const size = thompsonSize(r.regex);
		if (size > MAX_NFA_STATES) return { ...base, tooLarge: size };
		const t = thompson(r.regex);
		return { ...base, nfa: t.nfa, positions: t.positions };
	}
	const p = parseAutomatonText(src.text);
	const base = { ...empty, textDiagnostics: p.diagnostics };
	if (!p.automaton) return base;
	if (p.automaton.states.length > MAX_NFA_STATES)
		return { ...base, tooLarge: p.automaton.states.length };
	return { ...base, nfa: p.automaton };
}

// ---------------------------------------------------------------------------
// The construction, with a size guard
// ---------------------------------------------------------------------------

/**
 * Number of DFA states the subset construction reaches (plus ∅ when
 * `includeEmpty`), or null as soon as it passes `limit`.
 */
export function countSubsets(
	nfa: Automaton,
	opts: { limit?: number; includeEmpty?: boolean } = {}
): number | null {
	const limit = opts.limit ?? MAX_DFA_STATES;
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const key = (ids: StateId[]) => [...ids].sort((a, b) => a - b).join(',');
	const first = index.closure([nfa.start]);
	const seen = new Set([key(first)]);
	const queue = [first];
	for (let q = 0; q < queue.length; q++) {
		for (const c of classes) {
			const next = index.closure(index.move(queue[q], c).targets);
			if (next.length === 0 && !opts.includeEmpty) continue;
			const k = key(next);
			if (seen.has(k)) continue;
			seen.add(k);
			if (seen.size > limit) return null;
			queue.push(next);
		}
	}
	return seen.size;
}

export interface Construction {
	result: SubsetResult | null;
	/** The DFA would pass MAX_DFA_STATES (the construction is not run). */
	tooLarge: boolean;
}

export function construct(
	nfa: Automaton,
	opts: { naming: SubsetNaming; includeEmpty: boolean }
): Construction {
	if (countSubsets(nfa, { includeEmpty: opts.includeEmpty }) === null)
		return { result: null, tooLarge: true };
	return { result: subsetConstruction(nfa, opts), tooLarge: false };
}

/**
 * The DFA as drawn: the ∅ state, when there is one, is flagged as a trap state
 * (dashed outline, Lexical Analysis III slide 6).
 */
export function drawnDfa(result: SubsetResult): Automaton {
	const empty = result.empty;
	if (empty === null) return result.dfa;
	return {
		...result.dfa,
		states: result.dfa.states.map((s) => (s.id === empty ? { ...s, trap: true } : s))
	};
}

/** The DFA as it stands after `step`: its first `dfaStates` states and `dfaTransitions` transitions. */
export function partialDfa(dfa: Automaton, step: SubsetTraceStep | undefined): Automaton {
	if (!step) return dfa;
	return {
		...dfa,
		states: dfa.states.slice(0, step.dfaStates),
		transitions: dfa.transitions.slice(0, step.dfaTransitions)
	};
}

// ---------------------------------------------------------------------------
// Worklist table
// ---------------------------------------------------------------------------

export interface WorkCell {
	move: { step: number; targets: StateId[]; via: number[] } | null;
	closure: { step: number; order: StateId[] } | null;
	target: { step: number; to: StateId | null; isNew: boolean } | null;
}

export interface WorkRow {
	/** DFA state id (rows are in creation order, which is the FIFO worklist order). */
	state: StateId;
	/** Step at which the state was created. */
	created: number;
	/** One cell per symbol class. */
	cells: WorkCell[];
}

/** Position of a step in the table: its row (DFA state) and class column. */
export interface StepCell {
	from: StateId;
	column: number;
}

/** Row and column of a move, closure or target step; null for start and done. */
export function stepCell(result: SubsetResult, step: SubsetTraceStep): StepCell | null {
	if (step.kind === 'start' || step.kind === 'done') return null;
	return { from: step.from, column: result.classes.indexOf(step.symbol) };
}

/** The worklist table: one row per DFA state, one cell per (state, class). */
export function worklist(result: SubsetResult): WorkRow[] {
	const rows: WorkRow[] = result.dfa.states.map((s) => ({
		state: s.id,
		created: 0,
		cells: result.classes.map(() => ({ move: null, closure: null, target: null }))
	}));
	result.steps.forEach((step, i) => {
		const at = stepCell(result, step);
		if (!at || at.column < 0) return;
		const cell = rows[at.from].cells[at.column];
		if (step.kind === 'move') cell.move = { step: i, targets: step.targets, via: step.via };
		else if (step.kind === 'closure') cell.closure = { step: i, order: step.order };
		else if (step.kind === 'target') {
			cell.target = { step: i, to: step.to, isNew: step.isNew };
			if (step.isNew && step.to !== null) rows[step.to].created = i;
		}
	});
	return rows;
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export interface Highlight {
	active: StateId[];
	taken: number[];
	/** States in the "info" tone (the set being processed). */
	info: StateId[];
}

const followed = (events: readonly ClosureEvent[]) =>
	events.flatMap((e) => (e.kind === 'follow' && e.via !== undefined ? [e.via] : []));

/**
 * NFA highlight for a step: the set being processed (info), then the move
 * targets and the transitions taken, then the ε-closure and the ε-edges it
 * followed.
 */
export function nfaHighlight(result: SubsetResult, index: number): Highlight {
	const step = result.steps[index];
	const none: Highlight = { active: [], taken: [], info: [] };
	if (!step) return none;
	switch (step.kind) {
		case 'start':
			return { active: step.closure.order, taken: followed(step.closure.events), info: [] };
		case 'move': {
			const hit = new Set(step.targets);
			const subset = result.dfa.states[step.from].subset ?? [];
			return { active: step.targets, taken: step.via, info: subset.filter((s) => !hit.has(s)) };
		}
		case 'closure':
		case 'target': {
			const closure = step.kind === 'closure' ? step : result.steps[index - 1];
			if (closure?.kind !== 'closure') return none;
			const move = result.steps[index - (step.kind === 'closure' ? 1 : 2)];
			const via = move?.kind === 'move' ? move.via : [];
			return { active: closure.order, taken: [...via, ...followed(closure.events)], info: [] };
		}
		case 'done':
			return none;
	}
}

/** DFA highlight for a step: the state being processed (info), the target and its new edge (active). */
export function dfaHighlight(result: SubsetResult, index: number): Highlight {
	const step = result.steps[index];
	if (!step) return { active: [], taken: [], info: [] };
	switch (step.kind) {
		case 'start':
			return { active: [step.dstate], taken: [], info: [] };
		case 'move':
		case 'closure':
			return { active: [], taken: [], info: [step.from] };
		case 'target':
			return {
				active: step.to === null ? [] : [step.to],
				taken: step.transition === null ? [] : [step.transition],
				info: step.to === step.from ? [] : [step.from]
			};
		case 'done':
			return { active: [], taken: [], info: [] };
	}
}

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------

/** The first target step after `index`, or null when every target is revealed. */
export function nextTarget(result: SubsetResult, index: number): number | null {
	for (let i = Math.max(0, index + 1); i < result.steps.length; i++)
		if (result.steps[i].kind === 'target') return i;
	return null;
}

/** The ε-closure a target step is built from (the closure step just before it). */
export function targetSet(result: SubsetResult, targetStep: number): StateId[] {
	const c = result.steps[targetStep - 1];
	return c?.kind === 'closure' ? c.order : [];
}

export interface PredictionCheck {
	correct: boolean;
	/** Picked and in the set. */
	hits: StateId[];
	/** In the set but not picked. */
	missing: StateId[];
	/** Picked but not in the set. */
	extra: StateId[];
}

export function checkPrediction(
	picked: readonly StateId[],
	actual: readonly StateId[]
): PredictionCheck {
	const want = new Set(actual);
	const got = new Set(picked);
	const hits = actual.filter((s) => got.has(s));
	const missing = actual.filter((s) => !got.has(s));
	const extra = [...got].filter((s) => !want.has(s));
	return { correct: missing.length === 0 && extra.length === 0, hits, missing, extra };
}

// ---------------------------------------------------------------------------
// Running the NFA and the DFA side by side
// ---------------------------------------------------------------------------

export interface SideBySideStep {
	pos: number;
	char?: string;
	/** NFA active set (after the ε-closure). */
	nfaActive: StateId[];
	/** Transitions taken by the NFA on this symbol, then the ε-edges its closure examined. */
	nfaTaken: number[];
	/** DFA state; null once the DFA has no transition (the hidden ∅ state). */
	dfaState: StateId | null;
	dfaVia: number | null;
	/** The DFA state's NFA states equal the NFA's active set. */
	same: boolean;
}

export interface SideBySide {
	steps: SideBySideStep[];
	nfaAccepts: boolean;
	dfaAccepts: boolean;
}

/** Runs `input` on the NFA (active set) and on its subset DFA (one state), symbol by symbol. */
export function runSideBySide(nfa: Automaton, dfa: Automaton, input: string): SideBySide {
	const n = runNfa(nfa, input);
	const d = runDfa(dfa, input);
	const steps = n.steps.map((ns, i): SideBySideStep => {
		const ds = d.steps[i];
		const dfaState = ds?.state ?? null;
		const members = dfaState === null ? [] : (dfa.states[dfaState].subset ?? []);
		return {
			pos: ns.pos,
			char: ns.char,
			nfaActive: ns.active,
			nfaTaken: [...ns.taken, ...ns.closure],
			dfaState,
			dfaVia: ds?.via ?? null,
			same: sameSet(members, ns.active)
		};
	});
	return { steps, nfaAccepts: n.accepted, dfaAccepts: d.accepted };
}

// ---------------------------------------------------------------------------
// Blow-up: (0 | 1)* 1 (0|1)^k
// ---------------------------------------------------------------------------

/**
 * The NFA for (0 | 1)* 1 (0|1)^k drawn as on Lexical Analysis III, slide 16
 * (k = 2): A loops on 0 and 1, A →1 B, then k steps on 0,1 to the accepting
 * state. It has k + 2 states.
 */
export function blowupNfaText(k: number): string {
	const n = k + 2;
	const name = (i: number) => letterName(i);
	const lines = [`start: A`, `accept: ${name(n - 1)}`, `A 0,1 A`, `A 1 B`];
	for (let i = 1; i < n - 1; i++) lines.push(`${name(i)} 0,1 ${name(i + 1)}`);
	return lines.join('\n') + '\n';
}

export interface BlowupRow {
	k: number;
	nfaStates: number;
	/** Counted by running the subset construction. */
	dfaStates: number;
	/** 2^(k+1). */
	formula: number;
}

/** NFA and DFA sizes for (0 | 1)* 1 (0|1)^k, k = BLOWUP_MIN_K … maxK. */
export function blowupRows(maxK = BLOWUP_MAX_K): BlowupRow[] {
	const rows: BlowupRow[] = [];
	for (let k = BLOWUP_MIN_K; k <= maxK; k++) {
		const nfa = parseAutomatonText(blowupNfaText(k)).automaton!;
		const dfaStates = countSubsets(nfa, { limit: 2 ** (k + 2) }) ?? -1;
		rows.push({ k, nfaStates: nfa.states.length, dfaStates, formula: 2 ** (k + 1) });
	}
	return rows;
}
