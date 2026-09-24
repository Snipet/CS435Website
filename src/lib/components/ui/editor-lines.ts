/**
 * Splits editor text into display lines with highlight and diagnostic
 * segments. Pure, so CodeEditor can re-run it on every keystroke and tests can
 * cover the edge cases (overlaps, empty spans, spans across lines).
 *
 * Offsets are JavaScript string indices (UTF-16 code units).
 */
import type { Diagnostic } from '$lib/theory/diagnostics';
import type { HighlightToken } from './types';

export type Severity = Diagnostic['severity'];

const RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };
const BY_RANK: (Severity | undefined)[] = [undefined, 'info', 'warning', 'error'];

export function maxSeverity(a: Severity | null, b: Severity | null): Severity | null {
	if (!a) return b;
	if (!b) return a;
	return RANK[a] >= RANK[b] ? a : b;
}

export interface EditorSegment {
	text: string;
	className?: string;
	/** Most severe diagnostic covering this text. */
	severity?: Severity;
	/** A zero-width diagnostic marker (text is ''). */
	point?: boolean;
}

export interface EditorLine {
	/** 1-based. */
	number: number;
	/** Offset of the line's first character. */
	start: number;
	/** Offset just past the line's last character (excluding the newline). */
	end: number;
	segments: EditorSegment[];
	/** Most severe diagnostic touching the line. */
	severity: Severity | null;
	messages: string[];
}

/** Offsets where each line starts. */
export function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
	return starts;
}

/** 0-based index of the line containing `offset`. */
export function lineIndexAt(starts: readonly number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** 1-based line and column of an offset. */
export function lineCol(text: string, offset: number): { line: number; col: number } {
	const starts = lineStarts(text);
	const clamped = Math.max(0, Math.min(offset, text.length));
	const i = lineIndexAt(starts, clamped);
	return { line: i + 1, col: clamped - starts[i] + 1 };
}

const clamp = (n: number, len: number) => Math.max(0, Math.min(Math.trunc(n), len));

export function layoutLines(
	text: string,
	tokens: readonly HighlightToken[] = [],
	diagnostics: readonly Diagnostic[] = []
): EditorLine[] {
	const len = text.length;
	const starts = lineStarts(text);

	// Per-character class (index into `classes`) and severity rank; later tokens win.
	const classes: string[] = [];
	const classOf = new Int32Array(len).fill(-1);
	for (const t of tokens) {
		const from = clamp(t.from, len);
		const to = clamp(t.to, len);
		if (to <= from || !t.className) continue;
		let k = classes.indexOf(t.className);
		if (k === -1) k = classes.push(t.className) - 1;
		classOf.fill(k, from, to);
	}

	const rankOf = new Uint8Array(len);
	const points = new Map<number, number>();
	const lines: EditorLine[] = starts.map((start, i) => ({
		number: i + 1,
		start,
		end: i + 1 < starts.length ? starts[i + 1] - 1 : len,
		segments: [],
		severity: null,
		messages: []
	}));

	for (const d of diagnostics) {
		if (!d.span) continue;
		const from = clamp(d.span.start, len);
		const to = clamp(Math.max(d.span.end, d.span.start), len);
		const rank = RANK[d.severity];
		if (to === from) {
			points.set(from, Math.max(points.get(from) ?? 0, rank));
		} else {
			for (let i = from; i < to; i++) if (rankOf[i] < rank) rankOf[i] = rank;
		}
		const first = lineIndexAt(starts, from);
		// A span ending right after a newline does not touch the next line.
		const last = lineIndexAt(starts, to > from ? to - 1 : to);
		for (let l = first; l <= last; l++) {
			const line = lines[l];
			line.severity = maxSeverity(line.severity, d.severity);
			if (!line.messages.includes(d.message)) line.messages.push(d.message);
		}
	}

	for (const line of lines) {
		const segs = line.segments;
		let i = line.start;
		const pushPoint = (at: number) => {
			const r = points.get(at);
			if (r) segs.push({ text: '', point: true, severity: BY_RANK[r] });
		};
		while (i < line.end) {
			pushPoint(i);
			const k = classOf[i];
			const r = rankOf[i];
			let j = i + 1;
			while (j < line.end && classOf[j] === k && rankOf[j] === r && !points.has(j)) j++;
			const seg: EditorSegment = { text: text.slice(i, j) };
			if (k >= 0) seg.className = classes[k];
			if (r) seg.severity = BY_RANK[r];
			segs.push(seg);
			i = j;
		}
		// Markers at the end of the line (on the newline, or at the end of the text).
		pushPoint(line.end);
	}

	return lines;
}
