/**
 * Presets for the Regular Expressions tool, from Lexical Analysis (slides
 * 23–32), Lexical Analysis III (slides 7–16), Scanning with flex (slides
 * 8–10) and Lexical Analysis IV (slide 6).
 */
import type { Preset } from '$lib/components/ui/types';
import { blankState, type Dialect, type RegexToolState } from './state';

export interface RegexPresetValue {
	re: string;
	defs?: string;
	dialect?: Dialect;
	alphabet?: string;
	tests?: string[];
	compare?: string;
}

/** A question the slide asks about the example, with its answer. */
export interface SlideQuestion {
	question: string;
	answer: string;
	/** The answer is notation (shown in the monospace font). */
	formal?: boolean;
}

export interface RegexPreset extends Preset<RegexPresetValue> {
	questions?: SlideQuestion[];
}

const DIGIT_FULL = "digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'";
const DIGIT = "digit = '0' | '1' | '2' | … | '9'";
const LETTER = "letter = 'A' | … | 'Z' | 'a' | … | 'z'";

const BASIS = 'Basis and operators';
const TOKENS = 'Token examples';
const AUTOMATA = 'Finite automata languages';
const FLEX = 'flex patterns';

export const presets: RegexPreset[] = [
	{
		id: 'atomic',
		group: BASIS,
		label: "Atomic: 'c'",
		description: 'L(\'c\') = { "c" }',
		cite: { deck: '04', slide: 23 },
		value: { re: "'c'", tests: ['c', 'cc', ''] }
	},
	{
		id: 'empty',
		group: BASIS,
		label: 'Empty: ɸ',
		description: 'L(ɸ) = { }',
		cite: { deck: '04', slide: 23 },
		value: { re: 'ɸ', tests: [''] }
	},
	{
		id: 'epsilon',
		group: BASIS,
		label: 'Epsilon: ε',
		description: 'L(ε) = { "" }',
		cite: { deck: '04', slide: 23 },
		value: { re: 'ε', tests: [''] }
	},
	{
		id: 'if-concat',
		group: BASIS,
		label: "'i' 'f' and 'if'",
		description: "L('i' 'f') = { \"if\" }, abbreviated 'if'",
		cite: { deck: '04', slide: 24 },
		value: { re: "'i' 'f'", compare: "'if'", tests: ['if', 'i'] }
	},
	{
		id: 'if-then-else',
		group: BASIS,
		label: "'if' | 'then' | 'else'",
		description: 'An RE for "if", "then", or "else"',
		cite: { deck: '04', slide: 25 },
		value: { re: "'if' | 'then' | 'else'", tests: ['then', 'the'] }
	},
	{
		id: 'digits',
		group: BASIS,
		label: "'0' | '1' | … | '9'",
		description: 'An RE for "0", "1", …, "9"',
		cite: { deck: '04', slide: 25 },
		value: { re: "'0' | '1' | … | '9'", tests: ['7', '42'] }
	},
	{
		id: 'two-bits',
		group: BASIS,
		label: "('0' | '1') ('0' | '1')",
		description: 'A concatenation of two choices',
		cite: { deck: '04', slide: 25 },
		value: { re: "('0' | '1') ('0' | '1')", tests: ['01', '0'] },
		questions: [
			{
				question: "('0' | '1') ('0' | '1') = ?",
				answer: '{ "00", "01", "10", "11" }',
				formal: true
			}
		]
	},
	{
		id: 'zero-star',
		group: BASIS,
		label: "'0'*",
		description: 'L(A*) = { "" } ∪ L(A) ∪ L(AA) ∪ …',
		cite: { deck: '04', slide: 26 },
		value: { re: "'0'*", tests: ['', '000', '010'] }
	},
	{
		id: 'one-zero-star',
		group: BASIS,
		label: "'1' '0'*",
		description: 'A symbol followed by an iteration',
		cite: { deck: '04', slide: 26 },
		value: { re: "'1' '0'*", tests: ['100', '010'] },
		questions: [
			{
				question: "'1' '0'* = ?",
				answer: '{ "1", "10", "100", "1000", … }',
				formal: true
			}
		]
	},
	{
		id: 'number',
		group: BASIS,
		label: 'number = digit digit*',
		description: 'Number: a non-empty string of digits',
		cite: { deck: '04', slide: 27 },
		value: { defs: DIGIT_FULL, re: 'digit digit*', compare: 'digit+', tests: ['2024', ''] }
	},
	{
		id: 'plus-and-power',
		group: BASIS,
		label: 'digit+ and digit^3',
		description: 'Positive closure L(A+) = L(A A*) and fixed iteration L(A³) = L(A A A)',
		cite: { deck: '04', slide: 27 },
		value: { defs: DIGIT_FULL, re: 'digit+', compare: 'digit^3', tests: ['717', '7'] }
	},
	{
		id: 'keyword',
		group: TOKENS,
		label: 'keyword',
		description: "keyword = 'for' | 'typename' | 'class' | …",
		cite: { deck: '04', slide: 28 },
		value: { re: "'for' | 'typename' | 'class'", tests: ['typename', 'type', 'for'] }
	},
	{
		id: 'identifier',
		group: TOKENS,
		label: 'identifier',
		description: 'Strings of letters or digits, starting with a letter',
		cite: { deck: '04', slide: 29 },
		value: {
			defs: `${LETTER}\n${DIGIT}`,
			re: 'letter (letter | digit)*',
			compare: '(letter* | digit*)',
			tests: ['x2y', '2xy', '']
		},
		questions: [
			{ question: 'identifier = ?', answer: 'letter (letter | digit)*', formal: true },
			{
				question: 'Is (letter* | digit*) the same?',
				answer:
					'No. (letter* | digit*) contains "" and strings of digits such as "42", and it does not contain strings that mix letters and digits, such as "a1".'
			}
		]
	},
	{
		id: 'ws',
		group: TOKENS,
		label: 'ws (whitespace)',
		description: 'A non-empty sequence of spaces, tabs, carriage returns, or newlines',
		cite: { deck: '04', slide: 30 },
		value: {
			re: "(' ' | '\\t' | '\\r' | '\\n')+",
			tests: [' ', '\t\n', ' x', '']
		}
	},
	{
		id: 'phone',
		group: TOKENS,
		label: 'Phone number',
		description: 'Consider (717) 867-5309',
		cite: { deck: '04', slide: 31 },
		value: {
			defs: `${DIGIT}\narea = digit^3\nexchange = digit^3\nphone = digit^4`,
			re: "'(' area ')' exchange '-' phone",
			alphabet: '{ 0, 1, 2, 3, …, 9, (, ), - }',
			tests: ['(717) 867-5309', '(717)867-5309']
		}
	},
	{
		id: 'email',
		group: TOKENS,
		label: 'Email address',
		description: "address = name '@' name ('.' name)+",
		cite: { deck: '04', slide: 32 },
		value: {
			defs: `${LETTER}\nname = letter+`,
			re: "name '@' name ('.' name)+",
			alphabet: 'letter ∪ { ., @ }',
			tests: ['account@cs.example.edu', 'account@cs']
		}
	},
	{
		id: 'ones-then-zero',
		group: AUTOMATA,
		label: '1*0',
		description: 'Any number of 1-s followed by a single 0',
		cite: { deck: '06', slide: 7 },
		value: { re: '1*0', tests: ['1110', '1101'] },
		questions: [
			{
				question: 'Check that "1110" is accepted but "110…" is not.',
				answer:
					'"1110" is in L(1*0). A string that goes on after "110", such as "1101", is not: nothing may follow the 0.'
			}
		]
	},
	{
		id: 'ends-00',
		group: AUTOMATA,
		label: '(0 | 1)*00',
		description: 'The language of the three-state DFA',
		cite: { deck: '06', slide: 8 },
		value: { re: '(0 | 1)*00', tests: ['100', '1001'] }
	},
	{
		id: 'ends-01',
		group: AUTOMATA,
		label: '(0|1)*01',
		description: 'The NFA run on input 1 0 1',
		cite: { deck: '06', slide: 13 },
		value: { re: '(0|1)*01', tests: ['101', '110'] }
	},
	{
		id: 'third-from-end',
		group: AUTOMATA,
		label: '(0 | 1)* 1 (0|1)^2',
		description: 'An NFA with 4 states whose DFA has 8',
		cite: { deck: '06', slide: 16 },
		value: { re: '(0 | 1)* 1 (0|1)^2', tests: ['100', '1011', '011'] }
	},
	{
		id: 'thompson-example',
		group: AUTOMATA,
		label: '(1 | 0)*1',
		description: "The RE for Thompson's construction and the subset construction",
		cite: { deck: '08', slide: 6 },
		value: { re: '(1 | 0)*1', tests: ['01', '10'] }
	},
	{
		id: 'flex-number',
		group: FLEX,
		label: '[0-9]+',
		description: 'Example 1: the numbers in the input',
		cite: { deck: '07', slide: 8 },
		value: { dialect: 'flex', re: '[0-9]+', tests: ['123', '7.5'] }
	},
	{
		id: 'flex-delim',
		group: FLEX,
		label: 'DELIM [ \\t]+',
		description: 'Example 2: blanks and tabs',
		cite: { deck: '07', slide: 9 },
		value: { dialect: 'flex', defs: 'DELIM     [ \\t]+', re: '{DELIM}', tests: [' \t ', 'a b'] }
	},
	{
		id: 'flex-id',
		group: FLEX,
		label: '{LETTER}({LETTER}|{DIGIT})*',
		description: 'Example 3: ID, with DIGIT [0-9] and LETTER [A-Za-z]',
		cite: { deck: '07', slide: 10 },
		value: {
			dialect: 'flex',
			defs: 'DIGIT     [0-9]\nLETTER    [A-Za-z]',
			re: '{LETTER}({LETTER}|{DIGIT})*',
			tests: ['abc123', 'x_1', '123abc']
		}
	}
];

/** Loaded on a first visit: it uses every view. */
export const DEFAULT_PRESET_ID = 'identifier';

export function presetById(id: string): RegexPreset | undefined {
	return presets.find((p) => p.id === id);
}

/** The inputs a preset sets; view options (list length, tab, parentheses) are kept. */
export function applyPreset(
	preset: RegexPreset,
	current: Pick<RegexToolState, 'maxLength' | 'full' | 'view'>
): RegexToolState {
	const v = preset.value;
	return {
		...blankState(),
		re: v.re,
		defs: v.defs ?? '',
		dialect: v.dialect ?? 'lecture',
		alphabet: v.alphabet ?? '',
		tests: [...(v.tests ?? [])],
		compare: v.compare ?? '',
		maxLength: current.maxLength,
		full: current.full,
		view: current.view
	};
}

/** The preset whose expression (R, definitions, dialect, Σ) is loaded, if any. */
export function matchPreset(
	state: Pick<RegexToolState, 're' | 'defs' | 'dialect' | 'alphabet'>
): RegexPreset | undefined {
	return presets.find(
		(p) =>
			p.value.re === state.re &&
			(p.value.defs ?? '') === state.defs &&
			(p.value.dialect ?? 'lecture') === state.dialect &&
			(p.value.alphabet ?? '') === state.alphabet
	);
}
