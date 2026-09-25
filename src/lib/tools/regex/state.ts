/**
 * The Regular Expressions tool's URL state: its shape, defaults, validation
 * (it must also accept `LinkStates['regex']` from other tools), and the escape
 * form used to type test strings with tabs and newlines.
 */
import type { LinkStates } from '$lib/tools/links';

export type Dialect = 'lecture' | 'flex';
export type ViewId = 'structure' | 'language' | 'tests' | 'compare';

export const VIEW_IDS: readonly ViewId[] = ['structure', 'language', 'tests', 'compare'];

export interface RegexToolState {
	/** R, in the chosen dialect. */
	re: string;
	/** Regular definitions: `name = RE` lines (lecture) or `NAME pattern` lines (flex). */
	defs: string;
	dialect: Dialect;
	/** Σ as typed; empty means Σ is inferred from R. */
	alphabet: string;
	/** Test strings (raw, not escaped). */
	tests: string[];
	/** R₂ for the comparison. */
	compare: string;
	/** Longest string listed in the Language view. */
	maxLength: number;
	/** Show sub-expressions fully parenthesized. */
	full: boolean;
	/** Selected node of the syntax tree, as child indices from the root. */
	node: number[];
	/** Tab shown on narrow screens. */
	view: ViewId;
}

export const MAX_LENGTH_LIMIT = 12;
export const DEFAULT_MAX_LENGTH = 6;
/** Test rows kept from a link. */
export const MAX_TESTS = 40;

export function blankState(): RegexToolState {
	return {
		re: '',
		defs: '',
		dialect: 'lecture',
		alphabet: '',
		tests: [],
		compare: '',
		maxLength: DEFAULT_MAX_LENGTH,
		full: false,
		node: [],
		view: 'structure'
	};
}

/** What the URL hash may hold: a link from another tool, or this tool's own saved state. */
export type RegexLinkState = LinkStates['regex'] & Partial<RegexToolState>;

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
const isString = (x: unknown) => typeof x === 'string';

/**
 * Accepts this tool's saved state and the `LinkStates['regex']` shape other
 * tools link with (only `re` is required).
 */
export function isRegexState(v: unknown): v is RegexLinkState {
	if (!isObject(v) || typeof v.re !== 'string') return false;
	return (
		optional(v.defs, isString) &&
		optional(v.dialect, (x) => x === 'lecture' || x === 'flex') &&
		optional(v.alphabet, isString) &&
		optional(v.tests, (x) => Array.isArray(x) && x.every(isString)) &&
		optional(v.compare, isString) &&
		optional(v.maxLength, (x) => typeof x === 'number' && Number.isFinite(x)) &&
		optional(v.full, (x) => typeof x === 'boolean') &&
		optional(
			v.node,
			(x) => Array.isArray(x) && x.every((i) => Number.isInteger(i) && (i as number) >= 0)
		) &&
		optional(v.view, (x) => VIEW_IDS.includes(x as ViewId))
	);
}

/** A complete state from a loaded value; missing fields take their blank defaults. */
export function normalizeState(v: RegexLinkState): RegexToolState {
	const base = blankState();
	return {
		re: v.re,
		defs: v.defs ?? base.defs,
		dialect: v.dialect ?? base.dialect,
		alphabet: v.alphabet ?? base.alphabet,
		tests: (v.tests ?? base.tests).slice(0, MAX_TESTS),
		compare: v.compare ?? base.compare,
		maxLength: Math.max(0, Math.min(MAX_LENGTH_LIMIT, Math.round(v.maxLength ?? base.maxLength))),
		full: v.full ?? base.full,
		node: v.node ?? base.node,
		view: v.view ?? base.view
	};
}

// ---------------------------------------------------------------------------
// Test strings: typed with escapes so tabs and newlines fit in one line.
// ---------------------------------------------------------------------------

const ESCAPES: Record<string, string> = { t: '\t', n: '\n', r: '\r', '\\': '\\' };
const NAMED: Record<string, string> = { '\t': '\\t', '\n': '\\n', '\r': '\\r' };

/**
 * Reads the typed form of a test string: `\t`, `\n`, `\r` and `\\` are
 * escapes; any other backslash stands for itself.
 */
export function unescapeTest(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];
		if (ch === '\\' && next !== undefined && ESCAPES[next] !== undefined) {
			out += ESCAPES[next];
			i++;
		} else out += ch;
	}
	return out;
}

/** The typed form of a test string; `unescapeTest(escapeTest(s)) === s`. */
export function escapeTest(s: string): string {
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (NAMED[ch]) out += NAMED[ch];
		else if (ch === '\\') {
			// Doubled only where the typed form would otherwise read it as the start
			// of an escape: before t, n, r, or anything written with a backslash.
			const next = s[i + 1];
			out += next !== undefined && 'tnr\\\t\n\r'.includes(next) ? '\\\\' : '\\';
		} else out += ch;
	}
	return out;
}
