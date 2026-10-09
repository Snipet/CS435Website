/**
 * Tokens of C- (the language of Appendix A of the course text).
 *
 * Keywords: else if int return void while. Special symbols:
 * + - * / < <= > >= == != = ; , ( ) [ ] { } and the comment brackets.
 * ID = letter letter*, NUM = digit digit*. Token type names are written in
 * upper case, as in the course's scanners (ID, NUM, PLUS, ASSIGN, ENDFILE …).
 */
import type { Diagnostic } from '../diagnostics';
import type { Span } from '../regex/ast';

/** A range of the source text, with the line and column of its first character. */
export interface SourceSpan extends Span {
	/** 1-based line of `start`. */
	line: number;
	/** 1-based column of `start`, counted in UTF-16 code units. */
	column: number;
}

/** A diagnostic of the C- compiler: its span carries the line and the column. */
export interface SourceDiagnostic extends Diagnostic {
	span?: SourceSpan;
}

export type KeywordType = 'ELSE' | 'IF' | 'INT' | 'RETURN' | 'VOID' | 'WHILE';

export type SymbolType =
	| 'PLUS'
	| 'MINUS'
	| 'TIMES'
	| 'OVER'
	| 'LT'
	| 'LTE'
	| 'GT'
	| 'GTE'
	| 'EQ'
	| 'NEQ'
	| 'ASSIGN'
	| 'SEMI'
	| 'COMMA'
	| 'LPAREN'
	| 'RPAREN'
	| 'LBRACKET'
	| 'RBRACKET'
	| 'LBRACE'
	| 'RBRACE';

export type TokenType = KeywordType | 'ID' | 'NUM' | SymbolType | 'ENDFILE' | 'ERROR';

/** Reserved words and their token types. */
export const KEYWORDS: Readonly<Record<string, KeywordType>> = {
	else: 'ELSE',
	if: 'IF',
	int: 'INT',
	return: 'RETURN',
	void: 'VOID',
	while: 'WHILE'
};

/** Special symbols, two-character ones first so that `<=` wins over `<` (maximal munch). */
export const SYMBOLS: readonly (readonly [string, SymbolType])[] = [
	['<=', 'LTE'],
	['>=', 'GTE'],
	['==', 'EQ'],
	['!=', 'NEQ'],
	['+', 'PLUS'],
	['-', 'MINUS'],
	['*', 'TIMES'],
	['/', 'OVER'],
	['<', 'LT'],
	['>', 'GT'],
	['=', 'ASSIGN'],
	[';', 'SEMI'],
	[',', 'COMMA'],
	['(', 'LPAREN'],
	[')', 'RPAREN'],
	['[', 'LBRACKET'],
	[']', 'RBRACKET'],
	['{', 'LBRACE'],
	['}', 'RBRACE']
];

/** Every token type: keywords, ID, NUM, special symbols, ENDFILE, ERROR. */
export const TOKEN_TYPES: readonly TokenType[] = [
	...Object.values(KEYWORDS),
	'ID',
	'NUM',
	...SYMBOLS.map(([, type]) => type),
	'ENDFILE',
	'ERROR'
];

export interface Token {
	type: TokenType;
	/** The characters of the token ('' for ENDFILE). */
	lexeme: string;
	span: SourceSpan;
	/** NUM only: the number written (it may be larger than an int holds). */
	value?: number;
}

/** Text between tokens: it produces no token and is kept for highlighting. */
export interface Trivia {
	kind: 'whitespace' | 'comment';
	text: string;
	span: SourceSpan;
}

const SPELLING = new Map<TokenType, string>([
	...Object.entries(KEYWORDS).map(([word, type]) => [type, word] as const),
	...SYMBOLS.map(([text, type]) => [type, text] as const)
]);

/** The fixed spelling of a keyword or special symbol; null for ID, NUM, ENDFILE and ERROR. */
export function spellingOf(type: TokenType): string | null {
	return SPELLING.get(type) ?? null;
}

/** From the start of `a` through the end of `b`. */
export function joinSpans(a: SourceSpan, b: SourceSpan): SourceSpan {
	return {
		start: a.start,
		end: Math.max(a.end, b.end),
		line: a.line,
		column: a.column,
		source: null
	};
}
