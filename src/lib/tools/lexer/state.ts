/**
 * The Scanner Rules page state, kept in the URL hash. It accepts the
 * cross-tool shape `LinkStates['lexer']` (defs, rules, input, errorRule) and
 * adds view options of its own.
 */
import type { TokenFormat } from '$lib/components/ui/token-format';
import type { LinkStates, RuleState } from '$lib/tools/links';

export type LexerTab = 'matches' | 'lookahead' | 'strip';

export interface LexerState {
	defs: string;
	rules: RuleState[];
	input: string;
	errorRule: boolean;
	format: TokenFormat;
	/** Show dropped tokens (e.g. Whitespace) in the output. */
	showDropped: boolean;
	tab: LexerTab;
	/** "Remove whitespace and comments before scanning" in the Strip first tab. */
	strip: boolean;
	/** Current step of the scanning loop. */
	step: number;
	/** Current character read in the Lookahead tab. */
	lookahead: number;
	/** Id of the preset last loaded. */
	preset: string | null;
}

/** What a preset sets; the view options it leaves out take their defaults. */
export type LexerSetup = LinkStates['lexer'] &
	Partial<Pick<LexerState, 'format' | 'showDropped' | 'tab' | 'strip'>>;

export const TABS: readonly LexerTab[] = ['matches', 'lookahead', 'strip'];

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function isRule(v: unknown): v is RuleState {
	return (
		isObject(v) &&
		typeof v.name === 'string' &&
		typeof v.re === 'string' &&
		(v.drop === undefined || typeof v.drop === 'boolean')
	);
}

/**
 * Accepts `LinkStates['lexer']` (from another tool) and this page's own saved
 * state. View options of the wrong type are ignored by `normalizeState`.
 */
export function isLexerHash(v: unknown): v is LinkStates['lexer'] & Partial<LexerState> {
	return (
		isObject(v) &&
		Array.isArray(v.rules) &&
		v.rules.length <= 500 &&
		v.rules.every(isRule) &&
		typeof v.input === 'string' &&
		(v.defs === undefined || typeof v.defs === 'string') &&
		(v.errorRule === undefined || typeof v.errorRule === 'boolean')
	);
}

const count = (v: unknown) =>
	typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

/** A full state from a validated hash value or a preset; missing options take defaults. */
export function normalizeState(v: LinkStates['lexer'] & Partial<LexerState>): LexerState {
	return {
		defs: v.defs ?? '',
		rules: v.rules.map((r) => ({ name: r.name, re: r.re, drop: r.drop ?? false })),
		input: v.input,
		errorRule: v.errorRule ?? false,
		format: v.format === 'angle' ? 'angle' : 'paren',
		showDropped: typeof v.showDropped === 'boolean' ? v.showDropped : false,
		tab: TABS.includes(v.tab as LexerTab) ? (v.tab as LexerTab) : 'matches',
		strip: typeof v.strip === 'boolean' ? v.strip : false,
		step: count(v.step),
		lookahead: count(v.lookahead),
		preset: typeof v.preset === 'string' ? v.preset : null
	};
}

/** The cross-tool part of the state, for links to tools that take the same rules. */
export function ruleLinkState(s: Pick<LexerState, 'defs' | 'rules' | 'input'>) {
	return {
		defs: s.defs,
		rules: s.rules.map((r) =>
			r.drop ? { name: r.name, re: r.re, drop: true } : { name: r.name, re: r.re }
		),
		input: s.input
	};
}
