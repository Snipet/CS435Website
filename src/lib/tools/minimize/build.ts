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
import { CharSet } from '$lib/theory/charset';
import { formatLabel } from '$lib/theory/chars';
import type { Diagnostic } from '$lib/theory/diagnostics';
import {
	children,
	containsAny,
	parseDefinitions,
	parseRegex,
	symbolsOf,
	type Regex,
	type Span
} from '$lib/theory/regex';
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
 * Number of states of Thompson's NFA for `r`, following `thompson` case by
 * case (derived forms make fresh copies of their operand, so repetition
 * multiplies). Computed without building the NFA; saturates instead of
 * overflowing.
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
				// Options are joined two at a time; each join adds a start and a final.
				out = cap(n.options.reduce((s, p) => cap(s + size(p)), 0) + 2 * (n.options.length - 1));
				break;
			case 'star':
				out = cap(size(n.body) + 2);
				break;
			case 'plus':
				// A A*
				out = cap(2 * size(n.body) + 2);
				break;
			case 'optional':
				// A | ε
				out = cap(size(n.body) + 4);
				break;
			case 'repeat': {
				const { min, max } = n;
				if ((max ?? min + 1) <= 0) {
					out = 2; // the fragment for ε
					break;
				}
				const body = size(n.body);
				// min copies of A, then A* (no max) or max − min copies of A | ε.
				const rest = max === null ? body + 2 : Math.max(0, max - min) * (body + 4);
				out = cap(cap(min * body) + rest);
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

/** Span of the first Σ written in the expression itself (not inside a definition). */
function anySpan(r: Regex): Span | undefined {
	const seen = new Set<Regex>();
	const stack = [r];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (seen.has(n)) continue;
		seen.add(n);
		if (n.kind === 'any' && n.span?.source === null) return n.span;
		// Definition bodies are spanned in the other editor.
		if (n.kind !== 'ref') stack.push(...[...children(n)].reverse());
	}
	return undefined;
}

/**
 * The page has no alphabet of its own, so Σ stands for the symbols the input
 * uses (as in `thompson` and `scannerDfa`). Says which set that is, and warns
 * when it is empty.
 */
export function sigmaNote(
	regexes: readonly { regex: Regex; offset: number }[],
	what: 'the RE' | 'the rules'
): Diagnostic | null {
	const users = regexes.filter((r) => containsAny(r.regex));
	if (users.length === 0) return null;
	const sigma = CharSet.fromRanges(regexes.flatMap((r) => symbolsOf(r.regex).ranges));
	let span: Span | undefined;
	for (const r of users) {
		const at = anySpan(r.regex);
		if (at) {
			span = { start: at.start + r.offset, end: at.end + r.offset, source: null };
			break;
		}
	}
	const uses = what === 'the RE' ? 'uses' : 'use';
	return sigma.isEmpty
		? {
				severity: 'warning',
				message: `Σ is empty here: ${what} ${uses} no other symbols, so Σ matches nothing.`,
				...(span ? { span } : {})
			}
		: {
				severity: 'info',
				message: `Σ = { ${formatLabel(sigma, { separator: ', ' })} } here: the symbols ${what} ${uses}.`,
				...(span ? { span } : {})
			};
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
		const sigma = sigmaNote([{ regex: parsed.regex, offset: 0 }], 'the RE');
		if (sigma) out.diagnostics.re = [...out.diagnostics.re, sigma];
		if (thompsonSize(parsed.regex) > MAX_NFA_STATES) {
			out.problem = { kind: 'too-big', what: 'nfa', limit: MAX_NFA_STATES };
			return out;
		}
		return determinize(thompson(parsed.regex).nfa, out);
	}

	const rules = parseRules(state.rules, defs);
	out.diagnostics.rules = rules.diagnostics;
	if (hasError(rules.diagnostics) || hasError(defs.diagnostics)) return invalid();
	const sigma = sigmaNote(
		rules.rules.map((r, i) => ({ regex: r.regex, offset: rules.offsets[i] })),
		'the rules'
	);
	if (sigma) out.diagnostics.rules = [...out.diagnostics.rules, sigma];
	const size = rules.rules.reduce((n, r) => n + thompsonSize(r.regex), 1);
	if (size > MAX_NFA_STATES) {
		out.problem = { kind: 'too-big', what: 'nfa', limit: MAX_NFA_STATES };
		return out;
	}
	// The same machine as scannerDfa(rules): accepting states carry their token.
	return determinize(scannerNfa(rules.rules).nfa, out);
}
