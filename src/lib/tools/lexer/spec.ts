/**
 * The lexical specification the Scanner Rules tool edits: helper definitions
 * (`name = RE`) and an ordered list of token rules R = R1 | R2 | … | Rn
 * (Lexical Analysis II, slides 4–5). Rules are parsed in lecture notation and
 * guarded against machines too large to scan while typing.
 */
import { CharSet } from '$lib/theory/charset';
import type { Diagnostic } from '$lib/theory/diagnostics';
import {
	children,
	containsAny,
	empty,
	parseDefinitions,
	parseRegex,
	type DefinitionsResult,
	type Regex
} from '$lib/theory/regex';
import {
	ClosureIndex,
	scannerAlphabet,
	symbolClasses,
	thompson,
	type Automaton,
	type TokenRule
} from '$lib/theory/automata';
import type { RuleState } from '$lib/tools/links';

/** Rules whose Thompson NFA would have more states than this are not built. */
export const MAX_NFA_STATES = 3000;
/** Rules whose DFA has more states than this are left out of the scan. */
export const MAX_DFA_STATES = 300;

/** 'blank': no RE yet (a new rule); it matches nothing and is not an error. */
export type RuleProblem = 'error' | 'too-large' | 'blank';

export interface RuleInfo {
	/** 0-based position; the rule is R(index + 1). */
	index: number;
	/** Token name reported for the rule (R3 when the name is blank). */
	name: string;
	re: string;
	drop: boolean;
	/** How the rule appears in R = …: its RE when that is one quoted literal, else its name. */
	label: string;
	/** The rule's RE, or null when it has errors or is too large. */
	regex: Regex | null;
	/** Problems with the RE; spans index into `re`. */
	diagnostics: Diagnostic[];
	/** Problem with the name, if any. */
	nameError: string | null;
	nameWarning: string | null;
	problem: RuleProblem | null;
}

export interface LexSpec {
	defs: DefinitionsResult;
	rules: RuleInfo[];
	/** One engine rule per row, in order; a rule with a problem matches nothing (ɸ). */
	tokenRules: TokenRule[];
	/** Every definition and rule is usable. */
	ok: boolean;
}

/** One quoted literal such as `'+'`, `'new'`, or `'\t'` (straight or curly quotes). */
const LITERAL = /^(?:'(?:[^'\\]|\\.)+'|‘(?:[^’\\]|\\.)+’)$/u;

/** The rule's entry in the line R = R1 | R2 | …: the literal itself for `'+'`, otherwise the name. */
export function ruleLabel(name: string, re: string): string {
	const text = re.trim();
	return LITERAL.test(text) ? text : name;
}

/** The name a rule reports: its own, or R3 when blank. */
export function ruleName(name: string, index: number): string {
	return name.trim() === '' ? `R${index + 1}` : name.trim();
}

const sat = (n: number) => Math.min(n, Number.MAX_SAFE_INTEGER);

/**
 * An upper bound on the size of the lecture Thompson NFA for `r` (definition
 * references expanded), computed without building it.
 */
export function estimateNfaStates(r: Regex): number {
	const memo = new Map<Regex, number>();
	const size = (n: Regex): number => {
		const known = memo.get(n);
		if (known !== undefined) return known;
		let s: number;
		switch (n.kind) {
			case 'empty':
			case 'epsilon':
			case 'chars':
			case 'any':
				s = 2;
				break;
			case 'concat':
				s = n.parts.reduce((acc, p) => sat(acc + size(p)), 0);
				break;
			case 'alt':
				s = sat(n.options.reduce((acc, p) => sat(acc + size(p)), 0) + 2 * (n.options.length - 1));
				break;
			case 'star':
				s = sat(size(n.body) + 2);
				break;
			case 'plus':
				s = sat(2 * size(n.body) + 2);
				break;
			case 'optional':
				s = sat(size(n.body) + 4);
				break;
			case 'repeat': {
				const copies = n.max === null ? n.min + 1 : Math.max(n.max, 1);
				s = sat(copies * (size(n.body) + 4) + 2);
				break;
			}
			case 'ref':
				s = size(n.body);
				break;
			default:
				s = children(n).reduce((acc, c) => sat(acc + size(c)), 2);
		}
		memo.set(n, s);
		return s;
	};
	return size(r);
}

/**
 * True when determinizing `nfa` gives at most `cap` states (not counting the
 * empty set). Stops exploring as soon as the cap is passed.
 */
export function dfaFitsWithin(nfa: Automaton, cap: number): boolean {
	const index = new ClosureIndex(nfa);
	const classes = symbolClasses(nfa);
	const key = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(',');
	const start = index.closure([nfa.start]);
	const seen = new Set<string>([key(start)]);
	const queue: number[][] = [start];
	for (let head = 0; head < queue.length; head++) {
		for (const c of classes) {
			const { targets } = index.move(queue[head], c);
			if (targets.length === 0) continue;
			const next = index.closure(targets);
			const k = key(next);
			if (seen.has(k)) continue;
			if (seen.size >= cap) return false;
			seen.add(k);
			queue.push(next);
		}
	}
	return true;
}

/**
 * Σ for the size guard. The scan's Σ is every symbol the rules use plus every
 * character of the input; an input character outside the rules' symbols is
 * matched only by Σ, so all such characters lead every rule's DFA to the same
 * states. One stand-in for them gives the largest DFA any input can produce.
 */
export function guardAlphabet(regexes: readonly Regex[]): CharSet {
	const used = scannerAlphabet(
		regexes.map((regex) => ({ name: '', regex })),
		CharSet.EMPTY
	);
	if (!regexes.some((r) => containsAny(r))) return used;
	const free = used.complement().first();
	return free === undefined ? used : used.union(CharSet.single(free));
}

/** Parses the helper definitions and the rules, in order. */
export function buildSpec(defsText: string, rules: readonly RuleState[]): LexSpec {
	const defs = parseDefinitions(defsText);
	const seen = new Map<string, number>();
	const infos: RuleInfo[] = rules.map((r, index) => {
		const name = ruleName(r.name, index);
		const blank = r.re.trim() === '';
		const parsed = blank
			? null
			: parseRegex(r.re, { defs: defs.defs, invalid: defs.invalid, source: null });
		let nameError: string | null = null;
		let nameWarning: string | null = null;
		if (r.name.trim() === '') {
			if (!blank) nameError = 'Name the rule';
		} else if (seen.has(name)) nameWarning = `R${seen.get(name)! + 1} has the same name`;
		if (!seen.has(name)) seen.set(name, index);
		return {
			index,
			name,
			re: r.re,
			drop: r.drop ?? false,
			label: ruleLabel(name, r.re),
			regex: parsed?.ok ? parsed.regex : null,
			diagnostics: parsed?.diagnostics ?? [],
			nameError,
			nameWarning,
			problem: blank ? 'blank' : parsed?.ok ? null : 'error'
		};
	});

	// Size guard: the NFA estimate first (cheap), then a bounded determinization.
	const usable = infos.filter((r) => r.regex !== null);
	const alphabet = guardAlphabet(usable.map((r) => r.regex!));
	for (const info of usable) {
		const regex = info.regex!;
		const fits =
			estimateNfaStates(regex) <= MAX_NFA_STATES &&
			dfaFitsWithin(thompson(regex, { alphabet }).nfa, MAX_DFA_STATES);
		if (!fits) {
			info.regex = null;
			info.problem = 'too-large';
		}
	}

	const tokenRules: TokenRule[] = infos.map((r) => ({
		name: r.name,
		regex: r.regex ?? empty(),
		skip: r.drop
	}));
	const ok =
		!defs.diagnostics.some((d) => d.severity === 'error') &&
		infos.every((r) => (r.problem === null || r.problem === 'blank') && r.nameError === null);
	return { defs, rules: infos, tokenRules, ok };
}
