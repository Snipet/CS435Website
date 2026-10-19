/**
 * Presets from Bottom-up Parsing II (the parsing DFA, its table and the LR
 * parsing algorithm, slides 15–21) and Bottom-up Parsing III (LR(1) items,
 * Closure and Transition, slides 7–14; conflicts, slides 16–25; the classes
 * of grammars, slide 26). Questions the slides pose are kept as questions,
 * with the answer behind "Show answer".
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import type { ClosureOrder, Method } from './build';
import type { ItemForm } from './items';
import { DEFAULT_STATE, type ClosureMode, type DfaView, type Lr1State } from './state';

export interface Lr1PresetValue {
	grammar: string;
	input: string;
	order?: ClosureOrder;
	method?: Method;
	items?: ItemForm;
	view?: DfaView;
	range?: [number, number];
	closure?: ClosureMode;
	seed?: string;
	from?: number;
	symbol?: string;
	/** Steps the steppers open on; left out, they open on their last step. */
	closureStep?: number;
	buildStep?: number;
	parseStep?: number;
}

/** A question posed on a slide. */
export interface SlideQuestion {
	/** The slide's words. */
	prompt: string;
	/** The answer in words. */
	answer: string;
	/** The slides of the question and of its answer. */
	cite: Citation;
	/** The slides pose the question and leave it open: the answer is not theirs. */
	unanswered?: boolean;
}

export interface Lr1Preset extends Preset<Lr1PresetValue> {
	questions?: readonly SlideQuestion[];
}

/** Bottom-up Parsing II, slide 4 (and slide 17). */
export const DECK_14_GRAMMAR = 'E → E + ( E ) | int';
/** Bottom-up Parsing III, slide 4: E → int first. */
export const DECK_15_GRAMMAR = 'E → int | E + ( E )';
/** Bottom-up Parsing II, slides 4–14. */
export const SLIDE_INPUT = 'int + ( int ) + ( int )';
/** Bottom-up Parsing III, slide 18. */
export const AMBIGUOUS_GRAMMAR = 'E → E + E | E * E | int';
/** Bottom-up Parsing III, slide 24. */
export const IDS_GRAMMAR = 'S → ε | id | id S';
/** Bottom-up Parsing III, slide 25: the rewrite. */
export const IDS_REWRITTEN = 'S → ε | id S';
/** A short C- program as tokens. */
export const CMINUS_INPUT = 'int ID ; void ID ( void ) { ID = NUM ; }';

const CLOSURE = 'Closure and Transition';
const DFA = 'The parsing DFA';
const PARSING = 'LR parsing';
const BEYOND = 'Beyond the decks';

export const presets: readonly Lr1Preset[] = [
	{
		id: 'start-context',
		label: 'Closure({ S → •E, $ })',
		group: CLOSURE,
		description:
			'Construct the start context: Closure({ S → •E, $ }), with the new start symbol S and the production S → E. Closure adds four items to S → •E, $; merged by lookahead they are three lines, E → •E + ( E ), $/+ and E → •int, $/+. The grammar is written E → int first, as on slide 4, and Closure takes the productions of E last first, which lists the items in the order of slide 11.',
		cite: { deck: '15', slide: 11 },
		value: { grammar: DECK_15_GRAMMAR, input: SLIDE_INPUT, order: 'reversed', closureStep: 0 }
	},
	{
		id: 'extend-context',
		label: 'Extending E → E + (•E), +',
		group: CLOSURE,
		description:
			'A context with the item E → E + (•E), +. There are two productions for E, E → int and E → E + ( E ), so the context is extended with E → •int, ) and E → •E + ( E ), ). The stepper opens where the second of them is added. Extending E → •E + ( E ), ) in turn adds the same two items with lookahead + (First( + ( E ) ) ) = { + }), which is why state 4 of the DFA lists them with )/+.',
		cite: { deck: '15', slide: 9 },
		value: {
			grammar: DECK_15_GRAMMAR,
			input: SLIDE_INPUT,
			seed: 'E → E + ( •E ), +',
			closureStep: 7
		}
	},
	{
		id: 'transition',
		label: 'Transition(3, ( )',
		group: CLOSURE,
		description:
			'A state that contains [X → α•yβ, b] has a transition labeled y to the state Transition(state, y): the items with the dot moved over y, closed. From state 3 on ( the dot moves in E → E + •( E ), $/+, and Closure adds the items for E with lookaheads ) and +. The result is state 4.',
		cite: { deck: '15', slide: 13 },
		value: {
			grammar: DECK_15_GRAMMAR,
			input: SLIDE_INPUT,
			order: 'reversed',
			closure: 'transition',
			from: 3,
			symbol: '(',
			closureStep: 0
		},
		questions: [
			{
				prompt: 'In context containing E → E + • ( E ), +: if ( follows then we can ?',
				answer: 'Perform a shift to context containing E → E + (• E ), +.',
				cite: { deck: '15', slide: 8 }
			},
			{
				prompt: 'In context containing E → E + ( E ) •, +: we can ?',
				answer: 'Perform a reduction with E → E + ( E ), but only if a + follows.',
				cite: { deck: '15', slide: 8 }
			}
		]
	},
	{
		id: 'item-sets',
		label: 'States 0–6 as item sets',
		group: DFA,
		description:
			'A DFA state is a closed set of LR(1) items. The start state is Closure({ S → •E, $ }), and an edge labeled y leads from a state to Transition(state, y). A state with [X → α•, b] is labeled “reduce with X → α on b”; the state with [S → E•, $] is labeled accept on $. The construction opens at state 6, where the slide stops (“and so on…”); its next steps make states 7–11.',
		cite: { deck: '15', slide: 14 },
		value: { grammar: DECK_15_GRAMMAR, input: SLIDE_INPUT, order: 'reversed', buildStep: 6 }
	},
	{
		id: 'circles',
		label: 'The 12 states as circles',
		group: DFA,
		description:
			'The LR(1) DFA for E → E + ( E ) | int as numbered states, each labeled with the reductions it allows (E → int on $, +) or with accept on $. To decide between shift and reduce, the parser runs the DFA on the stack: in the state X it ends in, with tok the token after the divider, it shifts if X has a transition on tok and reduces with A → β if X is labeled A → β on tok.',
		cite: { deck: '14', slide: 17 },
		value: { grammar: DECK_14_GRAMMAR, input: SLIDE_INPUT, view: 'circles' },
		questions: [
			{
				prompt: 'DFA input is ?',
				answer: 'The stack: the symbols left of the divider.',
				cite: { deck: '14', slide: 16 },
				unanswered: true
			},
			{
				prompt: 'DFA alphabet consists of ?',
				answer: 'The grammar symbols, terminals and non-terminals: every edge is labeled with one.',
				cite: { deck: '14', slide: 16 },
				unanswered: true
			}
		]
	},
	{
		id: 'table-fragment',
		label: 'Table rows 3–7',
		group: DFA,
		description:
			'Table for a fragment of our DFA: states 3–7 and their rows. The terminal columns come in the order the DFA first shifts the terminals, int + ( ) $, as on the slide. The slide prints the entries of row 6 one column to the left; by the DFA, s8 is under + and s7 under ).',
		cite: { deck: '14', slide: 19 },
		value: {
			grammar: DECK_14_GRAMMAR,
			input: SLIDE_INPUT,
			view: 'circles',
			range: [3, 7]
		},
		questions: [
			{
				prompt: 'Rows correspond to ?',
				answer: 'The states of the DFA.',
				cite: { deck: '14', slide: 18 },
				unanswered: true
			},
			{
				prompt: 'Columns correspond to ?',
				answer:
					'The grammar symbols: the terminals and $ make up the action table, the non-terminals the goto table.',
				cite: { deck: '14', slide: 18 },
				unanswered: true
			}
		]
	},
	{
		id: 'lr-parse',
		label: 'int + (int) + (int)',
		group: PARSING,
		description:
			'The LR parsing algorithm on the input of slides 4–14. The stack holds pairs < sym, state >, starting with < dummy, 0 >; each step looks up action[top_state(stack), I[j]], shifts, or pops |α| pairs and pushes the Goto entry, until accept.',
		cite: { deck: '14', slide: 21 },
		value: { grammar: DECK_14_GRAMMAR, input: SLIDE_INPUT, parseStep: 0 },
		questions: [
			{
				prompt: 'Left string can be implemented as a ?',
				answer:
					'A stack. Shift pushes a terminal; reduce pops 0 or more symbols (α) and pushes a non-terminal (A).',
				cite: { deck: '14', slide: 15 }
			},
			{
				prompt:
					'After shift or reduce action we rerun DFA on entire stack. Wasteful, since most of the work is repeated. Alternative?',
				answer:
					'For each stack element, remember to which state it brings the DFA. The count of DFA transitions beside the stack compares the two.',
				cite: { deck: '14', slide: 20 }
			}
		]
	},
	{
		id: 'nested',
		label: 'int + (int + (int))',
		group: PARSING,
		description:
			'Parentheses inside parentheses: this input takes the parser through states 8–11, which the input of the slides never reaches.',
		cite: { deck: '14', slide: 17 },
		value: { grammar: DECK_14_GRAMMAR, input: 'int + ( int + ( int ) )' }
	},
	{
		id: 'epsilon',
		label: 'S → ε | id S',
		group: PARSING,
		description:
			'The rewritten grammar of the slide, with an ε-production. S is the grammar’s own start symbol, so the new start symbol is S’, with S’ → S. A reduction with S → ε pops no pairs.',
		cite: { deck: '15', slide: 25 },
		value: { grammar: IDS_REWRITTEN, input: 'id id id' },
		questions: [
			{
				prompt: 'Reduce pops 0 or more symbols (α) and pushes a non-terminal (A). 0 ?',
				answer:
					'A reduction with an ε-production pops nothing: here S → ε, before the first S is pushed.',
				cite: { deck: '14', slide: 15 },
				unanswered: true
			}
		]
	},
	{
		id: 'shift-reduce-conflict',
		label: 'E → E + E | E * E | int',
		group: PARSING,
		description:
			'An ambiguous grammar. After E * E with + next, a state contains [E → E * E •, +] and [E → E • + E, +]: a shift/reduce conflict on +. Cells with a conflict show both entries. Without precedence declarations the table keeps the shift, as bison does, so int * int + int is parsed as int * (int + int).',
		cite: { deck: '15', slide: 18 },
		value: { grammar: AMBIGUOUS_GRAMMAR, input: 'int * int + int' },
		questions: [
			{
				prompt: 'We have a shift/reduce on input +. Do we want a shift or reduce?',
				answer:
					'Reduce: E * E binds tighter than +. With %left + then %left *, the rule E → E * E has higher precedence than the terminal +, and bison reduces.',
				cite: { deck: '15', slide: [18, 20] }
			}
		]
	},
	{
		id: 'reduce-reduce-conflict',
		label: 'S → ε | id | id S',
		group: PARSING,
		description:
			'A sequence of identifiers with two parse trees for id. After id, a state contains [S → id •, $] and [S → •, $]: a reduce/reduce conflict on $. The table keeps the earlier rule. The slide rewrites the grammar as S → ε | id S.',
		cite: { deck: '15', slide: [24, 25] },
		value: { grammar: IDS_GRAMMAR, input: 'id' },
		questions: [
			{
				prompt: 'How does this confuse the parser?',
				answer:
					'After id with $ next, it cannot choose between reducing with S → id and reducing with S → ε (to go on with S → id S).',
				cite: { deck: '15', slide: [24, 25] }
			}
		]
	},
	{
		id: 'lalr',
		label: 'LALR(1) of E → E + ( E ) | int',
		group: BEYOND,
		description:
			'Look-ahead LR (LALR) is named on the slide, not built in the decks. LALR(1) merges the LR(1) states whose items differ only in their lookaheads, as bison does: the 12 states become 7, each listing the LR(1) states it merges.',
		cite: { deck: '15', slide: 26 },
		value: { grammar: DECK_14_GRAMMAR, input: SLIDE_INPUT, method: 'lalr1' }
	},
	{
		id: 'cminus',
		label: 'The C- grammar',
		group: BEYOND,
		description:
			'The 29 rules of C-, with for loops and ++ and --. Its LR(1) automaton has a few hundred states; the drawings and the table show them a window at a time. Its one conflict is the dangling else.',
		value: { grammar: CMINUS_BNF, input: CMINUS_INPUT }
	}
];

/** The preset the page opens with: the LR parsing algorithm on the slides' input, run to its end. */
export const DEFAULT_PRESET_ID = 'lr-parse';

/** The state a preset opens with. */
export function presetState(p: Pick<Lr1Preset, 'value'>): Lr1State {
	const v = p.value;
	return {
		...DEFAULT_STATE,
		grammar: v.grammar,
		input: v.input,
		order: v.order ?? 'grammar',
		method: v.method ?? 'lr1',
		items: v.items ?? 'abbreviated',
		view: v.view ?? 'boxes',
		range: v.range ? [v.range[0], v.range[1]] : null,
		closure: v.closure ?? 'closure',
		seed: v.seed ?? '',
		from: v.from ?? 0,
		symbol: v.symbol ?? '',
		closureStep: v.closureStep ?? null,
		buildStep: v.buildStep ?? null,
		parseStep: v.parseStep ?? null
	};
}

const squash = (text: string): string =>
	text
		.split('\n')
		.map((line) => line.trim().replace(/[ \t]+/g, ' '))
		.filter((line) => line !== '')
		.join('\n');

/**
 * The preset the state is, if any: the same grammar, token string, method,
 * order, range and Closure stepper. `loaded` is the id of the preset loaded
 * last; it is taken when it fits, since several presets may fit one state.
 */
export function presetFor(state: Lr1State, loaded: string | null = null): Lr1Preset | undefined {
	const fits = presets.filter((p) => {
		const s = presetState(p);
		return (
			squash(s.grammar) === squash(state.grammar) &&
			squash(s.input) === squash(state.input) &&
			s.order === state.order &&
			s.method === state.method &&
			JSON.stringify(s.range) === JSON.stringify(state.range) &&
			s.closure === state.closure &&
			squash(s.seed) === squash(state.seed) &&
			(s.closure === 'closure' || (s.from === state.from && s.symbol === state.symbol))
		);
	});
	return fits.find((p) => p.id === loaded) ?? fits[0];
}
