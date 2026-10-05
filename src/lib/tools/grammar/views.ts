/**
 * The views of the Context-Free Grammars page that run the Earley parser:
 * membership of the token string and of the test strings, the parse tree and
 * leftmost derivation of a member, and the sentences of L(G) up to a length.
 * They are computed in a worker (views.worker.ts); parsing the grammar, its
 * four-tuple and the derivation builder stay on the page.
 *
 * Requests and results are plain data (they are copied between threads). A
 * result names nothing of the page's own grammar object: tokens, trees and
 * derivations come with their symbols, so a result for an earlier grammar can
 * be drawn as it is while a newer one is computed.
 */
import type { ChainStep } from '$lib/components/grammar';
import {
	derivationFromTree,
	enumerateLanguage,
	parseGrammar,
	parseTrees,
	recognizes,
	sentenceLengths,
	tokenizeInput,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import { hasErrors } from '$lib/theory/diagnostics';
import { chainOf, pairsOf } from './builder';
import type { StepPair } from './state';

/** Longest token string whose membership is decided. */
export const MAX_CHECK_TOKENS = 400;
/** Longest member whose parse tree and derivation are built. */
export const MAX_TREE_TOKENS = 60;
/** Longest leftmost derivation written out as a chain, in steps. */
export const MAX_CHAIN_STEPS = 150;
/** Parse trees counted for one string. */
export const TREE_LIMIT = 50;
/** Sentences listed in the Language panel. */
export const LIST_LIMIT = 200;
/** A finite language is counted up to this many sentences of at most COUNT_LENGTH tokens. */
export const COUNT_LIMIT = 2000;
export const COUNT_LENGTH = 40;
/** Work limit, in Earley items, for counting a finite language. */
const COUNT_STEPS = 2_000_000;

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export interface CheckRequest {
	kind: 'check';
	/** Grammar text without errors. */
	grammar: string;
	/** The token string of the Membership panel. */
	input: string;
	tests: string[];
}

/**
 * `invalid`: the string has symbols that are not terminals (the page lists
 * them). `too-long`: more than MAX_CHECK_TOKENS tokens.
 */
export type Verdict = 'member' | 'not-member' | 'invalid' | 'too-long';

export interface MemberDerivation {
	/**
	 * Sentential forms with symbols written as in a grammar (see `chainOf`);
	 * empty, like `steps`, for a derivation of more than MAX_CHAIN_STEPS steps.
	 */
	forms: string[][];
	steps: ChainStep[];
	nonterminals: string[];
	/** Every step in the builder's saved form. */
	pairs: StepPair[];
}

export interface MembershipView {
	verdict: Verdict;
	/** The tokens read. */
	tokens: string[];
	/** Parse trees found, up to TREE_LIMIT; 0 when none were built. */
	trees: number;
	/** There are more than `trees` parse trees. */
	moreTrees: boolean;
	/** The first parse tree; null for a non-member and for a member longer than MAX_TREE_TOKENS. */
	tree: ParseNode | null;
	/** The leftmost derivation of `tree`. */
	derivation: MemberDerivation | null;
}

export interface CheckView {
	input: MembershipView;
	/** One per test string. */
	tests: Verdict[];
}

function tokensOf(g: Grammar, text: string) {
	return tokenizeInput(text, g.terminals, { nonterminals: g.nonterminals });
}

function verdictOf(g: Grammar, text: string): { verdict: Verdict; tokens: string[] } {
	const { tokens, diagnostics } = tokensOf(g, text);
	if (hasErrors(diagnostics)) return { verdict: 'invalid', tokens };
	if (tokens.length > MAX_CHECK_TOKENS) return { verdict: 'too-long', tokens };
	return { verdict: recognizes(g, tokens) ? 'member' : 'not-member', tokens };
}

export function membership(g: Grammar, text: string): MembershipView {
	const { verdict, tokens } = verdictOf(g, text);
	const view: MembershipView = {
		verdict,
		tokens,
		trees: 0,
		moreTrees: false,
		tree: null,
		derivation: null
	};
	if (verdict !== 'member' || tokens.length > MAX_TREE_TOKENS) return view;
	const { trees, truncated } = parseTrees(g, tokens, { limit: TREE_LIMIT });
	if (trees.length === 0) return view;
	const leftmost = derivationFromTree(g, trees[0], 'leftmost');
	const pairs = pairsOf(leftmost);
	const chain = chainOf(g, leftmost);
	return {
		...view,
		trees: trees.length,
		moreTrees: truncated,
		tree: trees[0],
		derivation:
			pairs.length > MAX_CHAIN_STEPS
				? { forms: [], steps: [], nonterminals: chain.nonterminals, pairs }
				: { ...chain, pairs }
	};
}

const NO_MEMBERSHIP: MembershipView = {
	verdict: 'invalid',
	tokens: [],
	trees: 0,
	moreTrees: false,
	tree: null,
	derivation: null
};

export function computeCheck(request: CheckRequest): CheckView {
	const { grammar: g } = parseGrammar(request.grammar);
	if (!g) return { input: NO_MEMBERSHIP, tests: request.tests.map(() => 'invalid') };
	return {
		input: membership(g, request.input),
		tests: request.tests.map((text) => verdictOf(g, text).verdict)
	};
}

// ---------------------------------------------------------------------------
// The language
// ---------------------------------------------------------------------------

export interface LanguageRequest {
	kind: 'language';
	/** Grammar text without errors. */
	grammar: string;
	/** Longest sentence listed, in tokens. */
	maxLength: number;
}

export interface LanguageView {
	/** Sentences of at most `maxLength` tokens: shorter first, then in the order of T. At most LIST_LIMIT. */
	sentences: string[][];
	/** L(G) has sentences that are not listed (longer ones included). */
	more: boolean;
	/** The list itself was cut: there are more sentences within `maxLength`. */
	cut: boolean;
	/** The number of sentences of a finite L(G); null when it is infinite or too large to count. */
	total: number | null;
}

export function computeLanguage(request: LanguageRequest): LanguageView {
	const { grammar: g } = parseGrammar(request.grammar);
	if (!g) return { sentences: [], more: false, cut: false, total: null };
	const listing = enumerateLanguage(g, { maxLength: request.maxLength, limit: LIST_LIMIT });
	const range = sentenceLengths(g);
	let total: number | null = null;
	if (range === null) total = 0;
	else if (range.max <= request.maxLength && !listing.limited) total = listing.strings.length;
	else if (range.max <= COUNT_LENGTH) {
		const all = enumerateLanguage(g, {
			maxLength: range.max,
			limit: COUNT_LIMIT,
			maxSteps: COUNT_STEPS
		});
		if (!all.limited) total = all.strings.length;
	}
	return {
		sentences: listing.strings,
		more: listing.truncated,
		cut: listing.limited,
		total
	};
}

// ---------------------------------------------------------------------------
// The worker's computation and what the page shows of its results
// ---------------------------------------------------------------------------

export type ViewsRequest = CheckRequest | LanguageRequest;

/** Answers either kind of request; the worker serves this. */
export function computeViews(request: ViewsRequest): CheckView | LanguageView {
	return request.kind === 'check' ? computeCheck(request) : computeLanguage(request);
}

/** Why a view has no result when its computation did not finish, or null. */
export function failureText(
	status: 'idle' | 'working' | 'timed-out' | 'error',
	error: string | null
): string | null {
	if (status === 'timed-out') return 'This takes too long to compute for this grammar.';
	if (status === 'error') return `This could not be computed${error ? ` (${error})` : ''}.`;
	return null;
}

/** A result with what it was computed for. */
export interface Done<I, O> {
	input: I;
	output: O;
}

export interface TestRow {
	/** Null while the row's string has no result yet. */
	verdict: Verdict | null;
	/** The verdict is for the same string under an earlier grammar. */
	stale: boolean;
}

/**
 * The verdict to show in each test row. A row whose string differs from the
 * one the result was computed for shows none (a verdict next to another
 * string would be wrong); a row computed for an earlier grammar shows its
 * verdict as stale.
 */
export function testRows(
	tests: readonly string[],
	grammar: string,
	done: Done<CheckRequest, CheckView> | null
): TestRow[] {
	return tests.map((text, i) => {
		if (!done || done.input.tests[i] !== text || done.output.tests[i] === undefined)
			return { verdict: null, stale: false };
		return { verdict: done.output.tests[i], stale: done.input.grammar !== grammar };
	});
}

/** The sentences of a listing in groups of one length, shortest first. */
export function byLength(sentences: readonly string[][]): { length: number; items: string[][] }[] {
	const groups: { length: number; items: string[][] }[] = [];
	for (const s of sentences) {
		const last = groups[groups.length - 1];
		if (last && last.length === s.length) last.items.push(s);
		else groups.push({ length: s.length, items: [s] });
	}
	return groups;
}
