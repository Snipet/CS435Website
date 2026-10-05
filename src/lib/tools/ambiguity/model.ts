/**
 * What the Ambiguity and Precedence page shows, computed from its inputs:
 * the parse trees of the string under the grammar, the same string under a
 * rewritten grammar with the original trees it rules out, and the trees that
 * precedence and associativity declarations rule out.
 *
 * Everything here runs on the page for every edit, so it is bounded: strings
 * of up to MAX_TOKENS tokens and the first TREE_LIMIT trees. (Comparing the
 * languages of two grammars is not: see compare.ts.)
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
	type Grammar,
	type ParseNode
} from '$lib/theory/grammar';
import {
	binaryOperators,
	filterTrees,
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
import { evaluate, parseValues, type Evaluation, type OperandValue } from './values';

/** Longest token string whose trees are listed. */
export const MAX_TOKENS = 40;
/** Most trees listed for one string. */
export const TREE_LIMIT = 20;

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
	/** Position in the list, from 1. */
	number: number;
	tree: ParseNode;
	shape: Shape | null;
	/** `shapeKey(shape)`: equal for trees with the same operator structure. */
	key: string;
	/** The grouping the tree stands for, with the display labels: `(int * int) + int`. */
	grouping: string;
	/** `E( E( E(int) * E(int) ) + E(int) )`. */
	bracket: string;
	/** The abbreviated tree (see `abbreviate`); null for a tree of the empty string. */
	abbreviated: ParseNode | null;
	/** What the tree computes; null when no values are given or their number does not fit. */
	value: Evaluation | null;
}

export interface Listing {
	trees: TreeEntry[];
	/** There are more trees than TREE_LIMIT. */
	truncated: boolean;
	/** Why the trees have no values, when values are given. */
	valuesNote: string | null;
}

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

/** The parse trees of the source's string under `g`, in slide order (see `orderTrees`). */
export function listTrees(
	g: Grammar,
	source: Pick<Source, 'tokens' | 'display' | 'values'>
): Listing {
	const found = parseTrees(g, source.tokens, { limit: TREE_LIMIT });
	const operands = operandTerminals(g);
	const assigned = assignValues(g, source.tokens, source.values);
	const label = (at: number, symbol: string) => source.display[at] ?? symbol;
	const trees = orderTrees(found.trees).map((tree, i): TreeEntry => {
		const shape = shapeOf(tree);
		return {
			number: i + 1,
			tree,
			shape,
			key: shapeKey(shape),
			grouping: shapeText(shape, label),
			bracket: bracketForm(tree),
			abbreviated: shape ? abbreviate(shape, operands) : null,
			value: assigned.at.size > 0 ? evaluate(shape, (at) => assigned.at.get(at)) : null
		};
	});
	return { trees, truncated: found.truncated, valuesNote: assigned.note };
}

/** "1 parse tree", "2 parse trees", "More than 20 parse trees", "No parse tree". */
export function countText(listing: Pick<Listing, 'trees' | 'truncated'>): string {
	const n = listing.trees.length;
	if (n === 0) return 'No parse tree';
	if (listing.truncated) return `More than ${n} parse trees`;
	return n === 1 ? '1 parse tree' : `${n} parse trees`;
}

/**
 * The verdict line: "1 parse tree", "2 parse trees: the grammar is
 * ambiguous" (a grammar is ambiguous if it has more than one parse tree for
 * some string), "No parse tree: the grammar does not generate the string".
 */
export function verdictText(
	listing: Pick<Listing, 'trees' | 'truncated'>,
	what = 'the grammar'
): string {
	const note = verdictNote(listing, what);
	return note ? `${countText(listing)}: ${note}` : countText(listing);
}

/** What the number of trees says about the grammar; null for exactly one tree. */
export function verdictNote(
	listing: Pick<Listing, 'trees' | 'truncated'>,
	what = 'the grammar'
): string | null {
	const n = listing.trees.length;
	if (n === 0) return `${what} does not generate the string`;
	if (n === 1 && !listing.truncated) return null;
	return `${what} is ambiguous`;
}

/** How a tree count is toned: one tree, several trees (ambiguous), none. */
export function verdictTone(
	listing: Pick<Listing, 'trees' | 'truncated'>
): 'accept' | 'active' | 'reject' {
	const n = listing.trees.length;
	return n === 0 ? 'reject' : n === 1 && !listing.truncated ? 'accept' : 'active';
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
	 * Per original tree: the number of the rewritten grammar's tree with the same
	 * shape, or null when there is none (the tree is crossed out).
	 */
	matches: (number | null)[];
	/** Per tree of the rewritten grammar: the number of the first original tree with its shape. */
	origins: (number | null)[];
}

/**
 * The string under the rewritten grammar, and which trees of the original
 * grammar still have a counterpart: a tree is kept when some tree of the
 * rewritten grammar has the same shape.
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
		matches: [],
		origins: []
	};
	if (none.empty) return none;
	const parsed = parseGrammar(text);
	const g = parsed.grammar;
	if (!g) return { ...none, diagnostics: parsed.diagnostics };
	const terminals = new Set(g.terminals);
	const unknown = [...new Set(source.tokens.filter((t) => !terminals.has(t)))];
	if (!source.ready || !original)
		return { ...none, grammar: g, diagnostics: parsed.diagnostics, unknown };
	const listing = listTrees(g, source);
	const numberOf = new Map<string, number>();
	for (const entry of listing.trees)
		if (!numberOf.has(entry.key)) numberOf.set(entry.key, entry.number);
	const originOf = new Map<string, number>();
	for (const entry of original.trees)
		if (!originOf.has(entry.key)) originOf.set(entry.key, entry.number);
	return {
		empty: false,
		grammar: g,
		diagnostics: parsed.diagnostics,
		unknown,
		listing,
		matches: original.trees.map((entry) => numberOf.get(entry.key) ?? null),
		origins: listing.trees.map((entry) => originOf.get(entry.key) ?? null)
	};
}

export interface DeclarationAnalysis extends Filtered {
	/** Per original tree: why it is crossed out (empty: it is kept). */
	reasons: string[][];
	/** Operators of the grammar's productions of the form A → A op A. */
	operators: string[];
}

/** The original trees under the declarations (see declarations.ts). */
export function analyzeDeclarations(
	g: Grammar,
	listing: Listing,
	declarations: readonly Declaration[]
): DeclarationAnalysis {
	const filtered = filterTrees(
		g,
		listing.trees.map((entry) => entry.tree),
		declarations
	);
	return {
		...filtered,
		reasons: filtered.violations.map(reasons),
		operators: binaryOperators(g)
	};
}

/** A token string as text, for messages: `int * int + int`. */
export const stringText = (tokens: readonly string[]): string => printSymbols(tokens);
