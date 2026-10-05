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
	cycles,
	derivationFromTree,
	enumerateLanguage,
	makeGrammar,
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
import { PLAIN, spellingOf, type Spelling } from './spelling';
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
	 * Sentential forms with symbols written as in the grammar (see `chainOf`);
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
	/**
	 * Parse trees found, up to TREE_LIMIT; 0 when none were built. Trees in
	 * which a node repeats above itself are not among them (see `cycle`).
	 */
	trees: number;
	/** There are more than `trees` such parse trees. */
	moreTrees: boolean;
	/**
	 * A non-terminal V with V →+ V that stands in a parse tree of the string;
	 * null when there is none. With one, the steps from V back to V can be put
	 * into the tree any number of times: the string has infinitely many parse
	 * trees, whatever `trees` says.
	 */
	cycle: string | null;
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

/**
 * Whether some parse tree of `tokens` has a node labeled with a non-terminal
 * of `marked`.
 *
 * Decided by a second grammar: next to every non-terminal X it has X′, which
 * derives the strings X derives with a tree that holds a marked node. For a
 * marked X that is every tree of X (X′ takes the productions of X as they
 * are); for another X one non-terminal of the right-hand side has to supply
 * the node (X → Y Z gives X′ → Y′ Z | Y Z′). The answer is whether S′ derives
 * the tokens.
 */
export function parsesThrough(
	g: Grammar,
	tokens: readonly string[],
	marked: ReadonlySet<string>
): boolean {
	const symbols = new Set([...g.nonterminals, ...g.terminals]);
	// A suffix that makes no X′ the name of a symbol of the grammar.
	let suffix = '′';
	while (g.nonterminals.some((x) => symbols.has(x + suffix))) suffix += '′';
	const isNonterminal = new Set(g.nonterminals);
	const primed: { lhs: string; rhs: string[] }[] = [];
	for (const p of g.productions) {
		const lhs = p.lhs + suffix;
		if (marked.has(p.lhs)) primed.push({ lhs, rhs: p.rhs });
		else
			p.rhs.forEach((y, i) => {
				if (isNonterminal.has(y))
					primed.push({ lhs, rhs: [...p.rhs.slice(0, i), y + suffix, ...p.rhs.slice(i + 1)] });
			});
	}
	const start = g.start + suffix;
	// makeGrammar takes the first left-hand side as the start symbol.
	const first = primed.filter((p) => p.lhs === start);
	if (first.length === 0) return false;
	const rest = primed.filter((p) => p.lhs !== start);
	return recognizes(makeGrammar([...first, ...rest, ...g.productions]), tokens);
}

/**
 * A non-terminal V with V →+ V (`cycles`) that stands in some parse tree of
 * `tokens`, or null. Such a tree can be made larger without changing its
 * string, by going from V back to V once more, so the string has infinitely
 * many parse trees exactly when there is such a V. `parseTrees` lists none of
 * the larger trees, and with more trees than its limit it need not list one
 * that holds V at all, which is why this is decided apart from its list.
 *
 * Of the groups of `cycles`, the first one in grammar order that some tree
 * goes through names the answer (its first member: every member of a group
 * derives every other).
 */
export function cycleIn(g: Grammar, tokens: readonly string[]): string | null {
	const groups = cycles(g);
	const through = (count: number) =>
		parsesThrough(g, tokens, new Set(groups.slice(0, count).flat()));
	if (groups.length === 0 || !through(groups.length)) return null;
	// The fewest leading groups that a tree goes through: the last of them is the one.
	let low = 1;
	let high = groups.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (through(middle)) high = middle;
		else low = middle + 1;
	}
	return groups[low - 1][0];
}

/** `write`: how the symbols of the derivation are written (the tokens and the tree hold plain names). */
export function membership(g: Grammar, text: string, write: Spelling = PLAIN): MembershipView {
	const { verdict, tokens } = verdictOf(g, text);
	const view: MembershipView = {
		verdict,
		tokens,
		trees: 0,
		moreTrees: false,
		cycle: null,
		tree: null,
		derivation: null
	};
	if (verdict !== 'member' || tokens.length > MAX_TREE_TOKENS) return view;
	const { trees, truncated } = parseTrees(g, tokens, { limit: TREE_LIMIT });
	if (trees.length === 0) return view;
	const leftmost = derivationFromTree(g, trees[0], 'leftmost');
	const pairs = pairsOf(leftmost);
	const chain = chainOf(g, leftmost, write);
	return {
		...view,
		trees: trees.length,
		moreTrees: truncated,
		cycle: cycleIn(g, tokens),
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
	cycle: null,
	tree: null,
	derivation: null
};

export function computeCheck(request: CheckRequest): CheckView {
	const { grammar: g } = parseGrammar(request.grammar);
	if (!g) return { input: NO_MEMBERSHIP, tests: request.tests.map(() => 'invalid') };
	return {
		input: membership(g, request.input, spellingOf(request.grammar)),
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
