/**
 * Scanners built from token rules (Lexical Analysis II; Lexical Analysis IV).
 *
 * `scan` is the lecture's loop: at each position, test every prefix of length
 * ≥ 1 against every rule, take the longest match, and break ties with the
 * earliest rule. Skipped rules (e.g. Whitespace) are matched and then dropped.
 *
 * `scannerNfa` / `scannerDfa` combine the rules into one machine whose
 * accepting states carry the token, and `longestMatchRun` drives such a DFA
 * the way flex does: remember the last accepting position, run until the
 * machine can go no further, then back up.
 */
import { CharSet, type Range } from '../charset';
import type { Regex } from '../regex/ast';
import { coReachableStates, letterName } from './core';
import { codePoints, compile, regexHasAny, regexSymbols, step } from './internal';
import { minimize } from './minimize';
import { subsetConstruction } from './subset';
import { THOMPSON_COLUMN_WIDTH, THOMPSON_ROW_HEIGHT, thompson } from './thompson';
import type { Automaton, Positions, State, StateId, Transition } from './types';

export interface TokenRule {
	name: string;
	regex: Regex;
	/** Match, then drop (e.g. Whitespace, comments). */
	skip?: boolean;
}

/** One position of the scanning loop. */
export interface MatchMatrix {
	/** Offset where this token starts. */
	pos: number;
	/** Prefix lengths examined (in symbols); every longer prefix matches no rule. */
	maxLen: number;
	/** matches[rule][len - 1]: the prefix of length len is in L(rule). */
	matches: boolean[][];
	/** Chosen length (longest match), or null when nothing matches. */
	length: number | null;
	/** Chosen rule (earliest among those matching `length`), or null. */
	rule: number | null;
}

export interface ScanToken {
	/**
	 * Rule index, or `ERROR_RULE` for the Error rule. `driveScanner` also
	 * reports `ERROR_RULE` for an accepting state without token info
	 * (`error` is false then).
	 */
	rule: number;
	name: string;
	lexeme: string;
	start: number;
	end: number;
	skipped: boolean;
	error: boolean;
}

export interface ScanResult {
	/** Every token in order, skipped ones included (flagged). */
	tokens: ScanToken[];
	steps: MatchMatrix[];
	/** Offset where scanning stopped with no match, or null. */
	stuck: number | null;
	/**
	 * Set only when `maxReads` stopped the scan: the offset of the next token,
	 * which was not scanned.
	 */
	cutoff?: number;
}

/** Token name of the Error rule. */
export const ERROR_TOKEN = 'Error';
/** Rule index reported for Error tokens (the Error rule is listed after every rule). */
export const ERROR_RULE = -1;

/**
 * The default Σ for token rules: every symbol the rules use, plus `extra`.
 * `scan`, `scannerNfa` and `scannerDfa` all use it when no alphabet is given;
 * pass the same alphabet to each (e.g. `scannerAlphabet(rules, CharSet.of(input))`)
 * to make Σ in a rule cover more symbols.
 */
export function scannerAlphabet(
	rules: readonly TokenRule[],
	extra: CharSet = CharSet.EMPTY
): CharSet {
	const ranges: Range[] = [...extra.ranges];
	for (const r of rules) ranges.push(...regexSymbols(r.regex).ranges);
	return CharSet.fromRanges(ranges);
}

/** Thompson NFA for one rule; Σ in a rule means any symbol of `alphabet`. */
function ruleNfa(rule: TokenRule, alphabet: CharSet) {
	return thompson(rule.regex, regexHasAny(rule.regex) ? { alphabet } : {});
}

/**
 * Scans `input` with maximal munch. Offsets are code-unit offsets; lengths
 * count symbols (code points). With `errorRule`, an unmatched symbol becomes
 * an (Error, one symbol) token and scanning continues; otherwise scanning
 * stops and `stuck` is its offset. Σ in a rule means any symbol of `alphabet`
 * (default: `scannerAlphabet(rules)`, as for `scannerDfa`). With `maxReads`,
 * no new step starts once the steps so far have read that many symbols in
 * total (the sum of their `maxLen`); `cutoff` is then the offset where it
 * stopped. It bounds the work, which is quadratic in the worst case (e.g.
 * 'a'* 'b' on "aaa…").
 */
export function scan(
	rules: TokenRule[],
	input: string,
	opts: { errorRule?: boolean; alphabet?: CharSet; maxReads?: number } = {}
): ScanResult {
	const alphabet = opts.alphabet ?? scannerAlphabet(rules);
	const machines = rules.map((r) => compile(subsetConstruction(ruleNfa(r, alphabet).nfa).dfa));
	const cps = codePoints(input);
	const tokens: ScanToken[] = [];
	const steps: MatchMatrix[] = [];
	let stuck: number | null = null;
	let cutoff: number | null = null;
	const maxReads = opts.maxReads ?? Infinity;
	let reads = 0;
	let i = 0;
	let pos = 0;
	while (i < cps.length) {
		if (reads >= maxReads) {
			cutoff = pos;
			break;
		}
		const current = machines.map((m) => m.start);
		const matches = rules.map((): boolean[] => []);
		let len = 0;
		let alive = machines.length;
		while (i + len < cps.length && alive > 0) {
			const cp = cps[i + len].cp;
			len++;
			alive = 0;
			machines.forEach((m, r) => {
				const s = current[r] < 0 ? -1 : step(m, current[r], cp);
				current[r] = s;
				if (s >= 0) alive++;
				matches[r].push(s >= 0 && m.accepting[s]);
			});
		}
		let length: number | null = null;
		let rule: number | null = null;
		for (let l = len; l >= 1 && length === null; l--) {
			const r = matches.findIndex((row) => row[l - 1]);
			if (r >= 0) {
				length = l;
				rule = r;
			}
		}
		steps.push({ pos, maxLen: len, matches, length, rule });
		reads += len;
		if (length !== null && rule !== null) {
			const end = cps[i + length - 1].end;
			tokens.push({
				rule,
				name: rules[rule].name,
				lexeme: input.slice(pos, end),
				start: pos,
				end,
				skipped: rules[rule].skip ?? false,
				error: false
			});
			i += length;
			pos = end;
		} else if (opts.errorRule) {
			const end = cps[i].end;
			tokens.push({
				rule: ERROR_RULE,
				name: ERROR_TOKEN,
				lexeme: input.slice(pos, end),
				start: pos,
				end,
				skipped: false,
				error: true
			});
			i++;
			pos = end;
		} else {
			stuck = pos;
			break;
		}
	}
	return cutoff === null ? { tokens, steps, stuck } : { tokens, steps, stuck, cutoff };
}

/**
 * One NFA for all rules: a new start state A with an ε-transition to each
 * rule's Thompson NFA (in rule order). Each rule's final state accepts and
 * reports { rule, token }. States are named A, B, C, … rule by rule; the
 * positions stack the rules' Thompson layouts top to bottom. Σ in a rule
 * means any symbol of `alphabet` (default: `scannerAlphabet(rules)`).
 */
export function scannerNfa(
	rules: TokenRule[],
	opts: { alphabet?: CharSet } = {}
): { nfa: Automaton; starts: StateId[]; positions: Positions } {
	const alphabet = opts.alphabet ?? scannerAlphabet(rules);
	const parts = rules.map((r) => ruleNfa(r, alphabet));
	const states: State[] = [{ id: 0, name: letterName(0), accepting: false }];
	const transitions: Transition[] = [];
	const starts: StateId[] = [];
	const positions: Positions = new Map();
	const rows: number[] = [];
	let offset = 1;
	for (const part of parts) {
		starts.push(offset + part.nfa.start);
		offset += part.nfa.states.length;
	}
	for (const s of starts) transitions.push({ id: transitions.length, from: 0, to: s, label: null });
	offset = 1;
	let top = 0;
	parts.forEach((part, r) => {
		for (const s of part.nfa.states) {
			const id = offset + s.id;
			const state: State = { id, name: letterName(id), accepting: s.accepting };
			if (s.accepting) state.accept = { rule: r, token: rules[r].name };
			states.push(state);
		}
		for (const t of part.nfa.transitions)
			transitions.push({
				id: transitions.length,
				from: offset + t.from,
				to: offset + t.to,
				label: t.label
			});
		let height = 1;
		for (const [id, p] of part.positions) {
			positions.set(offset + id, { x: p.x + THOMPSON_COLUMN_WIDTH, y: p.y + top });
			height = Math.max(height, Math.ceil(p.y / THOMPSON_ROW_HEIGHT - 1e-9) + 1);
		}
		rows.push(height);
		top += height * THOMPSON_ROW_HEIGHT;
		offset += part.nfa.states.length;
	});
	const totalRows = rows.reduce((a, b) => a + b, 0);
	positions.set(0, { x: 0, y: (Math.max(totalRows, 1) - 1) * (THOMPSON_ROW_HEIGHT / 2) });
	return { nfa: { states, transitions, start: 0 }, starts, positions };
}

/**
 * Subset construction of `scannerNfa`; an accepting DFA state reports the
 * token of the lowest-numbered rule among its NFA states. With `minimal`, the
 * DFA is minimized keeping different tokens apart. `alphabet` is as for
 * `scannerNfa`.
 */
export function scannerDfa(
	rules: TokenRule[],
	opts: { minimal?: boolean; alphabet?: CharSet } = {}
): Automaton {
	const dfa = subsetConstruction(scannerNfa(rules, { alphabet: opts.alphabet }).nfa).dfa;
	return opts.minimal ? minimize(dfa, { splitByToken: true }).dfa : dfa;
}

export interface DriverStep {
	pos: number;
	/** Current state; null after a missing transition. */
	state: StateId | null;
	char?: string;
	/** Most recent accepting state and the offset just after it. */
	lastAccept: { state: StateId; pos: number } | null;
}

/**
 * Longest match from `start`, flex style: read symbols while the DFA can still
 * reach an accepting state, remembering the last accepting position; the token
 * ends there (the reader backs up to it). `token` is null when no prefix of
 * length ≥ 1 is accepted.
 */
export function longestMatchRun(
	dfa: Automaton,
	input: string,
	start: number
): { steps: DriverStep[]; token: { state: StateId; end: number } | null } {
	const m = compile(dfa);
	const live = coReachableStates(dfa);
	let state = dfa.start;
	let lastAccept: DriverStep['lastAccept'] = null;
	const steps: DriverStep[] = [{ pos: start, state, lastAccept }];
	if (live.has(state)) {
		for (const { cp, end } of codePoints(input, start)) {
			const char = String.fromCodePoint(cp);
			const next = step(m, state, cp);
			if (next < 0) {
				steps.push({ pos: end, state: null, char, lastAccept });
				break;
			}
			state = next;
			if (m.accepting[state]) lastAccept = { state, pos: end };
			steps.push({ pos: end, state, char, lastAccept });
			if (!live.has(state)) break;
		}
	}
	return {
		steps,
		token: lastAccept ? { state: lastAccept.state, end: lastAccept.pos } : null
	};
}

/**
 * Runs a scanner DFA over the whole input with `longestMatchRun`, reporting
 * each token by the accepting state's token (or its name when it has none).
 * Unmatched symbols become Error tokens with `errorRule`, and otherwise stop
 * the scan. Error tokens, and states without token info, report `ERROR_RULE`.
 * For a DFA from `scannerDfa(rules)` the tokens equal those of `scan(rules)`
 * with the same alphabet.
 */
export function driveScanner(
	dfa: Automaton,
	input: string,
	opts: { errorRule?: boolean; skip?: ReadonlySet<string> } = {}
): {
	tokens: ScanToken[];
	runs: { start: number; steps: DriverStep[]; token: { state: StateId; end: number } | null }[];
	stuck: number | null;
} {
	const tokens: ScanToken[] = [];
	const runs: ReturnType<typeof driveScanner>['runs'] = [];
	let pos = 0;
	let stuck: number | null = null;
	while (pos < input.length) {
		const run = longestMatchRun(dfa, input, pos);
		runs.push({ start: pos, ...run });
		if (run.token) {
			const info = dfa.states[run.token.state].accept;
			const name = info?.token ?? dfa.states[run.token.state].name;
			tokens.push({
				rule: info?.rule ?? ERROR_RULE,
				name,
				lexeme: input.slice(pos, run.token.end),
				start: pos,
				end: run.token.end,
				skipped: opts.skip?.has(name) ?? false,
				error: false
			});
			pos = run.token.end;
		} else if (opts.errorRule) {
			const end = pos + (input.codePointAt(pos)! > 0xffff ? 2 : 1);
			tokens.push({
				rule: ERROR_RULE,
				name: ERROR_TOKEN,
				lexeme: input.slice(pos, end),
				start: pos,
				end,
				skipped: false,
				error: true
			});
			pos = end;
		} else {
			stuck = pos;
			break;
		}
	}
	return { tokens, runs, stuck };
}
