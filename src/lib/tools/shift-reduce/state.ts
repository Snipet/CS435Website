/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['shift-reduce']` ({ grammar, input? }) as
 * well as its own saved shape, which adds the view, the trace options and the
 * steps being shown. Extra fields (such as the `precedence` of a link meant
 * for the conflicts tool) are ignored.
 */
import type { LinkStates } from '$lib/tools/links';

/** The two views: the shift-reduce trace and the handles of the reductions. */
export type ViewId = 'trace' | 'handles';

export interface ShiftReduceState {
	/** Grammar text in lecture notation. */
	grammar: string;
	/** Token string, space-separated; a closing `$` may be written or left out. */
	input: string;
	view: ViewId;
	/** Consecutive shifts on one row, "shift 3 times" (Bottom-up Parsing II, slide 14). */
	collapse: boolean;
	/** The DFA state of every stack symbol, under the symbol. */
	stacks: boolean;
	/** Row of the trace shown (0-based, in the rows as listed); null shows the last row. */
	step: number | null;
	/** Reductions shown in the Handles view; null shows them all. */
	handleStep: number | null;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type ShiftReduceHash = LinkStates['shift-reduce'] &
	Partial<Omit<ShiftReduceState, 'grammar' | 'input'>>;

/** Bottom-up Parsing II, slide 4. */
export const SLIDE_GRAMMAR = 'E → E + ( E ) | int';
/** Bottom-up Parsing II, slide 4: int + (int) + (int)$, written as tokens. */
export const SLIDE_INPUT = 'int + ( int ) + ( int )';

/** The slide 14 trace, complete. */
export const DEFAULT_STATE: ShiftReduceState = {
	grammar: SLIDE_GRAMMAR,
	input: SLIDE_INPUT,
	view: 'trace',
	collapse: true,
	stacks: false,
	step: null,
	handleStep: null
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isStep = (v: unknown): boolean =>
	v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

const isFlag = (v: unknown): boolean => v === undefined || typeof v === 'boolean';

/**
 * Accepts `{ grammar, input?, view?, collapse?, stacks?, step?, handleStep? }`;
 * extra fields are ignored.
 */
export function isShiftReduceHash(value: unknown): value is ShiftReduceHash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	if (value.input !== undefined && typeof value.input !== 'string') return false;
	if (value.view !== undefined && value.view !== 'trace' && value.view !== 'handles') return false;
	return (
		isFlag(value.collapse) && isFlag(value.stacks) && isStep(value.step) && isStep(value.handleStep)
	);
}

/**
 * The state a hash value describes. A link from another tool has only the
 * grammar and perhaps a token string: it opens on the whole trace, with
 * consecutive shifts collapsed as on slide 14.
 */
export function stateFromHash(value: ShiftReduceHash): ShiftReduceState {
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		view: value.view ?? 'trace',
		collapse: value.collapse ?? true,
		stacks: value.stacks ?? false,
		step: typeof value.step === 'number' ? value.step : null,
		handleStep: typeof value.handleStep === 'number' ? value.handleStep : null
	};
}
