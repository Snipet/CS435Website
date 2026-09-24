/**
 * Pieces shared by the lecture-notation and flex parsers: escapes, bracket
 * classes, and ordering of regular definitions. Not part of the public API.
 */
import { CharSet, MAX_CODE_POINT } from '../charset';
import type { Diagnostic } from '../diagnostics';
import { children, type Regex, type Span } from './ast';

export type Dialect = 'lecture' | 'flex';

/** Largest count accepted by A^n and r{n,m}; bigger counts are almost always typos. */
export const MAX_REPEAT = 1000;

/**
 * Deepest tree either parser returns (parentheses, chained postfix operators,
 * and definition bodies all count). Deeper input is reported, not parsed, so
 * recursive algorithms over the AST stay well inside the call stack.
 */
export const MAX_DEPTH = 500;
export const tooDeep = `expression is nested too deeply (more than ${MAX_DEPTH} levels)`;

/** Lecture notation: any Unicode whitespace is cosmetic. */
export const isSpace = (ch: string): boolean => /\s/u.test(ch);
/** flex ends a pattern only at ASCII whitespace; other spaces (e.g. U+00A0) are characters. */
export const isFlexSpace = (ch: string | undefined): boolean =>
	ch !== undefined && ch.length === 1 && ' \t\n\r\f\v'.includes(ch);
export const isFlexBlank = (text: string): boolean => /^[ \t\n\r\f\v]*$/.test(text);
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
	/** Messages already given by infoOnce. */
	private readonly noted = new Set<string>();

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

	/** An info note given only for the first occurrence in this source. */
	infoOnce(message: string, start: number, end: number): void {
		if (this.noted.has(message)) return;
		this.noted.add(message);
		this.info(message, start, end);
	}
}

const FLEX_U_NOTE =
	'\\u{…} is accepted here but is not flex syntax; flex reads \\u as the letter u';

/** Notes a successful flex escape at `i` that used the site's \u{…} extension. */
export function noteFlexU(text: string, i: number, end: number, rep: Reporter): void {
	if (text.startsWith('\\u{', i)) rep.infoOnce(FLEX_U_NOTE, i, end);
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

function unknownClass(whole: string, name: string): string {
	const lower = name.toLowerCase();
	return lower !== name && Object.hasOwn(POSIX_CLASSES, lower)
		? `unknown character class ${whole}; class names are lowercase, e.g. [:${lower}:]`
		: `unknown character class ${whole}`;
}

export interface ClassResult {
	set: CharSet;
	/** Offset just past the closing ']' (or the end of input when unterminated). */
	end: number;
	ok: boolean;
}

/**
 * Parses a bracket class starting at the '[' at `start`: ranges `a-z`,
 * negation `[^…]`, escapes, `[:alpha:]` and `[:^alpha:]` classes, and a literal
 * ']' first or '-' first/last. Negated classes are complements over all code
 * points (so `[^a]` and `[[:^alpha:]]` contain \n, as in flex).
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
			if (dialect === 'flex') noteFlexU(text, i, esc.end, rep);
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
			const m = /^\[:(\^?)([A-Za-z]+):\]/.exec(text.slice(i, limit));
			if (m) {
				const [whole, negated, name] = m;
				if (Object.hasOwn(POSIX_CLASSES, name)) {
					const set = negated ? POSIX_CLASSES[name].complement() : POSIX_CLASSES[name];
					for (const r of set.ranges) parts.push([r[0], r[1]]);
				} else rep.error(unknownClass(whole, name), i, i + whole.length);
				i += whole.length;
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

	for (const root of names) {
		if (state.has(root)) continue;
		// An explicit stack, since definitions can chain arbitrarily deep.
		const stack: { name: string; next: number }[] = [{ name: root, next: 0 }];
		state.set(root, 'active');
		while (stack.length > 0) {
			const frame = stack[stack.length - 1];
			const ds = deps.get(frame.name) ?? [];
			if (frame.next < ds.length) {
				const d = ds[frame.next++];
				const s = deps.has(d) ? state.get(d) : 'done';
				if (s === 'active') {
					const k = stack.findIndex((f) => f.name === d);
					const cycle = [...stack.slice(k).map((f) => f.name), d];
					cycles.push(cycle);
					for (const n of cycle) inCycle.add(n);
				} else if (s === undefined) {
					state.set(d, 'active');
					stack.push({ name: d, next: 0 });
				}
				continue;
			}
			stack.pop();
			state.set(frame.name, 'done');
			if (!inCycle.has(frame.name)) order.push(frame.name);
		}
	}
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

const heights = new WeakMap<Regex, number>();

/**
 * Height of the tree, counting definition bodies (a leaf is 1). Iterative and
 * cached per node, so shared definitions and long postfix chains are cheap.
 */
export function treeHeight(root: Regex): number {
	const known = heights.get(root);
	if (known !== undefined) return known;
	const stack: { node: Regex; kids: Regex[]; next: number; max: number }[] = [
		{ node: root, kids: children(root), next: 0, max: 0 }
	];
	for (;;) {
		const top = stack[stack.length - 1];
		if (top.next < top.kids.length) {
			const kid = top.kids[top.next++];
			const h = heights.get(kid);
			if (h !== undefined) top.max = Math.max(top.max, h);
			else stack.push({ node: kid, kids: children(kid), next: 0, max: 0 });
			continue;
		}
		const h = top.max + 1;
		heights.set(top.node, h);
		stack.pop();
		if (stack.length === 0) return h;
		const parent = stack[stack.length - 1];
		parent.max = Math.max(parent.max, h);
	}
}
