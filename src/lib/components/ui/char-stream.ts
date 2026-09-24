/**
 * Layout for CharStream: one cell per character (code point) with visible
 * whitespace, grouped into labelled runs (e.g. token lexemes) and split into
 * lines at newlines. Indices are string indices (UTF-16), like the scanner's.
 */
import { showChar } from '$lib/theory/chars';
import type { HighlightRange, Tone } from './types';

export type CellKind = 'char' | 'space' | 'tab' | 'newline' | 'cr' | 'control' | 'end';

export interface StreamCell {
	/** String index of the character (for the end cell: the text length). */
	index: number;
	/** Index just past the character. */
	end: number;
	char: string;
	/** What is drawn: the character, or a visible stand-in for whitespace. */
	glyph: string;
	kind: CellKind;
	/** Tone of the last highlight covering the cell. */
	tone: Tone | null;
	/** First / last cell of its highlight range (for rounded ends). */
	edgeStart: boolean;
	edgeEnd: boolean;
	/** The cursor bar is drawn before this cell. */
	cursor: boolean;
	lookahead: boolean;
}

export type StreamItem =
	| { kind: 'cell'; cell: StreamCell }
	| { kind: 'run'; label: string; tone: Tone; continued: boolean; cells: StreamCell[] }
	| { kind: 'break' };

const GLYPHS: Record<string, [string, CellKind]> = {
	' ': ['·', 'space'],
	'\t': ['⇥', 'tab'],
	'\n': ['↵', 'newline'],
	'\r': ['␍', 'cr']
};

export function glyphFor(char: string): { glyph: string; kind: CellKind } {
	const known = GLYPHS[char];
	if (known) return { glyph: known[0], kind: known[1] };
	const shown = showChar(char, 'label');
	return shown === char ? { glyph: char, kind: 'char' } : { glyph: shown, kind: 'control' };
}

export interface StreamOptions {
	highlights?: readonly HighlightRange[];
	/** Cursor position (0 … text.length): a bar before that character. */
	cursor?: number | null;
	/** Characters read ahead but not consumed, `[start, end)`. */
	lookahead?: { start: number; end: number } | null;
	/** Always add the end-of-input cell (it is added anyway when the cursor is at the end). */
	showEnd?: boolean;
}

export function layoutStream(text: string, opts: StreamOptions = {}): StreamItem[] {
	const highlights = opts.highlights ?? [];
	const cursor = opts.cursor ?? null;
	const la = opts.lookahead ?? null;

	const cells: StreamCell[] = [];
	for (let i = 0; i < text.length;) {
		const cp = text.codePointAt(i)!;
		const char = String.fromCodePoint(cp);
		const end = i + char.length;
		cells.push({
			index: i,
			end,
			char,
			...glyphFor(char),
			tone: null,
			edgeStart: false,
			edgeEnd: false,
			cursor: cursor === i,
			lookahead: la !== null && i >= la.start && i < la.end
		});
		i = end;
	}
	const atEnd = cursor === text.length || (la !== null && la.end > text.length);
	if (opts.showEnd || atEnd) {
		cells.push({
			index: text.length,
			end: text.length,
			char: '',
			glyph: '',
			kind: 'end',
			tone: null,
			edgeStart: false,
			edgeEnd: false,
			cursor: cursor === text.length,
			lookahead: false
		});
	}

	// Tone and range membership: the last covering highlight wins the color, the
	// first labelled one groups the run.
	const toneRange = new Int32Array(cells.length).fill(-1);
	const runRange = new Int32Array(cells.length).fill(-1);
	const cellAt = new Int32Array(text.length).fill(-1);
	cells.forEach((c, k) => {
		if (c.kind !== 'end') cellAt[c.index] = k;
	});
	highlights.forEach((h, r) => {
		const from = Math.max(0, Math.trunc(h.start));
		const to = Math.min(text.length, Math.trunc(h.end));
		for (let i = from; i < to; i++) {
			const k = cellAt[i];
			if (k === -1) continue;
			toneRange[k] = r;
			if (h.label !== undefined && runRange[k] === -1) runRange[k] = r;
		}
	});
	cells.forEach((c, k) => {
		const r = toneRange[k];
		if (r === -1) return;
		c.tone = highlights[r].tone;
		c.edgeStart = k === 0 || toneRange[k - 1] !== r || cells[k - 1].kind === 'newline';
		c.edgeEnd = k === cells.length - 1 || toneRange[k + 1] !== r || c.kind === 'newline';
	});

	const items: StreamItem[] = [];
	let run: Extract<StreamItem, { kind: 'run' }> | null = null;
	let runId = -1;
	const labelled = new Set<number>();
	for (let k = 0; k < cells.length; k++) {
		const c = cells[k];
		const r = runRange[k];
		if (r === -1) {
			run = null;
			items.push({ kind: 'cell', cell: c });
		} else {
			if (!run || runId !== r) {
				const h = highlights[r];
				const continued = labelled.has(r);
				run = {
					kind: 'run',
					label: continued ? '' : (h.label ?? ''),
					tone: h.tone,
					continued,
					cells: []
				};
				labelled.add(r);
				runId = r;
				items.push(run);
			}
			run.cells.push(c);
		}
		if (c.kind === 'newline') {
			items.push({ kind: 'break' });
			run = null;
		}
	}
	return items;
}

/** Plain-text description for assistive technology, e.g. `"if x" (5 characters)`. */
export function describeText(text: string): string {
	const n = [...text].length;
	const shown = [...text].map((c) => showChar(c, 'string')).join('');
	return `"${shown}" (${n} character${n === 1 ? '' : 's'})`;
}
