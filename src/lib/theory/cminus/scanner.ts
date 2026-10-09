/**
 * The C- scanner: characters in, tokens out.
 *
 * Maximal munch (the longest token wins, so `<=` is one LTE and `< =` is LT
 * ASSIGN); a reserved word wins over ID. White space and comments separate
 * tokens and produce none; they are kept in `trivia`. A comment runs from
 * slash-star to the first star-slash (comments do not nest) and may span lines.
 *
 * Errors do not stop the scan: an illegal character, a `!` that is not part of
 * `!=`, and a comment that is never closed each become an ERROR token and a
 * diagnostic.
 */
import { formatString } from '../chars';
import {
	KEYWORDS,
	SYMBOLS,
	type SourceDiagnostic,
	type SourceSpan,
	type Token,
	type TokenType,
	type Trivia
} from './tokens';

/**
 * `letters`: ID = letter letter* (the language definition; `x1` is ID x, NUM 1).
 * `extended`: ID = letter (letter | digit | _)*.
 */
export type IdentifierMode = 'letters' | 'extended';

export interface ScanOptions {
	identifiers?: IdentifierMode;
}

export interface ScanResult {
	/** Every token in order; the last one is ENDFILE. */
	tokens: Token[];
	/** White space and comments, in order. */
	trivia: Trivia[];
	diagnostics: SourceDiagnostic[];
}

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isDigit = (c: string) => c >= '0' && c <= '9';
const isSpace = (c: string) =>
	c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

export function scan(source: string, options: ScanOptions = {}): ScanResult {
	const extended = options.identifiers === 'extended';
	const tokens: Token[] = [];
	const trivia: Trivia[] = [];
	const diagnostics: SourceDiagnostic[] = [];

	let i = 0;
	let line = 1;
	let lineStart = 0;

	/** The span [start, i), whose first character is on the current line. */
	const spanFrom = (start: number): SourceSpan => ({
		start,
		end: i,
		line,
		column: start - lineStart + 1,
		source: null
	});
	/** Counts the line breaks in [from, i). Call after taking the span. */
	const countLines = (from: number) => {
		for (let k = from; k < i; k++) {
			if (source[k] === '\n') {
				line++;
				lineStart = k + 1;
			}
		}
	};
	const token = (type: TokenType, start: number): Token => {
		const t: Token = { type, lexeme: source.slice(start, i), span: spanFrom(start) };
		tokens.push(t);
		return t;
	};
	const error = (start: number, message: string, markEnd = i) => {
		const t = token('ERROR', start);
		diagnostics.push({
			severity: 'error',
			message,
			span: { ...t.span, end: markEnd }
		});
	};

	while (i < source.length) {
		const start = i;
		const c = source[i];

		if (isSpace(c)) {
			while (i < source.length && isSpace(source[i])) i++;
			trivia.push({ kind: 'whitespace', text: source.slice(start, i), span: spanFrom(start) });
			countLines(start);
			continue;
		}

		if (c === '/' && source[i + 1] === '*') {
			const close = source.indexOf('*/', i + 2);
			if (close === -1) {
				i = source.length;
				error(start, 'This comment is never closed: there is no */ after it.', start + 2);
			} else {
				i = close + 2;
				trivia.push({ kind: 'comment', text: source.slice(start, i), span: spanFrom(start) });
			}
			countLines(start);
			continue;
		}

		if (isLetter(c)) {
			i++;
			while (
				i < source.length &&
				(isLetter(source[i]) || (extended && (isDigit(source[i]) || source[i] === '_')))
			)
				i++;
			const word = source.slice(start, i);
			token(Object.hasOwn(KEYWORDS, word) ? KEYWORDS[word] : 'ID', start);
			continue;
		}

		if (isDigit(c)) {
			i++;
			while (i < source.length && isDigit(source[i])) i++;
			const t = token('NUM', start);
			t.value = Number(t.lexeme);
			continue;
		}

		const symbol = SYMBOLS.find(([text]) => source.startsWith(text, i));
		if (symbol) {
			i += symbol[0].length;
			token(symbol[1], start);
			continue;
		}

		// One whole character (a surrogate pair is one character).
		const ch = String.fromCodePoint(source.codePointAt(i)!);
		i += ch.length;
		if (ch === '!') {
			error(start, '! alone is not a token: it is only used in !=.');
		} else if (ch === '_' && !extended) {
			error(start, 'Illegal character "_": an identifier is made of letters only.');
		} else {
			error(start, `Illegal character ${formatString(ch)}: no token starts with it.`);
		}
	}

	tokens.push({ type: 'ENDFILE', lexeme: '', span: spanFrom(i) });
	return { tokens, trivia, diagnostics };
}
