/** Text and layout helpers for the Flex Playground page. */
import type { HighlightRange } from '$lib/components/ui/types';
import { formatString } from '$lib/theory/chars';
import { children, type Regex } from '$lib/theory/regex';
import type { FlexRun, MatchStep } from './runtime';
import type { FlexSpec } from './spec';

/** Whitespace made visible: · for space, ⇥ for tab, ↵ for newline. */
export function visible(s: string): string {
	return s.replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\r/g, '␍').replace(/\n/g, '↵');
}

/** A yylex return value with its #define / enum name or character: `259 (IDENT)`, `43 ('+')`. */
export function formatReturn(v: number, names: ReadonlyMap<number, string[]>): string {
	const named = names.get(v);
	if (named?.length) return `${v} (${named.join(', ')})`;
	if (v > 32 && v < 127) return `${v} ('${String.fromCharCode(v)}')`;
	return String(v);
}

/** "19 characters · 2 lines · ends with a newline" */
export function describeInput(text: string): string {
	const n = [...text].length;
	if (n === 0) return 'Empty';
	const newlines = (text.match(/\n/g) ?? []).length;
	const lines = newlines + (text.endsWith('\n') ? 0 : 1);
	const end = text.endsWith('\n') ? 'ends with a newline' : 'no newline at the end';
	return `${n} character${n === 1 ? '' : 's'} · ${lines} line${lines === 1 ? '' : 's'} · ${end}`;
}

/** Rule label: `rule 2 ({ID})`. */
export function ruleLabel(spec: FlexSpec, rule: number): string {
	const r = spec.rules[rule];
	return r ? `rule ${rule + 1} (${r.patternText})` : `rule ${rule + 1}`;
}

/** One sentence describing a step, for the step controls and screen readers. */
export function describeStep(
	step: MatchStep,
	spec: FlexSpec,
	names: ReadonlyMap<number, string[]>
): string {
	const where = `line ${step.line}, column ${step.col}`;
	const ret = step.returned !== null ? ` yylex returns ${formatReturn(step.returned, names)}.` : '';
	if (step.kind === 'eof') {
		if (step.rule !== null) return `End of input: ${ruleLabel(spec, step.rule)} runs.${ret}`;
		return `End of input: no <<EOF>> rule, so yylex returns 0.`;
	}
	if (step.kind === 'default') {
		return `At ${where}, no rule matches ${formatString(step.yytext)}; the default rule copies it to the output.`;
	}
	const matched = step.candidates.filter((c) => c.status === 'match');
	const best = matched.find((c) => c.rule === step.rule)!;
	const ties = matched.filter((c) => c.length === best.length).length;
	const why =
		matched.length === 1
			? 'the only match'
			: ties > 1
				? `the longest match (${best.length}), listed first among ${ties}`
				: `the longest match (${best.length})`;
	return `At ${where}, ${ruleLabel(spec, step.rule!)} wins with ${why}: yytext = ${formatString(step.yytext)}.${ret}`;
}

export interface InputWindow {
	text: string;
	/** Offset of `text` in the whole input. */
	offset: number;
	clippedStart: boolean;
	clippedEnd: boolean;
}

/**
 * The part of a long input around `[from, to)`, cut at line breaks where
 * possible, so the character view stays small.
 */
export function inputWindow(input: string, from: number, to: number, max = 1200): InputWindow {
	if (input.length <= max)
		return { text: input, offset: 0, clippedStart: false, clippedEnd: false };
	const half = Math.floor(max / 2);
	let start = Math.max(0, Math.min(from - half, input.length - max));
	let end = Math.min(input.length, Math.max(to + half, start + max));
	// Start on a line when a line break is near.
	const nl = input.lastIndexOf('\n', from - 1);
	if (nl >= start && from - nl < half) start = nl + 1;
	const nlEnd = input.indexOf('\n', to);
	if (nlEnd >= 0 && nlEnd < end && nlEnd - to > half / 2) end = nlEnd + 1;
	// Do not split a surrogate pair.
	if (start > 0 && /[\uDC00-\uDFFF]/.test(input[start])) start--;
	if (end < input.length && /[\uDC00-\uDFFF]/.test(input[end])) end++;
	return {
		text: input.slice(start, end),
		offset: start,
		clippedStart: start > 0,
		clippedEnd: end < input.length
	};
}

/**
 * Character-view highlights for step `index`: earlier matches colored by
 * rule (default-rule characters muted), the current yytext, and characters
 * read by input().
 */
export function stepHighlights(run: FlexRun, index: number, offset = 0): HighlightRange[] {
	const out: HighlightRange[] = [];
	const shift = (n: number) => n - offset;
	for (let k = 0; k < index && k < run.steps.length; k++) {
		const s = run.steps[k];
		if (s.kind === 'eof') continue;
		const end = s.yyless !== null ? s.pos + s.yyless : s.end;
		if (end > s.pos)
			out.push({
				start: shift(s.pos),
				end: shift(end),
				tone: s.kind === 'default' ? 'muted' : s.rule!
			});
		if (s.next > s.end) out.push({ start: shift(s.end), end: shift(s.next), tone: 'muted' });
	}
	const s = run.steps[index];
	if (s && s.kind !== 'eof') {
		const end = s.yyless !== null ? s.pos + s.yyless : s.end;
		out.push({
			start: shift(s.pos),
			end: shift(end),
			tone: 'active',
			label: s.kind === 'default' ? 'ECHO' : 'yytext'
		});
		if (s.next > s.end)
			out.push({ start: shift(s.end), end: shift(s.next), tone: 'info', label: 'input()' });
	}
	return out;
}

/** The step whose match covers input position `pos` (for clicking a character). */
export function stepAt(run: FlexRun, pos: number): number | null {
	for (const s of run.steps) {
		if (s.kind === 'eof') {
			if (pos >= s.pos) return s.index;
			continue;
		}
		const end = Math.max(s.end, s.next);
		if (pos >= s.pos && pos < end) return s.index;
	}
	return null;
}

/**
 * Number of nodes a regex has with every {NAME} expanded (each use counts
 * again). Definitions that use each other can make this huge, so views check
 * it before printing an expansion.
 */
export function expandedSize(r: Regex, memo: Map<Regex, number> = new Map()): number {
	const known = memo.get(r);
	if (known !== undefined) return known;
	let n = 1;
	for (const c of children(r)) n += expandedSize(c, memo);
	memo.set(r, n);
	return n;
}

/** Largest expansion (in regex nodes) the rules view prints. */
export const MAX_EXPANDED = 400;
