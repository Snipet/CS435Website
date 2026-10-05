/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['rd-backtracking']` ({ grammar, input? })
 * as well as its own saved shape, which adds the view options and the steps
 * being shown.
 */
import type { LinkStates } from '$lib/tools/links';

export type TabId = 'backtracking' | 'functions';

export interface RdState {
	/** Grammar text in lecture notation. */
	grammar: string;
	/** Token string, space-separated. */
	input: string;
	tab: TabId;
	/** Number the instances of non-terminals: E0, T1 … (slides 18–20). */
	numbers: boolean;
	/** Run a left-recursive grammar anyway, with a depth cap. */
	anyway: boolean;
	/** Step shown on the Backtracking tab (0-based); null shows the last step. */
	step: number | null;
	/** Step shown on the bool functions tab; null shows the last step. */
	fstep: number | null;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type RdHash = LinkStates['rd-backtracking'] & Partial<Omit<RdState, 'grammar' | 'input'>>;

/**
 * Example 1 (Top-Down Parsing, slides 4–16) at its first step, where slide 5
 * starts. An edit shows the last step instead (see `step`).
 */
export const DEFAULT_STATE: RdState = {
	grammar: 'E → T | T + E\nT → int | int * T | ( E )',
	input: '( int )',
	tab: 'backtracking',
	numbers: false,
	anyway: false,
	step: 0,
	fstep: 0
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isStep = (v: unknown): boolean =>
	v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

const isFlag = (v: unknown): boolean => v === undefined || typeof v === 'boolean';

/** Accepts `{ grammar, input?, tab?, numbers?, anyway?, step?, fstep? }`; extra fields are ignored. */
export function isRdHash(value: unknown): value is RdHash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	if (value.input !== undefined && typeof value.input !== 'string') return false;
	if (value.tab !== undefined && value.tab !== 'backtracking' && value.tab !== 'functions')
		return false;
	return isFlag(value.numbers) && isFlag(value.anyway) && isStep(value.step) && isStep(value.fstep);
}

/**
 * The state a hash value describes. Missing options are off, and a link
 * without a step (one from another tool) shows the last step: the finished
 * parse.
 */
export function stateFromHash(value: RdHash): RdState {
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		tab: value.tab ?? 'backtracking',
		numbers: value.numbers ?? false,
		anyway: value.anyway ?? false,
		step: typeof value.step === 'number' ? value.step : null,
		fstep: typeof value.fstep === 'number' ? value.fstep : null
	};
}
