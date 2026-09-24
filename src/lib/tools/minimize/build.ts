/**
 * Builds the DFA to minimize from the page's source: a regular expression
 * (Thompson's construction, then the subset construction, not minimized),
 * token rules (the scanner DFA of `scannerDfa`), or automaton text. Large
 * machines are refused before the expensive steps run, so typing stays quick.
 */
import {
	ClosureIndex,
	analyzeDeterminism,
	parseAutomatonText,
	scannerNfa,
	subsetConstruction,
	symbolClasses,
	thompson,
	type Automaton,
	type StateId
} from '$lib/theory/automata';
import { formatLabel } from '$lib/theory/chars';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { parseDefinitions, parseRegex, type Regex } from '$lib/theory/regex';
import { parseRules } from './rules';
import type { MinimizeState } from './state';

/** Largest DFA the page partitions (a trap state may be added on top). */
export const MAX_STATES = 300;
/** Largest DFA the page draws; bigger machines are listed in tables only. */
export const MAX_DRAWN_STATES = 60;
/** Largest Thompson NFA the page builds before determinizing. */
export const MAX_NFA_STATES = 4000;

export type BuildProblem =
	/** Input errors; see the diagnostics. */
	| { kind: 'invalid' }
	/** Automaton text that describes an NFA. */
	| { kind: 'nfa'; reasons: string[] }
	/** More than MAX_STATES DFA states (or MAX_NFA_STATES NFA states). */
	| { kind: 'too-big'; what: 'dfa' | 'nfa'; limit: number };

export interface BuildResult {
	dfa: Automaton | null;
	problem: BuildProblem | null;
	/** Problems in each input, with spans into that input's text. */
	diagnostics: {
		re: Diagnostic[];
		defs: Diagnostic[];
		rules: Diagnostic[];
		text: Diagnostic[];
	};
}

const hasError = (ds: readonly Diagnostic[]) => ds.some((d) => d.severity === 'error');

/**
 * Upper bound on the number of states of Thompson's NFA for `r` (derived forms
 * make fresh copies, so repetition multiplies). Saturates instead of overflowing.
 */
export function thompsonSize(r: Regex): number {
	const cap = (n: number) => Math.min(n, Number.MAX_SAFE_INTEGER);
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
				out = n.options.reduce((s, p) => cap(s + size(p) + 2), 0);
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
				const copies = (n.max ?? n.min + 1) + 1;
				out = cap(copies * (size(n.body) + 4));
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

/**
 * Number of DFA states the subset construction would build for `nfa`, or
 * `limit + 1` as soon as it would build more than `limit`.
 */
export function countSubsets(nfa: Automaton, limit: number): number {
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const key = (ids: StateId[]) => [...ids].sort((a, b) => a - b).join(',');
	const first = index.closure([nfa.start]);
	const seen = new Set([key(first)]);
	const queue = [first];
	for (let i = 0; i < queue.length; i++) {
		for (const c of classes) {
			const next = index.closure(index.move(queue[i], c).targets);
			if (next.length === 0) continue;
			const k = key(next);
			if (seen.has(k)) continue;
			seen.add(k);
			if (seen.size > limit) return limit + 1;
			queue.push(next);
		}
	}
	return seen.size;
}

function determinize(nfa: Automaton, out: BuildResult): BuildResult {
	if (countSubsets(nfa, MAX_STATES) > MAX_STATES) {
		out.problem = { kind: 'too-big', what: 'dfa', limit: MAX_STATES };
		return out;
	}
	out.dfa = subsetConstruction(nfa).dfa;
	return out;
}

function nfaReasons(a: Automaton): string[] {
	const report = analyzeDeterminism(a);
	const name = (id: StateId) => a.states[id].name || `#${id}`;
	const reasons: string[] = [];
	if (report.epsilonMoves.length > 0) {
		const t = report.epsilonMoves[0];
		reasons.push(`an ε-move (${name(t.from)} →ε ${name(t.to)})`);
	}
	if (report.conflicts.length > 0) {
		const c = report.conflicts[0];
		reasons.push(`two transitions from ${name(c.state)} on ${formatLabel(c.symbols)}`);
	}
	return reasons;
}

/** The DFA described by the page's source, or the reason there is none. */
export function buildInput(
	state: Pick<MinimizeState, 'from' | 're' | 'defs' | 'rules' | 'text'>
): BuildResult {
	const out: BuildResult = {
		dfa: null,
		problem: null,
		diagnostics: { re: [], defs: [], rules: [], text: [] }
	};
	const invalid = (): BuildResult => {
		out.problem = { kind: 'invalid' };
		return out;
	};

	if (state.from === 'dfa') {
		const parsed = parseAutomatonText(state.text);
		out.diagnostics.text = parsed.diagnostics;
		const a = parsed.automaton;
		if (!a) return invalid();
		if (analyzeDeterminism(a).kind === 'nfa') {
			out.problem = { kind: 'nfa', reasons: nfaReasons(a) };
			return out;
		}
		if (a.states.length > MAX_STATES) {
			out.problem = { kind: 'too-big', what: 'dfa', limit: MAX_STATES };
			return out;
		}
		out.dfa = a;
		return out;
	}

	const defs = parseDefinitions(state.defs);
	out.diagnostics.defs = defs.diagnostics;

	if (state.from === 're') {
		const parsed = parseRegex(state.re, { defs: defs.defs, invalid: defs.invalid });
		out.diagnostics.re = parsed.diagnostics;
		if (!parsed.ok || hasError(defs.diagnostics)) return invalid();
		if (thompsonSize(parsed.regex) > MAX_NFA_STATES) {
			out.problem = { kind: 'too-big', what: 'nfa', limit: MAX_NFA_STATES };
			return out;
		}
		return determinize(thompson(parsed.regex).nfa, out);
	}

	const rules = parseRules(state.rules, defs);
	out.diagnostics.rules = rules.diagnostics;
	if (hasError(rules.diagnostics) || hasError(defs.diagnostics)) return invalid();
	const size = rules.rules.reduce((n, r) => n + thompsonSize(r.regex), 1);
	if (size > MAX_NFA_STATES) {
		out.problem = { kind: 'too-big', what: 'nfa', limit: MAX_NFA_STATES };
		return out;
	}
	// The same machine as scannerDfa(rules): accepting states carry their token.
	return determinize(scannerNfa(rules.rules).nfa, out);
}
