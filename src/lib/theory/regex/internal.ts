/**
 * Pieces shared by the lecture-notation and flex parsers: escapes, bracket
 * classes, and ordering of regular definitions. Not part of the public API.
 */
import { CharSet, MAX_CODE_POINT } from '../charset';
import type { Diagnostic } from '../diagnostics';
import type { Span } from './ast';

export type Dialect = 'lecture' | 'flex';

/** Largest count accepted by A^n and r{n,m}; bigger counts are almost always typos. */
export const MAX_REPEAT = 1000;

export const isSpace = (ch: string): boolean => /\s/u.test(ch);
export const isDigit = (ch: string | undefined): boolean =>
	ch !== undefined && ch >= '0' && ch <= '9';
const isHex = (ch: string | undefined): boolean => ch !== undefined && /^[0-9A-Fa-f]$/.test(ch);
const isOctal = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '7';
const isAlnum = (ch: string): boolean => /^[A-Za-z0-9]$/.test(ch);

/** The character (full code point) at `i`, or undefined past the end. */
export function charAt(text: string, i: number): string | undefined {
	const cp = text.codePointAt(i);
	return cp === undefined ? undefined : String.fromCodePoint(cp);
}

/** Collects diagnostics with spans in one source. */
export class Reporter {
	constructor(
		readonly diagnostics: Diagnostic[],
		readonly source: string | null,
		/** Added to every offset, so spans can point into a larger document. */
		readonly base = 0
	) {}

	span(start: number, end: number): Span {
		return { start: start + this.base, end: end + this.base, source: this.source };
	}

	error(message: string, start: number, end: number): void {
		this.diagnostics.push({ severity: 'error', message, span: this.span(start, end) });
	}

	info(message: string, start: number, end: number): void {
		this.diagnostics.push({ severity: 'info', message, span: this.span(start, end) });
	}
}

const NAMED: Record<Dialect, Record<string, number>> = {
	lecture: { t: 0x09, n: 0x0a, r: 0x0d, v: 0x0b, f: 0x0c, '0': 0x00 },
	flex: { t: 0x09, n: 0x0a, r: 0x0d, v: 0x0b, f: 0x0c, a: 0x07, b: 0x08 }
};

export type EscapeResult = { cp: number; end: number } | { error: string; end: number };

/**
 * Reads the escape starting at the backslash at `i` (outside or inside
 * quotes/classes). Lecture notation accepts \t \n \r \v \f \0 \xHH \u{H…} and a
 * backslash before any punctuation; flex also accepts \a \b and octal \123, and
 * any other \c means c. Both accept \u{H…} so every code point can be written.
 */
export function readEscape(text: string, i: number, limit: number, dialect: Dialect): EscapeResult {
	const c = i + 1 < limit ? charAt(text, i + 1) : undefined;
	if (c === undefined) return { error: 'incomplete escape \\', end: i + 1 };
	const after = i + 1 + c.length;
	if (dialect === 'flex' && isOctal(c)) {
		let j = i + 1;
		while (j < Math.min(i + 4, limit) && isOctal(text[j])) j++;
		return { cp: parseInt(text.slice(i + 1, j), 8), end: j };
	}
	if (Object.hasOwn(NAMED[dialect], c)) return { cp: NAMED[dialect][c], end: after };
	if (c === 'x') {
		let j = i + 2;
		while (j < Math.min(i + 4, limit) && isHex(text[j])) j++;
		if (j === i + 2) return { error: '\\x needs one or two hex digits, e.g. \\x41', end: after };
		return { cp: parseInt(text.slice(i + 2, j), 16), end: j };
	}
	if (c === 'u' && i + 2 < limit && text[i + 2] === '{') {
		const found = text.indexOf('}', i + 3);
		const close = found >= limit ? -1 : found;
		const hex = close < 0 ? '' : text.slice(i + 3, close);
		if (!/^[0-9A-Fa-f]{1,6}$/.test(hex) || parseInt(hex, 16) > MAX_CODE_POINT)
			return {
				error: '\\u{…} needs a hex code point, e.g. \\u{3B5}',
				end: close < 0 ? i + 3 : close + 1
			};
		return { cp: parseInt(hex, 16), end: close + 1 };
	}
	if (dialect === 'flex' || !isAlnum(c)) return { cp: c.codePointAt(0)!, end: after };
	return { error: `unknown escape \\${c}`, end: after };
}

const range = (lo: string, hi: string): [number, number] => [
	lo.codePointAt(0)!,
	hi.codePointAt(0)!
];

/** POSIX bracket expressions with ASCII semantics, as flex defines them. */
export const POSIX_CLASSES: Record<string, CharSet> = {
	alpha: CharSet.fromRanges([range('A', 'Z'), range('a', 'z')]),
	digit: CharSet.range('0', '9'),
	alnum: CharSet.fromRanges([range('0', '9'), range('A', 'Z'), range('a', 'z')]),
	upper: CharSet.range('A', 'Z'),
	lower: CharSet.range('a', 'z'),
	space: CharSet.fromRanges([
		[0x09, 0x0d],
		[0x20, 0x20]
	]),
	blank: CharSet.of(' \t'),
	punct: CharSet.fromRanges([
		[0x21, 0x2f],
		[0x3a, 0x40],
		[0x5b, 0x60],
		[0x7b, 0x7e]
	]),
	xdigit: CharSet.fromRanges([range('0', '9'), range('A', 'F'), range('a', 'f')]),
	cntrl: CharSet.fromRanges([
		[0x00, 0x1f],
		[0x7f, 0x7f]
	]),
	print: CharSet.range(0x20, 0x7e),
	graph: CharSet.range(0x21, 0x7e)
};

export interface ClassResult {
	set: CharSet;
	/** Offset just past the closing ']' (or the end of input when unterminated). */
	end: number;
	ok: boolean;
}

/**
 * Parses a bracket class starting at the '[' at `start`: ranges `a-z`,
 * negation `[^…]`, escapes, `[:alpha:]`-style classes, and a literal ']' first
 * or '-' first/last. Negated classes are complements over all code points (so
 * `[^a]` contains \n, as in flex).
 */
export function parseClass(
	text: string,
	start: number,
	limit: number,
	dialect: Dialect,
	rep: Reporter
): ClassResult {
	let i = start + 1;
	let negate = false;
	if (text[i] === '^') {
		negate = true;
		i++;
	}
	const parts: [number, number][] = [];
	let first = true;

	// One member: an escape or a plain character. Returns null on a bad escape.
	const member = (): number | null => {
		if (text[i] === '\\') {
			const esc = readEscape(text, i, limit, dialect);
			if ('error' in esc) {
				rep.error(esc.error, i, Math.min(esc.end, limit));
				i = esc.end;
				return null;
			}
			i = esc.end;
			return esc.cp;
		}
		const ch = charAt(text, i)!;
		i += ch.length;
		return ch.codePointAt(0)!;
	};

	for (;;) {
		if (i >= limit) {
			rep.error('unterminated class: missing ]', start, limit);
			return { set: finish(), end: limit, ok: false };
		}
		if (text[i] === ']' && !first) {
			i++;
			break;
		}
		first = false;
		if (text[i] === '[' && text[i + 1] === ':') {
			const close = text.indexOf(':]', i + 2);
			if (close >= 0 && close < limit && /^[a-z]+$/.test(text.slice(i + 2, close))) {
				const name = text.slice(i + 2, close);
				if (Object.hasOwn(POSIX_CLASSES, name))
					for (const r of POSIX_CLASSES[name].ranges) parts.push([r[0], r[1]]);
				else rep.error(`unknown character class [:${name}:]`, i, close + 2);
				i = close + 2;
				continue;
			}
		}
		const loStart = i;
		const lo = member();
		if (lo === null) continue;
		if (text[i] === '-' && i + 1 < limit && text[i + 1] !== ']') {
			i++;
			const hi = member();
			if (hi === null) continue;
			if (hi < lo) {
				rep.error(
					`reversed range ${text.slice(loStart, i)}: the first character comes after the last`,
					loStart,
					i
				);
				continue;
			}
			parts.push([lo, hi]);
		} else parts.push([lo, lo]);
	}
	return { set: finish(), end: i, ok: true };

	function finish(): CharSet {
		const set = CharSet.fromRanges(parts);
		return negate ? set.complement() : set;
	}
}

export interface OrderResult {
	/** Definitions in dependency order (each after everything it uses); cyclic ones are left out. */
	order: string[];
	/** Each cycle as a closed walk, e.g. ['a', 'b', 'a']. */
	cycles: string[][];
}

/** Orders definitions so each comes after the definitions it refers to (depth-first, source order). */
export function orderDefinitions(
	names: readonly string[],
	deps: ReadonlyMap<string, readonly string[]>
): OrderResult {
	const state = new Map<string, 'active' | 'done'>();
	const order: string[] = [];
	const cycles: string[][] = [];
	const inCycle = new Set<string>();
	const stack: string[] = [];

	const visit = (name: string): void => {
		const s = state.get(name);
		if (s === 'done') return;
		if (s === 'active') {
			const cycle = [...stack.slice(stack.indexOf(name)), name];
			cycles.push(cycle);
			for (const n of cycle) inCycle.add(n);
			return;
		}
		state.set(name, 'active');
		stack.push(name);
		for (const d of deps.get(name) ?? []) if (deps.has(d)) visit(d);
		stack.pop();
		state.set(name, 'done');
		if (!inCycle.has(name)) order.push(name);
	};
	for (const n of names) visit(n);
	return { order, cycles };
}

/** Rotates a closed walk ['a', 'b', 'a'] to start at `name`: ['b', 'a', 'b']. */
export function rotateCycle(cycle: readonly string[], name: string): string[] {
	const open = cycle.slice(0, -1);
	const k = open.indexOf(name);
	const rotated = [...open.slice(k), ...open.slice(0, k)];
	return [...rotated, rotated[0]];
}

/** Stable sort by span start; diagnostics without spans keep their place at the front. */
export function sortDiagnostics(ds: Diagnostic[]): Diagnostic[] {
	return ds
		.map((d, k) => ({ d, k }))
		.sort((a, b) => (a.d.span?.start ?? -1) - (b.d.span?.start ?? -1) || a.k - b.k)
		.map((x) => x.d);
}
