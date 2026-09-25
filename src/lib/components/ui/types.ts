import type { Citation } from '$lib/lectures';

/** An example input a tool can load, citing the slide it comes from. */
export interface Preset<T> {
	id: string;
	label: string;
	/** Presets with the same group are listed together under that heading. */
	group?: string;
	description?: string;
	cite?: Citation;
	value: T;
}

/**
 * Semantic colors shared by highlights, chips, and badges. A number selects the
 * token palette (`--tok-0` … `--tok-5`) modulo 6, so a scanner rule index can
 * be passed directly.
 */
export type SemanticTone = 'active' | 'accept' | 'reject' | 'info' | 'epsilon' | 'muted' | 'accent';
export type Tone = SemanticTone | number;

/** A highlighted range of characters `[start, end)` (string indices). */
export interface HighlightRange {
	start: number;
	end: number;
	tone: Tone;
	/** Short caption drawn under the range, e.g. a token name. */
	label?: string;
	/**
	 * Quiet text with the tone only as an underline (no fill), e.g. for input
	 * that is already consumed.
	 */
	muted?: boolean;
}

/** A token as shown by `TokenPairs`; `ScanToken` from the scanner engine fits. */
export interface TokenPair {
	name: string;
	lexeme: string;
	skipped?: boolean;
	error?: boolean;
	/** Rule index; picks the token palette color. */
	rule?: number;
}

/** Token coloring returned by a `CodeEditor` highlighter, `[from, to)` string indices. */
export interface HighlightToken {
	from: number;
	to: number;
	/** One of the global `hl-*` classes in app.css, or any global class. */
	className: string;
}

export type Size = 'sm' | 'md';
