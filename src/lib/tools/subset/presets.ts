/**
 * Examples from Lexical Analysis III (finite automata) and Lexical Analysis IV
 * (regular expressions to finite automata). Slide NFAs whose states are not
 * labeled on the slide use the letters A, B, C, … from left to right.
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';

export type SubsetPresetValue =
	| { from: 're'; re: string; defs?: string; input?: string }
	| { from: 'nfa'; text: string; input?: string };

/** A question the slide poses about the example, with its answer. */
export interface SlideQuestion {
	cite: Citation;
	prompt: string;
	answer: string;
	/** Offer "Minimize this DFA" next to the answer. */
	minimizeLink?: boolean;
}

export interface SubsetPreset extends Preset<SubsetPresetValue> {
	question?: SlideQuestion;
}

const LECTURE_IV = 'Lexical Analysis IV';
const LECTURE_III = 'Lexical Analysis III';
const MORE = 'More examples';

export const PRESETS: readonly SubsetPreset[] = [
	{
		id: 'l08-ones',
		label: '(1 | 0)*1',
		group: LECTURE_IV,
		description:
			'Thompson NFA A–J (slide 6); the construction gives ABCDHI, FGABCDHI and EJGABCDHI.',
		cite: { deck: '08', slide: 10 },
		value: { from: 're', re: '(1 | 0)*1', input: '0101' },
		question: {
			cite: { deck: '08', slide: 11 },
			prompt: 'Is the previous DFA minimal?',
			answer:
				'No. ABCDHI and FGABCDHI are both non-accepting, and on every symbol they go to the same state (0 → FGABCDHI, 1 → EJGABCDHI), so they can be merged. The minimal DFA has 2 states.',
			minimizeLink: true
		}
	},
	{
		id: 'l06-s9',
		label: 'A →¹ A, A →¹ B',
		group: LECTURE_III,
		description: 'Two transitions on 1 out of A, over the alphabet { 0, 1 }.',
		cite: { deck: '06', slide: 9 },
		value: {
			from: 'nfa',
			text: 'alphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 1 B\n',
			input: '111'
		}
	},
	{
		id: 'l06-s13',
		label: 'NFA for (0|1)*01',
		group: LECTURE_III,
		description: 'The NFA the slide runs on input 1 0 1.',
		cite: { deck: '06', slide: 13 },
		value: { from: 'nfa', text: 'start: A\naccept: C\nA 0,1 A\nA 0 B\nB 1 C\n', input: '101' }
	},
	{
		id: 'l06-s15',
		label: 'NFA for (0|1)*00',
		group: LECTURE_III,
		description: 'A 3-state NFA next to the 3-state DFA for the same language.',
		cite: { deck: '06', slide: 15 },
		value: { from: 'nfa', text: 'start: A\naccept: C\nA 0,1 A\nA 0 B\nB 0 C\n', input: '1100' },
		question: {
			cite: { deck: '06', slide: 15 },
			prompt: 'How many possible states in corresponding DFA?',
			answer:
				'The NFA has 3 states, so there are 2³ = 8 possible subsets of { A, B, C }. The subset construction reaches only 3 of them: A, AB and ABC.'
		}
	},
	{
		id: 'l06-s16',
		label: 'NFA for (0 | 1)* 1 (0|1)²',
		group: LECTURE_III,
		description: 'Strings whose third symbol from the end is 1: 4 NFA states, 2³ = 8 DFA states.',
		cite: { deck: '06', slide: 16 },
		value: {
			from: 'nfa',
			text: 'start: A\naccept: D\nA 0,1 A\nA 1 B\nB 0,1 C\nC 0,1 D\n',
			input: '0100'
		}
	},
	{
		id: 'a-or-b-star',
		label: 'a | b*',
		group: MORE,
		description: 'Alternation around an iteration.',
		value: { from: 're', re: 'a | b*', input: 'bb' }
	},
	{
		id: 'abb',
		label: '(a|b)*abb',
		group: MORE,
		description: 'Strings over { a, b } that end in abb.',
		value: { from: 're', re: '(a|b)*abb', input: 'babb' }
	}
];

export const DEFAULT_PRESET: SubsetPreset = PRESETS[0];

const normalizeText = (t: string) =>
	t
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l !== '')
		.join('\n');

/** The preset whose source is exactly this one, if any. */
export function presetFor(src: {
	from: 're' | 'nfa';
	re: string;
	defs: string;
	text: string;
}): SubsetPreset | undefined {
	return PRESETS.find((p) =>
		p.value.from === 're'
			? src.from === 're' && p.value.re === src.re && (p.value.defs ?? '') === src.defs
			: src.from === 'nfa' && normalizeText(p.value.text) === normalizeText(src.text)
	);
}
