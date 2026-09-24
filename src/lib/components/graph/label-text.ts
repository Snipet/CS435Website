/**
 * Text form of a transition label, for editing: `0,1`, `a-z`, `ε`, `' '`,
 * `'\,'`, `\t`, `[^\n]`, or a name such as `digit`. `labelText` produces text
 * that `parseLabelText` reads back to the same label.
 *
 * Items are separated by commas or whitespace. An item is
 *   - ε (also ϵ, \e, eps, epsilon) for an ε-move;
 *   - one symbol: a bare character, a quoted one ('x', "x", ‘x’), an escape
 *     (\t \n \r \v \f \0 \s \\ \' \" \, \xHH \u{H…}), or ␣ for a space;
 *   - a range of symbols: a-z or a–z, without spaces (`a - z` is an error);
 *   - a class: [abc], [a-z0-9], [^\n];
 *   - the name of a named set, when names are given.
 */
import { CharSet, MAX_CODE_POINT } from '$lib/theory/charset';
import type { NamedSet } from '$lib/theory/chars';
import type { Diagnostic } from '$lib/theory/diagnostics';

export interface ParsedLabel {
	/** Input symbols (may be empty). */
	symbols: CharSet;
	/** True when the text asks for an ε-move. */
	epsilon: boolean;
}

export type LabelParseResult =
	{ ok: true; label: ParsedLabel } | { ok: false; diagnostic: Diagnostic };

export interface LabelTextOptions {
	names?: readonly NamedSet[];
}

const EPSILON_WORDS = new Set(['ε', 'ϵ', '\\e', 'eps', 'epsilon']);
const OPEN_QUOTES: Record<string, string> = { "'": "'", '"': '"', '‘': '’', '’': '’' };

const SIMPLE_ESCAPES: Record<string, number> = {
	t: 9,
	n: 10,
	r: 13,
	v: 11,
	f: 12,
	'0': 0,
	s: 32
};

const isSeparator = (ch: string) => ch === ',' || /\s/u.test(ch);

class LabelError extends Error {
	constructor(
		message: string,
		readonly start: number,
		readonly end: number
	) {
		super(message);
	}
}

/** Reads an escape at s[i] === '\\'; returns the code point and the index after it. */
function readEscape(s: string, i: number): [number, number] {
	const c = s[i + 1];
	if (c === undefined) throw new LabelError('A backslash needs a character after it.', i, i + 1);
	if (c in SIMPLE_ESCAPES) return [SIMPLE_ESCAPES[c], i + 2];
	if (c === 'x') {
		const m = /^[0-9a-fA-F]{2}/.exec(s.slice(i + 2));
		if (!m) throw new LabelError('Write \\x with two hex digits, e.g. \\x41.', i, i + 2);
		return [parseInt(m[0], 16), i + 4];
	}
	if (c === 'u') {
		const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(s.slice(i + 2));
		const plain = /^[0-9a-fA-F]{4}/.exec(s.slice(i + 2));
		const hex = braced?.[1] ?? plain?.[0];
		const cp = hex === undefined ? NaN : parseInt(hex, 16);
		if (!(cp <= MAX_CODE_POINT))
			throw new LabelError('Write \\u with hex digits, e.g. \\u{3B5}.', i, i + 2);
		return [cp, i + 2 + (braced ? braced[0].length : 4)];
	}
	const cp = s.codePointAt(i + 1)!;
	return [cp, i + 1 + String.fromCodePoint(cp).length];
}

/** Reads one symbol at s[i]; returns the code point and the index after it. */
function readSymbol(s: string, i: number): [number, number] {
	const ch = String.fromCodePoint(s.codePointAt(i)!);
	const close = OPEN_QUOTES[ch];
	if (close !== undefined && s.length > i + ch.length) {
		let j = i + ch.length;
		const cps: number[] = [];
		while (j < s.length && s[j] !== close && !(close === '’' && s[j] === "'")) {
			if (s[j] === '\\') {
				const [cp, next] = readEscape(s, j);
				cps.push(cp);
				j = next;
			} else {
				const cp = s.codePointAt(j)!;
				cps.push(cp);
				j += String.fromCodePoint(cp).length;
			}
		}
		if (j >= s.length) throw new LabelError('Missing closing quote.', i, s.length);
		if (cps.length !== 1)
			throw new LabelError(
				cps.length === 0
					? 'Empty quotes; write a symbol inside them.'
					: 'Quote one symbol at a time, separated by commas.',
				i,
				j + 1
			);
		return [cps[0], j + 1];
	}
	if (ch === '\\') return readEscape(s, i);
	if (ch === '␣') return [32, i + 1];
	return [ch.codePointAt(0)!, i + ch.length];
}

/** Symbol or range starting at i inside an item; returns the set and the index after it. */
function readSymbolOrRange(s: string, i: number, end: number): [CharSet, number] {
	const [lo, next] = readSymbol(s, i);
	if (next < end && (s[next] === '-' || s[next] === '–') && next + 1 < end) {
		const [hi, after] = readSymbol(s, next + 1);
		if (hi < lo) throw new LabelError('A range must go from low to high, e.g. a-z.', i, after);
		return [CharSet.range(lo, hi), after];
	}
	return [CharSet.single(lo), next];
}

function readClass(s: string, start: number, end: number): CharSet {
	// s[start] === '[' and s[end - 1] === ']'
	let i = start + 1;
	const negate = s[i] === '^';
	if (negate) i++;
	let set = CharSet.EMPTY;
	while (i < end - 1) {
		const [part, next] = readSymbolOrRange(s, i, end - 1);
		set = set.union(part);
		i = next;
	}
	if (set.isEmpty && !negate) throw new LabelError('Empty class.', start, end);
	return negate ? set.complement() : set;
}

/** Splits text into items, honoring quotes, brackets and escapes. */
function splitItems(s: string): { start: number; end: number }[] {
	const items: { start: number; end: number }[] = [];
	let i = 0;
	while (i < s.length) {
		if (isSeparator(s[i])) {
			i++;
			continue;
		}
		const start = i;
		while (i < s.length && !isSeparator(s[i])) {
			const ch = String.fromCodePoint(s.codePointAt(i)!);
			if (ch === '\\') i += Math.min(2, s.length - i);
			else if (ch === '[') {
				let j = i + 1;
				while (j < s.length && s[j] !== ']') j += s[j] === '\\' ? 2 : 1;
				if (j >= s.length) throw new LabelError('Missing ] to close the class.', i, s.length);
				i = j + 1;
			} else if (OPEN_QUOTES[ch] !== undefined && i + ch.length < s.length) {
				const close = OPEN_QUOTES[ch];
				let j = i + ch.length;
				while (j < s.length && s[j] !== close && !(close === '’' && s[j] === "'"))
					j += s[j] === '\\' ? 2 : 1;
				if (j >= s.length) throw new LabelError('Missing closing quote.', i, s.length);
				i = j + 1;
			} else i += ch.length;
		}
		items.push({ start, end: i });
	}
	return items;
}

const isDash = (item: string) => item === '-' || item === '–';

/**
 * Rejects `a - z`: a lone dash between two single symbols, separated by spaces
 * only, is most likely a range typed with spaces rather than three symbols.
 */
function checkSpacedRange(
	text: string,
	items: readonly { start: number; end: number }[],
	opts: LabelTextOptions
): void {
	const single = ({ start, end }: { start: number; end: number }) => {
		const item = text.slice(start, end);
		if (EPSILON_WORDS.has(item) || opts.names?.some((n) => n.name === item)) return false;
		try {
			return readSymbol(text, start)[1] === end;
		} catch {
			return false;
		}
	};
	const spaced = (from: number, to: number) => !text.slice(from, to).includes(',');
	for (let i = 1; i + 1 < items.length; i++) {
		const [l, m, r] = [items[i - 1], items[i], items[i + 1]];
		const dash = text.slice(m.start, m.end);
		if (!isDash(dash) || !spaced(l.end, m.start) || !spaced(m.end, r.start)) continue;
		if (!single(l) || !single(r)) continue;
		const lo = text.slice(l.start, l.end);
		const hi = text.slice(r.start, r.end);
		throw new LabelError(
			`Ranges have no spaces: ${lo}${dash}${hi}. For the symbol ${dash}, write ${lo}, ${dash}, ${hi} or '${dash}'.`,
			l.start,
			r.end
		);
	}
}

/** Parses label text. Empty text parses to no symbols and no ε. */
export function parseLabelText(text: string, opts: LabelTextOptions = {}): LabelParseResult {
	let symbols = CharSet.EMPTY;
	let epsilon = false;
	try {
		const items = splitItems(text);
		checkSpacedRange(text, items, opts);
		for (const { start, end } of items) {
			const item = text.slice(start, end);
			const named = opts.names?.find((n) => n.name === item);
			if (named) {
				symbols = symbols.union(named.set);
				continue;
			}
			if (EPSILON_WORDS.has(item)) {
				epsilon = true;
				continue;
			}
			if (item.startsWith('[') && item.endsWith(']') && item.length > 1) {
				symbols = symbols.union(readClass(text, start, end));
				continue;
			}
			const [set, next] = readSymbolOrRange(text, start, end);
			if (next !== end)
				throw new LabelError(
					`“${item}” is not one symbol. Separate symbols with commas, or quote them ('a').`,
					start,
					end
				);
			symbols = symbols.union(set);
		}
	} catch (e) {
		if (!(e instanceof LabelError)) throw e;
		return {
			ok: false,
			diagnostic: {
				severity: 'error',
				message: e.message,
				span: { start: e.start, end: e.end, source: null }
			}
		};
	}
	return { ok: true, label: { symbols, epsilon } };
}

const NAMED_TEXT: Record<number, string> = {
	9: '\\t',
	10: '\\n',
	13: '\\r',
	11: '\\v',
	12: '\\f',
	0: '\\0'
};

function hex(cp: number): string {
	return cp <= 0xff
		? `\\x${cp.toString(16).toUpperCase().padStart(2, '0')}`
		: `\\u{${cp.toString(16).toUpperCase()}}`;
}

const invisible = (cp: number) =>
	cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029;

/** Characters quoted in item text because they would otherwise read differently. */
const QUOTED = new Set([',', '"', '‘', '’', '[', ']', '-', '–', '␣', 'ε', 'ϵ']);
/** Characters escaped inside a [class]. */
const CLASS_ESCAPED = new Set([']', '[', '\\', '^', '-', '–', "'", '"', '‘', '’']);

/** One symbol as editable text; `reserved` holds words that would read as something else. */
function symbolText(cp: number, reserved: ReadonlySet<string>): string {
	if (NAMED_TEXT[cp] !== undefined) return NAMED_TEXT[cp];
	if (invisible(cp)) return hex(cp);
	const ch = String.fromCodePoint(cp);
	if (ch === "'" || ch === '\\') return `'\\${ch}'`;
	if (QUOTED.has(ch) || /\s/u.test(ch) || reserved.has(ch)) return `'${ch}'`;
	return ch;
}

function classSymbol(cp: number): string {
	if (NAMED_TEXT[cp] !== undefined) return NAMED_TEXT[cp];
	if (invisible(cp)) return hex(cp);
	const ch = String.fromCodePoint(cp);
	if (CLASS_ESCAPED.has(ch)) return `\\${ch}`;
	if (/\s/u.test(ch)) return cp === 32 ? '\\s' : hex(cp);
	return ch;
}

/** Editable text for a label; `parseLabelText` reads it back to the same label. */
export function labelText(label: CharSet | null, opts: LabelTextOptions = {}): string {
	if (label === null) return 'ε';
	if (label.isEmpty) return '';
	const named = opts.names?.find((n) => n.set.equals(label));
	if (named) return named.name;
	const comp = label.complement();
	if (label.size > 0x10000 && comp.size <= 16) {
		const body = comp.ranges
			.map(([lo, hi]) =>
				lo === hi
					? classSymbol(lo)
					: `${classSymbol(lo)}${hi > lo + 1 ? '-' : ''}${classSymbol(hi)}`
			)
			.join('');
		return `[^${body}]`;
	}
	// Names and ε words are read before symbols, so a symbol spelled like one is quoted.
	const reserved = new Set([...EPSILON_WORDS, ...(opts.names ?? []).map((n) => n.name)]);
	const sym = (cp: number) => symbolText(cp, reserved);
	return label.ranges
		.map(([lo, hi]) => {
			if (lo === hi) return sym(lo);
			if (hi === lo + 1) return `${sym(lo)},${sym(hi)}`;
			const range = `${sym(lo)}-${sym(hi)}`;
			return reserved.has(range) ? `'${String.fromCodePoint(lo)}'-${sym(hi)}` : range;
		})
		.join(',');
}
