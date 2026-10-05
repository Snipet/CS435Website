/**
 * The Ambiguity and Precedence page's user-editable state, kept in the URL
 * hash. The hash accepts the cross-tool link shape `LinkStates['ambiguity']`
 * ({ grammar, input? }) as well as the page's own saved shape, which adds the
 * fields below; a field that is missing takes its value from BLANK_STATE.
 *
 * Occurrence labels. `input` is always the token string the grammar reads,
 * e.g. `if OTHER then if OTHER then OTHER else OTHER`. `labels` holds the
 * display mapping as text, `OTHER = E` (several items are separated by
 * commas): the k-th token that is OTHER is displayed as E with the subscript
 * k, which gives the slides' `if E₁ then if E₂ then E₃ else E₄`. Only the
 * display changes: the token string above the trees and the leaves of the
 * trees. See labels.ts.
 *
 * Leftmost derivations. Every listed tree has a switch for its leftmost
 * derivation, and the page has one for all of them. `derivations` is the
 * switch for all; `flipped` holds the numbers of the trees that are the other
 * way round, so the two fields together say which derivations are open.
 */
import type { LinkStates } from '$lib/tools/links';
import { DEFAULT_ATOMS, DEFAULT_LEVELS, MAX_LEVELS, type CascadeLevel } from './cascade';
import { DEFAULT_LENGTH, clampLength } from './compare';
import { ASSOCS, type Declaration } from './declarations';
import { TREE_LIMIT } from './model';

export type TabId = 'rewrite' | 'declarations';
export const TAB_IDS: readonly TabId[] = ['rewrite', 'declarations'];

/** Most declaration lines kept. */
export const MAX_DECLARATIONS = 12;

export interface AmbiguityState {
	/** The grammar, in lecture notation. */
	grammar: string;
	/** The token string, space-separated, in the grammar's terminals. */
	input: string;
	/** Occurrence labels, `OTHER = E` (see above); '' for none. */
	labels: string;
	/** One number per operand token (`int`, `id`), space-separated; '' for none. */
	values: string;
	/** Draw the trees in abbreviated form: a keyword or operator with its sub-expressions. */
	abbreviated: boolean;
	/** Show the leftmost derivation of every listed tree. */
	derivations: boolean;
	/**
	 * Numbers of the listed trees whose derivation is the other way round:
	 * shown while `derivations` is off, hidden while it is on. Ascending.
	 */
	flipped: number[];
	tab: TabId;
	/** The rewritten grammar; '' when none has been entered. */
	rewrite: string;
	/** The precedence cascade builder: operator levels from lowest to highest precedence … */
	levels: CascadeLevel[];
	/** … and the alternatives of its last non-terminal. */
	atoms: string;
	/** Longest sentence compared by "Same strings?" (1–9 tokens). */
	maxLength: number;
	/** Declaration lines, lowest precedence first. */
	decls: Declaration[];
}

/** The leftmost derivation of the listed tree numbered `n` is shown. */
export function derivationShown(
	state: Pick<AmbiguityState, 'derivations' | 'flipped'>,
	n: number
): boolean {
	return state.derivations !== state.flipped.includes(n);
}

/** `flipped` after the switch of tree `n` is set to `show`. */
export function flipDerivation(
	state: Pick<AmbiguityState, 'derivations' | 'flipped'>,
	n: number,
	show: boolean
): number[] {
	if (show === derivationShown(state, n)) return state.flipped;
	return state.flipped.includes(n)
		? state.flipped.filter((k) => k !== n)
		: [...state.flipped, n].sort((a, b) => a - b);
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type AmbiguityHash = LinkStates['ambiguity'] & Partial<AmbiguityState>;

/** The page with nothing entered but the cascade builder's starting rows. */
export const BLANK_STATE: AmbiguityState = {
	grammar: '',
	input: '',
	labels: '',
	values: '',
	abbreviated: false,
	derivations: false,
	flipped: [],
	tab: 'rewrite',
	rewrite: '',
	levels: DEFAULT_LEVELS.map((level) => ({ ...level })),
	atoms: DEFAULT_ATOMS,
	maxLength: DEFAULT_LENGTH,
	decls: []
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const optional = (v: unknown, type: 'string' | 'boolean' | 'number'): boolean =>
	v === undefined || typeof v === type;

const isLevel = (v: unknown): v is CascadeLevel =>
	isRecord(v) && typeof v.ops === 'string' && (v.assoc === 'left' || v.assoc === 'right');
const isDeclaration = (v: unknown): v is Declaration =>
	isRecord(v) &&
	typeof v.ops === 'string' &&
	typeof v.assoc === 'string' &&
	(ASSOCS as readonly string[]).includes(v.assoc);

/**
 * Accepts `{ grammar, input? }` and the saved shape; fields of the wrong type
 * reject the value, extra fields are ignored.
 */
export function isAmbiguityHash(value: unknown): value is AmbiguityHash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	for (const key of ['input', 'labels', 'values', 'rewrite', 'atoms'])
		if (!optional(value[key], 'string')) return false;
	for (const key of ['abbreviated', 'derivations'])
		if (!optional(value[key], 'boolean')) return false;
	if (value.maxLength !== undefined && !Number.isFinite(value.maxLength)) return false;
	if (
		value.flipped !== undefined &&
		!(Array.isArray(value.flipped) && value.flipped.every((n) => Number.isInteger(n)))
	)
		return false;
	if (value.tab !== undefined && !(TAB_IDS as readonly unknown[]).includes(value.tab)) return false;
	if (value.levels !== undefined && !(Array.isArray(value.levels) && value.levels.every(isLevel)))
		return false;
	if (
		value.decls !== undefined &&
		!(Array.isArray(value.decls) && value.decls.every(isDeclaration))
	)
		return false;
	return true;
}

/** The state a hash value (or a preset) describes; missing fields come from BLANK_STATE. */
export function stateFromHash(value: AmbiguityHash): AmbiguityState {
	return {
		grammar: value.grammar,
		input: value.input ?? BLANK_STATE.input,
		labels: value.labels ?? BLANK_STATE.labels,
		values: value.values ?? BLANK_STATE.values,
		abbreviated: value.abbreviated ?? BLANK_STATE.abbreviated,
		derivations: value.derivations ?? BLANK_STATE.derivations,
		flipped: [...new Set(value.flipped ?? BLANK_STATE.flipped)]
			.filter((n) => n >= 1 && n <= TREE_LIMIT)
			.sort((a, b) => a - b),
		tab: value.tab ?? BLANK_STATE.tab,
		rewrite: value.rewrite ?? BLANK_STATE.rewrite,
		levels: (value.levels ?? BLANK_STATE.levels)
			.slice(0, MAX_LEVELS)
			.map(({ ops, assoc }) => ({ ops, assoc })),
		atoms: value.atoms ?? BLANK_STATE.atoms,
		maxLength: clampLength(value.maxLength ?? BLANK_STATE.maxLength),
		decls: (value.decls ?? BLANK_STATE.decls)
			.slice(0, MAX_DECLARATIONS)
			.map(({ ops, assoc }) => ({ ops, assoc }))
	};
}
