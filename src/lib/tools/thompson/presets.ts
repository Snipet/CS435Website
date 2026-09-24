/**
 * Thompson presets: the construction rules (Lexical Analysis IV, slides 3–5)
 * on the symbols a and b, the lecture's worked example and other lecture
 * expressions, and the derived forms.
 */
import type { Preset } from '$lib/components/ui/types';

export interface ThompsonPresetValue {
	re: string;
	defs?: string;
	/** Step to show; omitted or null shows the finished NFA. */
	step?: number | null;
}

/** A transition as the slides write it: from →symbol to. */
export type SlideEdge = readonly [from: string, symbol: string, to: string];

/** A question posed on the slide, with its answer behind "Show answer". */
export interface SlideQuestion {
	prompt: string;
	answer: string;
	/** Transitions listed after the answer text, drawn as s →a t. */
	edges?: readonly SlideEdge[];
}

export interface ThompsonPreset extends Preset<ThompsonPresetValue> {
	question?: SlideQuestion;
}

const ONE_FINAL: SlideQuestion = {
	prompt: 'OK to assume only 1 final state?',
	answer:
		'Yes. Every rule builds a machine with exactly one start state and one final state, and the rules that combine machines use only those two: they add ε-moves into the start and out of the final.'
};

const RULES = 'Construction rules';
const LECTURE = 'Lecture examples';
const DERIVED = 'Derived forms';

export const presets: readonly ThompsonPreset[] = [
	{
		id: 'rule-epsilon',
		label: 'ε',
		group: RULES,
		description: 'For ε: a new start s and a new final f with s →ε f.',
		cite: { deck: '08', slide: 3 },
		value: { re: 'ε' },
		question: ONE_FINAL
	},
	{
		id: 'rule-symbol',
		label: 'a',
		group: RULES,
		description: 'For a ∈ Σ: a new start s and a new final f with s →a f.',
		cite: { deck: '08', slide: 3 },
		value: { re: 'a' },
		question: ONE_FINAL
	},
	{
		id: 'rule-concat',
		label: 'a b',
		group: RULES,
		description: 'A B: an ε-move from A’s final to B’s start. No new states.',
		cite: { deck: '08', slide: 4 },
		value: { re: 'a b' }
	},
	{
		id: 'rule-alt',
		label: 'a | b',
		group: RULES,
		description: 'A | B: a new start and a new final, joined to A and B by four ε-moves.',
		cite: { deck: '08', slide: 4 },
		value: { re: 'a | b' }
	},
	{
		id: 'rule-star',
		label: 'a*',
		group: RULES,
		description: 'A*: a new start and a new final; A’s final goes back to the new start.',
		cite: { deck: '08', slide: 5 },
		value: { re: 'a*' }
	},
	{
		id: 'lecture-10-star-1',
		label: '(1 | 0)*1',
		group: LECTURE,
		description: 'The worked example: the ten-state NFA with states A–J.',
		cite: { deck: '08', slide: 6 },
		value: { re: '(1 | 0)*1' },
		question: {
			prompt: 'Consider the regular expression (1 | 0)*1. NFA is ?',
			answer: 'States A–J, start A, accepting J, and these 11 transitions:',
			edges: [
				['A', 'ε', 'B'],
				['A', 'ε', 'H'],
				['B', 'ε', 'C'],
				['B', 'ε', 'D'],
				['C', '1', 'E'],
				['D', '0', 'F'],
				['E', 'ε', 'G'],
				['F', 'ε', 'G'],
				['G', 'ε', 'A'],
				['H', 'ε', 'I'],
				['I', '1', 'J']
			]
		}
	},
	{
		id: 'lecture-ends-00',
		label: '(0 | 1)*00',
		group: LECTURE,
		description: 'Strings of 0s and 1s that end in 00.',
		cite: { deck: '06', slide: 15 },
		value: { re: '(0 | 1)*00' }
	},
	{
		id: 'lecture-third-from-last',
		label: '(0 | 1)* 1 (0|1)^2',
		group: LECTURE,
		description: 'The third symbol from the end is 1. (0|1)^2 is built as two copies of (0|1).',
		cite: { deck: '06', slide: 16 },
		value: { re: '(0 | 1)* 1 (0|1)^2' }
	},
	{
		id: 'lecture-keywords',
		label: "'if' | 'then' | 'else'",
		group: LECTURE,
		description:
			'Each keyword is a concatenation of its characters; the options join two at a time.',
		cite: { deck: '04', slide: 25 },
		value: { re: "'if' | 'then' | 'else'" }
	},
	{
		id: 'lecture-number',
		label: 'digit digit*',
		group: LECTURE,
		description:
			'number = digit digit*, with digit written using … as on slide 29: one transition on 0–9 for each use.',
		cite: { deck: '04', slide: 27 },
		value: { re: 'digit digit*', defs: "digit = '0' | '1' | '2' | … | '9'" }
	},
	{
		id: 'derived-plus',
		label: 'a+',
		group: DERIVED,
		description: 'A+ = A A*: the operand, then a fresh copy of it under the star rule.',
		value: { re: 'a+' }
	},
	{
		id: 'derived-optional',
		label: 'a?',
		group: DERIVED,
		description: 'A? = A | ε: the choice rule with an ε-machine as the second option.',
		value: { re: 'a?' }
	}
];

export const DEFAULT_PRESET_ID = 'lecture-10-star-1';

/** The preset whose expression and definitions match, if any. */
export function presetFor(re: string, defs: string): ThompsonPreset | undefined {
	return presets.find((p) => p.value.re === re && (p.value.defs ?? '') === defs);
}
