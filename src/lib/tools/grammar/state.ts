/**
 * The Context-Free Grammars tool's state in the URL hash: its shape, defaults
 * and validation. The hash also accepts `LinkStates['grammar']`
 * (`{ grammar, input? }`), the shape other tools link with.
 */
import type { LinkStates } from '$lib/tools/links';

/** Which non-terminal of a sentential form the builder lets a step replace. */
export type ReplaceOrder = 'any' | 'leftmost' | 'rightmost';

export const REPLACE_ORDERS: readonly ReplaceOrder[] = ['any', 'leftmost', 'rightmost'];

/**
 * One derivation step as it is saved: the position, in the form before the
 * step, of the non-terminal that is replaced, and the id of the production
 * that replaces it.
 */
export type StepPair = [index: number, production: number];

export interface GrammarToolState {
	/** Grammar text in lecture notation. */
	grammar: string;
	/** Token string of the Membership panel. */
	input: string;
	/** Test strings, one token string per row. */
	tests: string[];
	order: ReplaceOrder;
	/** The derivation in the builder, from the start symbol. */
	steps: StepPair[];
	/** Show the leftmost / rightmost derivation of the builder's tree. */
	lm: boolean;
	rm: boolean;
	/** Longest sentence listed in the Language panel, in tokens. */
	maxLength: number;
	/** Seed of the random sentence shown; null before the button is used. */
	seed: number | null;
	/** Id of the preset that was loaded, for its questions and the check mark in the menu. */
	preset: string | null;
}

export const MAX_LENGTH_LIMIT = 10;
export const DEFAULT_MAX_LENGTH = 5;
/** Test rows kept. */
export const MAX_TESTS = 30;
/** Derivation steps the builder keeps. */
export const MAX_STEPS = 200;
/** Seeds are unsigned 32-bit integers. */
export const MAX_SEED = 0xffff_ffff;

export function blankState(): GrammarToolState {
	return {
		grammar: '',
		input: '',
		tests: [],
		order: 'any',
		steps: [],
		lm: false,
		rm: false,
		maxLength: DEFAULT_MAX_LENGTH,
		seed: null,
		preset: null
	};
}

/** What the URL hash may hold: a link from another tool, or this tool's own saved state. */
export type GrammarHash = LinkStates['grammar'] & Partial<GrammarToolState>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
const isString = (x: unknown) => typeof x === 'string';
const isBoolean = (x: unknown) => typeof x === 'boolean';
const isIndex = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isStepPair = (x: unknown) => Array.isArray(x) && x.length === 2 && x.every(isIndex);

/**
 * Accepts this tool's saved state and the `LinkStates['grammar']` shape (only
 * `grammar` is required). Extra fields are ignored.
 */
export function isGrammarHash(v: unknown): v is GrammarHash {
	if (!isRecord(v) || typeof v.grammar !== 'string') return false;
	return (
		optional(v.input, isString) &&
		optional(v.tests, (x) => Array.isArray(x) && x.every(isString)) &&
		optional(v.order, (x) => REPLACE_ORDERS.includes(x as ReplaceOrder)) &&
		optional(v.steps, (x) => Array.isArray(x) && x.every(isStepPair)) &&
		optional(v.lm, isBoolean) &&
		optional(v.rm, isBoolean) &&
		optional(v.maxLength, (x) => typeof x === 'number' && Number.isFinite(x)) &&
		optional(v.seed, (x) => x === null || (isIndex(x) && (x as number) <= MAX_SEED)) &&
		optional(v.preset, (x) => x === null || isString(x))
	);
}

/** A complete state from a loaded value; missing fields take their blank defaults. */
export function stateFromHash(v: GrammarHash): GrammarToolState {
	const base = blankState();
	return {
		grammar: v.grammar,
		input: v.input ?? base.input,
		tests: (v.tests ?? base.tests).slice(0, MAX_TESTS),
		order: v.order ?? base.order,
		steps: (v.steps ?? base.steps).slice(0, MAX_STEPS).map(([i, p]): StepPair => [i, p]),
		lm: v.lm ?? base.lm,
		rm: v.rm ?? base.rm,
		maxLength: Math.max(0, Math.min(MAX_LENGTH_LIMIT, Math.round(v.maxLength ?? base.maxLength))),
		seed: v.seed ?? base.seed,
		preset: v.preset ?? base.preset
	};
}
