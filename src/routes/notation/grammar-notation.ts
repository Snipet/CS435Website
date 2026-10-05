/**
 * Examples for the "Grammars and parsing" sections of the notation page, taken
 * from the three parsing decks. Trees and derivations are written out by hand.
 */
import { highlightGrammar, type ChainStep } from '$lib/components/grammar';

export interface CodeSegment {
	text: string;
	className?: string;
}

/**
 * Grammar text split into colored pieces, for a `<pre>`. Non-terminals are the
 * symbols on a left-hand side, plus any named in `nonterminals`.
 */
export function grammarSegments(
	text: string,
	opts: { ebnf?: boolean; nonterminals?: readonly string[] } = {}
): CodeSegment[] {
	const out: CodeSegment[] = [];
	let at = 0;
	for (const mark of highlightGrammar(text, opts)) {
		if (mark.from > at) out.push({ text: text.slice(at, mark.from) });
		out.push({ text: text.slice(mark.from, mark.to), className: mark.className });
		at = mark.to;
	}
	if (at < text.length) out.push({ text: text.slice(at) });
	return out;
}

/** Top-Down Parsing, slide 4. */
export const expressionGrammar = `E → T | T + E
T → int | int * T | ( E )`;

/** Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 11. */
export const danglingElseGrammar = `E → if E then E
  | if E then E else E
  | OTHER`;

/** `%left` lines of Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 18. */
export const precedenceDeclarations = `%left +
%left *`;

export interface EbnfRewrite {
	/** Slide of Top-Down Parsing. */
	slide: number;
	before: string;
	after: string;
	/** Non-terminals that have no production in the text. */
	nonterminals?: string[];
}

/** Grammars the slides rewrite with EBNF brackets. */
export const ebnfRewrites: EbnfRewrite[] = [
	{ slide: 25, before: 'S → 1 | S 0', after: 'S → 1 { 0 }' },
	{
		slide: 38,
		before: `E → E + T | T
T → T * F | F
F → ( E ) | int`,
		after: `E → T { + T }
T → F { * F }
F → ( E ) | int`
	},
	{
		slide: 36,
		before: `E → T + E | T
T → ( E ) | int | int * T`,
		after: `E → T [ + E ]
T → ( E ) | int [ * T ]`
	},
	{ slide: 39, before: 'A → X op A | X', after: 'A → X [ op A ]', nonterminals: ['X'] }
];

/**
 * Introduction to Parsing, slide 12: E → E * E → ( E ) * E → ( E + E ) * E → …
 * → (int + int) * int. The slide leaves out the three steps E → int; here
 * they replace the leftmost E first.
 */
export const rewriteChain: { forms: string[][]; steps: ChainStep[]; nonterminals: string[] } = {
	forms: [
		['E'],
		['E', '*', 'E'],
		['(', 'E', ')', '*', 'E'],
		['(', 'E', '+', 'E', ')', '*', 'E'],
		['(', 'int', '+', 'E', ')', '*', 'E'],
		['(', 'int', '+', 'int', ')', '*', 'E'],
		['(', 'int', '+', 'int', ')', '*', 'int']
	],
	steps: [
		{ index: 0, length: 3 },
		{ index: 0, length: 3 },
		{ index: 1, length: 3 },
		{ index: 1, length: 1 },
		{ index: 3, length: 1 },
		{ index: 6, length: 1 }
	],
	nonterminals: ['E']
};

/** Top-Down Parsing, slides 31–34: one function per production, numbered from 1. */
export const productionFunctions: { name: string; number: number; production: string }[] = [
	{ name: 'E', number: 1, production: 'E → T' },
	{ name: 'E', number: 2, production: 'E → T + E' },
	{ name: 'T', number: 1, production: 'T → int' },
	{ name: 'T', number: 2, production: 'T → int * T' },
	{ name: 'T', number: 3, production: 'T → ( E )' }
];

/** Top-Down Parsing, slides 7, 11 and 16: the status messages, word for word. */
export const statusMessages: { text: string; when: string }[] = [
	{
		text: 'Mismatch: int is not (',
		when: 'The terminal at the current node (here int) is not the next token (here an opening parenthesis).'
	},
	{
		text: 'Backtrack …',
		when: 'Follows a mismatch: the children just added are removed and the next alternative is tried.'
	},
	{
		text: 'Match! Advance input.',
		when: 'The terminal at the current node is the next token; the pointer moves one token to the right.'
	},
	{
		text: 'End of input, accept',
		when: 'The tree is complete and the pointer is past the last token.'
	}
];
