/**
 * Examples for the "Grammars and parsing" sections of the notation page, taken
 * from the three parsing decks. Trees and derivations are written out by hand.
 */
import { highlightGrammar, tokenizeGrammarText, type ChainStep } from '$lib/components/grammar';

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

/** Top-Down Parsing, slides 4 and 31–34. */
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

export interface ProductionFunction {
	/** The non-terminal. */
	name: string;
	/** Position of the production among those of `name`, from 1. */
	number: number;
	production: string;
}

/**
 * One function per production, numbered from 1 for each non-terminal in the
 * order the grammar text writes its productions.
 */
export function numberProductions(text: string): ProductionFunction[] {
	const tokens = tokenizeGrammarText(text).filter((t) => t.kind !== 'comment');
	const out: ProductionFunction[] = [];
	const counts = new Map<string, number>();
	let name: string | null = null;
	let rhs: string[] = [];
	const close = () => {
		if (name === null) return;
		const number = (counts.get(name) ?? 0) + 1;
		counts.set(name, number);
		out.push({ name, number, production: `${name} → ${rhs.join(' ') || 'ε'}` });
		rhs = [];
	};
	for (let k = 0; k < tokens.length; k++) {
		const t = tokens[k];
		if (t.kind === 'symbol' && tokens[k + 1]?.kind === 'arrow') {
			close();
			name = t.text;
			k++;
		} else if (t.kind === 'bar') close();
		else if (t.kind !== 'epsilon') rhs.push(text.slice(t.from, t.to));
	}
	close();
	return out;
}

/**
 * Top-Down Parsing, slides 31–34: the functions E1, E2, T1, T2, T3. The slides
 * number them for `expressionGrammar`, whose order of productions differs from
 * the grammar of the instance tree on slide 20.
 */
export const productionFunctions: ProductionFunction[] = numberProductions(expressionGrammar);

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
