/**
 * Language names on T-diagrams, as the slides write them: primes (`L′`, `M′`)
 * and subscripts (`M_OTHER`, drawn as M with a subscript OTHER).
 *
 * Typing: `'` (or `’`) is a prime and `_` starts a subscript (`M_OTHER` or
 * `M_{OTHER}`). A run of primes is written with one glyph however it was
 * typed: `L''`, `L′′` and `L″` are all `L″`, and three primes are `L‴`. Two
 * names are the same language when their normalized forms match (case
 * matters: `x86` and `X86` are different names).
 */

/** Longest language name a field accepts. */
export const MAX_LABEL = 24;

/** Advance width of a monospace glyph, in em (JetBrains Mono and most fallbacks). */
export const MONO_ADVANCE = 0.6;

/** Size of a subscript relative to the name it follows. */
export const SUB_SCALE = 0.7;

export interface LangParts {
	/** The name up to the subscript, primes included: `L′`, `M`, `C++`. */
	main: string;
	/** Subscript text without the underscore or braces; '' when there is none. */
	sub: string;
}

/** How many primes each spelling stands for (`'` and `’` as typed, the rest as drawn). */
const PRIME_COUNT: Readonly<Record<string, number>> = {
	"'": 1,
	'’': 1,
	'′': 1,
	'″': 2,
	'‴': 3,
	'⁗': 4
};
const PRIME_RUN = /['’′″‴⁗]+/g;
/** Glyphs for one, two and three primes. */
const PRIME_GLYPH = ['', '′', '″', '‴'];

/** `n` primes in as few glyphs as possible: ′, ″, ‴, then ‴′, ‴″, ‴‴, … */
export function primeGlyphs(n: number): string {
	if (n <= 0) return '';
	return '‴'.repeat(Math.floor(n / 3)) + PRIME_GLYPH[n % 3];
}

/**
 * Primes in their canonical spelling: every run of `'`, `’`, `′`, `″`, `‴` or
 * `⁗` becomes the glyph for its total count (`L''` and `L′′` → `L″`).
 * Everything else is kept as typed.
 */
export function normalizePrimes(text: string): string {
	return text.replace(PRIME_RUN, (run) =>
		primeGlyphs([...run].reduce((n, c) => n + (PRIME_COUNT[c] ?? 0), 0))
	);
}

/** Splits a name into its main part and subscript, with primes in their canonical spelling. */
export function parseLang(text: string): LangParts {
	const t = normalizePrimes(text.trim().replace(/\s+/g, ' '));
	const i = t.indexOf('_');
	if (i <= 0) return { main: t, sub: '' };
	const main = t.slice(0, i).trim();
	let sub = t.slice(i + 1).trim();
	if (sub.startsWith('{') && sub.endsWith('}')) sub = sub.slice(1, -1).trim();
	return { main, sub };
}

/**
 * The canonical spelling of a name: primes as `′`, `″` or `‴`, single spaces,
 * and the subscript as `_SUB`. Used to compare languages and to print them in
 * text.
 */
export function normalizeLang(text: string): string {
	const { main, sub } = parseLang(text);
	return sub ? `${main}_${sub}` : main;
}

const glyphs = (s: string) => [...s].length;

/**
 * Width of a name field, in characters: what it holds (or its placeholder
 * when empty), at least one. Browsers without `field-sizing: content` size
 * the field from this.
 */
export function fieldChars(value: string, placeholder = ''): number {
	return Math.max(1, glyphs(value || placeholder));
}

/** Width of a name drawn in the monospace font at `fontSize` px (subscript included). */
export function labelWidth(text: string, fontSize: number): number {
	const { main, sub } = parseLang(text);
	return MONO_ADVANCE * fontSize * (glyphs(main) + SUB_SCALE * glyphs(sub));
}

/** A name for screen readers: `M_OTHER` → "M OTHER"; empty → "blank". */
export function spokenLang(text: string): string {
	const { main, sub } = parseLang(text);
	if (!main && !sub) return 'blank';
	return sub ? `${main} ${sub}` : main;
}
