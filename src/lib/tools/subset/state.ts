/**
 * The page's URL-hash state. The hash also accepts the cross-tool link shape
 * `LinkStates['subset']` ({ from: 're', re, defs? } or { from: 'nfa', text }).
 */
import type { SubsetNaming } from '$lib/theory/automata';
import type { LinkStates } from '$lib/tools/links';
import { BLOWUP_MAX_K, BLOWUP_MIN_K, MAX_RUN_INPUT } from './logic';
import { DEFAULT_PRESET, type SubsetPresetValue } from './presets';

export type TabId = 'closure' | 'predict' | 'run' | 'blowup';
export const TAB_IDS: readonly TabId[] = ['closure', 'predict', 'run', 'blowup'];
export const NAMINGS: readonly SubsetNaming[] = ['discovery', 'sorted-set', 'numbered'];

export interface SubsetState {
	from: 're' | 'nfa';
	/** Lecture-notation regular expression (source 're'). */
	re: string;
	/** Regular definitions, one `name = RE` per line (source 're'). */
	defs: string;
	/** NFA in the automaton text format (source 'nfa'). */
	text: string;
	naming: SubsetNaming;
	/** Keep the ∅ state (empty set of NFA states) as a DFA state. */
	showEmpty: boolean;
	tab: TabId;
	/** Predict each target before it is revealed. */
	predict: boolean;
	/** Input for the side-by-side run. */
	input: string;
	/** k of (0 | 1)* 1 (0|1)^k on the blow-up tab. */
	k: number;
	/** NFA states picked on the ε-closure tab, in the order picked. */
	seeds: number[];
}

/** What the hash may hold: a link state, or the page's own state plus the step. */
export type SubsetHash = LinkStates['subset'] & Partial<SubsetState> & { step?: number };

type Source = Pick<SubsetState, 'from' | 're' | 'defs' | 'text'>;

/** The default preset's regular expression and definitions. */
export function defaultRe(): Pick<SubsetState, 're' | 'defs'> {
	const v = DEFAULT_PRESET.value;
	return v.from === 're' ? { re: v.re, defs: v.defs ?? '' } : { re: '', defs: '' };
}

/**
 * The source fields a preset fills in. A regular-expression preset clears the
 * NFA text (switching to "From an NFA" then starts from its Thompson NFA); an
 * NFA preset keeps the regular expression of `keep`.
 */
export function presetFields(
	v: SubsetPresetValue,
	keep: Pick<SubsetState, 're' | 'defs'> = defaultRe()
): Source {
	return v.from === 're'
		? { from: 're', re: v.re, defs: v.defs ?? '', text: '' }
		: { from: 'nfa', re: keep.re, defs: keep.defs, text: v.text };
}

/**
 * The source after switching to `from`. "From an NFA" with no text starts
 * from `nfaText` (the NFA shown); "From a regular expression" with none
 * starts from the default preset's.
 */
export function switchSource(s: Source, from: 're' | 'nfa', nfaText: string | null): Source {
	if (from === s.from) return s;
	if (from === 'nfa')
		return { ...s, from, text: s.text.trim() === '' && nfaText !== null ? nfaText : s.text };
	if (s.re.trim() !== '') return { ...s, from };
	const d = defaultRe();
	return { ...s, from, re: d.re, defs: s.defs.trim() === '' ? d.defs : s.defs };
}

export function defaultState(): SubsetState {
	return {
		...presetFields(DEFAULT_PRESET.value, defaultRe()),
		naming: 'discovery',
		showEmpty: false,
		tab: 'closure',
		predict: false,
		input: DEFAULT_PRESET.value.input ?? '',
		k: 2,
		seeds: []
	};
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts `LinkStates['subset']` and the page's own saved state. */
export function isSubsetHash(v: unknown): v is SubsetHash {
	if (!isRecord(v)) return false;
	if (v.from === 're') return typeof v.re === 'string';
	if (v.from === 'nfa') return typeof v.text === 'string';
	return false;
}

/**
 * The state a hash value describes, on top of `base`. Fields of the wrong
 * type are ignored. A link that names one source keeps the other source's
 * text from `base`, so switching back finds it again.
 */
export function stateFromHash(base: SubsetState, v: SubsetHash): SubsetState {
	const next: SubsetState = { ...base, seeds: [...base.seeds], from: v.from };
	const str = (x: unknown): x is string => typeof x === 'string';
	if (str(v.re)) next.re = v.re;
	if (v.from === 're') next.defs = str(v.defs) ? v.defs : '';
	else if (str(v.defs)) next.defs = v.defs;
	if (str(v.text)) next.text = v.text;
	if (NAMINGS.includes(v.naming as SubsetNaming)) next.naming = v.naming as SubsetNaming;
	if (typeof v.showEmpty === 'boolean') next.showEmpty = v.showEmpty;
	if (TAB_IDS.includes(v.tab as TabId)) next.tab = v.tab as TabId;
	if (typeof v.predict === 'boolean') next.predict = v.predict;
	if (str(v.input)) next.input = v.input.slice(0, MAX_RUN_INPUT);
	if (Number.isInteger(v.k) && (v.k as number) >= BLOWUP_MIN_K && (v.k as number) <= BLOWUP_MAX_K)
		next.k = v.k as number;
	if (Array.isArray(v.seeds))
		next.seeds = v.seeds.filter((s): s is number => Number.isInteger(s) && s >= 0);
	return next;
}

/** The step index a hash asks for; null means "the finished construction". */
export function stepFromHash(v: SubsetHash): number | null {
	return Number.isInteger(v.step) && (v.step as number) >= 0 ? (v.step as number) : null;
}
