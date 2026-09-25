/**
 * Token rules → scanner DFA: parse the helper definitions and the ordered
 * rules (lecture notation), then build `scannerDfa(rules)` and its minimal
 * DFA with the states numbered 0, 1, 2, … (the int states of the table-driven
 * code).
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
	scannerNfa,
	subsetAccept,
	symbolClasses,
	type Automaton,
	type State,
	type StateId,
	type TokenRule,
	type Transition
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
 * The subset construction of `nfa`, as `subsetConstruction` builds it (same
 * states, ids, transitions and tokens) but without the step trace, or null as
 * soon as it makes more than `limit` states. `count` is the number of states
 * made (at most `limit + 1`).
 */
export function boundedSubsetDfa(
	nfa: Automaton,
	limit: number
): { dfa: Automaton | null; count: number } {
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	// Classes refine every label, so a label covers a class or misses it.
	const covered = new Map<CharSet, number[]>();
	const classesOf = (label: CharSet) => {
		let ks = covered.get(label);
		if (!ks) {
			ks = classes.flatMap((c, k) => (label.overlaps(c) ? [k] : []));
			covered.set(label, ks);
		}
		return ks;
	};
	const keyOf = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b).join(',');
	/** ε-closure of move targets, with the key of the closed set; many moves share targets. */
	const closures = new Map<string, { subset: StateId[]; key: string }>();
	const closureOf = (targets: number[]) => {
		const moved = keyOf(new Set(targets));
		let closed = closures.get(moved);
		if (!closed) {
			const subset = index.closure(targets);
			closed = { subset, key: keyOf(subset) };
			closures.set(moved, closed);
		}
		return closed;
	};

	const states: State[] = [];
	const transitions: Transition[] = [];
	const byKey = new Map<string, StateId>();
	const create = (subset: StateId[], key: string): StateId => {
		const id = states.length;
		const state: State = {
			id,
			name: String(id),
			accepting: subset.some((s) => nfa.states[s].accepting),
			subset
		};
		const accept = subsetAccept(nfa, subset);
		if (accept) state.accept = accept;
		states.push(state);
		byKey.set(key, id);
		return id;
	};

	const first = index.closure([nfa.start]);
	create(first, keyOf(first));
	for (let q = 0; q < states.length; q++) {
		const moves: number[][] = classes.map(() => []);
		for (const s of states[q].subset!)
			for (const t of index.labeled[s]) for (const k of classesOf(t.label)) moves[k].push(t.to);
		for (const [k, targets] of moves.entries()) {
			if (targets.length === 0) continue;
			const closed = closureOf(targets);
			let to = byKey.get(closed.key);
			if (to === undefined) {
				if (states.length >= limit) return { dfa: null, count: states.length + 1 };
				to = create(closed.subset, closed.key);
			}
			transitions.push({ id: transitions.length, from: q, to, label: classes[k] });
		}
	}
	const dfa: Automaton = { states, transitions, start: 0 };
	if (nfa.alphabet) dfa.alphabet = nfa.alphabet;
	return { dfa, count: states.length };
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

/**
 * The same DFA with each accepting state reporting `names[rule]` (and noted
 * with it), so renaming a rule does not rebuild the DFA.
 */
export function withTokenNames(a: Automaton, names: readonly string[]): Automaton {
	return {
		...a,
		states: a.states.map((s) => {
			const token = s.accept ? names[s.accept.rule] : undefined;
			if (!s.accept || token === undefined || token === s.accept.token) return s;
			const out: State = { ...s, accept: { ...s.accept, token } };
			if (s.accepting) out.note = token;
			return out;
		})
	};
}

/**
 * For each rule, the first rule with the same name. Minimizing keeps apart
 * accepting states whose tokens differ, so only this grouping of the names
 * matters to the minimal DFA.
 */
export function nameGroups(names: readonly string[]): number[] {
	return names.map((n) => names.indexOf(n));
}

/**
 * The minimal DFA (accepting states with different tokens kept apart), with
 * the states numbered. `groups` is `nameGroups` of the rule names: tokens
 * come out as the group numbers; `withTokenNames` puts the names back.
 */
export function minimalRuleDfa(full: Automaton, groups: readonly number[]): Automaton {
	const byGroup = withTokenNames(full, groups.map(String));
	return numberStates(minimize(byGroup, { splitByToken: true }).dfa);
}

/**
 * What the DFA of the rules depends on: the definitions and the REs in order
 * (names and drop flags are applied to a built DFA without rebuilding it).
 */
export function structureKey(defs: string, rows: readonly RuleState[]): string {
	return JSON.stringify([defs, ...rows.map((r) => r.re)]);
}

export type RuleDfaResult =
	{ ok: true; full: Automaton } | { ok: false; reason: 'nfa' | 'dfa'; count: number };

/**
 * The scanner DFA for `rules` (`scannerDfa(rules)` with the states numbered).
 * Refuses machines above the size limits, stopping the construction as soon
 * as it passes `limit` states.
 */
export function buildRuleDfa(rules: TokenRule[], opts: { limit?: number } = {}): RuleDfaResult {
	const limit = opts.limit ?? MAX_DFA_STATES;
	const { nfa } = scannerNfa(rules);
	if (nfa.states.length > MAX_NFA_STATES)
		return { ok: false, reason: 'nfa', count: nfa.states.length };
	const { dfa, count } = boundedSubsetDfa(nfa, limit);
	if (!dfa) return { ok: false, reason: 'dfa', count };
	return { ok: true, full: numberStates(dfa) };
}

/** The DFAs the page shows: as built, and minimized once something needs it. */
export type RuleDfas =
	| { ok: true; full: Automaton; minimal: Automaton | null }
	| { ok: false; reason: 'nfa' | 'dfa'; count: number };
