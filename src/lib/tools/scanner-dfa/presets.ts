/**
 * Presets from the slides, with the questions the slides ask about them.
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import type { RuleState } from '$lib/tools/links';
import type { ScannerDfaState } from './state';

/** What a preset sets; fields it leaves out keep their current value. */
export type PresetValue = Partial<ScannerDfaState> & Pick<ScannerDfaState, 'source' | 'input'>;

/** A question printed on a slide, with the answer shown behind "Show answer". */
export interface SlideQuestion {
	question: string;
	answer: string;
	/** A table that is part of the answer: header row, then body rows (first cell is the row head). */
	table?: { head: string[]; rows: string[][] };
	cite: Citation;
}

export const DIGIT = "digit = '0' | … | '9'";
export const LETTER = "letter = 'A' | … | 'Z' | 'a' | … | 'z'";
export const LEX2_DEFS = `${DIGIT}\n${LETTER}`;

/** R = Whitespace | Integer | Identifier | '+' (Lexical Analysis II, slides 7, 9, 12). */
export const LEX2_RULES: RuleState[] = [
	{ name: 'Whitespace', re: "' '+" },
	{ name: 'Integer', re: 'digit+' },
	{ name: 'Identifier', re: 'letter (letter | digit)*' },
	{ name: 'Plus', re: "'+'" }
];

/** R = Whitespace | 'new' | Integer | Identifier (Lexical Analysis II, slide 11). */
export const NEW_RULES: RuleState[] = [
	{ name: 'Whitespace', re: "' '+", drop: true },
	{ name: 'New', re: "'new'" },
	{ name: 'Integer', re: 'digit+' },
	{ name: 'Identifier', re: 'letter (letter | digit)*' }
];

/** (1 | 0)*1 as the only rule (Lexical Analysis IV, slides 6 and 10). */
export const ENDS_IN_1_RULES: RuleState[] = [{ name: 'EndsIn1', re: '(1 | 0)*1' }];

export interface ScannerPreset extends Preset<PresetValue> {
	questions?: SlideQuestion[];
}

const L4 = 'Lexical Analysis IV';
const L2 = 'Lexical Analysis II';

export const PRESETS: readonly ScannerPreset[] = [
	{
		id: 'relop',
		label: 'relop: < | <= | <> | > | >= | =',
		group: L4,
		description: 'The relop DFA as a table, and its hand-coded getToken (), on "<=".',
		cite: { deck: '08', slide: [16, 19] },
		value: {
			source: 'relop',
			input: '<=',
			mode: 'first',
			switchInput: '<=',
			breaks: false
		}
	},
	{
		id: 'stu',
		label: 'The S, T, U DFA',
		group: L4,
		description: 'The DFA of slide 14 and its table, on "0110".',
		cite: { deck: '08', slide: 14 },
		value: { source: 'stu', input: '0110', mode: 'first' },
		questions: [
			{
				question: 'What is the transition table?',
				answer: 'Rows are states, columns are input symbols:',
				table: {
					head: ['', '0', '1'],
					rows: [
						['S', 'T', 'U'],
						['T', 'T', 'U'],
						['U', 'T', 'U']
					]
				},
				cite: { deck: '08', slide: 14 }
			}
		]
	},
	{
		id: 'ends-in-1',
		label: '(1 | 0)*1 as one rule',
		group: L4,
		description:
			'On "0110": as on the slide the first token is "01"; with the longest match it is "011".',
		cite: { deck: '08', slide: 10 },
		value: {
			source: 'rules',
			defs: '',
			rules: ENDS_IN_1_RULES,
			input: '0110',
			minimal: false,
			mode: 'first'
		},
		questions: [
			{
				question: 'Is the previous DFA minimal?',
				answer:
					'No. States 0 and 1 have the same row in T (0 → 1, 1 → 2) and neither accepts, so they can be merged; the minimal DFA has two states. Turn on “Minimal DFA” to see it.',
				cite: { deck: '08', slide: 11 }
			}
		]
	},
	{
		id: 'f3g',
		label: 'Scan "f+3  +g"',
		group: L2,
		description: "R = Whitespace | Integer | Identifier | '+', longest match, minimal DFA.",
		cite: { deck: '05', slide: 7 },
		value: {
			source: 'rules',
			defs: LEX2_DEFS,
			rules: LEX2_RULES,
			input: 'f+3  +g',
			minimal: true,
			mode: 'longest'
		},
		questions: [
			{
				question: 'Token tuples are ?',
				answer:
					'(Identifier, "f"), (Plus, "+"), (Integer, "3"), (Whitespace, "  "), (Plus, "+"), (Identifier, "g"). The slide prints the Whitespace lexeme as " "; the input has two spaces and the longest match takes both.',
				cite: { deck: '05', slide: 7 }
			}
		]
	},
	{
		id: 'foo3',
		label: 'Scan "foo+3"',
		group: L2,
		description: '"f", "fo" and "foo" all match Identifier; the longest match takes "foo".',
		cite: { deck: '05', slide: [9, 10] },
		value: {
			source: 'rules',
			defs: LEX2_DEFS,
			rules: LEX2_RULES,
			input: 'foo+3',
			minimal: true,
			mode: 'longest'
		},
		questions: [
			{
				question: 'How much input is used?',
				answer:
					'Maximal munch: use max(i, k), the longest prefix that matches R. Here "foo". The driver as on slide 15 stops at the first accepting state and returns "f".',
				cite: { deck: '05', slide: [9, 10] }
			}
		]
	},
	{
		id: 'new-foo',
		label: '\'new\' vs Identifier on "new foo"',
		group: L2,
		description: "R = Whitespace | 'new' | Integer | Identifier; Whitespace is dropped.",
		cite: { deck: '05', slide: 11 },
		value: {
			source: 'rules',
			defs: LEX2_DEFS,
			rules: NEW_RULES,
			input: 'new foo',
			minimal: true,
			mode: 'longest'
		},
		questions: [
			{
				question: '"new" matches \'new\' but also Identifier. Which one is picked?',
				answer:
					'min(j, k): the rule listed first, so (New, "new"). The DFA state reached on "new" accepts for both rules and reports the token of the earlier one.',
				cite: { deck: '05', slide: 11 }
			}
		]
	},
	{
		id: 'eq56',
		label: 'Scan "=56"',
		group: L2,
		description: 'No prefix of "=56" matches R, so the first call ends in handleError ().',
		cite: { deck: '05', slide: 12 },
		value: {
			source: 'rules',
			defs: LEX2_DEFS,
			rules: LEX2_RULES,
			input: '=56',
			minimal: true,
			mode: 'longest'
		}
	}
];

export const DEFAULT_PRESET = PRESETS[0];

/**
 * The preset the table-driven source still matches: the same DFA from the
 * slides, or the same definitions, rules and input.
 */
export function matchPreset(state: ScannerDfaState): ScannerPreset | null {
	for (const p of PRESETS) {
		const v = p.value;
		if (v.source !== state.source) continue;
		if (v.source === 'rules') {
			if (v.defs !== state.defs || v.input !== state.input) continue;
			if (!sameRules(v.rules ?? [], state.rules)) continue;
		}
		return p;
	}
	return null;
}

function sameRules(a: readonly RuleState[], b: readonly RuleState[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(r, i) =>
				r.name === b[i].name && r.re === b[i].re && (r.drop ?? false) === (b[i].drop ?? false)
		)
	);
}
