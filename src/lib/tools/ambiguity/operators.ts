/**
 * The operators typed into a field of the cascade builder or a declaration
 * line: words separated by spaces, each word one operator.
 *
 * A grammar writes an operator of several characters in quotes (`"=="`),
 * because `==` without them is the two symbols `=` `=`. An operator field
 * lists operators and nothing else, so there a word is one operator however
 * many characters it has: `== !=` is two operators, `&&` one, `+-` one (the
 * two operators + and - are written `+ -`). Quotes around a word are allowed
 * and are not part of the operator; `∗` is read as `*`.
 */
import { tokenizeInput } from '$lib/theory/grammar';

export interface OperatorWord {
	/** The operator: the word without its quotes. */
	name: string;
	/** The grammar symbols the word is made of when it is written without quotes (`==` is = and =). */
	parts: string[];
}

/** The words of an operator field, in order. */
export function operatorWords(text: string): OperatorWord[] {
	const { tokens, spans } = tokenizeInput(text, []);
	const words: OperatorWord[] = [];
	tokens.forEach((token, i) => {
		// Symbols with nothing between them are one word.
		if (i > 0 && spans[i - 1].end === spans[i].start) {
			const word = words[words.length - 1];
			word.name += token;
			word.parts.push(token);
		} else words.push({ name: token, parts: [token] });
	});
	return words;
}

/** The operators of an operator field, in order: `== !=` is == and !=. */
export function operatorsOf(text: string): string[] {
	return operatorWords(text).map((word) => word.name);
}
