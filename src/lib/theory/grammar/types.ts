/**
 * Context-free grammar model shared by the parsing tools.
 *
 * A CFG is a four-tuple (N, T, S, P) (Introduction to Parsing, slide 14).
 * Symbols are plain strings. A symbol is a non-terminal exactly when it appears
 * on the left-hand side of a production, so an upper-case terminal such as
 * OTHER (the dangling-else grammar) stays a terminal.
 */
import type { Span } from '../regex/ast';

export interface Production {
	/** Index in `Grammar.productions` (grammar order); also the production's number minus one. */
	id: number;
	lhs: string;
	/** Right-hand side symbols; empty for an ε-production. */
	rhs: string[];
	/** Where this alternative was written (offsets into the grammar text). */
	span?: Span;
}

export interface Grammar {
	/** S: the left-hand side of the first production. */
	start: string;
	/** N, in order of first appearance on a left-hand side. */
	nonterminals: string[];
	/** T, in order of first appearance. */
	terminals: string[];
	/** P, in the order written; `X → a | b` contributes two productions. */
	productions: Production[];
}

/** EBNF right-hand sides: { α } repetition and [ α ] option (Top-Down Parsing, slide 24). */
export type Ebnf =
	| { kind: 'sym'; name: string }
	| { kind: 'eps' }
	| { kind: 'seq'; items: Ebnf[] }
	| { kind: 'alt'; options: Ebnf[] }
	/** [ α ]: zero or one α */
	| { kind: 'opt'; body: Ebnf }
	/** { α }: zero or more α */
	| { kind: 'rep'; body: Ebnf };

export interface EbnfRule {
	lhs: string;
	body: Ebnf;
	span?: Span;
}

export interface EbnfGrammar {
	start: string;
	nonterminals: string[];
	terminals: string[];
	/** One rule per non-terminal, in the order written. */
	rules: EbnfRule[];
}

/**
 * A parse-tree node. Interior nodes are non-terminals with the production
 * that was applied; leaves are terminals. An ε-production gives an interior
 * node with no children (`production` set, `children` empty).
 */
export interface ParseNode {
	symbol: string;
	terminal: boolean;
	children: ParseNode[];
	/** Production id applied at this non-terminal node. */
	production?: number;
	/** Token range [start, end) of the input this subtree covers, when known. */
	start?: number;
	end?: number;
}

/** A string of grammar symbols: a sentential form, or a sentence when all are terminals. */
export type SententialForm = string[];

/** One derivation step: replace the non-terminal at `index` of the previous form using `production`. */
export interface DerivationStep {
	index: number;
	production: number;
	/** The form after the step. */
	form: SententialForm;
}

export interface Derivation {
	/** The starting form, normally [S]. */
	start: SententialForm;
	steps: DerivationStep[];
}

/** End-of-input marker used by predictive parsers (Top-Down Parsing, slide 37). */
export const END_MARKER = '$';
/** Display form of the empty string in grammars. */
export const EPSILON = 'ε';
