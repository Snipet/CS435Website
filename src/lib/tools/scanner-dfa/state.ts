/**
 * The tool's saved state (URL hash) and how links from other tools map onto it.
 */
import type { LinkStates, RuleState } from '$lib/tools/links';
import type { Mode } from './driver';
import type { MachineId } from './machines';
import { LEX2_DEFS, LEX2_RULES } from './presets';
import { SWITCH_INPUTS, type SwitchInput } from './switch';

export type TabId = 'table' | 'switch' | 'sizes';
export type SourceId = 'rules' | MachineId;

export interface ScannerDfaState {
	tab: TabId;
	/** Where the table-driven DFA comes from: the rules, or a DFA from the slides. */
	source: SourceId;
	/** Helper definitions, one `name = RE` per line. */
	defs: string;
	rules: RuleState[];
	/** Input for the table-driven scanner. */
	input: string;
	/** Minimize the DFA built from the rules. */
	minimal: boolean;
	mode: Mode;
	/** Input for the hand-coded getToken (). */
	switchInput: SwitchInput;
	/** Add `break;` after each case of the hand-coded switch. */
	breaks: boolean;
	/** The input each other source had, restored when switching back to it. */
	inputs: Partial<Record<SourceId, string>>;
}

export const TABS: readonly TabId[] = ['table', 'switch', 'sizes'];
export const SOURCES: readonly SourceId[] = ['rules', 'relop', 'stu'];
export const MODES: readonly Mode[] = ['first', 'longest'];

/** Input shown when switching to a source for the first time. */
export const SOURCE_INPUTS: Record<SourceId, string> = {
	rules: 'f+3  +g',
	relop: '<=',
	stu: '0110'
};

/**
 * First load: relop on "<=" (Lexical Analysis IV, slides 16–19). The rules
 * start as Lexical Analysis II's R = Whitespace | Integer | Identifier | '+'.
 */
export const DEFAULT_STATE: ScannerDfaState = {
	tab: 'table',
	source: 'relop',
	defs: LEX2_DEFS,
	rules: LEX2_RULES,
	input: '<=',
	minimal: false,
	mode: 'first',
	switchInput: '<=',
	breaks: false,
	inputs: {}
};

/** Largest input the page keeps (characters). */
export const MAX_INPUT = 2000;
/** Most rules the page keeps. */
export const MAX_RULES = 40;

/** The state saved in the hash, or the `LinkStates['scanner-dfa']` shape another tool links with. */
export type SavedState = Partial<ScannerDfaState> & Partial<LinkStates['scanner-dfa']>;

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function isRuleState(v: unknown): v is RuleState {
	return (
		isObject(v) &&
		typeof v.name === 'string' &&
		typeof v.re === 'string' &&
		(v.drop === undefined || typeof v.drop === 'boolean')
	);
}

const oneOf =
	<T>(values: readonly T[]) =>
	(v: unknown): v is T =>
		values.includes(v as T);

const FIELDS: Record<keyof ScannerDfaState, (v: unknown) => boolean> = {
	tab: oneOf(TABS),
	source: oneOf(SOURCES),
	defs: (v) => typeof v === 'string',
	rules: (v) => Array.isArray(v) && v.length <= MAX_RULES && v.every(isRuleState),
	input: (v) => typeof v === 'string' && v.length <= MAX_INPUT,
	minimal: (v) => typeof v === 'boolean',
	mode: oneOf(MODES),
	switchInput: oneOf(SWITCH_INPUTS),
	breaks: (v) => typeof v === 'boolean',
	inputs: (v) =>
		isObject(v) &&
		Object.entries(v).every(
			([k, x]) => SOURCES.includes(k as SourceId) && typeof x === 'string' && x.length <= MAX_INPUT
		)
};

/**
 * Accepts the tool's own saved state (any subset of its fields) and the
 * `{ defs?, rules, input }` link shape; rejects values with a known field of
 * the wrong type, and objects with none of the fields.
 */
export function isSavedState(v: unknown): v is SavedState {
	if (!isObject(v)) return false;
	let known = 0;
	for (const [key, check] of Object.entries(FIELDS)) {
		if (!(key in v) || v[key] === undefined) continue;
		if (!check(v[key])) return false;
		known++;
	}
	return known > 0;
}

/**
 * The state after loading `saved` over `base`. A link that brings rules but
 * no source opens them on the table-driven tab with the longest match (the
 * rule the other scanner tools use).
 */
export function loadState(base: ScannerDfaState, saved: SavedState): ScannerDfaState {
	const out: ScannerDfaState = {
		...base,
		rules: base.rules.map((r) => ({ ...r })),
		inputs: { ...base.inputs }
	};
	const link = saved.rules !== undefined && saved.source === undefined;
	if (link) {
		out.source = 'rules';
		out.tab = 'table';
		out.mode = 'longest';
		out.defs = '';
	}
	for (const key of Object.keys(FIELDS) as (keyof ScannerDfaState)[]) {
		const value = saved[key];
		if (value === undefined) continue;
		(out as unknown as Record<string, unknown>)[key] =
			key === 'rules'
				? (value as RuleState[]).map((r) => ({ ...r }))
				: key === 'inputs'
					? { ...(value as object) }
					: value;
	}
	return out;
}
