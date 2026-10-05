/**
 * What the Ambiguity and Precedence page shows, computed from its inputs:
 * the parse trees of the string under the grammar, the same string under a
 * rewritten grammar with the original trees it rules out, and the trees that
 * precedence and associativity declarations rule out.
 *
 * Everything here runs on the page for every edit, so it is bounded: strings
 * of up to MAX_TOKENS tokens, of whose trees up to POOL_LIMIT are put in
 * order and the first TREE_LIMIT are listed. (Comparing the languages of two
 * grammars is not bounded like that: see compare.ts.)
 *
 * A string can have far more trees than are listed (six operands under
 * E → E + E | int: 42). What the two tabs say about the trees never depends
 * on which of them are listed: the tree a rewritten grammar or a set of
 * declarations keeps is looked for directly (shape-search.ts, allowedTrees in
 * declarations.ts) and drawn before the listed trees when it is not one of
 * them.
 */
import type { TreeLabeler } from '$lib/components/grammar/tree-layout';
import type { ChainStep } from '$lib/components/grammar/types';
import { hasErrors, type Diagnostic } from '$lib/theory/diagnostics';
import {
	bracketForm,
	derivationFromTree,
	parseGrammar,
	parseTrees,
	printSymbols,
	tokenizeInput,
	treeEquals,
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import {
	allowedTrees,
	binaryOperators,
	filterWith,
	leftNestedTrees,
	readDeclarations,
	reasons,
	type Declaration,
	type Filtered
} from './declarations';
import { displayTokens, parseLabels } from './labels';
import {
	abbreviate,
	operandTerminals,
	orderTrees,
	shapeKey,
	shapeOf,
	shapeText,
	type Shape
} from './shape';
import { shapeFinder } from './shape-search';
import { evaluate, parseValues, type Evaluation, type OperandValue } from './values';

/** Longest token string whose trees are listed. */
export const MAX_TOKENS = 40;
/** Most trees listed for one string. */
export const TREE_LIMIT = 20;
/**
 * Most trees of one string that are found and put in order before the first
 * TREE_LIMIT are listed: enough for eight operands under E → E + E | int (429
 * trees), and few enough to be put in order within a few milliseconds for a
 * string of MAX_TOKENS tokens. A string with more trees than this has its
 * trees counted as "more than".
 */
export const POOL_LIMIT = 500;
/**
 * Most trees from outside the listing that a tab draws before the listed
 * ones: the trees a rewritten grammar or the declarations keep. Enough for
 * the tree they select; when they keep many trees, the listed ones show it.
 */
export const EXTRA_LIMIT = 4;

/**
 * Colors of the trees of one string, alternating as the slides alternate red
 * and purple: indices into the token palette (`--tok-4`, `--tok-3`).
 */
export const TREE_TONES = [4, 3] as const;
/** The color of the tree numbered `number` (from 1). */
export const treeTone = (number: number): number =>
	TREE_TONES[(Math.max(1, number) - 1) % TREE_TONES.length];

export interface Source {
	grammar: Grammar | null;
	grammarDiagnostics: Diagnostic[];
	/** The token string as symbols; every symbol read, known to the grammar or not. */
	tokens: string[];
	/** Problems with the token string; spans index into its text. */
	inputDiagnostics: Diagnostic[];
	/** Each token as it is displayed: its occurrence label (`E₁`) or the token itself. */
	display: string[];
	/** Some token is displayed under a label. */
	labelled: boolean;
	labelProblems: string[];
	/** The numbers of the "operand values" field. */
	values: OperandValue[];
	valuesError: string | null;
	/** The grammar has no errors and the string is made of its terminals. */
	ready: boolean;
}

/** Parses the grammar, the token string, the occurrence labels and the operand values. */
export function readSource(input: {
	grammar: string;
	input: string;
	labels: string;
	values: string;
}): Source {
	const parsed = parseGrammar(input.grammar);
	const g = parsed.grammar;
	const lexed = tokenizeInput(input.input, g ? g.terminals : [], {
		nonterminals: g?.nonterminals
	});
	// Without a grammar there are no terminals to check the tokens against.
	const inputDiagnostics = g ? [...lexed.diagnostics] : [];
	if (lexed.tokens.length > MAX_TOKENS)
		inputDiagnostics.push({
			severity: 'error',
			message: `The string has ${lexed.tokens.length} tokens. Trees are listed for strings of up to ${MAX_TOKENS} tokens.`
		});
	const labels = parseLabels(input.labels, g?.terminals);
	const display = displayTokens(lexed.tokens, labels.map);
	const values = parseValues(input.values);
	return {
		grammar: g,
		grammarDiagnostics: parsed.diagnostics,
		tokens: lexed.tokens,
		inputDiagnostics,
		display,
		labelled: display.some((text, i) => text !== lexed.tokens[i]),
		labelProblems: labels.problems,
		values: values.values,
		valuesError: values.error,
		ready: g !== null && !hasErrors(inputDiagnostics)
	};
}

export interface TreeEntry {
	/**
	 * The tree's place among the trees of the string in slide order, from 1.
	 * 0 for a tree from outside the listing whose place is not known (the
	 * string has more than POOL_LIMIT trees).
	 */
	number: number;
	tree: ParseNode;
	shape: Shape | null;
	/** `shapeKey(shape)`: equal for trees with the same operator structure. */
	key: string;
	/** The grouping the tree stands for, with the display labels: `(int * int) + int`. */
	grouping: string;
	/** `E( E( E(int) * E(int) ) + E(int) )`. */
	bracket: string;
	/**
	 * The abbreviated tree (see `abbreviate`). Null when there is none: for a
	 * tree of the empty string, and under a grammar without operand terminals
	 * (S → a S b | ε), where nothing tells a keyword from a sub-expression and
	 * the abbreviation would leave out every token but the first of each node.
	 */
	abbreviated: ParseNode | null;
	/** What the tree computes; null when no values are given or their number does not fit. */
	value: Evaluation | null;
}

export interface Listing {
	/** The trees listed: the first TREE_LIMIT in slide order (see `orderTrees`). */
	trees: TreeEntry[];
	/** The string has more trees than are listed. */
	truncated: boolean;
	/** How many trees the string has; null when there are more than POOL_LIMIT. */
	total: number | null;
	/** Every tree of the string in slide order; null when there are more than POOL_LIMIT. */
	all: readonly ParseNode[] | null;
	/** Why the trees have no values, when values are given. */
	valuesNote: string | null;
}

/** The fields of a source that say how a tree of its string is listed. */
type Shown = Pick<Source, 'tokens' | 'display' | 'values'>;

/**
 * How the operand values map to the tokens: the k-th token that is an operand
 * terminal of `g` takes the k-th value. `note` says why there are no values
 * when the numbers do not fit the string.
 */
export function assignValues(
	g: Grammar,
	tokens: readonly string[],
	values: readonly OperandValue[]
): { at: Map<number, OperandValue>; note: string | null } {
	const at = new Map<number, OperandValue>();
	if (values.length === 0) return { at, note: null };
	const operands = operandTerminals(g);
	const places = tokens.flatMap((t, i) => (operands.has(t) ? [i] : []));
	if (places.length !== values.length) {
		const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
		return {
			at,
			note: `The string has ${count(places.length, 'operand')} and the field has ${count(values.length, 'value')}.`
		};
	}
	places.forEach((place, k) => at.set(place, values[k]));
	return { at, note: null };
}

/** Makes the entries of the trees of one string. */
function entryMaker(g: Grammar, source: Shown) {
	const operands = operandTerminals(g);
	const assigned = assignValues(g, source.tokens, source.values);
	const label = (at: number, symbol: string) => source.display[at] ?? symbol;
	const entry = (tree: ParseNode, number: number): TreeEntry => {
		const shape = shapeOf(tree);
		return {
			number,
			tree,
			shape,
			key: shapeKey(shape),
			grouping: shapeText(shape, label),
			bracket: bracketForm(tree),
			abbreviated: shape && operands.size > 0 ? abbreviate(shape, operands) : null,
			value: assigned.at.size > 0 ? evaluate(shape, (at) => assigned.at.get(at)) : null
		};
	};
	return { entry, note: assigned.note };
}

/** What the page lists for one tree of the source's string under `g`. */
export function treeEntry(g: Grammar, source: Shown, tree: ParseNode, number: number): TreeEntry {
	return entryMaker(g, source).entry(tree, number);
}

/**
 * The parse trees of the source's string under `g`: up to POOL_LIMIT trees
 * are found and put in slide order (see `orderTrees`), and the first
 * TREE_LIMIT of them are listed. So the left-nested tree comes first also
 * when the string has more trees than are listed.
 *
 * A string with more than POOL_LIMIT trees has its trees counted as "more
 * than". The trees listed for it are a sample: the first trees the parser
 * finds, and the left-nested tree, which is found separately so that it is
 * still listed first for a grammar of binary operators.
 */
export function listTrees(g: Grammar, source: Shown): Listing {
	const found = parseTrees(g, source.tokens, { limit: POOL_LIMIT });
	// Past the limit, putting the trees found in order would not make them the first of all.
	const pool = found.truncated ? found.trees.slice(0, TREE_LIMIT) : found.trees;
	const added = found.truncated
		? leftNestedTrees(g, source.tokens, TREE_LIMIT).filter(
				(tree) => !pool.some((other) => treeEquals(other, tree))
			)
		: [];
	const sorted = orderTrees([...added, ...pool]);
	const make = entryMaker(g, source);
	return {
		trees: sorted.slice(0, TREE_LIMIT).map((tree, i) => make.entry(tree, i + 1)),
		truncated: found.truncated || sorted.length > TREE_LIMIT,
		total: found.truncated ? null : sorted.length,
		all: found.truncated ? null : sorted,
		valuesNote: make.note
	};
}

/**
 * The place of a tree among the trees of the string, from 1; 0 when the
 * string has more than POOL_LIMIT trees.
 */
export function placeOf(listing: Pick<Listing, 'all'>, tree: ParseNode): number {
	return listing.all ? listing.all.findIndex((other) => treeEquals(other, tree)) + 1 : 0;
}

/** "Tree 3"; "Another tree" for a tree from outside the listing whose place is not known. */
export function treeTitle(entry: Pick<TreeEntry, 'number'>): string {
	return entry.number > 0 ? `Tree ${entry.number}` : 'Another tree';
}

/** A listing as far as its number of trees goes. */
type Counted = Pick<Listing, 'trees' | 'total'>;

/** "1 parse tree", "42 parse trees", "More than 500 parse trees", "No parse tree". */
export function countText(listing: Counted): string {
	if (listing.trees.length === 0) return 'No parse tree';
	if (listing.total === null) return `More than ${POOL_LIMIT} parse trees`;
	return listing.total === 1 ? '1 parse tree' : `${listing.total} parse trees`;
}

/**
 * The verdict line: "1 parse tree", "2 parse trees: the grammar is
 * ambiguous" (a grammar is ambiguous if it has more than one parse tree for
 * some string), "No parse tree: the grammar does not generate the string".
 */
export function verdictText(listing: Counted, what = 'the grammar'): string {
	const note = verdictNote(listing, what);
	return note ? `${countText(listing)}: ${note}` : countText(listing);
}

/** What the number of trees says about the grammar; null for exactly one tree. */
export function verdictNote(listing: Counted, what = 'the grammar'): string | null {
	if (listing.trees.length === 0) return `${what} does not generate the string`;
	return listing.total === 1 ? null : `${what} is ambiguous`;
}

/** How a tree count is toned: one tree, several trees (ambiguous), none. */
export function verdictTone(listing: Counted): 'accept' | 'active' | 'reject' {
	if (listing.trees.length === 0) return 'reject';
	return listing.total === 1 ? 'accept' : 'active';
}

/** "the 42" or "more than 500": how many parse trees there are, before "parse trees". */
const howMany = (listing: Counted): string =>
	listing.total === null ? `more than ${POOL_LIMIT}` : `the ${listing.total}`;

/**
 * The line under the listed trees when the string has more: "… and more: the
 * first 20 of the 42 parse trees are listed."
 */
export function listedText(listing: Counted): string {
	// Past POOL_LIMIT the trees listed are not the first of all the trees.
	const first = listing.total === null ? '' : 'the first ';
	return `… and more: ${first}${listing.trees.length} of ${howMany(listing)} parse trees are listed.`;
}

/**
 * The line under the trees a tab draws when the string has more: "… and
 * more: 20 of the 42 parse trees are shown."
 */
export function shownText(listing: Counted, shown: number): string {
	return `… and more: ${shown} of ${howMany(listing)} parse trees are shown.`;
}

/**
 * Labels for the leaves of a tree drawn by ParseTreeView: the display form of
 * the token a leaf stands for, when it differs from the leaf's symbol.
 */
export function leafLabeler(display: readonly string[]): TreeLabeler {
	return (node) => {
		if (!node.terminal || node.start === undefined) return null;
		const text = display[node.start];
		return text !== undefined && text !== node.symbol ? text : null;
	};
}

/** The leftmost derivation of a tree, as DerivationChain takes it. */
export function leftmostChain(
	g: Grammar,
	tree: ParseNode
): { forms: string[][]; steps: ChainStep[] } {
	const d = derivationFromTree(g, tree, 'leftmost');
	return {
		forms: [d.start, ...d.steps.map((s) => s.form)],
		steps: d.steps.map((s) => ({ index: s.index, length: g.productions[s.production].rhs.length }))
	};
}

export interface RewriteAnalysis {
	/** The rewritten grammar's field is empty. */
	empty: boolean;
	grammar: Grammar | null;
	diagnostics: Diagnostic[];
	/** Tokens of the string that are not terminals of the rewritten grammar. */
	unknown: string[];
	/** The string's trees under the rewritten grammar; null when it cannot be parsed with it. */
	listing: Listing | null;
	/**
	 * The trees of the original grammar that are drawn: the listed trees, and
	 * before them up to EXTRA_LIMIT trees from outside the listing that have
	 * the shape of a listed tree of the rewritten grammar (TREE_LIMIT trees in
	 * all, at most).
	 */
	originals: TreeEntry[];
	/** How many of `originals` are from outside the listing. */
	extra: number;
	/**
	 * Per tree of `originals`: the number of the rewritten grammar's tree with
	 * the same shape (0 when that tree is outside the rewritten grammar's
	 * listing), or null when there is none: the tree is crossed out.
	 */
	matches: (number | null)[];
	/**
	 * Per listed tree of the rewritten grammar: the number of the original
	 * grammar's tree with its shape (0 when its place is not known), or null
	 * when the original grammar has no such tree.
	 */
	origins: (number | null)[];
	/**
	 * False when the rewritten grammar has trees for the string and none has
	 * the shape of a tree of the original grammar (E → T X, X → + T X | ε
	 * groups int + int + int as neither tree of E → E + E | int does). The
	 * shapes then say nothing about which tree the rewrite selects, and no
	 * tree is crossed out.
	 */
	comparable: boolean;
}

/**
 * The string under the rewritten grammar, and which trees of the original
 * grammar still have a counterpart: a tree is kept when some tree of the
 * rewritten grammar has the same shape.
 *
 * Neither answer depends on which trees are listed. When a listing is cut
 * short, a tree of one grammar whose shape is not among the listed trees of
 * the other is looked for in that grammar by its shape (shape-search.ts).
 */
export function analyzeRewrite(
	source: Source,
	original: Listing | null,
	text: string
): RewriteAnalysis {
	const none: RewriteAnalysis = {
		empty: text.trim() === '',
		grammar: null,
		diagnostics: [],
		unknown: [],
		listing: null,
		originals: [],
		extra: 0,
		matches: [],
		origins: [],
		comparable: true
	};
	if (none.empty) return none;
	const parsed = parseGrammar(text);
	const g = parsed.grammar;
	if (!g) return { ...none, diagnostics: parsed.diagnostics };
	const terminals = new Set(g.terminals);
	const unknown = [...new Set(source.tokens.filter((t) => !terminals.has(t)))];
	if (!source.ready || !original)
		return { ...none, grammar: g, diagnostics: parsed.diagnostics, unknown };
	const first = source.grammar!;
	const listing = listTrees(g, source);
	const numberOf = new Map<string, number>();
	for (const entry of listing.trees)
		if (!numberOf.has(entry.key)) numberOf.set(entry.key, entry.number);
	const originOf = new Map<string, number>();
	for (const entry of original.trees)
		if (!originOf.has(entry.key)) originOf.set(entry.key, entry.number);

	let inOriginal: ReturnType<typeof shapeFinder> | undefined;
	const extras: TreeEntry[] = [];
	const origins = listing.trees.map((entry) => {
		const known = originOf.get(entry.key);
		if (known !== undefined || !original.truncated) return known ?? null;
		inOriginal ??= shapeFinder(first, source.tokens);
		const tree = inOriginal(entry.shape);
		if (!tree) return null;
		const found = treeEntry(first, source, tree, placeOf(original, tree));
		extras.push(found);
		originOf.set(entry.key, found.number);
		return found.number;
	});
	const extra = Math.min(extras.length, EXTRA_LIMIT);
	const originals = [...extras.slice(0, extra), ...original.trees].slice(0, TREE_LIMIT);

	let inRewritten: ReturnType<typeof shapeFinder> | undefined;
	const matches = originals.map((entry) => {
		const known = numberOf.get(entry.key);
		if (known !== undefined || !listing.truncated) return known ?? null;
		inRewritten ??= shapeFinder(g, source.tokens);
		return inRewritten(entry.shape) ? 0 : null;
	});
	return {
		empty: false,
		grammar: g,
		diagnostics: parsed.diagnostics,
		unknown,
		listing,
		originals,
		extra,
		matches,
		origins,
		comparable: listing.trees.length === 0 || listing.truncated || origins.some((o) => o !== null)
	};
}

/** What the rewritten grammar leaves of the original grammar's trees, in a sentence. */
export function rewriteSummary(
	original: Pick<Listing, 'truncated'>,
	rewrite: Pick<RewriteAnalysis, 'originals' | 'matches' | 'extra' | 'comparable'>
): string {
	const shown = rewrite.originals.length;
	if (shown === 0) return 'The original grammar has no parse tree for the string.';
	if (!rewrite.comparable)
		return 'The rewritten grammar groups the string differently from every tree of the original grammar, so the trees are not matched and none is crossed out.';
	const crossed = rewrite.matches.filter((m) => m === null).length;
	const why = `no tree of the rewritten grammar has ${crossed === 1 ? 'its' : 'their'} structure`;
	if (!original.truncated) {
		if (crossed === 0)
			return shown === 1
				? 'Its tree has the structure of a tree of the rewritten grammar.'
				: `All ${shown} trees have the structure of a tree of the rewritten grammar.`;
		const which =
			shown === 1
				? 'The tree is'
				: `${crossed} of the ${shown} trees ${crossed === 1 ? 'is' : 'are'}`;
		return `${which} crossed out: ${why}.`;
	}
	let text: string;
	if (crossed === 0)
		text = `All ${shown} trees shown have the structure of a tree of the rewritten grammar.`;
	else if (crossed === shown) text = `All ${shown} trees shown are crossed out: ${why}.`;
	else
		text = `${crossed} of the ${shown} trees shown ${crossed === 1 ? 'is' : 'are'} crossed out: ${why}.`;
	return text + extraText(rewrite.extra);
}

/** A sentence about the kept trees a tab draws before the listed ones; '' when there are none. */
function extraText(extra: number): string {
	if (extra === 0) return '';
	return extra === 1
		? ' A kept tree from outside the listed ones is shown first.'
		: ` ${extra} kept trees from outside the listed ones are shown first.`;
}

export interface DeclarationAnalysis extends Filtered {
	/**
	 * The trees drawn: the listed trees, and before them up to EXTRA_LIMIT trees
	 * from outside the listing that the declarations allow (TREE_LIMIT trees in
	 * all, at most). `violations`, `reasons` and `kept` go by this list.
	 */
	trees: TreeEntry[];
	/** How many of `trees` are from outside the listing. */
	extra: number;
	/** Per tree of `trees`: why it is crossed out (empty: it is kept). */
	reasons: string[][];
	/** How many trees of the string the declarations allow; null when more than POOL_LIMIT. */
	allowed: number | null;
	/** Operators of the grammar's productions of the form A → A op A. */
	operators: string[];
}

/**
 * The trees of the string under the declarations (see declarations.ts). When
 * the string has more trees than are listed, the trees the declarations allow
 * are found without the listing (`allowedTrees`), so the tree they select is
 * drawn and counted whether or not it is among the listed ones.
 */
export function analyzeDeclarations(
	g: Grammar,
	source: Shown,
	listing: Listing,
	declarations: readonly Declaration[]
): DeclarationAnalysis {
	const precedence = readDeclarations(declarations, g);
	let trees = listing.trees;
	let extra = 0;
	// Declarations that restrict nothing allow every tree.
	let allowed = listing.total;
	const beyond = listing.truncated ? allowedTrees(g, source.tokens, precedence, POOL_LIMIT) : null;
	if (beyond) {
		allowed = beyond.truncated ? null : beyond.trees.length;
		const listed = new Set(listing.trees.map((entry) => entry.bracket));
		const extras: TreeEntry[] = [];
		// Past the limit the allowed trees found are a sample, as in listTrees.
		const pool = beyond.truncated ? beyond.trees.slice(0, TREE_LIMIT) : beyond.trees;
		for (const tree of orderTrees(pool)) {
			if (extras.length === EXTRA_LIMIT) break;
			if (!listed.has(bracketForm(tree)))
				extras.push(treeEntry(g, source, tree, placeOf(listing, tree)));
		}
		extra = extras.length;
		trees = [...extras, ...listing.trees].slice(0, TREE_LIMIT);
	}
	const filtered = filterWith(
		g,
		trees.map((entry) => entry.tree),
		precedence
	);
	if (!listing.truncated) allowed = filtered.kept.length;
	return {
		...filtered,
		trees,
		extra,
		reasons: filtered.violations.map(reasons),
		allowed,
		operators: binaryOperators(g)
	};
}

/** What the declarations leave of the string's trees, in a sentence or two. */
export function declarationSummary(
	listing: Counted,
	analysis: Pick<DeclarationAnalysis, 'allowed' | 'operators' | 'extra'>,
	lines: number
): string {
	if (listing.trees.length === 0) return 'The string has no parse tree.';
	if (analysis.operators.length === 0)
		return 'The grammar has no production of the form A → A op A, so declarations leave its trees as they are.';
	const { total } = listing;
	const kept = analysis.allowed;
	const one = total === 1;
	const all = one ? 'the tree' : total === null ? 'the trees' : `the ${total} trees`;
	if (lines === 0) {
		if (one) return 'No declarations: the tree is kept.';
		return total === null
			? 'No declarations: every tree is kept.'
			: `No declarations: all ${total} trees are kept.`;
	}
	if (kept === 0) {
		const which = one ? all : total === null ? 'every tree' : `all of ${all}`;
		return `The declarations cross out ${which}: with them, the string is a syntax error.`;
	}
	let text: string;
	if (kept === null) text = `The declarations keep more than ${POOL_LIMIT} trees.`;
	else if (kept === total)
		text = one ? 'The declarations keep the tree.' : `The declarations keep all of ${all}.`;
	else if (total === null)
		text = `The declarations keep ${kept === 1 ? 'one tree' : `${kept} trees`} and cross out the rest.`;
	else if (kept === 1) text = `The declarations keep one of ${all} and cross out the rest.`;
	else text = `The declarations keep ${kept} of ${all}.`;
	return text + extraText(analysis.extra);
}

/**
 * The index in `analysis.trees` of the tree the declarations select: the only
 * tree they allow, when the string has other trees. −1 when there is none.
 */
export function selectedTree(
	listing: Counted,
	analysis: Pick<DeclarationAnalysis, 'allowed' | 'kept'>
): number {
	return analysis.allowed === 1 && analysis.kept.length === 1 && listing.total !== 1
		? analysis.kept[0]
		: -1;
}

/** A token string as text, for messages: `int * int + int`. */
export const stringText = (tokens: readonly string[]): string => printSymbols(tokens);
