/**
 * Lookahead (Lexical Analysis, slide 13): characters read beyond the current
 * token start but not consumed yet. The scanner reads one character at a
 * time; after each, every rule is a complete match, a viable prefix (its
 * minimal DFA can still reach acceptance), or dead. When no rule can go on,
 * it backs up to the longest match.
 */
import type { CharSet } from '$lib/theory/charset';
import { containsAny, type Regex } from '$lib/theory/regex';
import {
	coReachableStates,
	isLabeled,
	outgoingIndex,
	regexToDfa,
	type Automaton
} from '$lib/theory/automata';
import { formatTokenPair } from '$lib/components/ui/token-format';
import { advance, quoteShort, ruleRef, type LexRun, type StepContext } from './scan';

export type RuleStatus = 'match' | 'viable' | 'dead';

export interface RuleStanding {
	status: RuleStatus;
	/** A longer string (the characters read plus more) is still in the rule's language. */
	more: boolean;
}

/** A rule's minimal DFA, stepped one code point at a time. */
export class RuleMachine {
	readonly dfa: Automaton;
	readonly #edges: { label: CharSet; to: number }[][];
	readonly #live: Set<number>;

	constructor(dfa: Automaton) {
		this.dfa = dfa;
		this.#edges = outgoingIndex(dfa).map((ts) =>
			ts.filter(isLabeled).map((t) => ({ label: t.label, to: t.to }))
		);
		this.#live = coReachableStates(dfa);
	}

	get start(): number {
		return this.dfa.start;
	}

	/** Next state on `cp`, or -1 (dead). */
	step(state: number, cp: number): number {
		if (state < 0) return -1;
		for (const e of this.#edges[state]) if (e.label.has(cp)) return e.to;
		return -1;
	}

	standing(state: number): RuleStanding {
		if (state < 0 || !this.#live.has(state)) return { status: 'dead', more: false };
		const more = this.#edges[state].some((e) => this.#live.has(e.to));
		return { status: this.dfa.states[state].accepting ? 'match' : 'viable', more };
	}

	/** Where the rule stands after reading `text[from, to)`. */
	standingAfter(text: string, from: number, to: number): RuleStanding {
		let s = this.start;
		for (let i = from; i < to && s >= 0;) {
			const cp = text.codePointAt(i)!;
			s = this.step(s, cp);
			i += cp > 0xffff ? 2 : 1;
		}
		return this.standing(s);
	}
}

const cache = new WeakMap<Regex, Map<string, RuleMachine>>();

/** The minimal DFA of a rule, cached per expression and (when it uses Σ) alphabet. */
export function ruleMachine(regex: Regex, alphabet: CharSet): RuleMachine {
	let byAlphabet = cache.get(regex);
	if (!byAlphabet) {
		byAlphabet = new Map();
		cache.set(regex, byAlphabet);
	}
	const key = containsAny(regex) ? alphabet.key() : '';
	let m = byAlphabet.get(key);
	if (!m) {
		m = new RuleMachine(regexToDfa(regex, { alphabet, minimal: true }));
		byAlphabet.set(key, m);
	}
	return m;
}

/**
 * The lookahead walk: for each token (scan step), one entry per character
 * read, 1 … maxLen. `offsets[s]` is the index of step s's first entry.
 */
export interface LookaheadIndex {
	total: number;
	offsets: number[];
}

export function lookaheadIndex(run: LexRun): LookaheadIndex {
	const offsets: number[] = [];
	let total = 0;
	for (const step of run.steps) {
		offsets.push(total);
		total += Math.max(1, step.maxLen);
	}
	return { total, offsets };
}

export interface LookaheadPoint {
	/** Index into run.steps. */
	scanStep: number;
	/** Token start (string index). */
	pos: number;
	/** Characters read so far (≥ 1). */
	read: number;
	/** String index just past the characters read. */
	end: number;
	/** The last read of this token: the scanner decides here. */
	final: boolean;
}

export function lookaheadPoint(
	run: LexRun,
	index: LookaheadIndex,
	i: number
): LookaheadPoint | null {
	if (i < 0 || i >= index.total) return null;
	let lo = 0;
	let hi = index.offsets.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (index.offsets[mid] <= i) lo = mid;
		else hi = mid - 1;
	}
	const step = run.steps[lo];
	const read = i - index.offsets[lo] + 1;
	return {
		scanStep: lo,
		pos: step.pos,
		read,
		end: advance(run.text, step.pos, read),
		final: read === Math.max(1, step.maxLen)
	};
}

/** The first lookahead entry of scan step `s`. */
export function lookaheadStart(index: LookaheadIndex, s: number): number {
	return index.offsets[Math.max(0, Math.min(s, index.offsets.length - 1))] ?? 0;
}

/** Where every rule stands (the Error rule last, when on) after the characters read. */
export function standingsAt(
	machines: readonly RuleMachine[],
	run: LexRun,
	point: LookaheadPoint,
	errorRule: boolean
): RuleStanding[] {
	const out = machines.map((m) => m.standingAfter(run.text, point.pos, point.end));
	if (errorRule) out.push({ status: point.read === 1 ? 'match' : 'dead', more: false });
	return out;
}

/** The longest match among the reads so far (length in characters, earliest rule), or null. */
export function longestSoFar(
	run: LexRun,
	point: LookaheadPoint
): { length: number; rule: number } | null {
	const step = run.steps[point.scanStep];
	for (let len = Math.min(point.read, step.maxLen); len >= 1; len--) {
		const j = step.matches.findIndex((row) => row[len - 1]);
		if (j >= 0) return { length: len, rule: j };
	}
	return null;
}

function names(ctx: Pick<StepContext, 'spec'>, rules: number[]): string {
	const refs = rules.map((j) => ruleRef(ctx, j));
	if (refs.length <= 2) return refs.join(' and ');
	return `${refs.slice(0, -1).join(', ')} and ${refs[refs.length - 1]}`;
}

/** One sentence for a lookahead point. */
export function describeLookahead(
	ctx: StepContext,
	point: LookaheadPoint,
	standings: readonly RuleStanding[]
): string {
	const { run, format } = ctx;
	const read = run.text.slice(point.pos, point.end);
	const matching = standings.flatMap((s, j) => (s.status === 'match' ? [j] : []));
	const viable = standings.flatMap((s, j) => (s.status === 'viable' ? [j] : []));
	const canGoOn = standings.some((s) => s.status === 'viable' || s.more);
	const tokenIndex = run.tokenAt[point.scanStep];
	const token = tokenIndex === null ? null : run.tokens[tokenIndex];
	const count = `${point.read} character${point.read === 1 ? '' : 's'}`;
	const opening = `Read ${quoteShort(read)} (${count}).`;

	if (!point.final) {
		const matchText = matching.length
			? `${names(ctx, matching)} ${matching.length === 1 ? 'matches' : 'match'} it`
			: 'No rule matches it yet';
		if (viable.length) {
			return `${opening} ${matchText}; ${names(ctx, viable)} can still match with more input, so the scanner reads on.`;
		}
		if (canGoOn) {
			return `${opening} ${matchText}, and a longer match is still possible, so the scanner reads on.`;
		}
		return `${opening} ${matchText}. The scanner reads the next character to see whether a longer prefix matches.`;
	}

	const n = ctx.spec.rules.length;
	if (token?.error) {
		const which = n === 0 ? 'R' : n === 1 ? 'R1' : `R1…R${n}`;
		return `${opening} No prefix matches ${which}, so the Error rule (R${n + 1}) takes one character → ${formatTokenPair(token, format)}.`;
	}
	const atEnd = point.end >= run.text.length && canGoOn;
	const head = atEnd
		? `End of input after ${quoteShort(read)}.`
		: `Read ${quoteShort(read)} (${count}): no rule matches it or anything longer.`;
	if (!token) {
		return `${head} No prefix matches R, so the scanner is stuck at position ${point.pos}.`;
	}
	const pairText = formatTokenPair(token, format);
	if (token.end < point.end) {
		const left = run.text.slice(token.end, point.end);
		return `${head} The scanner backs up to the longest match, ${quoteShort(token.lexeme)} → ${pairText}; ${quoteShort(left)} stays in the input.`;
	}
	return `${head} The longest match is ${quoteShort(token.lexeme)} → ${pairText}.`;
}
