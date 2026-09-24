import { describe, expect, it } from 'vitest';
import { formatLexeme, formatTokenPair } from './token-format';

describe('formatTokenPair', () => {
	it('uses the Lexical Analysis II format', () => {
		expect(formatTokenPair({ name: 'Identifier', lexeme: 'f' }, 'paren')).toBe('(Identifier, "f")');
		expect(formatTokenPair({ name: 'Whitespace', lexeme: ' ' }, 'paren')).toBe('(Whitespace, " ")');
		expect(formatTokenPair({ name: 'Str', lexeme: 'say "hi"' }, 'paren')).toBe(
			'(Str, "say \\"hi\\"")'
		);
	});

	it('uses the compiler-architecture format', () => {
		expect(formatTokenPair({ name: 'ID', lexeme: 'A' }, 'angle')).toBe("<ID,'A'>");
		expect(formatTokenPair({ name: 'SEMI', lexeme: ';' }, 'angle')).toBe("<SEMI,';'>");
		expect(formatTokenPair({ name: 'Q', lexeme: "'" }, 'angle')).toBe("<Q,'\\''>");
	});

	it('escapes invisible characters in lexemes', () => {
		expect(formatLexeme('\t\n', 'paren')).toBe('"\\t\\n"');
		expect(formatLexeme('\t\n', 'angle')).toBe("'\\t\\n'");
		expect(formatLexeme('', 'paren')).toBe('""');
	});
});
