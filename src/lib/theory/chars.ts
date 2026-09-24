/**
 * Display helpers for characters, strings, and character sets, following the
 * lecture conventions: RE literals in single quotes ('c'), strings in double
 * quotes ("c"), the empty string as "", and the empty set as { }.
 */
import { CharSet } from './charset';

export type CharContext =
	/** Edge labels and table headers: bare symbol, whitespace made visible. */
	| 'label'
	/** Inside a single-quoted lecture RE literal: 'a', '\t', '\''. */
	| 'quoted'
	/** Inside a double-quoted string: "a", "\t", "\"". */
	| 'string'
	/** Inside a flex-style [...] class. */
	| 'class';

const NAMED_ESCAPES: Record<number, string> = {
	0x09: '\\t',
	0x0a: '\\n',
	0x0d: '\\r',
	0x0b: '\\v',
	0x0c: '\\f',
	0x00: '\\0'
};

function hexEscape(cp: number): string {
	return cp <= 0xff
		? `\\x${cp.toString(16).toUpperCase().padStart(2, '0')}`
		: `\\u{${cp.toString(16).toUpperCase()}}`;
}

function isInvisible(cp: number): boolean {
	return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029;
}

/** Renders one character for display in the given context. */
export function showChar(c: string | number, ctx: CharContext = 'label'): string {
	const cp = typeof c === 'number' ? c : c.codePointAt(0)!;
	if (NAMED_ESCAPES[cp] !== undefined) return NAMED_ESCAPES[cp];
	if (isInvisible(cp)) return hexEscape(cp);
	const ch = String.fromCodePoint(cp);
	switch (ctx) {
		case 'label':
			return cp === 0x20 ? '␣' : ch;
		case 'quoted':
			return ch === "'" || ch === '\\' ? `\\${ch}` : ch;
		case 'string':
			return ch === '"' || ch === '\\' ? `\\${ch}` : ch;
		case 'class':
			return ch === ']' || ch === '\\' || ch === '^' || ch === '-' ? `\\${ch}` : ch;
	}
}

/** "abc" → `"abc"`, "" → `""`, with escapes for quotes, backslashes, and control characters. */
export function formatString(s: string): string {
	let out = '"';
	for (const ch of s) out += showChar(ch, 'string');
	return out + '"';
}

/** Lecture-style set of strings: { "", "0", "00", … } or { } when empty. */
export function formatStringSet(strings: readonly string[], opts: { more?: boolean } = {}): string {
	if (strings.length === 0 && !opts.more) return '{ }';
	const items = strings.map(formatString);
	if (opts.more) items.push('…');
	return `{ ${items.join(', ')} }`;
}

export interface NamedSet {
	name: string;
	set: CharSet;
}

export interface LabelOptions {
	/** Sets that should be shown by name when matched exactly (e.g. digit, letter). */
	names?: readonly NamedSet[];
	/** Separator between listed symbols; lectures write "0,1". */
	separator?: string;
}

function rangeText(lo: number, hi: number): string {
	if (lo === hi) return showChar(lo, 'label');
	if (hi === lo + 1) return `${showChar(lo, 'label')},${showChar(hi, 'label')}`;
	return `${showChar(lo, 'label')}–${showChar(hi, 'label')}`;
}

/**
 * Compact label for a transition or table column, e.g. `0,1`, `a–z`, `A–Z,a–z`,
 * `[^\n]`, or a name such as `digit` when `names` supplies one.
 */
export function formatLabel(set: CharSet, opts: LabelOptions = {}): string {
	if (set.isEmpty) return '∅';
	const named = opts.names?.find((n) => n.set.equals(set));
	if (named) return named.name;
	const sep = opts.separator ?? ',';
	// Very large sets read better as a complement.
	const comp = set.complement();
	if (set.size > 0x10000 && comp.size <= 16) {
		return `[^${comp.ranges.map(([lo, hi]) => (lo === hi ? showChar(lo, 'class') : `${showChar(lo, 'class')}-${showChar(hi, 'class')}`)).join('')}]`;
	}
	if (set.size <= 8 && set.ranges.every(([lo, hi]) => hi - lo < 2)) {
		return set
			.chars()
			.map((ch) => showChar(ch, 'label'))
			.join(sep);
	}
	return set.ranges.map(([lo, hi]) => rangeText(lo, hi)).join(sep);
}

/** Flex-style class text for a set: `[0-9]`, `[A-Za-z]`, `[^\n]`, or a single escaped char. */
export function formatClass(set: CharSet): string {
	if (set.isSingleton) return showChar(set.first()!, 'class');
	const comp = set.complement();
	const useComp = comp.size < set.size && comp.ranges.length < set.ranges.length;
	const body = (useComp ? comp : set).ranges
		.map(([lo, hi]) =>
			lo === hi
				? showChar(lo, 'class')
				: hi === lo + 1
					? showChar(lo, 'class') + showChar(hi, 'class')
					: `${showChar(lo, 'class')}-${showChar(hi, 'class')}`
		)
		.join('');
	return `[${useComp ? '^' : ''}${body}]`;
}
