/**
 * Presets from Top-Down Parsing: left recursion and its elimination (slides
 * 23–27) and recursive descent with prediction (slides 36–41). Questions the
 * slides pose are kept as questions, with the answer behind "Show answer".
 */
import type { Citation } from '$lib/lectures';
import type { Preset } from '$lib/components/ui/types';
import { DEFAULT_GRAMMAR, DEFAULT_STATE, type PredictiveState } from './state';
import type { NonterminalOrder, ResultForm } from './transform';

export interface PredictivePresetValue {
	grammar: string;
	input: string;
	form?: ResultForm;
	/** Order of the non-terminals in the general algorithm for left recursion. */
	order?: NonterminalOrder;
	/** The grammar of the parser when it is not the rewritten one. */
	ebnf?: string;
	/** Step the run opens on; left out, it opens on its last step. */
	step?: number;
	/** Step the AST construction opens on. */
	astStep?: number;
}

/** A question posed on a slide. */
export interface SlideQuestion {
	/** The slide's words. */
	prompt: string;
	/** The answer as notation or code, one line per line. */
	code?: string;
	/** The answer in words. */
	answer?: string;
	cite: Citation;
}

export interface PredictivePreset extends Preset<PredictivePresetValue> {
	/** Notation the slide shows with the description, one line per entry. */
	formula?: readonly string[];
	questions?: readonly SlideQuestion[];
}

/** Top-Down Parsing, slide 23, with V → b so that V derives strings. */
export const SLIDE_23 = 'V → V a | b';
/** Slides 24–25. */
export const SLIDE_25 = 'S → 1 | S 0';
/** An instance of the general form of slide 26: two α and two β. */
export const SLIDE_26 = 'S → S a | S b | c | d';
/** Slide 27 with α = a, δ = d, β = b. */
export const SLIDE_27 = 'S → A a | d\nA → S b';
/** Slide 36, before left factoring. */
export const SLIDE_36 = 'E → T + E | T\nT → ( E ) | int | int * T';
/** Slides 36, 37 and 39: the left-factored grammar the parser of slide 37 is for. */
export const SLIDE_37 = 'E → T [ + E ]\nT → ( E ) | int [ * T ]';
/** Slide 38, before the rewrite. */
export const SLIDE_38 = DEFAULT_GRAMMAR;
/** Slides 38 and 40. */
export const SLIDE_38_EBNF = 'E → T { + T }\nT → F { * F }\nF → ( E ) | int';
/** Slide 39. */
export const SLIDE_39 = 'A → X op A | X';

/** The function of slide 40. */
export const SLIDE_40_CODE = [
	'Node*',
	'E () {',
	'  Node* tree = T ();',
	"  while (token == '+') {",
	"    match ('+');",
	"    Node* plus = makeNode ('+');",
	'    plus->left  = tree;',
	'    plus->right = T ();',
	'    tree = plus;',
	'  }',
	'  return tree;',
	'}'
].join('\n');

const LEFT_RECURSION = 'Left recursion';
const PREDICTION = 'Recursive descent with prediction';

export const presets: readonly PredictivePreset[] = [
	{
		id: 'what-goes-wrong',
		label: 'V → V a',
		group: LEFT_RECURSION,
		description:
			'A left-recursive grammar has a non-terminal V such that V →+ V α for some α. V → b is added to the production of the slide so that V derives strings. The parser below is generated from the grammar as written, not from its rewrite.',
		cite: { deck: '11', slide: 23 },
		value: { grammar: SLIDE_23, input: 'b a a', ebnf: SLIDE_23, step: 0 },
		questions: [
			{
				prompt:
					'Consider a production V → V a: in the process of parsing V we try the above rule. What goes wrong?',
				answer:
					'V () calls V () before a token is matched. The new call sees the same token and makes the same call, so the calls never end.',
				cite: { deck: '11', slide: 23 }
			}
		]
	},
	{
		id: 'one-zero',
		label: 'S → 1 | S 0',
		group: LEFT_RECURSION,
		description:
			'The grammar has the form S → S α | β, with α = 0 and β = 1. Its left recursion is eliminated with right recursion and a new non-terminal S’, or with EBNF.',
		cite: { deck: '11', slide: [24, 25] },
		value: { grammar: SLIDE_25, input: '1 0 0' },
		questions: [
			{
				prompt: 'S → S α | β. S generates all strings of form ?',
				code: 'β { α }',
				answer:
					'Using EBNF: β followed by zero or more α. For this grammar it is 1 { 0 }. EBNF also uses [ α ] for optional α.',
				cite: { deck: '11', slide: 24 }
			},
			{
				prompt: 'How can we rewrite using right-recursion?',
				code: 'S → β S’\nS’ → α S’ | ε',
				cite: { deck: '11', slide: 24 }
			},
			{
				prompt: 'Remove left-recursion to obtain ?',
				code: 'S → 1 S’\nS’ → 0 S’ | ε',
				answer: 'Or S → 1 { 0 } using EBNF. “Result as” in the Rewrite panel shows either form.',
				cite: { deck: '11', slide: 25 }
			}
		]
	},
	{
		id: 'general-form',
		label: 'S → S a | S b | c | d',
		group: LEFT_RECURSION,
		description:
			'In general a non-terminal has n left-recursive alternatives and m others. In this grammar α₁ = a, α₂ = b, β₁ = c and β₂ = d.',
		formula: ['S → S α₁ | … | S αₙ | β₁ | … | βₘ'],
		cite: { deck: '11', slide: 26 },
		value: { grammar: SLIDE_26, input: 'c a b', form: 'bnf' },
		questions: [
			{
				prompt: 'Can be rewritten as ?',
				code: 'S → β₁ S’ | … | βₘ S’\nS’ → α₁ S’ | … | αₙ S’ | ε',
				cite: { deck: '11', slide: 26 }
			}
		]
	},
	{
		id: 'indirect',
		label: 'S → A a | d ; A → S b',
		group: LEFT_RECURSION,
		description:
			'The grammar S → A α | δ ; A → S β with α = a, δ = d and β = b. No production has the form S → S α. This left recursion can also be eliminated; the slide refers to the text for the general algorithm. The Rewrite panel applies it with A before S in the order of the non-terminals, so A is replaced at the front of S → A a.',
		cite: { deck: '11', slide: 27 },
		value: { grammar: SLIDE_27, input: 'd b a', order: 'reversed' },
		questions: [
			{
				prompt: 'The grammar is also left-recursive because S →+ ?',
				code: 'S β α',
				answer: 'S → A α → S β α. In this grammar: S → A a → S b a.',
				cite: { deck: '11', slide: 27 }
			}
		]
	},
	{
		id: 'suitable',
		label: 'E → T + E | T before left factoring',
		group: PREDICTION,
		description:
			'How do we avoid backtracking? Use lookahead as rule determiner (one or more tokens). Backtracking is not needed if the grammar is suitable. The parser below is generated from the grammar as written, not from its rewrite.',
		cite: { deck: '11', slide: 36 },
		value: { grammar: SLIDE_36, input: 'int * int', ebnf: SLIDE_36 },
		questions: [
			{
				prompt: 'Previous grammar suitable for prediction?',
				answer:
					'No. Both alternatives of E start with T, and int and int * T both start with int, so one token of lookahead cannot choose between them. The prediction table lists both conflicts.',
				cite: { deck: '11', slide: 36 }
			},
			{
				prompt: 'Solution?',
				code: SLIDE_37,
				answer:
					'Use EBNF to left factor. “Use this grammar below” in the Rewrite panel generates the parser from it.',
				cite: { deck: '11', slide: 36 }
			}
		]
	},
	{
		id: 'parser',
		label: 'Parser on int * int $',
		group: PREDICTION,
		description:
			'The complete parser for the left-factored grammar E → T [ + E ] ; T → ( E ) | int [ * T ]: main for E $, and one function per rule.',
		cite: { deck: '11', slide: 37 },
		value: { grammar: SLIDE_36, input: 'int * int', step: 0 },
		questions: [
			{
				prompt: 'Does this succeed on s = “int * int $” ?',
				answer:
					'Yes. main calls E, and E calls T. T sees an int and matches it, sees * and matches it, and calls T, which matches the second int. Back in E the token is $, not +, so E returns and main matches $.',
				cite: { deck: '11', slide: 37 }
			}
		]
	},
	{
		id: 'left-recursion-ebnf',
		label: 'E → E + T | T with EBNF',
		group: PREDICTION,
		description:
			'Left recursion implies left associativity. Left recursion is a problem for RD parsers.',
		cite: { deck: '11', slide: 38 },
		value: { grammar: SLIDE_38, input: 'int * int + int' },
		questions: [
			{
				prompt: 'So remove it with EBNF. How?',
				code: SLIDE_38_EBNF,
				cite: { deck: '11', slide: 38 }
			}
		]
	},
	{
		id: 'right-recursion',
		label: 'A → X op A | X',
		group: PREDICTION,
		description:
			'Right recursion implies right associativity. It is not a problem for RD. X and op have no productions in this grammar, so they are terminals.',
		cite: { deck: '11', slide: 39 },
		value: { grammar: SLIDE_39, input: 'X op X op X' },
		questions: [
			{
				prompt: 'A → X op A | X becomes ?',
				code: 'A → X [ op A ]',
				cite: { deck: '11', slide: 39 }
			}
		]
	},
	{
		id: 'ast',
		label: 'AST of int + int + int',
		group: PREDICTION,
		description:
			'AST construction for E → T { + T } ; T → F { * F } ; F → ( E ) | int. The AST panel runs the functions on int + int + int, from the first step.',
		cite: { deck: '11', slide: 40 },
		value: { grammar: SLIDE_38, input: 'int + int + int', astStep: 0 },
		questions: [
			{
				prompt: 'So how do we build the AST?',
				code: SLIDE_40_CODE,
				cite: { deck: '11', slide: 40 }
			}
		]
	},
	{
		id: 'recipe',
		label: 'RD with prediction on int + int * int',
		group: PREDICTION,
		description:
			'RD w/prediction: eliminate left-recursion using EBNF, left factor using EBNF, and write one function per (rewritten) grammar rule.',
		cite: { deck: '11', slide: 41 },
		value: { grammar: SLIDE_38, input: 'int + int * int' }
	}
];

export const DEFAULT_PRESET_ID = 'recipe';

/** The state a preset opens with. */
export function presetState(p: Pick<PredictivePreset, 'value'>): PredictiveState {
	return {
		...DEFAULT_STATE,
		grammar: p.value.grammar,
		input: p.value.input,
		form: p.value.form ?? 'ebnf',
		order: p.value.order ?? 'written',
		ebnf: p.value.ebnf ?? null,
		step: p.value.step ?? null,
		astStep: p.value.astStep ?? null
	};
}

const squash = (text: string): string =>
	text
		.split('\n')
		.map((line) => line.trim().replace(/[ \t]+/g, ' '))
		.filter((line) => line !== '')
		.join('\n');

/**
 * The preset the state is, if any: the same grammar, token string, options
 * of the rewrite and grammar of the parser. `loaded` is the id of the preset
 * loaded last; it is taken when it fits, since two presets may fit one state.
 */
export function presetFor(
	state: Pick<PredictiveState, 'grammar' | 'input' | 'form' | 'order' | 'ebnf'>,
	loaded: string | null = null
): PredictivePreset | undefined {
	const fits = presets.filter(
		(p) =>
			squash(p.value.grammar) === squash(state.grammar) &&
			squash(p.value.input) === squash(state.input) &&
			(p.value.form ?? 'ebnf') === state.form &&
			(p.value.order ?? 'written') === state.order &&
			(p.value.ebnf === undefined
				? state.ebnf === null
				: state.ebnf !== null && squash(p.value.ebnf) === squash(state.ebnf))
	);
	return fits.find((p) => p.id === loaded) ?? fits[0];
}
