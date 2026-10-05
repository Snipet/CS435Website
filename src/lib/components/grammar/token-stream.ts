/**
 * Layout for TokenStream: one cell per token, an optional `$` end marker, and
 * the cell the input pointer stands under. Indices are token indices.
 */
import type { HighlightRange, Tone } from '$lib/components/ui/types';
import { END_MARKER } from '$lib/theory/grammar/types';

export interface TokenCell {
	/** Token index; `tokens.length` for the end marker and the end-of-input cell. */
	index: number;
	text: string;
	/** `marker` is the `$` cell; `end` is the empty cell after the last token that holds the pointer. */
	kind: 'token' | 'marker' | 'end';
	/** Before the pointer: already matched. */
	consumed: boolean;
	/** The pointer `↑` is drawn under this cell. */
	pointer: boolean;
	/** Tone of the last highlight covering the cell. */
	tone: Tone | null;
	/** That highlight is muted: the tone only as an underline. */
	muted: boolean;
	/** First / last cell of its highlight range (for rounded ends). */
	edgeStart: boolean;
	edgeEnd: boolean;
}

export interface TokenStreamOptions {
	/** Index of the next token, 0 … tokens.length (the end of the input); null for no pointer. */
	pointer?: number | null;
	/** Ranges `[start, end)` of token indices; `tokens.length` is the end marker. Labels are not drawn. */
	highlights?: readonly HighlightRange[];
	/** End the stream with `$`. */
	endMarker?: boolean;
}

/** The pointer as a whole index within 0 … count, or null. */
export function clampPointer(pointer: number | null | undefined, count: number): number | null {
	if (pointer === null || pointer === undefined || Number.isNaN(pointer)) return null;
	return Math.max(0, Math.min(Math.trunc(pointer), count));
}

export function layoutTokens(
	tokens: readonly string[],
	opts: TokenStreamOptions = {}
): TokenCell[] {
	const n = tokens.length;
	const pointer = clampPointer(opts.pointer, n);
	const cell = (index: number, text: string, kind: TokenCell['kind']): TokenCell => ({
		index,
		text,
		kind,
		consumed: pointer !== null && index < pointer,
		pointer: pointer === index,
		tone: null,
		muted: false,
		edgeStart: false,
		edgeEnd: false
	});
	const cells = tokens.map((text, i) => cell(i, text, 'token'));
	// At the end of the input the pointer stands under `$`, or after the last token.
	if (opts.endMarker) cells.push(cell(n, END_MARKER, 'marker'));
	else if (pointer === n) cells.push(cell(n, '', 'end'));

	const highlights = opts.highlights ?? [];
	const range = new Int32Array(cells.length).fill(-1);
	highlights.forEach((h, r) => {
		const from = Math.max(0, Math.trunc(h.start));
		const to = Math.min(cells.length, Math.trunc(h.end));
		for (let i = from; i < to; i++) if (cells[i].kind !== 'end') range[i] = r;
	});
	cells.forEach((c, i) => {
		const r = range[i];
		if (r === -1) return;
		c.tone = highlights[r].tone;
		c.muted = highlights[r].muted ?? false;
		c.edgeStart = i === 0 || range[i - 1] !== r;
		c.edgeEnd = i === cells.length - 1 || range[i + 1] !== r;
	});
	return cells;
}

/**
 * Where the pointer is, in words: `next token: int (2 of 3)`, or
 * `end of input`. Empty without a pointer.
 */
export function pointerText(
	tokens: readonly string[],
	pointer: number | null | undefined,
	endMarker = false
): string {
	const p = clampPointer(pointer, tokens.length);
	if (p === null) return '';
	if (p < tokens.length) return `next token: ${tokens[p]} (${p + 1} of ${tokens.length})`;
	return endMarker ? `next token: ${END_MARKER} (end of input)` : 'end of input';
}

/** The tokens as text, e.g. `( int )`, with the end marker when shown. */
export function describeTokens(tokens: readonly string[], endMarker = false): string {
	const all = endMarker ? [...tokens, END_MARKER] : tokens;
	return all.length ? all.join(' ') : 'no tokens';
}
