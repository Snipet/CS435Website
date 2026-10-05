/**
 * How the symbols of one grammar are written on the page: as its text writes
 * them. Introduction to Parsing, slide 25 puts every terminal of the English
 * grammar in quotes ("the cat", "sat", "on"), also the ones of one word, which
 * read back the same without them; a symbol that the grammar text quotes keeps
 * its quotes in the four-tuple, the productions, sentential forms and
 * sentences. Every other symbol is written as `printSymbols` writes it.
 */
import { EPSILON, printSet, printSymbols, scanGrammar } from '$lib/theory/grammar';

export interface Spelling {
	/** One symbol: `E`, `"the cat"`. */
	symbol(name: string): string;
	/** A string of symbols separated by spaces: `E + T`, and `ε` for the empty string. */
	symbols(names: readonly string[]): string;
	/** A set of symbols: `{ int, +, * }`, `{ }`. */
	set(names: Iterable<string>): string;
}

/** The spelling of the engine's printers: quotes only where a symbol needs them. */
export const PLAIN: Spelling = {
	symbol: (name) => printSymbols([name]),
	symbols: (names) => printSymbols(names),
	set: (names) => printSet(names)
};

/** The characters that open a quoted symbol in grammar text. */
const OPENING_QUOTES = new Set(['"', "'", '“', '”', '‘']);

/**
 * The symbols that `text` writes in quotes, each with the text of its first
 * appearance (`"sat"`, `'=='`). A symbol whose first appearance is bare is
 * not listed, wherever else it is quoted.
 */
export function quotedSymbols(text: string): Map<string, string> {
	const quoted = new Map<string, string>();
	const seen = new Set<string>();
	for (const token of scanGrammar(text)) {
		if (token.name === undefined || seen.has(token.name)) continue;
		seen.add(token.name);
		const written = text.slice(token.span.start, token.span.end);
		if (OPENING_QUOTES.has(written[0])) quoted.set(token.name, written);
	}
	return quoted;
}

/** One member of a set as `printSet` writes it (a comma in quotes): `{ x }` without the braces. */
const setMember = (name: string): string => printSet([name]).slice(2, -2);

/**
 * The spelling of the grammar written as `text`: a symbol the text quotes is
 * written as it is there, any other one as in PLAIN.
 */
export function spellingOf(text: string): Spelling {
	const quoted = quotedSymbols(text);
	if (quoted.size === 0) return PLAIN;
	const symbol = (name: string) => quoted.get(name) ?? PLAIN.symbol(name);
	return {
		symbol,
		symbols: (names) => (names.length === 0 ? EPSILON : names.map(symbol).join(' ')),
		set: (names) => {
			const members = Array.from(names, (name) => quoted.get(name) ?? setMember(name));
			return members.length === 0 ? '{ }' : `{ ${members.join(', ')} }`;
		}
	};
}
