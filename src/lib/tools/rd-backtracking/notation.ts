/**
 * Text with subscripts, as the Top-Down Parsing slides write instances of
 * non-terminals (E0 → T1 + E2, slides 18–20) and the functions of the
 * productions (E1, T2, slides 29–34). A piece is a run of text with an
 * optional subscript; the page draws the subscript with <sub>.
 */
export type PieceKind =
	'nonterminal' | 'terminal' | 'keyword' | 'type' | 'function' | 'constant' | 'variable';

export interface Piece {
	text: string;
	/** Digits drawn as a subscript after the text. */
	sub?: string;
	kind?: PieceKind;
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** The digits of `n` as subscript characters: 12 → ₁₂. */
export function subscript(n: number | string): string {
	return String(n).replace(/[0-9]/g, (d) => SUBSCRIPT_DIGITS[Number(d)]);
}

/** Pieces as one string, subscripts written with subscript digits: E₀ → T₁ + E₂. */
export function plainText(pieces: readonly Piece[]): string {
	return pieces.map((p) => p.text + (p.sub ? subscript(p.sub) : '')).join('');
}

/**
 * Pieces as text that only uses ASCII digits: E1, and T1_2 when the name
 * itself ends in a digit (so the function of T1's second production does not
 * read as T12).
 */
export function asciiText(pieces: readonly Piece[]): string {
	return pieces
		.map((p) => (p.sub ? p.text + (/[0-9]$/.test(p.text) ? '_' : '') + p.sub : p.text))
		.join('');
}

/** A piece of plain text. */
export const text = (value: string): Piece => ({ text: value });

/** `items` with `separator` between them: a, b and c. */
export function joinPieces(
	items: readonly (readonly Piece[])[],
	separator = ', ',
	last = ' and '
): Piece[] {
	const out: Piece[] = [];
	items.forEach((item, i) => {
		if (i > 0) out.push(text(i === items.length - 1 ? last : separator));
		out.push(...item);
	});
	return out;
}

/** Subscript characters a string may use, and what they are drawn as. */
const SUBSCRIPT_CHARS: Record<string, string> = {
	'₀': '0',
	'₁': '1',
	'₂': '2',
	'₃': '3',
	'₄': '4',
	'₅': '5',
	'₆': '6',
	'₇': '7',
	'₈': '8',
	'₉': '9',
	ₖ: 'k',
	ₙ: 'n'
};

/**
 * A string as pieces, with its subscript characters as subscripts of the text
 * before them: `t₁ t₂ … tₖ` is t with 1, t with 2, …, t with k.
 */
export function piecesOf(value: string): Piece[] {
	const out: Piece[] = [];
	let run = '';
	let sub = '';
	const flush = () => {
		if (run || sub) out.push(sub ? { text: run, sub } : { text: run });
		run = '';
		sub = '';
	};
	for (const ch of value) {
		const drawn = SUBSCRIPT_CHARS[ch];
		if (drawn !== undefined) sub += drawn;
		else {
			if (sub) flush();
			run += ch;
		}
	}
	flush();
	return out;
}
