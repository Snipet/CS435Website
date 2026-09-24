import { formatString, showChar } from '$lib/theory/chars';

/**
 * 'paren': `(Identifier, "f")` as in Lexical Analysis II.
 * 'angle': `<ID,'A'>` as in the compiler-architecture intro.
 */
export type TokenFormat = 'paren' | 'angle';

export function formatLexeme(lexeme: string, format: TokenFormat): string {
	if (format === 'paren') return formatString(lexeme);
	return `'${[...lexeme].map((c) => showChar(c, 'quoted')).join('')}'`;
}

export function formatTokenPair(
	token: { name: string; lexeme: string },
	format: TokenFormat
): string {
	return format === 'paren'
		? `(${token.name}, ${formatLexeme(token.lexeme, 'paren')})`
		: `<${token.name},${formatLexeme(token.lexeme, 'angle')}>`;
}
