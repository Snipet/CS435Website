/**
 * Tokenizer and a small preprocessor for the C that flex actions and user
 * code are written in. Offsets are positions in the whole spec text, so
 * diagnostics point into the editor.
 *
 * Preprocessor: `#include` lines are ignored; `#define NAME tokens` defines an
 * object-like macro (expanded when tokens are read); `#undef` removes one.
 */
import type { Diagnostic } from '$lib/theory/diagnostics';

export type TokKind = 'id' | 'kw' | 'int' | 'float' | 'char' | 'str' | 'punct' | 'eof';

export interface Token {
	kind: TokKind;
	/** Source text (for punctuation and keywords, the operator itself). */
	text: string;
	/** Numeric value (int, float, char) or decoded string (str). */
	value?: number | string;
	start: number;
	end: number;
}

export const KEYWORDS = new Set([
	'auto',
	'break',
	'case',
	'char',
	'const',
	'continue',
	'default',
	'do',
	'double',
	'else',
	'enum',
	'extern',
	'float',
	'for',
	'goto',
	'if',
	'inline',
	'int',
	'long',
	'register',
	'return',
	'short',
	'signed',
	'sizeof',
	'static',
	'struct',
	'switch',
	'typedef',
	'union',
	'unsigned',
	'void',
	'volatile',
	'while'
]);

const PUNCT = [
	'<<=',
	'>>=',
	'...',
	'->',
	'++',
	'--',
	'<<',
	'>>',
	'<=',
	'>=',
	'==',
	'!=',
	'&&',
	'||',
	'+=',
	'-=',
	'*=',
	'/=',
	'%=',
	'&=',
	'^=',
	'|=',
	'[',
	']',
	'(',
	')',
	'{',
	'}',
	'.',
	'&',
	'*',
	'+',
	'-',
	'~',
	'!',
	'/',
	'%',
	'<',
	'>',
	'^',
	'|',
	'?',
	':',
	';',
	'=',
	','
];

const CURLY: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'" };

/** Object-like macros shared by every code block of a spec, in text order. */
export type Macros = Map<string, Token[]>;

const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdChar = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/** Reads the escape after a backslash at `i` (text[i] === '\\'); returns code and end. */
function readCEscape(text: string, i: number, end: number): { cp: number; end: number } | null {
	const c = text[i + 1];
	if (i + 1 >= end || c === undefined) return null;
	const simple: Record<string, number> = {
		n: 10,
		t: 9,
		r: 13,
		'0': 0,
		a: 7,
		b: 8,
		f: 12,
		v: 11,
		'\\': 92,
		"'": 39,
		'"': 34,
		'?': 63
	};
	if (c === 'x') {
		let j = i + 2;
		while (j < end && /[0-9A-Fa-f]/.test(text[j])) j++;
		if (j === i + 2) return null;
		return { cp: parseInt(text.slice(i + 2, j), 16) & 0xff, end: j };
	}
	if (c >= '0' && c <= '7') {
		let j = i + 1;
		while (j < end && j < i + 4 && text[j] >= '0' && text[j] <= '7') j++;
		return { cp: parseInt(text.slice(i + 1, j), 8) & 0xff, end: j };
	}
	if (c in simple) return { cp: simple[c], end: i + 2 };
	return { cp: c.codePointAt(0)!, end: i + 1 + c.length };
}

export interface LexResult {
	tokens: Token[];
	diagnostics: Diagnostic[];
}

/**
 * Tokenizes `text[start, end)`, running `#define` / `#include` lines and
 * expanding macros from (and adding macros to) `macros`.
 */
export function lexC(text: string, start: number, end: number, macros: Macros): LexResult {
	const raw: Token[] = [];
	const diagnostics: Diagnostic[] = [];
	const error = (message: string, s: number, e: number) =>
		diagnostics.push({ severity: 'error', message, span: { start: s, end: e, source: null } });
	const warn = (message: string, s: number, e: number) =>
		diagnostics.push({ severity: 'warning', message, span: { start: s, end: e, source: null } });

	let i = start;
	let lineStart = true;
	let curlyNoted = false;
	const curly = (at: number) => {
		if (curlyNoted) return;
		curlyNoted = true;
		error(`C needs straight quotes: ${text[at]} is a curly quote`, at, at + 1);
	};

	while (i < end) {
		const c = text[i];
		if (c === '\n') {
			lineStart = true;
			i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
			i++;
			continue;
		}
		if (c === '/' && text[i + 1] === '/') {
			while (i < end && text[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && text[i + 1] === '*') {
			const close = text.indexOf('*/', i + 2);
			if (close < 0 || close + 2 > end) {
				error('comment /* is never closed', i, i + 2);
				i = end;
			} else i = close + 2;
			continue;
		}
		if (c === '#' && lineStart) {
			i = directive(i);
			continue;
		}
		lineStart = false;
		const tokStart = i;
		if (isIdStart(c)) {
			let j = i + 1;
			while (j < end && isIdChar(text[j])) j++;
			const word = text.slice(i, j);
			raw.push({ kind: KEYWORDS.has(word) ? 'kw' : 'id', text: word, start: i, end: j });
			i = j;
			continue;
		}
		if (isDigit(c) || (c === '.' && isDigit(text[i + 1]))) {
			i = number(i);
			continue;
		}
		if (c === "'" || c === '‘' || c === '’') {
			if (c !== "'") curly(i);
			let j = i + 1;
			let value: number | null = null;
			if (text[j] === '\\') {
				const esc = readCEscape(text, j, end);
				if (esc) {
					value = esc.cp;
					j = esc.end;
				}
			} else if (j < end && text[j] !== '\n' && text[j] !== "'") {
				value = text.codePointAt(j)!;
				j += value > 0xffff ? 2 : 1;
			}
			if (text[j] === "'" || text[j] === '’' || text[j] === '‘') {
				if (text[j] !== "'") curly(j);
				j++;
			} else {
				error("character constant is missing its closing '", tokStart, Math.max(j, tokStart + 1));
				while (j < end && text[j] !== '\n' && text[j] !== ';') j++;
			}
			if (value === null) error('empty character constant', tokStart, j);
			raw.push({
				kind: 'char',
				text: text.slice(tokStart, j),
				value: value ?? 0,
				start: tokStart,
				end: j
			});
			i = j;
			continue;
		}
		if (c === '"' || c === '“' || c === '”') {
			if (c !== '"') curly(i);
			let j = i + 1;
			let value = '';
			let closed = false;
			while (j < end && text[j] !== '\n') {
				const ch = text[j];
				if (ch === '"' || ch === '”' || ch === '“') {
					if (ch !== '"') curly(j);
					closed = true;
					j++;
					break;
				}
				if (ch === '\\') {
					if (text[j + 1] === '\n') {
						j += 2;
						continue;
					}
					const esc = readCEscape(text, j, end);
					if (!esc) {
						j++;
						continue;
					}
					value += String.fromCodePoint(esc.cp);
					j = esc.end;
					continue;
				}
				value += ch;
				j++;
			}
			if (!closed) error('string is missing its closing "', tokStart, j);
			// Adjacent string literals are one string.
			const prev = raw[raw.length - 1];
			if (prev && prev.kind === 'str' && prevStringAdjacent(prev.end, tokStart)) {
				prev.value = (prev.value as string) + value;
				prev.text = text.slice(prev.start, j);
				prev.end = j;
			} else
				raw.push({ kind: 'str', text: text.slice(tokStart, j), value, start: tokStart, end: j });
			i = j;
			continue;
		}
		const op = PUNCT.find((p) => text.startsWith(p, i) && i + p.length <= end);
		if (op) {
			raw.push({ kind: 'punct', text: op, start: i, end: i + op.length });
			i += op.length;
			continue;
		}
		const cp = text.codePointAt(i)!;
		const len = cp > 0xffff ? 2 : 1;
		error(`unexpected character ${text.slice(i, i + len)}`, i, i + len);
		i += len;
	}

	function prevStringAdjacent(prevEnd: number, next: number): boolean {
		// Only whitespace and comments may separate adjacent literals.
		const between = text.slice(prevEnd, next);
		return /^(\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*$/.test(between);
	}

	function number(from: number): number {
		let j = from;
		let isFloat = false;
		let value: number;
		if (text[j] === '0' && (text[j + 1] === 'x' || text[j + 1] === 'X')) {
			j += 2;
			const digits = j;
			while (j < end && /[0-9A-Fa-f]/.test(text[j])) j++;
			if (j === digits) error('hexadecimal number has no digits', from, j);
			value = parseInt(text.slice(digits, j) || '0', 16);
		} else {
			while (j < end && isDigit(text[j])) j++;
			if (text[j] === '.') {
				isFloat = true;
				j++;
				while (j < end && isDigit(text[j])) j++;
			}
			if (text[j] === 'e' || text[j] === 'E') {
				let k = j + 1;
				if (text[k] === '+' || text[k] === '-') k++;
				if (isDigit(text[k])) {
					isFloat = true;
					j = k;
					while (j < end && isDigit(text[j])) j++;
				}
			}
			const body = text.slice(from, j);
			if (isFloat) value = parseFloat(body);
			else if (body.length > 1 && body[0] === '0') {
				if (/[89]/.test(body)) error(`invalid digit in octal number ${body}`, from, j);
				value = parseInt(body, 8);
			} else value = parseInt(body, 10);
		}
		// Suffixes: u, l, f (any case, any order).
		while (j < end && /[uUlLfF]/.test(text[j])) {
			if (/[fF]/.test(text[j]) && isFloat) isFloat = true;
			j++;
		}
		if (j < end && isIdChar(text[j])) {
			let k = j;
			while (k < end && isIdChar(text[k])) k++;
			error(`invalid number ${text.slice(from, k)}`, from, k);
			j = k;
		}
		raw.push({
			kind: isFloat ? 'float' : 'int',
			text: text.slice(from, j),
			value,
			start: from,
			end: j
		});
		return j;
	}

	/** A preprocessor line starting at `from` (the `#`); returns the offset after it. */
	function directive(from: number): number {
		// Join backslash-newline continuations.
		let j = from;
		while (j < end && text[j] !== '\n') {
			if (text[j] === '\\' && text[j + 1] === '\n') j += 2;
			else j++;
		}
		const line = text.slice(from, j);
		const m = /^#\s*([A-Za-z]*)/.exec(line)!;
		const name = m[1];
		const bodyStart = from + m[0].length;
		if (name === 'include' || name === 'pragma' || name === '') return j;
		if (name === 'define') {
			const dm = /^\s+([A-Za-z_][A-Za-z0-9_]*)(\(?)/.exec(text.slice(bodyStart, j));
			if (!dm) {
				error('#define needs a name', from, j);
				return j;
			}
			const nameStart = bodyStart + dm[0].length - dm[1].length - dm[2].length;
			if (dm[2]) {
				error(
					`#define ${dm[1]}(…): macros with parameters are not supported; write a function instead`,
					nameStart,
					nameStart + dm[1].length
				);
				return j;
			}
			const valueStart = bodyStart + dm[0].length;
			const inner = lexC(text.replaceAll('\\\n', '  '), valueStart, j, new Map());
			diagnostics.push(...inner.diagnostics);
			const body = inner.tokens.filter((t) => t.kind !== 'eof');
			if (body.some((t) => t.kind === 'id' && t.text === dm[1]))
				warn(`${dm[1]} is defined in terms of itself`, nameStart, nameStart + dm[1].length);
			macros.set(dm[1], body);
			return j;
		}
		if (name === 'undef') {
			const um = /^\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(bodyStart, j));
			if (um) macros.delete(um[1]);
			return j;
		}
		error(`#${name} is not supported here`, from, from + m[0].length);
		return j;
	}

	const tokens = expand(raw, macros);
	tokens.push({ kind: 'eof', text: '', start: end, end });
	return { tokens, diagnostics };
}

/** Replaces macro names by their bodies (recursively, each macro at most once per expansion). */
function expand(tokens: Token[], macros: Macros, active: Set<string> = new Set()): Token[] {
	const out: Token[] = [];
	for (const t of tokens) {
		const body = t.kind === 'id' && !active.has(t.text) ? macros.get(t.text) : undefined;
		if (!body) {
			out.push(t);
			continue;
		}
		active.add(t.text);
		// Expanded tokens report the position of the macro use.
		const placed = body.map((b) => ({ ...b, start: t.start, end: t.end }));
		out.push(...expand(placed, macros, active));
		active.delete(t.text);
	}
	return out;
}

/** Replaces curly quotes with straight ones (the slides print “ ” in C strings). */
export function straightenQuotes(text: string): string {
	return text.replace(/[“”‘’]/g, (c) => CURLY[c]);
}

/** True when the text contains a curly quote. */
export const hasCurlyQuotes = (text: string): boolean => /[“”‘’]/.test(text);
