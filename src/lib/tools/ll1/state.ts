/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['ll1']` ({ grammar, input? }) as well as
 * its own saved shape, which adds the order of the table's rows and columns,
 * the names of the rewrite's new non-terminals, the selected table entry, the
 * steps shown and the fill-in mode.
 */
import type { LinkStates } from '$lib/tools/links';

export interface LL1State {
	/** The grammar, in BNF; the first left-hand side is the start symbol. */
	grammar: string;
	/** Token string, space-separated; `$` is added at the end. */
	input: string;
	/** Order of the table's rows, non-terminals separated by spaces; '' is grammar order. */
	rows: string;
	/** Order of the table's columns, terminals and `$`; '' is grammar order then `$`. */
	columns: string;
	/** Names of the rewrite's new non-terminals, by their default names (`E’` → `X`). */
	names: Record<string, string>;
	/** The selected table entry [A, b]; null for none. */
	cell: [string, string] | null;
	/** Step of the First and Follow computation shown (0-based); null shows the end. */
	setStep: number | null;
	/** Step of the parse shown (0-based); null shows the last row. */
	step: number | null;
	/** The First and Follow cells are left for the user to fill in. */
	fill: boolean;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type LL1Hash = LinkStates['ll1'] & Partial<Omit<LL1State, 'grammar' | 'input'>>;

/** Table-based Predictive Parsing, slides 7–9 and 12: the left-factored grammar, as slides 8–9 box it. */
export const DECK_GRAMMAR = 'E → T X\nX → + E | ε\nT → ( E ) | int Y\nY → * T | ε';
/** The slides' order of the table's rows and columns. */
export const DECK_ROWS = 'T E X Y';
export const DECK_COLUMNS = 'int * + ( ) $';

/** The grammar of the slides with the trace of slide 12 to its last row. */
export const DEFAULT_STATE: LL1State = {
	grammar: DECK_GRAMMAR,
	input: 'int * int',
	rows: DECK_ROWS,
	columns: DECK_COLUMNS,
	names: {},
	cell: null,
	setStep: null,
	step: null,
	fill: false
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isStep = (v: unknown): boolean =>
	v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

const isText = (v: unknown): boolean => v === undefined || typeof v === 'string';

const isNames = (v: unknown): boolean =>
	v === undefined || (isRecord(v) && Object.values(v).every((name) => typeof name === 'string'));

const isCell = (v: unknown): boolean =>
	v === undefined ||
	v === null ||
	(Array.isArray(v) && v.length === 2 && v.every((s) => typeof s === 'string'));

/**
 * Accepts `{ grammar, input?, rows?, columns?, names?, cell?, setStep?, step?, fill? }`;
 * extra fields are ignored.
 */
export function isLL1Hash(value: unknown): value is LL1Hash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	return (
		isText(value.input) &&
		isText(value.rows) &&
		isText(value.columns) &&
		isNames(value.names) &&
		isCell(value.cell) &&
		isStep(value.setStep) &&
		isStep(value.step) &&
		(value.fill === undefined || typeof value.fill === 'boolean')
	);
}

/**
 * The state a hash value describes. A link from another tool has only the
 * grammar and perhaps a token string: the table is then in grammar order and
 * every computation is shown at its end.
 */
export function stateFromHash(value: LL1Hash): LL1State {
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		rows: value.rows ?? '',
		columns: value.columns ?? '',
		names: { ...(value.names ?? {}) },
		cell: value.cell ? [value.cell[0], value.cell[1]] : null,
		setStep: typeof value.setStep === 'number' ? value.setStep : null,
		step: typeof value.step === 'number' ? value.step : null,
		fill: value.fill ?? false
	};
}
