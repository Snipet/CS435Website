/**
 * Presets from Top-Down Parsing: the two worked examples of recursive descent
 * with backtracking (slides 4–20), the bool-function parser of slides 28–34,
 * and the left-recursive grammar of slides 23–25. Questions the slides pose
 * are kept as questions, with the answer behind "Show answer".
 */
import type { Citation } from '$lib/lectures';
import type { Preset } from '$lib/components/ui/types';
import type { TabId } from './state';

export interface RdPresetValue {
	grammar: string;
	input: string;
	tab: TabId;
	/** Show instance numbers (E0, T1 …). */
	numbers?: boolean;
}

/** A question posed on a slide. */
export interface SlideQuestion {
	/** The slide's words. Subscript characters are drawn as subscripts. */
	prompt: string;
	/** Notation or code the slide shows with the question, with its blank: `bool E₂ () { ? }`. */
	notation?: string;
	/** The answer in words. */
	answer?: string;
	/** The answer as notation or as a line of the generated code (production numbers as digits). */
	code?: string;
	cite: Citation;
}

export interface RdPreset extends Preset<RdPresetValue> {
	questions?: readonly SlideQuestion[];
}

/** Top-Down Parsing, slides 4–16 and 31–34. */
export const ORDER_1 = 'E → T | T + E\nT → int | int * T | ( E )';
/** Top-Down Parsing, slides 17–20: "Same grammar, different order". */
export const ORDER_2 = 'E → T + E | T\nT → ( E ) | int | int * T';
/** Top-Down Parsing, slide 25. */
export const LEFT_RECURSIVE = 'S → 1 | S 0';

const BACKTRACKING = 'Recursive descent with backtracking';
const FUNCTIONS = '(Limited) recursive descent parser';
const LEFT_RECURSION = 'Left recursion';

const FRINGE_QUESTIONS: readonly SlideQuestion[] = [
	{
		prompt:
			'At a given moment the fringe of the parse tree is t₁ t₂ … tₖ A … Try all the productions for A: if A → BC is a production, the new fringe is ?',
		code: 't₁ t₂ … tₖ B C …',
		cite: { deck: '11', slide: 22 }
	},
	{
		prompt: 'What if the fringe doesn’t match the string?',
		answer:
			'Backtrack: the children added by the most recent choice are removed, the input pointer returns to where that alternative started, and the next production is tried. A non-terminal with no production left sends the search back to the choice before it.',
		cite: { deck: '11', slide: 22 }
	},
	{
		prompt: 'Stop when ?',
		answer:
			'When the fringe is the token string: the tree is complete and the pointer is past the last token (accept). Or when no choice is left (reject).',
		cite: { deck: '11', slide: 22 }
	}
];

const BLANKS: readonly SlideQuestion[] = [
	{
		prompt: 'For production E → T + E',
		notation: 'bool E₂ () { ? }',
		code: 'bool E2 () { return T () && match (PLUS) && E (); }',
		cite: { deck: '11', slide: 31 }
	},
	{
		prompt: 'Functions for non-terminal T',
		notation: 'bool T₂() { ? }',
		code: 'bool T2 () { return match (INT) && match (TIMES) && T (); }',
		cite: { deck: '11', slide: 32 }
	},
	{
		prompt: 'Functions for non-terminal T',
		notation: 'bool T₃() { ? }',
		code: 'bool T3 () { return match (OPEN) && E () && match (CLOSE); }',
		cite: { deck: '11', slide: 32 }
	}
];

export const presets: readonly RdPreset[] = [
	{
		id: 'example-1',
		label: 'Example 1: ( int )',
		group: BACKTRACKING,
		description:
			'Start with the top-level non-terminal E and try the rules for E in order. T → int and T → int * T do not match (, so each is removed again; T → ( E ) matches.',
		cite: { deck: '11', slide: [4, 16] },
		value: { grammar: ORDER_1, input: '( int )', tab: 'backtracking', numbers: false }
	},
	{
		id: 'example-2',
		label: 'Example 2: int * int',
		group: BACKTRACKING,
		description:
			'Same grammar, different order. E → T + E is tried first; when the choices for T₂ and T₁ are exhausted the search goes back to the choice for E₀ and succeeds with E₀ → T₁.',
		cite: { deck: '11', slide: [17, 20] },
		value: { grammar: ORDER_2, input: 'int * int', tab: 'backtracking', numbers: true },
		questions: FRINGE_QUESTIONS
	},
	{
		id: 'functions-paren',
		label: 'bool functions: ( int )',
		group: FUNCTIONS,
		description:
			'One bool function per production and one per non-terminal. T₁ () and T₂ () fail on ( and next is put back from save; T₃ () succeeds, and E () returns true with next at end-of-stream.',
		cite: { deck: '11', slide: 34 },
		value: { grammar: ORDER_1, input: '( int )', tab: 'functions' },
		questions: BLANKS
	},
	{
		id: 'functions-times',
		label: 'bool functions: int * int',
		group: FUNCTIONS,
		description:
			'T₁ () matches int, so T () returns true and never calls T₂ (). E () returns true with * int left over: the input is rejected although it is a sentence of the grammar.',
		cite: { deck: '11', slide: 33 },
		value: { grammar: ORDER_1, input: 'int * int', tab: 'functions' }
	},
	{
		id: 'left-recursion',
		label: 'Left recursion: S → 1 | S 0',
		group: LEFT_RECURSION,
		description:
			'S → S 0 starts with S itself. The grammar is not run unless “Run anyway” is on. With S → 1 written first the parse of 1 0 is found; in the reverse order, S → S 0 is tried again for every new S.',
		cite: { deck: '11', slide: [23, 25] },
		value: { grammar: LEFT_RECURSIVE, input: '1 0', tab: 'backtracking', numbers: true },
		questions: [
			{
				prompt:
					'Consider a production V → V a: in the process of parsing V we try the above rule. What goes wrong?',
				answer:
					'The rule makes V its own first child, and expanding that V tries the rules of V again with the input pointer where it was. No token is matched in between, so the tree grows down its left edge without end.',
				cite: { deck: '11', slide: 23 }
			}
		]
	}
];

export const DEFAULT_PRESET_ID = 'example-1';

const squash = (text: string): string => text.trim().replace(/[ \t]+/g, ' ');

/**
 * The preset with this grammar and token string, if any. Two presets share
 * `( int )`: the one for the tab shown is taken; a preset of the other tab
 * stands in when the tab has none, so the note stays while the tabs change.
 */
export function presetFor(grammar: string, input: string, tab: TabId): RdPreset | undefined {
	const same = presets.filter(
		(p) => squash(p.value.grammar) === squash(grammar) && squash(p.value.input) === squash(input)
	);
	return same.find((p) => p.value.tab === tab) ?? same[0];
}
