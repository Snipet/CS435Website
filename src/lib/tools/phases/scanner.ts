/**
 * Scanner of the tiny compiler (Intro (cont'd), compiler architecture, slide 4).
 *
 * Maximal munch over a fixed token set: identifiers `[A-Za-z][A-Za-z0-9]*`,
 * integer and float literals, the keywords `if then else`, the relational
 * operators, `= + - * / ( ) ;`. Whitespace separates tokens and produces none.
 * Characters outside the token set are reported and skipped.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { RuleState } from '$lib/tools/links';

export type TokenKind =
	| 'ID'
	| 'NUM'
	| 'FNUM'
	| 'ASSIGN'
	| 'PLUS'
	| 'MINUS'
	| 'TIMES'
	| 'OVER'
	| 'LPAREN'
	| 'RPAREN'
	| 'SEMI'
	| 'IF'
	| 'THEN'
	| 'ELSE'
	| 'EQ'
	| 'NE'
	| 'LT'
	| 'LE'
	| 'GT'
	| 'GE';

export interface Token {
	kind: TokenKind;
	lexeme: string;
	/** `[start, end)` in the source. */
	start: number;
	end: number;
}

export interface ScanOutput {
	tokens: Token[];
	diagnostics: Diagnostic[];
}

/**
 * Token names differ between the decks: the compiler-architecture table
 * (deck 01) writes integer literals as NUM, the five-phase walkthrough
 * (deck 03, slide 5) as ILIT. FLIT follows ILIT for float literals.
 */
export type TokenNaming = 'seven' | 'five';

export function tokenName(kind: TokenKind, naming: TokenNaming = 'seven'): string {
	if (naming === 'five') {
		if (kind === 'NUM') return 'ILIT';
		if (kind === 'FNUM') return 'FLIT';
	}
	return kind;
}

const KEYWORDS: Record<string, TokenKind> = { if: 'IF', then: 'THEN', else: 'ELSE' };

/** Two-character operators first, so `<=` wins over `<` (maximal munch). */
const OPERATORS: [string, TokenKind][] = [
	['==', 'EQ'],
	['!=', 'NE'],
	['<=', 'LE'],
	['>=', 'GE'],
	['=', 'ASSIGN'],
	['<', 'LT'],
	['>', 'GT'],
	['+', 'PLUS'],
	['-', 'MINUS'],
	['*', 'TIMES'],
	['/', 'OVER'],
	['(', 'LPAREN'],
	[')', 'RPAREN'],
	[';', 'SEMI']
];

const isLetter = (c: string) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
const isDigit = (c: string) => c >= '0' && c <= '9';
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

function describeChars(text: string): string {
	const shown = [...text].map((c) => (c === "'" ? "\\'" : c)).join('');
	return [...text].length === 1 ? `character '${shown}'` : `characters '${shown}'`;
}

export function scan(source: string): ScanOutput {
	const tokens: Token[] = [];
	const diagnostics: Diagnostic[] = [];
	let bad: { start: number; end: number } | null = null;

	const flushBad = () => {
		if (!bad) return;
		const text = source.slice(bad.start, bad.end);
		const hint = text === '!' ? ' (`!` is only used in `!=`)' : '';
		diagnostics.push({
			severity: 'error',
			message: `Unexpected ${describeChars(text)}: no token starts with it${hint}.`,
			span: { start: bad.start, end: bad.end, source: null }
		});
		bad = null;
	};

	let i = 0;
	while (i < source.length) {
		const c = source[i];
		if (isSpace(c)) {
			flushBad();
			i++;
			continue;
		}
		const start = i;
		let kind: TokenKind | null = null;
		if (isLetter(c)) {
			i++;
			while (i < source.length && (isLetter(source[i]) || isDigit(source[i]))) i++;
			kind = KEYWORDS[source.slice(start, i)] ?? 'ID';
		} else if (isDigit(c)) {
			while (i < source.length && isDigit(source[i])) i++;
			kind = 'NUM';
			if (source[i] === '.' && isDigit(source[i + 1] ?? '')) {
				i++;
				while (i < source.length && isDigit(source[i])) i++;
				kind = 'FNUM';
			}
		} else {
			const op = OPERATORS.find(([text]) => source.startsWith(text, i));
			if (op) {
				kind = op[1];
				i += op[0].length;
			}
		}
		if (kind === null) {
			// Surrogate pairs stay together so the message shows the real character.
			const width = (source.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
			if (bad) bad.end = i + width;
			else bad = { start: i, end: i + width };
			i += width;
			continue;
		}
		flushBad();
		tokens.push({ kind, lexeme: source.slice(start, i), start, end: i });
	}
	flushBad();
	return { tokens, diagnostics };
}

/**
 * The same token set as rules for the Lexer tool (lecture RE notation).
 * Keywords come before ID, so ties go to the keyword; longer operators win by
 * maximal munch.
 */
export function lexerRules(naming: TokenNaming = 'seven'): { defs: string; rules: RuleState[] } {
	const defs = ["letter = 'A' | … | 'Z' | 'a' | … | 'z'", "digit = '0' | … | '9'"].join('\n');
	const rules: RuleState[] = [
		{ name: 'Whitespace', re: "(' ' | '\\t' | '\\n' | '\\r')+", drop: true },
		{ name: 'IF', re: "'if'" },
		{ name: 'THEN', re: "'then'" },
		{ name: 'ELSE', re: "'else'" },
		{ name: 'ID', re: 'letter (letter | digit)*' },
		{ name: tokenName('FNUM', naming), re: "digit+ '.' digit+" },
		{ name: tokenName('NUM', naming), re: 'digit+' },
		...OPERATORS.map(([text, kind]) => ({ name: kind, re: `'${text}'` }))
	];
	return { defs, rules };
}
