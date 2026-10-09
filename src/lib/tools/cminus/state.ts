/**
 * The C- Compiler page's state in the URL hash: its shape, defaults and
 * validation. The hash also accepts `LinkStates['cminus']`
 * (`{ source, input? }`), the shape other tools link with.
 */
import type { IdentifierMode } from '$lib/theory/cminus';
import type { LinkStates } from '$lib/tools/links';
import { DEFAULT_PRESET } from './presets';

/** The tabs beside the source, in the order of the phases. */
export const TABS = ['tokens', 'syntax', 'semantics', 'ir', 'code', 'run', 'language'] as const;
export type TabId = (typeof TABS)[number];

/** Which of the two versions a tab with two shows: as generated, or after its optimizing pass. */
export const VERSIONS = ['before', 'after'] as const;
export type Version = (typeof VERSIONS)[number];

export const IDENTIFIER_MODES: readonly IdentifierMode[] = ['letters', 'extended'];

/** Programs longer than this are not compiled. */
export const MAX_SOURCE = 20_000;

export interface CminusState {
	/** C- program text. */
	source: string;
	/** The numbers the program reads, separated by spaces or line breaks. */
	input: string;
	/** Run the optimizer. */
	optimize: boolean;
	/** `letters`: ID = letter letter*. `extended`: letter (letter | digit | _)*. */
	identifiers: IdentifierMode;
	tab: TabId;
	/** Intermediate code shown: as generated, or after the optimizer. */
	ir: Version;
	/** Target code shown: before or after the peephole pass. */
	code: Version;
	/** List comments in the token table. */
	comments: boolean;
	/** The selected range of the source `[start, end)`; null when nothing is selected. */
	sel: [start: number, end: number] | null;
}

export function defaultState(): CminusState {
	return {
		source: DEFAULT_PRESET.value.source,
		input: DEFAULT_PRESET.value.input,
		optimize: true,
		identifiers: 'letters',
		tab: 'tokens',
		ir: 'before',
		code: 'before',
		comments: false,
		sel: null
	};
}

/** What the URL hash may hold: a link from another tool, or this page's own saved state. */
export type CminusHash = LinkStates['cminus'] & Partial<CminusState>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
const isString = (x: unknown) => typeof x === 'string';
const isBoolean = (x: unknown) => typeof x === 'boolean';
const oneOf =
	<T>(values: readonly T[]) =>
	(x: unknown) =>
		values.includes(x as T);
const isOffset = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isRange = (x: unknown) =>
	x === null || (Array.isArray(x) && x.length === 2 && x.every(isOffset) && x[0] <= x[1]);

/**
 * Accepts this page's saved state and the `LinkStates['cminus']` shape (only
 * `source` is required). Extra fields are ignored.
 */
export function isCminusHash(v: unknown): v is CminusHash {
	if (!isRecord(v) || typeof v.source !== 'string') return false;
	return (
		optional(v.input, isString) &&
		optional(v.optimize, isBoolean) &&
		optional(v.identifiers, oneOf(IDENTIFIER_MODES)) &&
		optional(v.tab, oneOf(TABS)) &&
		optional(v.ir, oneOf(VERSIONS)) &&
		optional(v.code, oneOf(VERSIONS)) &&
		optional(v.comments, isBoolean) &&
		optional(v.sel, isRange)
	);
}

/** A range that lies in a text of `length` characters and is not empty, or null. */
export function clampSelection(
	sel: readonly [number, number] | null | undefined,
	length: number
): [number, number] | null {
	if (!sel) return null;
	const start = Math.max(0, Math.min(sel[0], length));
	const end = Math.max(start, Math.min(sel[1], length));
	return end > start ? [start, end] : null;
}

/** Text with the line breaks a text field keeps: `\r\n` and `\r` become `\n`. */
export const lineBreaks = (text: string) => text.replace(/\r\n?/g, '\n');

/**
 * A complete state from a loaded value; missing fields take their defaults.
 * Line breaks are written as the editor writes them, so that offsets in the
 * state are offsets in the editor.
 */
export function stateFromHash(v: CminusHash): CminusState {
	const base = defaultState();
	const source = lineBreaks(v.source);
	return {
		source,
		input: lineBreaks(v.input ?? ''),
		optimize: v.optimize ?? base.optimize,
		identifiers: v.identifiers ?? base.identifiers,
		tab: v.tab ?? base.tab,
		ir: v.ir ?? base.ir,
		code: v.code ?? base.code,
		comments: v.comments ?? base.comments,
		// A selection saved by this page counts in the text as the editor holds it.
		sel: source === v.source ? clampSelection(v.sel, source.length) : null
	};
}
