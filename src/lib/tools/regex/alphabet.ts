/**
 * The alphabet field: `Σ = { 0, 1 }`, `0 1`, `{ 0, 1, 2, 3, …, 9, (, ), - }`
 * (Lexical Analysis, slide 31) or `letter ∪ { ., @ }` (slide 32).
 *
 * Symbols are separated by commas or spaces; braces only group. `…` (or `...`)
 * between two single symbols is the range between them. A word that names a
 * regular definition stands for the symbols that definition uses. Symbols that
 * would read as syntax (space, comma, braces, ∪, quotes) are written in quotes:
 * `' '`, `','`. Inside quotes, `\t \n \r \\ \' \"` are escapes.
 */
import { CharSet, type Range } from '$lib/theory/charset';
import { showChar } from '$lib/theory/chars';
import type { Diagnostic } from '$lib/theory/diagnostics';
import { containsAny, symbolsOf, type Regex } from '$lib/theory/regex';

/** Span source of alphabet diagnostics (pass it as RegexField's `source`). */
export const ALPHABET_SOURCE = '<alphabet>';

export interface AlphabetResult {
	/** Null when the field is blank or has errors. */
	set: CharSet | null;
	/** True when nothing was typed. */
	blank: boolean;
	diagnostics: Diagnostic[];
}

type Item =
	| { kind: 'char'; cp: number; start: number; end: number }
	| { kind: 'set'; set: CharSet; start: number; end: number }
	| { kind: 'ellipsis'; start: number; end: number };

const QUOTES: Record<string, string> = { "'": "'’", '‘': "'’", '"': '"”', '“': '"”' };
const ESCAPES: Record<string, number> = {
	t: 9,
	n: 10,
	r: 13,
	'\\': 92,
	"'": 39,
	'"': 34,
	'’': 0x2019,
	'”': 0x201d
};
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

/** Parses the alphabet field. `defs` supplies definition names (e.g. `letter`). */
export function parseAlphabet(text: string, defs?: ReadonlyMap<string, Regex>): AlphabetResult {
	const diagnostics: Diagnostic[] = [];
	const span = (start: number, end: number) => ({ start, end, source: ALPHABET_SOURCE });
	const error = (message: string, start: number, end: number) =>
		diagnostics.push({ severity: 'error', message, span: span(start, end) });
	if (text.trim() === '') return { set: null, blank: true, diagnostics };

	const items: Item[] = [];
	let i = 0;
	while (i < text.length) {
		const cp = text.codePointAt(i)!;
		const ch = String.fromCodePoint(cp);
		const start = i;
		if (/\s/u.test(ch) || ch === ',' || ch === '{' || ch === '}' || ch === '∪') {
			i += ch.length;
			continue;
		}
		if (ch === '…' || text.startsWith('...', i)) {
			i += ch === '…' ? 1 : 3;
			items.push({ kind: 'ellipsis', start, end: i });
			continue;
		}
		if (QUOTES[ch]) {
			const closers = QUOTES[ch];
			let j = i + 1;
			const cps: number[] = [];
			let closed = false;
			while (j < text.length) {
				const c = String.fromCodePoint(text.codePointAt(j)!);
				if (closers.includes(c)) {
					closed = true;
					j += c.length;
					break;
				}
				if (c === '\\' && j + 1 < text.length && ESCAPES[text[j + 1]] !== undefined) {
					cps.push(ESCAPES[text[j + 1]]);
					j += 2;
					continue;
				}
				cps.push(c.codePointAt(0)!);
				j += c.length;
			}
			if (!closed) error(`missing closing quote`, start, j);
			else if (cps.length === 0) error('empty quotes; put one symbol between them', start, j);
			else if (cps.length === 1) items.push({ kind: 'char', cp: cps[0], start, end: j });
			else items.push({ kind: 'set', set: CharSet.fromCodePoints(cps), start, end: j });
			i = j;
			continue;
		}
		if (NAME_START.test(ch)) {
			let j = i;
			while (j < text.length && NAME_CHAR.test(text[j])) j++;
			const name = text.slice(i, j);
			const def = defs?.get(name);
			if (def && containsAny(def)) error(`${name} uses Σ, so it cannot define Σ`, i, j);
			else if (def) items.push({ kind: 'set', set: symbolsOf(def), start: i, end: j });
			else {
				if (name.length > 1)
					diagnostics.push({
						severity: 'info',
						message: `${name} read as the symbols ${[...name].join(' ')}; no definition named ${name}`,
						span: span(i, j)
					});
				for (let k = i; k < j; k++)
					items.push({ kind: 'char', cp: text.charCodeAt(k), start: k, end: k + 1 });
			}
			i = j;
			continue;
		}
		items.push({ kind: 'char', cp, start, end: i + ch.length });
		i += ch.length;
	}

	const ranges: Range[] = [];
	for (let k = 0; k < items.length; k++) {
		const item = items[k];
		if (item.kind === 'char') ranges.push([item.cp, item.cp]);
		else if (item.kind === 'set') ranges.push(...item.set.ranges);
		else {
			const prev = items[k - 1];
			const next = items[k + 1];
			if (prev?.kind !== 'char' || next?.kind !== 'char') {
				error('… needs a single symbol on each side, e.g. 0, …, 9', item.start, item.end);
				continue;
			}
			if (next.cp < prev.cp) {
				error(
					`${showSymbol(prev.cp)}, …, ${showSymbol(next.cp)} is backwards`,
					prev.start,
					next.end
				);
				continue;
			}
			ranges.push([prev.cp, next.cp]);
		}
	}
	if (diagnostics.some((d) => d.severity === 'error'))
		return { set: null, blank: false, diagnostics };
	return { set: CharSet.fromRanges(ranges), blank: false, diagnostics };
}

/** Characters that must be quoted in the alphabet field. */
const SYNTAX = new Set([' ', ',', '{', '}', '∪', '…', "'", '"', '‘', '’', '“', '”', '\\']);

/** One symbol as the alphabet field writes it: `0`, `(`, `' '`, `'\t'`. */
export function showSymbol(cp: number, names?: ReadonlySet<string>): string {
	const ch = String.fromCodePoint(cp);
	const shown = showChar(cp, 'quoted');
	if (SYNTAX.has(ch) || shown !== ch || /\s/u.test(ch) || names?.has(ch)) return `'${shown}'`;
	return ch;
}

/**
 * Σ in lecture notation: `{ 0, 1 }`, `{ 0, …, 9, (, ), - }`, or `{ }`. Runs of
 * four or more symbols are written with `…`. Very large sets are described by
 * what they leave out. The result reads back with `parseAlphabet`, unless it
 * was cut short at `maxItems`.
 */
export function formatAlphabet(
	set: CharSet,
	opts: { maxItems?: number; names?: ReadonlySet<string> } = {}
): string {
	if (set.isEmpty) return '{ }';
	const comp = set.complement();
	if (set.size > 0x10000 && comp.size <= 8) {
		if (comp.isEmpty) return 'every character';
		return `every character except ${[...comp.codePoints()].map((c) => showSymbol(c)).join(', ')}`;
	}
	const max = opts.maxItems ?? 40;
	const items: string[] = [];
	for (const [lo, hi] of set.ranges) {
		if (hi - lo >= 3) items.push(showSymbol(lo, opts.names), '…', showSymbol(hi, opts.names));
		else for (let c = lo; c <= hi; c++) items.push(showSymbol(c, opts.names));
	}
	const shown = items.length > max ? [...items.slice(0, max), '…'] : items;
	return `{ ${shown.join(', ')} }`;
}
