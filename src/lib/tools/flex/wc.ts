/**
 * What `wc` reports for a text (lines, words, characters), and the
 * comparison with the word-count spec's nl, wd, ch counters.
 */
import type { FlexRun, MatchStep } from './runtime';

export interface WcCounts {
	/** Newline characters. */
	lines: number;
	/** Maximal runs of non-whitespace characters. */
	words: number;
	/** Characters (code points; the same as bytes for ASCII input). */
	chars: number;
}

const isSpace = (c: string) =>
	c === ' ' || c === '\t' || c === '\n' || c === '\v' || c === '\f' || c === '\r';

export function wcCounts(text: string): WcCounts {
	let lines = 0;
	let words = 0;
	let chars = 0;
	let inWord = false;
	for (const c of text) {
		chars++;
		if (c === '\n') lines++;
		if (isSpace(c)) inWord = false;
		else if (!inWord) {
			inWord = true;
			words++;
		}
	}
	return { lines, words, chars };
}

/** The globals the word-count view compares, in wc's column order. */
export const WC_GLOBALS = ['nl', 'wd', 'ch'] as const;

/** Where a watched counter went up, with the rule that did it. */
export interface CounterBump {
	step: MatchStep;
	/** How much the counter went up (usually 1). */
	by: number;
}

/** Steps after which `name` increased. */
export function counterBumps(run: FlexRun, name: string): CounterBump[] {
	const out: CounterBump[] = [];
	let prev = run.watchStart?.[name] ?? 0;
	for (const step of run.steps) {
		const v = step.watch?.[name];
		if (v === undefined) continue;
		if (v > prev) out.push({ step, by: v - prev });
		prev = v;
	}
	return out;
}
