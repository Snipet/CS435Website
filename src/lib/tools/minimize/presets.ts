/**
 * Example machines. Lecture presets reproduce the slides; the others are
 * marked uncited.
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import type { MinimizeState } from './state';

export type PresetInput = Pick<MinimizeState, 'from'> &
	Partial<Pick<MinimizeState, 're' | 'defs' | 'rules' | 'text' | 'p' | 'q'>>;

/** A question posed on a slide, with its answer (shown behind "Show answer"). */
export interface SlideQuestion {
	prompt: string;
	/** Plain text; `backticks` mark formal notation. */
	answer: string;
	cite?: Citation;
}

export interface MinimizePreset extends Preset<PresetInput> {
	question?: SlideQuestion;
}

const IV = 'Lexical Analysis IV';
const III = 'Lexical Analysis III';
const MORE = 'Other examples';

export const presets: readonly MinimizePreset[] = [
	{
		id: 'subset-dfa',
		label: 'Subset DFA for (1 | 0)*1',
		group: IV,
		description:
			'The DFA the subset construction builds from the NFA for (1 | 0)*1: ABCDHI, FGABCDHI, EJGABCDHI.',
		cite: { deck: '08', slide: 10 },
		value: { from: 're', re: '(1 | 0)*1' },
		question: {
			prompt: 'Is the previous DFA minimal?',
			cite: { deck: '08', slide: 11 },
			answer:
				'No. `ABCDHI` and `FGABCDHI` are equivalent: neither accepts, and both go to `FGABCDHI` on 0 and to `EJGABCDHI` on 1. Merging them leaves 2 states.'
		}
	},
	{
		id: 'stu',
		label: 'The S, T, U DFA',
		group: IV,
		description:
			'The DFA of the transition-table slide: the slide-10 machine with its states named S, T, U.',
		cite: { deck: '08', slide: 14 },
		value: {
			from: 'dfa',
			text: `states: S T U
start: S
accept: U
S 0 T
S 1 U
T 0 T
T 1 U
U 0 T
U 1 U
`
		}
	},
	{
		id: 'ends-00',
		label: 'DFA for (0 | 1)*00',
		group: III,
		description:
			'The complete 3-state DFA of slide 8 (unnamed on the slide; named q0, q1, q2 here).',
		cite: { deck: '06', slide: 8 },
		value: {
			from: 'dfa',
			text: `states: q0 q1 q2
start: q0
accept: q2
q0 1 q0
q0 0 q1
q1 0 q2
q1 1 q0
q2 0 q2
q2 1 q0
`
		},
		question: {
			prompt: 'What language does this recognize? Give the RE.',
			answer: 'L(R) with R = `(0 | 1)*00`: the strings that end in 00.'
		}
	},
	{
		id: 'third-from-last',
		label: '8-state DFA for (0 | 1)* 1 (0|1)²',
		group: III,
		description:
			'The subset DFA of the slide’s 4-state NFA (its states named A–D; each DFA name lists the NFA states it holds). It remembers the last three symbols.',
		cite: { deck: '06', slide: 16 },
		value: {
			from: 'dfa',
			text: `states: A AB AC ABC AD ABD ACD ABCD
start: A
accept: AD ABD ACD ABCD
A 0 A
A 1 AB
AB 0 AC
AB 1 ABC
AC 0 AD
AC 1 ABD
ABC 0 ACD
ABC 1 ABCD
AD 0 A
AD 1 AB
ABD 0 AC
ABD 1 ABC
ACD 0 AD
ACD 1 ABD
ABCD 0 ACD
ABCD 1 ABCD
`
		}
	},
	{
		id: 'one-star-zero',
		label: 'Partial DFA for 1*0',
		group: III,
		description:
			'Missing transitions go to a trap state (slide 6). The trap is added before partitioning and dropped from the result.',
		cite: { deck: '06', slide: 7 },
		value: {
			from: 'dfa',
			text: `start: q0
accept: q1
q0 1 q0
q0 0 q1
`
		}
	},
	{
		id: 'abb',
		label: 'Subset DFA for (a | b)* a b b',
		group: MORE,
		description:
			'The subset DFA of Thompson’s NFA for (a | b)* a b b, its five states renamed A–E in the order they are found.',
		value: {
			from: 'dfa',
			text: `states: A B C D E
start: A
accept: E
A a B
A b C
B a B
B b D
C a B
C b C
D a B
D b E
E a B
E b C
`
		}
	},
	{
		id: 'scanner',
		label: 'Scanner DFA for If, Integer, Identifier',
		group: MORE,
		description:
			'The DFA for three token rules. Accepting states start in one block per token, so the state reached on "if" stays apart from the identifier states.',
		value: {
			from: 'rules',
			defs: `digit = '0' | … | '9'
letter = 'a' | … | 'z'
`,
			rules: `If = 'if'
Integer = digit+
Identifier = letter (letter | digit)*
`,
			p: 'MNOPQU',
			q: 'CMDNOPQU'
		}
	}
];

export const DEFAULT_PRESET = presets[0];
