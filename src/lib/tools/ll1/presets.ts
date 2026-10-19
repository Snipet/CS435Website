/**
 * Presets from Table-based Predictive Parsing (the LL(1) table, its parse
 * trace, First and Follow, left factoring without EBNF, grammars that are not
 * LL(1)) and Bottom-Up Parsing, slide 3. Questions the slides pose are kept
 * as questions, with the answer behind "Show answer".
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import { firstFollow, parseGrammar } from '$lib/theory/grammar';
import { setSteps } from './sets';
import { DECK_COLUMNS, DECK_GRAMMAR, DECK_ROWS, DEFAULT_STATE, type LL1State } from './state';

export interface LL1PresetValue {
	grammar: string;
	input: string;
	rows?: string;
	columns?: string;
	names?: Record<string, string>;
	cell?: [string, string];
	setStep?: number;
	step?: number;
	fill?: boolean;
}

/** A question posed on a slide. */
export interface SlideQuestion {
	/** The slide's words. */
	prompt: string;
	/** The answer as notation, one line per line. */
	code?: string;
	/** The answer in words. */
	answer?: string;
	cite: Citation;
}

export interface LL1Preset extends Preset<LL1PresetValue> {
	questions?: readonly SlideQuestion[];
	/** The grammar is parsed bottom-up as it is: link to the bottom-up tools. */
	bottomUp?: boolean;
}

/** Table-based Predictive Parsing, slides 5–6: the grammar before left factoring. */
export const SLIDE_5 = 'E → T + E | T\nT → int | int * T | ( E )';
/** Slide 6: the left-factored grammar, as the slide writes it. */
export const SLIDE_6 = 'E → T X\nX → + E | ε\nT → int Y | ( E )\nY → * T | ε';
/** Bottom-Up Parsing, slide 3. */
export const BOTTOM_UP = 'E → E + ( E ) | int';
/** Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 3. */
export const AMBIGUOUS = 'E → E + E | E * E | ( E ) | int';
/** Not LL(1), though not left recursive, left-factored and not ambiguous. */
export const OTHER = 'S → A a | b\nA → a | ε';
/** Non-terminals that derive ε, for Follow. */
export const NULLABLE = 'S → A B c\nA → a | ε\nB → b | ε';

/** The deck's order of the table, for presets on the deck's grammars. */
const DECK_ORDER = { rows: DECK_ROWS, columns: DECK_COLUMNS };

/** The first step of the Follow computation of the deck's grammar. */
export const FOLLOW_START = setSteps(firstFollow(parseGrammar(DECK_GRAMMAR).grammar!)).findIndex(
	(s) => s.phase === 'follow'
);

const TABLE = 'LL(1) parsing tables';
const SETS = 'First and Follow';
const NOT_LL1 = 'Grammars that are not LL(1)';

export const presets: readonly LL1Preset[] = [
	{
		id: 'table',
		label: 'LL(1) parsing table',
		group: TABLE,
		description:
			'The left-factored grammar and its LL(1) parsing table, with the rows and columns in the order of the slides. $ is the special end marker; a cell holds the right-hand side to use.',
		cite: { deck: '12', slide: [7, 9] },
		value: { grammar: DECK_GRAMMAR, input: 'int * int', ...DECK_ORDER, cell: ['E', 'int'] },
		questions: [
			{
				prompt: 'Consider the [E, int] entry',
				code: 'T X',
				answer: 'E → T X goes in the columns of First( T X ) = { (, int }.',
				cite: { deck: '12', slide: 8 }
			},
			{
				prompt: 'Consider the [Y,+] entry',
				code: 'ε',
				answer: 'Y → ε goes in the columns of Follow( Y ) = { $, +, ) }.',
				cite: { deck: '12', slide: 8 }
			},
			{
				prompt: 'Blank entries indicate ?',
				answer:
					'An error: no production of the row’s non-terminal can be used with that token next.',
				cite: { deck: '12', slide: 9 }
			},
			{
				prompt: 'Consider the [E,*] entry',
				answer:
					'It is blank, so a parse error: * ∉ First( T X ) = { (, int }, and E does not derive ε.',
				cite: { deck: '12', slide: 9 }
			}
		]
	},
	{
		id: 'trace',
		label: 'int * int $',
		group: TABLE,
		description:
			'The LL(1) parsing algorithm on int * int $: the stack starts as < E $ >, its top on the left. Each row’s action is what is done to that row: the right-hand side pushed, terminal for a match, ε, or ACCEPT.',
		cite: { deck: '12', slide: 12 },
		value: { grammar: DECK_GRAMMAR, input: 'int * int', ...DECK_ORDER },
		questions: [
			{
				prompt: '<N, rest> : if T[N,*next] == Y₁ … Yₙ … else error (); // Why the error?',
				answer:
					'T[N,*next] is blank: no production of N can be used with that token next, so the input is not in L(G).',
				cite: { deck: '12', slide: 11 }
			},
			{
				prompt: '<t, rest> : if t == *next ++ … else error (); // Why the error?',
				answer:
					'The terminal on top of the stack has to be the next token. Any other token cannot be matched.',
				cite: { deck: '12', slide: 11 }
			}
		]
	},
	{
		id: 'blank',
		label: 'int + * int $',
		group: TABLE,
		description:
			'The same grammar on int + * int. Once + is matched, E is on top of the stack and the next token is *: the [E,*] entry is blank, so the parser reports an error.',
		cite: { deck: '12', slide: 9 },
		value: { grammar: DECK_GRAMMAR, input: 'int + * int', ...DECK_ORDER, cell: ['E', '*'] }
	},
	{
		id: 'first-sets',
		label: 'First sets, pass by pass',
		group: SETS,
		description:
			'First(X) = { b | X →* bα } ∪ { ε | X →* ε }. First(b) = { b } for a terminal; then, for every production X → A₁ … Aₙ, First(Aᵢ) – { ε } is added to First(X) until ε ∉ First(Aᵢ), and ε when no Aᵢ stops it. The productions are gone over until a pass changes nothing.',
		cite: { deck: '12', slide: [20, 21] },
		value: { grammar: DECK_GRAMMAR, input: 'int * int', ...DECK_ORDER, setStep: 0 }
	},
	{
		id: 'follow-sets',
		label: 'Follow sets, pass by pass',
		group: SETS,
		description:
			'Follow(X) = { b | S →* β X b ω }. With the First sets computed, $ is added to Follow(S); then, for every production Y → … X A₁ … Aₙ, First(Aᵢ) – { ε } is added to Follow(X) until ε ∉ First(Aᵢ), and Follow(Y) when no Aᵢ stops it. Terminals have Follow sets too: Follow( int ).',
		cite: { deck: '12', slide: [22, 23] },
		value: { grammar: DECK_GRAMMAR, input: 'int * int', ...DECK_ORDER, setStep: FOLLOW_START }
	},
	{
		id: 'fill-in',
		label: 'First( E ) = ?',
		group: SETS,
		description:
			'The questions of slides 21 and 23: every set starts as ?. Type a set, such as { (, int }, and check it; each member is marked right or wrong.',
		cite: { deck: '12', slide: [21, 23] },
		value: { grammar: DECK_GRAMMAR, input: 'int * int', ...DECK_ORDER, fill: true }
	},
	{
		id: 'nullable',
		label: 'S → A B c',
		group: SETS,
		description:
			'A and B derive ε. In S → A B c, First(B) – { ε } is added to Follow(A), and since ε ∈ First(B) the rule goes on to First(c): Follow(A) = { c, b }. Follow(B) takes First(c) = { c }.',
		cite: { deck: '12', slide: 22 },
		value: { grammar: NULLABLE, input: 'a c' }
	},
	{
		id: 'left-factor',
		label: 'E → T + E | T',
		group: NOT_LL1,
		description:
			'This grammar has to be rewritten: left-factor, and remove left recursion (right recursion is okay). EBNF is avoided, as right-hand sides must not contain meta-characters. The new non-terminals are named X and Y, as on slide 6.',
		cite: { deck: '12', slide: [5, 6] },
		value: {
			grammar: SLIDE_5,
			input: 'int * int',
			...DECK_ORDER,
			names: { 'E’': 'X', 'T’': 'Y' }
		},
		questions: [
			{
				prompt: 'Impossible to predict because ?',
				answer:
					'Both alternatives of E start with T, and int and int * T both start with int: one token cannot choose between them. [E, int], [E, (] and [T, int] are multiply defined.',
				cite: { deck: '12', slide: 5 }
			},
			{
				prompt: 'Left factor (w/o using EBNF)?',
				code: SLIDE_6,
				answer: 'A → αβ | α γ is rewritten as A → α A’ ; A’ → β | γ.',
				cite: { deck: '12', slide: 6 }
			}
		]
	},
	{
		id: 'bottom-up',
		label: 'E → E + ( E ) | int',
		group: NOT_LL1,
		description:
			'A bottom-up parser needs no left factoring and no removal of left recursion. This grammar is left recursive: E → E + ( E ) and E → int both go in [E, int]. The parse takes E → E + ( E ) from [E, int] again and again without matching a token.',
		cite: { deck: '13', slide: 3 },
		// The parse runs until the tree is too deep: it opens on its third row, the loop under way.
		value: { grammar: BOTTOM_UP, input: 'int + ( int )', cell: ['E', 'int'], step: 2 },
		bottomUp: true,
		questions: [
			{
				prompt: 'Is it LL(1) ?',
				answer: 'No. It is left recursive, and the [E, int] entry is multiply defined.',
				cite: { deck: '13', slide: 3 }
			},
			{
				prompt: 'Can it be made LL(1) ?',
				code: 'E → int E’\nE’ → + ( E ) E’ | ε',
				answer:
					'Yes. Removing the left recursion gives a grammar whose table has no multiply-defined entry.',
				cite: { deck: '13', slide: 3 }
			}
		]
	},
	{
		id: 'ambiguous',
		label: 'E → E + E | E * E | ( E ) | int',
		group: NOT_LL1,
		description:
			'G is not LL(1) if G is ambiguous. This grammar is also left recursive, and removing the left recursion leaves it ambiguous: the rewritten table still has multiply-defined entries.',
		cite: { deck: '12', slide: 26 },
		value: { grammar: AMBIGUOUS, input: 'int + int * int', cell: ['E', 'int'], step: 2 }
	},
	{
		id: 'other',
		label: 'S → A a | b ; A → a | ε',
		group: NOT_LL1,
		description:
			'Not ambiguous, not left recursive and left-factored, and still not LL(1): A → a and A → ε both go in [A, a], since a ∈ First( a ) and a ∈ Follow( A ). The parser takes A → a, the first production of the entry, and so rejects a, which is in L(G).',
		cite: { deck: '12', slide: 26 },
		value: { grammar: OTHER, input: 'a', cell: ['A', 'a'] }
	}
];

export const DEFAULT_PRESET_ID = 'trace';

/** The state a preset opens with. */
export function presetState(p: Pick<LL1Preset, 'id' | 'value'>): LL1State {
	return {
		...DEFAULT_STATE,
		grammar: p.value.grammar,
		input: p.value.input,
		rows: p.value.rows ?? '',
		columns: p.value.columns ?? '',
		names: { ...(p.value.names ?? {}) },
		cell: p.value.cell ? [p.value.cell[0], p.value.cell[1]] : null,
		setStep: p.value.setStep ?? null,
		step: p.value.step ?? null,
		fill: p.value.fill ?? false,
		preset: p.id
	};
}

const squash = (text: string): string =>
	text
		.split('\n')
		.map((line) => line.trim().replace(/[ \t]+/g, ' '))
		.filter((line) => line !== '')
		.join('\n');

const sameNames = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) => {
	const entries = (r: Readonly<Record<string, string>>) =>
		Object.entries(r)
			.filter(([key, name]) => key !== name.trim())
			.map(([key, name]) => `${key}\u0000${name.trim()}`)
			.sort();
	return JSON.stringify(entries(a)) === JSON.stringify(entries(b));
};

const sameCell = (a: readonly string[] | null, b: readonly string[] | null) =>
	a === null || b === null ? a === b : a[0] === b[0] && a[1] === b[1];

/**
 * The preset the state is, if any: the same grammar, token string, order of
 * the table, names of the rewrite and fill-in mode. Several presets differ
 * only in the entry or the steps they open on, and stepping or selecting an
 * entry keeps a preset: the one the state names (`preset`, the one loaded
 * last) is taken when it fits; otherwise the one that opens on the same
 * entry and steps; otherwise the first that fits.
 */
export function presetFor(
	state: Pick<LL1State, 'grammar' | 'input' | 'rows' | 'columns' | 'names' | 'fill'> &
		Partial<Pick<LL1State, 'cell' | 'setStep' | 'step' | 'preset'>>
): LL1Preset | undefined {
	const fits = presets.filter(
		(p) =>
			squash(p.value.grammar) === squash(state.grammar) &&
			squash(p.value.input) === squash(state.input) &&
			squash(p.value.rows ?? '') === squash(state.rows) &&
			squash(p.value.columns ?? '') === squash(state.columns) &&
			sameNames(p.value.names ?? {}, state.names) &&
			(p.value.fill ?? false) === state.fill
	);
	const opensAt = (p: LL1Preset) =>
		sameCell(p.value.cell ?? null, state.cell ?? null) &&
		(p.value.setStep ?? null) === (state.setStep ?? null) &&
		(p.value.step ?? null) === (state.step ?? null);
	return fits.find((p) => p.id === state.preset) ?? fits.find(opensAt) ?? fits[0];
}
