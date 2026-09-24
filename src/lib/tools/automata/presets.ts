/**
 * Machines from the slides. The small machines of Lexical Analysis III are
 * drawn without state names; they are named A, B, C… from left to right here
 * and load with "Hide state names" on.
 */
import type { Preset } from '$lib/components/ui/types';
import { decks } from '$lib/lectures';
import { automatonFromText } from '$lib/theory/automata/core';
import type { Automaton } from '$lib/theory/automata/types';
import type { PositionsJson } from './codec';

/** Part of an answer: running text, a formal line, or a small table. */
export type AnswerBlock =
	| { kind: 'text'; text: string }
	| { kind: 'formal'; text: string }
	| { kind: 'table'; head: string[]; rows: string[][] };

export interface AutomataPreset {
	machine: Automaton;
	/** Pinned positions by state id, or null for automatic layout. */
	positions: PositionsJson;
	hideNames: boolean;
	input: string;
	/** Strings for the batch run. */
	batch: string[];
	/** Text on the start arrow. */
	startLabel?: string;
	/** A question the slide asks, with its answer (shown on request). */
	question?: { prompt: string; answer: AnswerBlock[] };
	/** A task the slide sets, with nothing to reveal. */
	prompt?: string;
}

const GAP = 130;
/** States in one row, left to right. */
const row = (n: number): [number, number][] =>
	Array.from({ length: n }, (_, i) => [i * GAP, 0] as [number, number]);

const III = decks['06'].title;
const IV = decks['08'].title;

/** relop (Lexical Analysis IV, slide 16): notes, retract marks, and `other` edges. */
function relop(): Automaton {
	const a = automatonFromText(
		[
			'states: 0 1 2 3 4 5 6 7 8',
			'start: 0',
			'accept: 2 3 4 5 7 8',
			'0 < 1',
			'0 = 5',
			'0 > 6',
			'1 = 2',
			'1 > 3',
			'1 [^=>] 4',
			'6 = 7',
			'6 [^=] 8'
		].join('\n')
	);
	const notes: Record<string, string> = {
		'2': 'return LE',
		'3': 'return NE',
		'4': 'return LT',
		'5': 'return EQ',
		'7': 'return GE',
		'8': 'return GT'
	};
	return {
		...a,
		states: a.states.map((s) => ({
			...s,
			...(notes[s.name] ? { note: notes[s.name] } : {}),
			...(s.name === '4' || s.name === '8' ? { retract: true } : {})
		})),
		transitions: a.transitions.map((t) =>
			t.label && t.label.size > 1 ? { ...t, display: 'other' } : t
		)
	};
}

export const presets: readonly Preset<AutomataPreset>[] = [
	{
		id: '06-6',
		label: 'DFA accepting exactly "1"',
		group: III,
		description: 'Two states over Σ = { 1 }; the accepting state has no transitions.',
		cite: { deck: '06', slide: 6 },
		value: {
			machine: automatonFromText('states: A B\nalphabet: 1\nstart: A\naccept: B\nA 1 B'),
			positions: row(2),
			hideNames: true,
			input: '1',
			batch: ['1', '', '11'],
			question: {
				prompt: 'This DFA (M) accepts what language?',
				answer: [
					{ kind: 'formal', text: 'L(M) = { "1" }' },
					{
						kind: 'text',
						text: 'Any other input either ends in the non-accepting start state or needs a transition that is missing, which sends the machine to the trap state (or crashes it).'
					}
				]
			}
		}
	},
	{
		id: '06-7',
		label: 'DFA: any number of 1-s, then a single 0',
		group: III,
		description: 'A loop on 1 at the start state and a 0-transition to the accepting state.',
		cite: { deck: '06', slide: 7 },
		value: {
			machine: automatonFromText('states: A B\nalphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 0 B'),
			positions: row(2),
			hideNames: true,
			input: '1110',
			batch: ['1110', '110', '1101', '1100', '0', ''],
			prompt: 'Check that "1110" is accepted but "110…" is not.'
		}
	},
	{
		id: '06-8',
		label: 'DFA: strings ending in 00',
		group: III,
		description: 'A complete DFA over { 0, 1 }: every state has a 0- and a 1-transition.',
		cite: { deck: '06', slide: 8 },
		value: {
			machine: automatonFromText(
				'states: A B C\nalphabet: 0,1\nstart: A\naccept: C\nA 1 A\nA 0 B\nB 0 C\nB 1 A\nC 0 C\nC 1 A'
			),
			positions: row(3),
			hideNames: true,
			input: '1100',
			batch: ['00', '100', '1100', '001', '0', ''],
			question: {
				prompt: 'What language does this recognize? Give the RE.',
				answer: [
					{ kind: 'formal', text: 'L(R) where R = (0 | 1)*00' },
					{ kind: 'text', text: 'The strings over { 0, 1 } that end in 00.' }
				]
			}
		}
	},
	{
		id: '06-9',
		label: 'NFA: two transitions on 1',
		group: III,
		description:
			'From A, the input 1 can lead to A or to B, so the input does not fully determine what the automaton does.',
		cite: { deck: '06', slide: 9 },
		value: {
			machine: automatonFromText('states: A B\nalphabet: 0,1\nstart: A\naccept: B\nA 1 A\nA 1 B'),
			positions: row(2),
			hideNames: false,
			input: '111',
			batch: ['1', '111', '', '10']
		}
	},
	{
		id: '06-10',
		label: 'An ε-move',
		group: III,
		description: 'The machine can move from A to B without reading input.',
		cite: { deck: '06', slide: 10 },
		value: {
			machine: automatonFromText('start: A\nA ε B'),
			positions: row(2),
			hideNames: false,
			input: '',
			batch: ['']
		}
	},
	{
		id: '06-13',
		label: 'NFA run on 1 0 1',
		group: III,
		description:
			'An NFA can be in several states at once; it accepts if it can get into a final state.',
		cite: { deck: '06', slide: 13 },
		value: {
			machine: automatonFromText(
				'states: A B C\nalphabet: 0,1\nstart: A\naccept: C\nA 1 A\nA 0 A\nA 0 B\nB 1 C'
			),
			positions: row(3),
			hideNames: true,
			input: '101',
			batch: ['101', '01', '110', '1001', ''],
			prompt: 'Input: 1 0 1. Which states is the NFA in after each symbol?'
		}
	},
	{
		id: '06-15',
		label: 'NFA for (0 | 1)*00',
		group: III,
		description:
			'The NFA can guess where the final 00 starts; compare it with the DFA for the same language.',
		cite: { deck: '06', slide: 15 },
		value: {
			machine: automatonFromText(
				'states: A B C\nalphabet: 0,1\nstart: A\naccept: C\nA 1 A\nA 0 A\nA 0 B\nB 0 C'
			),
			positions: row(3),
			hideNames: true,
			input: '1100',
			batch: ['00', '100', '1100', '001', '0', ''],
			question: {
				prompt: 'How many possible states in corresponding DFA?',
				answer: [
					{
						kind: 'text',
						text: 'At most 2³ = 8, one for each subset of { A, B, C }. Only three are reachable from the start:'
					},
					{ kind: 'formal', text: '{ A }, { A, B }, { A, B, C }' },
					{
						kind: 'text',
						text: 'They give the three-state DFA for strings ending in 00 (Lexical Analysis III, slide 8).'
					}
				]
			}
		}
	},
	{
		id: '06-16',
		label: 'NFA for (0 | 1)* 1 (0|1)²',
		group: III,
		description:
			'Strings whose third symbol from the end is 1. The NFA has four states; a DFA needs eight.',
		cite: { deck: '06', slide: 16 },
		value: {
			machine: automatonFromText(
				'states: A B C D\nalphabet: 0,1\nstart: A\naccept: D\nA 1 A\nA 0 A\nA 1 B\nB 0,1 C\nC 0,1 D'
			),
			positions: row(4),
			hideNames: true,
			input: '0100',
			batch: ['100', '0100', '1011', '011', '10', '']
		}
	},
	{
		id: '08-10',
		label: 'Subset DFA for (1 | 0)*1',
		group: IV,
		description:
			'The subset construction applied to the Thompson NFA for (1 | 0)*1; each state is named by the NFA states it contains.',
		cite: { deck: '08', slide: 10 },
		value: {
			machine: automatonFromText(
				[
					'states: ABCDHI FGABCDHI EJGABCDHI',
					'start: ABCDHI',
					'accept: EJGABCDHI',
					'ABCDHI 0 FGABCDHI',
					'ABCDHI 1 EJGABCDHI',
					'FGABCDHI 0 FGABCDHI',
					'FGABCDHI 1 EJGABCDHI',
					'EJGABCDHI 0 FGABCDHI',
					'EJGABCDHI 1 EJGABCDHI'
				].join('\n')
			),
			positions: null,
			hideNames: false,
			input: '0101',
			batch: ['1', '01', '0101', '0110', ''],
			question: {
				prompt: 'Is the previous DFA minimal? (slide 11)',
				answer: [
					{
						kind: 'text',
						text: 'No. ABCDHI and FGABCDHI are both non-accepting and have the same transitions (0 to FGABCDHI, 1 to EJGABCDHI), so they can be merged. The minimal DFA has 2 states.'
					}
				]
			}
		}
	},
	{
		id: '08-14',
		label: 'DFA S, T, U and its transition table',
		group: IV,
		description:
			'The same machine with states S, T, U, implemented as a transition table T[i, a] = k.',
		cite: { deck: '08', slide: 14 },
		value: {
			machine: automatonFromText(
				'states: S T U\nstart: S\naccept: U\nS 0 T\nS 1 U\nT 0 T\nT 1 U\nU 0 T\nU 1 U'
			),
			positions: null,
			hideNames: false,
			input: '0101',
			batch: ['1', '01', '0101', '0110', ''],
			question: {
				prompt: 'What is the transition table?',
				answer: [
					{
						kind: 'table',
						head: ['', '0', '1'],
						rows: [
							['S', 'T', 'U'],
							['T', 'T', 'U'],
							['U', 'T', 'U']
						]
					}
				]
			}
		}
	},
	{
		id: '08-16',
		label: 'relop transition diagram',
		group: IV,
		description:
			'relop: < | <= | <> | > | >= | =. Accepting states return a token; * marks a state that pushes back one character; other is any character not on another edge.',
		cite: { deck: '08', slide: 16 },
		value: {
			machine: relop(),
			positions: [
				[0, 190],
				[150, 70],
				[310, 0],
				[310, 70],
				[310, 140],
				[150, 190],
				[150, 310],
				[310, 260],
				[310, 350]
			],
			hideNames: false,
			startLabel: 'start',
			input: '<=',
			batch: ['<', '<=', '<>', '<x', '=', '>', '>=', '>a', '==']
		}
	}
];

export const DEFAULT_PRESET_ID = '06-8';

export function presetById(id: string | null | undefined): Preset<AutomataPreset> | undefined {
	return id ? presets.find((p) => p.id === id) : undefined;
}
