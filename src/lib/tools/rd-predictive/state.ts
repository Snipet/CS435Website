/**
 * The tool's user-editable state, kept in the URL hash. It accepts the
 * cross-tool link shape `LinkStates['rd-predictive']` ({ grammar, input? })
 * as well as its own saved shape, which adds the options of the rewrite, the
 * grammar the parser is generated from, and the steps being shown.
 */
import type { LinkStates } from '$lib/tools/links';
import type { AstForm } from './ast';
import type { NonterminalOrder, ResultForm } from './transform';

export interface PredictiveState {
	/** The grammar to rewrite, in BNF. */
	grammar: string;
	/** Token string, space-separated; `$` is added at the end. */
	input: string;
	/** How the result of removing left recursion is written. */
	form: ResultForm;
	/** Order of the non-terminals in the general algorithm for left recursion. */
	order: NonterminalOrder;
	/**
	 * The EBNF grammar the parser is generated from. Null: the rewritten
	 * grammar, which then follows every change to `grammar`.
	 */
	ebnf: string | null;
	/** Step of the run that is shown (0-based); null shows the last step. */
	step: number | null;
	/** Form of the operator rules in the AST panel; null: as the grammar is written. */
	ast: AstForm | null;
	/** Step of the AST construction that is shown; null shows the last step. */
	astStep: number | null;
}

/** What the hash may hold: a link from another tool, or a saved view. */
export type PredictiveHash = LinkStates['rd-predictive'] &
	Partial<Omit<PredictiveState, 'grammar' | 'input'>>;

/** Top-Down Parsing, slide 38: left recursion to be removed with EBNF. */
export const DEFAULT_GRAMMAR = 'E → E + T | T\nT → T * F | F\nF → ( E ) | int';

/** The grammar of slide 38, rewritten, with the parser run to its end on `int + int * int`. */
export const DEFAULT_STATE: PredictiveState = {
	grammar: DEFAULT_GRAMMAR,
	input: 'int + int * int',
	form: 'ebnf',
	order: 'written',
	ebnf: null,
	step: null,
	ast: null,
	astStep: null
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const isStep = (v: unknown): boolean =>
	v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

const isOneOf = (v: unknown, ...values: unknown[]): boolean =>
	v === undefined || values.includes(v);

/**
 * Accepts `{ grammar, input?, form?, order?, ebnf?, step?, ast?, astStep? }`;
 * extra fields are ignored.
 */
export function isPredictiveHash(value: unknown): value is PredictiveHash {
	if (!isRecord(value)) return false;
	if (typeof value.grammar !== 'string') return false;
	if (value.input !== undefined && typeof value.input !== 'string') return false;
	if (value.ebnf !== undefined && value.ebnf !== null && typeof value.ebnf !== 'string')
		return false;
	return (
		isOneOf(value.form, 'ebnf', 'bnf') &&
		isOneOf(value.order, 'written', 'reversed') &&
		isOneOf(value.ast, null, 'loop', 'recursion') &&
		isStep(value.step) &&
		isStep(value.astStep)
	);
}

/**
 * The state a hash value describes. A link from another tool has only the
 * grammar and perhaps a token string: the parser is then generated from the
 * rewritten grammar, and both runs are shown at their end.
 */
export function stateFromHash(value: PredictiveHash): PredictiveState {
	return {
		grammar: value.grammar,
		input: value.input ?? '',
		form: value.form ?? 'ebnf',
		order: value.order ?? 'written',
		ebnf: typeof value.ebnf === 'string' ? value.ebnf : null,
		step: typeof value.step === 'number' ? value.step : null,
		ast: value.ast ?? null,
		astStep: typeof value.astStep === 'number' ? value.astStep : null
	};
}
