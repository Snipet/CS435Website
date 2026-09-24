/**
 * Runs the lecture scanning loop (Lexical Analysis II, slides 6–12) for the
 * tool and explains each decision: the prefix-match matrix, maximal munch
 * (max(i, k)), the earliest rule (min(j, k)), and the Error rule.
 */
import { CharSet } from '$lib/theory/charset';
import { formatString } from '$lib/theory/chars';
import {
	ERROR_RULE,
	ERROR_TOKEN,
	scan,
	scannerAlphabet,
	type MatchMatrix,
	type ScanResult,
	type ScanToken
} from '$lib/theory/automata';
import { formatTokenPair, type TokenFormat } from '$lib/components/ui/token-format';
import type { LexSpec } from './spec';

/** Longer inputs are cut to this many characters (string indices) before scanning. */
export const MAX_INPUT = 2000;

export interface LexRun extends ScanResult {
	/** The text that was scanned (the input, cut to MAX_INPUT). */
	text: string;
	truncated: boolean;
	/** tokenAt[step] = index into `tokens` of the token that step emitted, or null (stuck). */
	tokenAt: (number | null)[];
}

/** Cuts `input` to at most `max` code units without splitting a surrogate pair. */
export function clip(input: string, max = MAX_INPUT): string {
	if (input.length <= max) return input;
	let end = max;
	const code = input.charCodeAt(end - 1);
	if (code >= 0xd800 && code <= 0xdbff) end--;
	return input.slice(0, end);
}

/** Σ for the scan: every symbol the rules use plus every character of the input. */
export function lexAlphabet(spec: LexSpec, text: string): CharSet {
	return scannerAlphabet(spec.tokenRules, CharSet.of(text));
}

export function runScan(spec: LexSpec, input: string, errorRule: boolean): LexRun {
	const text = clip(input);
	const result = scan(spec.tokenRules, text, { errorRule, alphabet: lexAlphabet(spec, text) });
	// Each step emits exactly one token, except a final stuck step.
	const tokenAt = result.steps.map((_, i) => (i < result.tokens.length ? i : null));
	return { ...result, text, truncated: text.length < input.length, tokenAt };
}

/** String index just past `count` code points from `start`. */
export function advance(text: string, start: number, count: number): number {
	let i = start;
	for (let k = 0; k < count && i < text.length; k++) {
		i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
	}
	return i;
}

/** The prefixes x1…xi examined at a step, as strings (index i - 1). */
export function prefixesAt(text: string, step: MatchMatrix): string[] {
	const out: string[] = [];
	let end = step.pos;
	for (let len = 1; len <= step.maxLen; len++) {
		end = advance(text, end, 1);
		out.push(text.slice(step.pos, end));
	}
	return out;
}

/**
 * Rule indices that match the prefix of `length` symbols, in order. With the
 * Error rule, it matches every prefix of length 1 and is listed last
 * (index = number of rules).
 */
export function rulesMatching(step: MatchMatrix, length: number, errorRule: boolean): number[] {
	const out: number[] = [];
	step.matches.forEach((row, j) => {
		if (row[length - 1]) out.push(j);
	});
	if (errorRule && length === 1) out.push(step.matches.length);
	return out;
}

/** A string for a sentence, shortened in the middle of long lexemes: `"abc…"`. */
export function quoteShort(s: string, max = 24): string {
	const chars = [...s];
	if (chars.length <= max) return formatString(s);
	return formatString(chars.slice(0, max).join('')).slice(0, -1) + '…"';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function listNames(names: string[]): string {
	if (names.length <= 1) return names.join('');
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface StepContext {
	spec: LexSpec;
	run: LexRun;
	errorRule: boolean;
	format: TokenFormat;
}

/** `Identifier (R3)`, `'new' (R2)`, `Error (R5)`. */
export function ruleRef(ctx: Pick<StepContext, 'spec'>, j: number): string {
	const rule = ctx.spec.rules[j];
	return rule ? `${rule.label} (R${j + 1})` : `${ERROR_TOKEN} (R${j + 1})`;
}

function pair(token: ScanToken, format: TokenFormat): string {
	return formatTokenPair(token, format);
}

/**
 * One sentence explaining the decision at `stepIndex`, following the slides:
 * the longest match wins (max(i, k)); among rules matching it, the earliest
 * (min(j, k)); with no match, the scanner is stuck or the Error rule fires.
 */
export function describeStep(ctx: StepContext, stepIndex: number): string {
	const { run, spec, errorRule, format } = ctx;
	const step = run.steps[stepIndex];
	if (!step) return '';
	const rest = run.text.slice(step.pos);
	const n = spec.rules.length;
	const tokenIndex = run.tokenAt[stepIndex];
	const token = tokenIndex === null ? null : run.tokens[tokenIndex];

	if (step.length === null || step.rule === null) {
		const which = n === 0 ? 'R' : n === 1 ? 'R1' : `R1…R${n}`;
		if (token && token.rule === ERROR_RULE) {
			return `No prefix of ${quoteShort(rest)} matches ${which}. The Error rule (R${n + 1}) matches one character → ${pair(token, format)}.`;
		}
		return `No prefix of ${quoteShort(rest)} matches R — the scanner is stuck at position ${step.pos}.`;
	}

	const lexeme = run.text.slice(step.pos, advance(run.text, step.pos, step.length));
	const matching = rulesMatching(step, step.length, errorRule);
	const head = `Longest match: ${quoteShort(lexeme)} (${plural(step.length, 'character')}).`;
	const result = token ? pair(token, format) : '';
	const tail = token?.skipped ? `${result}, which is dropped.` : `${result}.`;
	if (matching.length <= 1) {
		return `${head} Only ${ruleRef(ctx, step.rule)} matches it → ${tail}`;
	}
	const refs = matching.map((j) => ruleRef(ctx, j));
	const verb = matching.length === 2 ? 'both match' : 'all match';
	return `${head} ${listNames(refs)} ${verb} ${quoteShort(lexeme)}; R${step.rule + 1} is listed first → ${tail}`;
}

export type MatrixColumn = { kind: 'len'; len: number } | { kind: 'gap'; from: number; to: number };

/**
 * Which prefix lengths to show as columns when there are more than `cap`:
 * the first few, a window around the chosen length, and the last few, with
 * gaps between them.
 */
export function matrixColumns(maxLen: number, chosen: number | null, cap = 24): MatrixColumn[] {
	const lens = new Set<number>();
	if (maxLen <= cap) {
		for (let l = 1; l <= maxLen; l++) lens.add(l);
	} else {
		const head = Math.floor(cap / 3);
		for (let l = 1; l <= Math.min(head, maxLen); l++) lens.add(l);
		if (chosen !== null) {
			for (let l = chosen - 3; l <= chosen + 3; l++) if (l >= 1 && l <= maxLen) lens.add(l);
		}
		for (let l = Math.max(1, maxLen - 3); l <= maxLen; l++) lens.add(l);
	}
	const sorted = [...lens].sort((a, b) => a - b);
	const out: MatrixColumn[] = [];
	let prev = 0;
	for (const l of sorted) {
		if (l > prev + 1) out.push({ kind: 'gap', from: prev + 1, to: l - 1 });
		out.push({ kind: 'len', len: l });
		prev = l;
	}
	return out;
}
