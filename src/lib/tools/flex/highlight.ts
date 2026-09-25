/**
 * Token coloring for the spec editor: section delimiters, directives,
 * definition names, flex patterns, and C code, plus an optional focus range
 * (the pattern and action of the rule the step view is on). Line classes mark
 * the section of each line and the lines of C code.
 */
import type { HighlightToken } from '$lib/components/ui/types';
import { KEYWORDS } from './c-lexer';
import type { FlexSpec, RegionKind } from './spec';

/** Names flex defines for actions and user code. */
export const FLEX_NAMES = new Set([
	'yytext',
	'yyleng',
	'yylex',
	'yylineno',
	'yyin',
	'yyout',
	'ECHO',
	'BEGIN',
	'REJECT',
	'yyless',
	'yymore',
	'yyterminate',
	'yywrap',
	'input',
	'unput',
	'YY_START',
	'YYSTATE',
	'INITIAL'
]);

const FIXED: Partial<Record<RegionKind, string>> = {
	delimiter: 'hl-keyword',
	directive: 'hl-keyword',
	'directive-arg': 'hl-name',
	'def-name': 'hl-name',
	comment: 'hl-comment',
	sc: 'hl-special',
	eof: 'hl-special',
	bar: 'hl-operator'
};

/** Colors a flex pattern in `text[start, end)`. */
export function colorPattern(
	text: string,
	start: number,
	end: number,
	cls: (string | null)[]
): void {
	const set = (a: number, b: number, c: string) => {
		for (let k = a; k < Math.min(b, end); k++) cls[k] = c;
	};
	let i = start;
	while (i < end) {
		const c = text[i];
		if (c === '\\') {
			let j = i + 2;
			if (text[i + 1] === 'x') while (j < end && /[0-9A-Fa-f]/.test(text[j]) && j < i + 4) j++;
			else if (/[0-7]/.test(text[i + 1] ?? ''))
				while (j < end && /[0-7]/.test(text[j]) && j < i + 4) j++;
			set(i, j, 'hl-escape');
			i = j;
		} else if (c === '"') {
			let j = i + 1;
			while (j < end && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
			set(i, j + 1, 'hl-string');
			i = j + 1;
		} else if (c === '[') {
			let j = i + 1;
			if (text[j] === '^') j++;
			if (text[j] === ']') j++;
			while (j < end && text[j] !== ']') {
				if (text[j] === '\\') j += 2;
				else if (text[j] === '[' && text[j + 1] === ':') {
					const close = text.indexOf(':]', j);
					j = close < 0 || close >= end ? j + 1 : close + 2;
				} else j++;
			}
			set(i, j + 1, 'hl-literal');
			i = j + 1;
		} else if (c === '{') {
			const close = text.indexOf('}', i);
			const j = close < 0 || close >= end ? i + 1 : close + 1;
			set(i, j, /^\{\d/.test(text.slice(i, j)) ? 'hl-operator' : 'hl-name');
			i = j;
		} else {
			if ('*+?|/'.includes(c)) cls[i] = 'hl-operator';
			else if (c === '(' || c === ')') cls[i] = 'hl-paren';
			else if (c === '.') cls[i] = 'hl-special';
			else if ((c === '^' && i === start) || (c === '$' && i === end - 1)) cls[i] = 'hl-special';
			i++;
		}
	}
}

/** Colors C code in `text[start, end)`. */
export function colorC(text: string, start: number, end: number, cls: (string | null)[]): void {
	const set = (a: number, b: number, c: string) => {
		for (let k = a; k < Math.min(b, end); k++) cls[k] = c;
	};
	let i = start;
	let lineStart = true;
	while (i < end) {
		const c = text[i];
		if (c === '\n') {
			lineStart = true;
			i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') {
			i++;
			continue;
		}
		if (c === '#' && lineStart) {
			let j = i;
			while (j < end && text[j] !== '\n') j++;
			set(i, j, 'hl-special');
			i = j;
			continue;
		}
		lineStart = false;
		if (c === '/' && text[i + 1] === '/') {
			let j = i;
			while (j < end && text[j] !== '\n') j++;
			set(i, j, 'hl-comment');
			i = j;
		} else if (c === '/' && text[i + 1] === '*') {
			const close = text.indexOf('*/', i + 2);
			const j = close < 0 || close + 2 > end ? end : close + 2;
			set(i, j, 'hl-comment');
			i = j;
		} else if (c === '"' || c === "'" || c === '“' || c === '‘') {
			const closers = c === '"' || c === '“' ? '"”“' : "'’‘";
			let j = i + 1;
			while (j < end && text[j] !== '\n' && !closers.includes(text[j]))
				j += text[j] === '\\' ? 2 : 1;
			set(i, j + 1, 'hl-string');
			i = j + 1;
		} else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
			let j = i + 1;
			while (j < end && /[0-9A-Za-z_.]/.test(text[j])) j++;
			set(i, j, 'hl-number');
			i = j;
		} else if (/[A-Za-z_]/.test(c)) {
			let j = i + 1;
			while (j < end && /[A-Za-z0-9_]/.test(text[j])) j++;
			const word = text.slice(i, j);
			if (KEYWORDS.has(word) || word === 'FILE') set(i, j, 'hl-keyword');
			else if (FLEX_NAMES.has(word)) set(i, j, 'hl-name');
			i = j;
		} else i++;
	}
}

export interface Focus {
	start: number;
	end: number;
}

/** Token class for the text of an action (C code inside a rule line). */
export const CODE_CLASS = 'fx-code';

export type SectionName = 'defs' | 'rules' | 'user';

/** Line class for each section of the spec (the editor draws a band in the gutter). */
export const sectionClass = (s: SectionName): string => `fx-sec-${s}`;

/** Line class for lines of C code copied into lex.yy.c as they are. */
export const CODE_LINE_CLASS = 'fx-line-code';

/**
 * A class list per line of the spec (index 0 = line 1): the section the
 * line belongs to, plus CODE_LINE_CLASS for lines of C code — %top{ … },
 * %{ … %}, indented code, the lines after the first of a multi-line action,
 * and the user code section.
 */
export function specLineClasses(spec: FlexSpec): string[] {
	const text = spec.text;
	const starts = [0];
	for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
	const lineAt = (offset: number): number => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};
	const code: boolean[] = new Array(starts.length).fill(false);
	const mark = (from: number, to: number) => {
		const last = lineAt(Math.max(from, to - 1));
		for (let l = lineAt(from); l <= last; l++) code[l] = true;
	};
	for (const b of spec.blocks) if (b.end > b.start) mark(b.start, b.end);
	for (const r of spec.regions)
		if (r.kind === 'delimiter' && text.slice(r.start, r.end) !== '%%') mark(r.start, r.end);
	for (const r of spec.rules) {
		if (r.bar || r.actionEnd <= r.actionStart) continue;
		const first = lineAt(r.actionStart);
		const last = lineAt(r.actionEnd - 1);
		for (let l = first + 1; l <= last; l++) code[l] = true;
	}
	const { rules, user } = spec.sections;
	return starts.map((_, l) => {
		const n = l + 1;
		const section: SectionName =
			user && n >= user[0] ? 'user' : rules && n >= rules[0] ? 'rules' : 'defs';
		return code[l] ? `${sectionClass(section)} ${CODE_LINE_CLASS}` : sectionClass(section);
	});
}

/**
 * Highlight tokens for the spec editor. `focus` ranges get the `fx-focus`
 * class on top of their syntax color.
 */
export function specTokens(spec: FlexSpec, focus: readonly Focus[] = []): HighlightToken[] {
	const text = spec.text;
	const cls: (string | null)[] = new Array(text.length).fill(null);
	for (const r of spec.regions) {
		const fixed = FIXED[r.kind];
		if (fixed) for (let k = r.start; k < r.end; k++) cls[k] = fixed;
		else if (r.kind === 'pattern' || r.kind === 'def-pattern')
			colorPattern(text, r.start, r.end, cls);
		else if (r.kind === 'code' || r.kind === 'action') colorC(text, r.start, r.end, cls);
	}
	// Actions are C code: they get the code background, so patterns and actions stand apart.
	for (const r of spec.regions) {
		if (r.kind !== 'action') continue;
		for (let k = r.start; k < Math.min(text.length, r.end); k++) {
			if (text[k] === '\n') continue;
			cls[k] = cls[k] ? `${cls[k]} ${CODE_CLASS}` : CODE_CLASS;
		}
	}
	for (const f of focus) {
		for (let k = Math.max(0, f.start); k < Math.min(text.length, f.end); k++) {
			if (text[k] === '\n') continue;
			cls[k] = cls[k] ? `${cls[k]} fx-focus` : 'fx-focus';
		}
	}
	const tokens: HighlightToken[] = [];
	let k = 0;
	while (k < text.length) {
		const c = cls[k];
		let j = k + 1;
		while (j < text.length && cls[j] === c) j++;
		if (c) tokens.push({ from: k, to: j, className: c });
		k = j;
	}
	return tokens;
}
