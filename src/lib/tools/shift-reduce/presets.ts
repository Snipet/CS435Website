/**
 * Presets from the bottom-up decks: the shift-reduce trace of Bottom-up
 * Parsing II, slides 4–14, and the handles of Bottom-Up Parsing, slides
 * 5–10, on the same grammar and input; a nested input that visits the states
 * of slide 17 the slide input does not; reductions that pop nothing (slide
 * 15); a left-recursive expression cascade; and the ambiguous grammar of
 * Bottom-up Parsing III, slide 18, parsed with bison's default resolution.
 */
import type { Citation } from '$lib/lectures';
import type { Preset } from '$lib/components/ui/types';
import { DEFAULT_STATE, SLIDE_GRAMMAR, SLIDE_INPUT, type ShiftReduceState } from './state';

export type ShiftReducePresetValue = Pick<ShiftReduceState, 'grammar' | 'input'> &
	Partial<Omit<ShiftReduceState, 'grammar' | 'input'>>;

/** A question posed on a slide, with its answer. */
export interface SlideQuestion {
	prompt: string;
	answer: string;
	cite: Citation;
}

export interface ShiftReducePreset extends Preset<ShiftReducePresetValue> {
	questions?: readonly SlideQuestion[];
}

/** Table-based Predictive Parsing, slide 7: the left-factored grammar, without EBNF. */
export const LEFT_FACTORED = 'E → T X\nT → ( E ) | int Y\nX → + E | ε\nY → * T | ε';
/** A left-recursive cascade of two precedence levels. */
export const CASCADE = 'E → E + T | T\nT → T * int | int';
/** Bottom-up Parsing III, slide 18. */
export const AMBIGUOUS = 'E → E + E | E * E | int';

const SLIDES = 'Worked examples';
const MORE = 'Other grammars and inputs';

export const presets: readonly ShiftReducePreset[] = [
	{
		id: 'slide-14',
		label: 'int + (int) + (int)',
		group: SLIDES,
		description:
			'The shift-reduce example: E → E + ( E ) | int on int + (int) + (int)$. Each row is a configuration, the stack left of the divider and the input right of it, with the action taken on it; consecutive shifts are on one row.',
		cite: { deck: '14', slide: [4, 14] },
		value: { grammar: SLIDE_GRAMMAR, input: SLIDE_INPUT, view: 'trace' }
	},
	{
		id: 'slides-5-10',
		label: 'Handles of int + (int) + (int)',
		group: SLIDES,
		description:
			'A bottom-up parse in detail: the sentential forms from the input down to E, the handle of each in red. Read upward, the list is a rightmost derivation.',
		cite: { deck: '13', slide: [5, 10] },
		value: { grammar: SLIDE_GRAMMAR, input: SLIDE_INPUT, view: 'handles' }
	},
	{
		id: 'nested',
		label: 'int + (int + (int))',
		group: MORE,
		description:
			'The grammar of the shift-reduce example on a nested input. Inside two parentheses the parser goes through states 8 to 11 of the DFA, which int + (int) + (int) never reaches. The DFA state of each stack symbol is shown under it.',
		cite: { deck: '14', slide: 17 },
		value: { grammar: SLIDE_GRAMMAR, input: 'int + ( int + ( int ) )', view: 'trace', stacks: true }
	},
	{
		id: 'epsilon',
		label: 'Reductions that pop nothing',
		group: MORE,
		description:
			'The left-factored grammar of Table-based Predictive Parsing, parsed bottom-up on int * int. Y → ε and X → ε have an empty handle: the reduction pops no symbols and pushes the non-terminal.',
		cite: { deck: '14', slide: 15 },
		value: { grammar: LEFT_FACTORED, input: 'int * int', view: 'trace' },
		questions: [
			{
				prompt: 'Reduce pops 0 or more symbols (α) and pushes a non-terminal (A). 0 ?',
				answer:
					'A reduction by an ε-production, A → ε: the handle is empty, so nothing is popped, and A is pushed.',
				cite: { deck: '14', slide: 15 }
			}
		]
	},
	{
		id: 'cascade',
		label: 'E → E + T | T',
		group: MORE,
		description:
			'A left-recursive cascade: * binds tighter than +, and both group to the left. No left factoring or removal of left recursion is needed for a bottom-up parser.',
		value: { grammar: CASCADE, input: 'int + int * int + int', view: 'trace' }
	},
	{
		id: 'ambiguous',
		label: 'E → E + E | E * E | int',
		group: MORE,
		description:
			'An ambiguous grammar: its LR(1) table has shift/reduce conflicts on + and *. With no precedence declared, each is settled with a shift, as bison does, so int * int + int is grouped as int * (int + int).',
		cite: { deck: '15', slide: [18, 19] },
		value: { grammar: AMBIGUOUS, input: 'int * int + int', view: 'trace' }
	}
];

export const DEFAULT_PRESET_ID = 'slide-14';

/** The state a preset opens: the whole trace, or all the reductions, unless it says otherwise. */
export function presetState(p: Preset<ShiftReducePresetValue>): ShiftReduceState {
	return {
		...DEFAULT_STATE,
		...p.value,
		step: p.value.step ?? null,
		handleStep: p.value.handleStep ?? null
	};
}

const sameText = (a: string, b: string) =>
	a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');

/**
 * The preset the state shows: `loaded` while the grammar, input and view are
 * still the preset's, else the first preset that has them.
 */
export function presetFor(
	state: Pick<ShiftReduceState, 'grammar' | 'input' | 'view'>,
	loaded: string | null = null
): ShiftReducePreset | null {
	const fits = (p: ShiftReducePreset) =>
		sameText(p.value.grammar, state.grammar) &&
		sameText(p.value.input, state.input) &&
		(p.value.view ?? 'trace') === state.view;
	const current = presets.find((p) => p.id === loaded);
	if (current && fits(current)) return current;
	return presets.find(fits) ?? null;
}
