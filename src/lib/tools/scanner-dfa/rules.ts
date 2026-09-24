/**
 * Token rules → scanner DFA: parse the helper definitions and the ordered
 * rules (lecture notation), then build `scannerDfa(rules, { minimal })` with
 * the states numbered 0, 1, 2, … (the int states of the table-driven code).
 */
import { CharSet } from '$lib/theory/charset';
import type { NamedSet } from '$lib/theory/chars';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	nullable,
	parseDefinitions,
	parseRegex,
	type DefinitionsResult,
	type Regex
} from '$lib/theory/regex';
import {
	ClosureIndex,
	minimize,
	scannerDfa,
	scannerNfa,
	symbolClasses,
	type Automaton,
	type TokenRule
} from '$lib/theory/automata';
import type { RuleState } from '$lib/tools/links';

/** Largest DFA the tool builds, draws as a table, and runs. */
export const MAX_DFA_STATES = 300;
/** Largest combined NFA the tool determinizes. */
export const MAX_NFA_STATES = 4000;

export interface RuleCheck {
	/** Problems with the rule's RE (spans index into its text). */
	diagnostics: Diagnostic[];
	/** Problem with the rule's name. */
	nameError?: string;
}

export interface CompiledRules {
	defs: DefinitionsResult;
	rows: RuleCheck[];
	/** The rules, or null when any rule (or no rule) has problems that stop the build. */
	rules: TokenRule[] | null;
	/** Definitions that are plain character sets (digit, letter), for labels and headers. */
	names: NamedSet[];
}

/** The character set a definition stands for, when it is one symbol from a set. */
export function charSetOf(r: Regex): CharSet | null {
	switch (r.kind) {
		case 'chars':
			return r.set;
		case 'ref':
			return charSetOf(r.body);
		case 'alt': {
			let out = CharSet.EMPTY;
			for (const o of r.options) {
				const s = charSetOf(o);
				if (!s) return null;
				out = out.union(s);
			}
			return out;
		}
		default:
			return null;
	}
}

/** Definitions that are sets of single characters, in source order. */
export function namedSets(defs: ReadonlyMap<string, Regex>): NamedSet[] {
	const out: NamedSet[] = [];
	for (const [name, regex] of defs) {
		const set = charSetOf(regex);
		if (set && !set.isEmpty && !set.isSingleton) out.push({ name, set });
	}
	return out;
}

export function compileRules(defsText: string, rows: readonly RuleState[]): CompiledRules {
	const defs = parseDefinitions(defsText);
	const checks: RuleCheck[] = [];
	const rules: TokenRule[] = [];
	let ok = rows.length > 0;
	for (const row of rows) {
		const check: RuleCheck = { diagnostics: [] };
		const name = row.name.trim();
		if (name === '') check.nameError = 'Name the token.';
		if (row.re.trim() === '') {
			check.diagnostics.push({ severity: 'error', message: 'Write a regular expression.' });
		} else {
			const parsed = parseRegex(row.re, { defs: defs.defs, invalid: defs.invalid });
			check.diagnostics.push(...parsed.diagnostics);
			if (parsed.ok) {
				if (nullable(parsed.regex))
					check.diagnostics.push({
						severity: 'warning',
						message: 'This rule matches the empty string, so the start state accepts.'
					});
				rules.push({ name, regex: parsed.regex, skip: row.drop ?? false });
			}
		}
		if (check.nameError || hasErrors(check.diagnostics)) ok = false;
		checks.push(check);
	}
	return { defs, rows: checks, rules: ok ? rules : null, names: namedSets(defs.defs) };
}

/**
 * Number of states the subset construction of `nfa` makes (without the empty
 * set), counting no further than `limit + 1`.
 */
export function subsetStateCount(nfa: Automaton, limit: number): number {
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const keyOf = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(',');
	const first = index.closure([nfa.start]);
	const seen = new Set<string>([keyOf(first)]);
	const queue: number[][] = [first];
	for (let q = 0; q < queue.length; q++) {
		for (const c of classes) {
			const moved = index.move(queue[q], c).targets;
			if (moved.length === 0) continue;
			const closed = index.closure(moved);
			const key = keyOf(closed);
			if (seen.has(key)) continue;
			seen.add(key);
			if (seen.size > limit) return seen.size;
			queue.push(closed);
		}
	}
	return seen.size;
}

/**
 * States renamed 0, 1, 2, … in id order (the start state is 0 for every
 * machine built here); accepting states are noted with their token.
 */
export function numberStates(a: Automaton): Automaton {
	return {
		...a,
		states: a.states.map((s) => {
			const out = { ...s, name: String(s.id) };
			if (s.accepting && s.accept) out.note = s.accept.token;
			return out;
		})
	};
}

export type RuleDfaResult =
	| { ok: true; dfa: Automaton; full: Automaton; minimal: Automaton }
	| { ok: false; reason: 'nfa' | 'dfa'; count: number };

/**
 * The scanner DFA for `rules` (states numbered), both as built and minimized
 * (tokens kept apart). Refuses machines above the size limits.
 */
export function buildRuleDfa(
	rules: TokenRule[],
	opts: { minimal: boolean; limit?: number }
): RuleDfaResult {
	const limit = opts.limit ?? MAX_DFA_STATES;
	const { nfa } = scannerNfa(rules);
	if (nfa.states.length > MAX_NFA_STATES)
		return { ok: false, reason: 'nfa', count: nfa.states.length };
	const count = subsetStateCount(nfa, limit);
	if (count > limit) return { ok: false, reason: 'dfa', count };
	const full = numberStates(scannerDfa(rules));
	const minimal = numberStates(minimize(full, { splitByToken: true }).dfa);
	return { ok: true, dfa: opts.minimal ? minimal : full, full, minimal };
}
