/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['lr1']` ({ grammar, input? }) as well as
 * its own saved shape, which adds the options and the steps being shown.
 */
import type { LinkStates } from '$lib/tools/links';
import { METHODS, type ClosureOrder, type Method } from './build';
import type { ItemForm } from './items';

export type DfaView = 'boxes' | 'circles';
export type ClosureMode = 'closure' | 'transition';

export interface Lr1State {
	/** The grammar, in lecture notation. */
	grammar: string;
	/** The token string to parse, space-separated; `$` is added at the end. */
	input: string;
	/** The order in which Closure adds a non-terminal's productions. */
	order: ClosureOrder;
	/** How the table is built: LR(1) (the decks) or a method the decks only name. */
	method: Method;
	/** Items one per line, or merged per core with lookaheads `$/+`. */
	items: ItemForm;
	/** The DFA as item-set boxes (Bottom-up Parsing III, slide 14) or as circles (Bottom-up Parsing II, slide 17). */
	view: DfaView;
	/** The states drawn and tabled, [first, last]; null: all of a small automaton, else the first window. */
	range: [number, number] | null;
	/** What the Closure stepper runs: Closure(Items) or Transition(state, y). */
	closure: ClosureMode;
	/** The items Closure starts from, one per line; '' is [S → •E, $]. */
	seed: string;
	/** Transition(state, y): the state … */
	from: number;
	/** … and the symbol ('' for the state's first). */
	symbol: string;
	/** Steps shown (0-based); null shows the last. */
	closureStep: number | null;
	buildStep: number | null;
	parseStep: number | null;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type Lr1Hash = LinkStates['lr1'] & Partial<Omit<Lr1State, 'grammar' | 'input'>>;

/** Bottom-up Parsing II, slide 4. */
export const DEFAULT_GRAMMAR = 'E → E + ( E ) | int';

export const DEFAULT_STATE: Lr1State = {
	grammar: DEFAULT_GRAMMAR,
	input: 'int + ( int ) + ( int )',
	order: 'grammar',
	method: 'lr1',
	items: 'abbreviated',
	view: 'boxes',
	range: null,
	closure: 'closure',
	seed: '',
	from: 0,
	symbol: '',
	closureStep: null,
	buildStep: null,
	parseStep: null
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isIndex = (v: unknown): v is number =>
	typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1e7;

const isStep = (v: unknown): boolean => v === undefined || v === null || isIndex(v);

const isOneOf = (v: unknown, values: readonly unknown[]): boolean =>
	v === undefined || values.includes(v);

const isRange = (v: unknown): boolean =>
	v === undefined ||
	v === null ||
	(Array.isArray(v) && v.length === 2 && isIndex(v[0]) && isIndex(v[1]) && v[0] <= v[1]);

/** Accepts `{ grammar, input?, … }` with the fields of `Lr1State`; extra fields are ignored. */
export function isLr1Hash(value: unknown): value is Lr1Hash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	for (const key of ['input', 'seed', 'symbol'] as const)
		if (value[key] !== undefined && typeof value[key] !== 'string') return false;
	return (
		isOneOf(value.order, ['grammar', 'reversed']) &&
		isOneOf(value.method, METHODS) &&
		isOneOf(value.items, ['abbreviated', 'full']) &&
		isOneOf(value.view, ['boxes', 'circles']) &&
		isOneOf(value.closure, ['closure', 'transition']) &&
		(value.from === undefined || isIndex(value.from)) &&
		isRange(value.range) &&
		isStep(value.closureStep) &&
		isStep(value.buildStep) &&
		isStep(value.parseStep)
	);
}

/**
 * The state a hash value describes. A link from another tool has only the
 * grammar and perhaps a token string: the tool then opens with the decks'
 * defaults and every stepper at its end.
 */
export function stateFromHash(value: Lr1Hash): Lr1State {
	const d = DEFAULT_STATE;
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		order: value.order ?? d.order,
		method: value.method ?? d.method,
		items: value.items ?? d.items,
		view: value.view ?? d.view,
		range: Array.isArray(value.range) ? [value.range[0], value.range[1]] : null,
		closure: value.closure ?? d.closure,
		seed: value.seed ?? '',
		from: value.from ?? 0,
		symbol: value.symbol ?? '',
		closureStep: typeof value.closureStep === 'number' ? value.closureStep : null,
		buildStep: typeof value.buildStep === 'number' ? value.buildStep : null,
		parseStep: typeof value.parseStep === 'number' ? value.parseStep : null
	};
}
