import type { Preset } from '$lib/components/ui/types';

export interface TinyVmPresetValue {
	/** TM program text. */
	program: string;
	/** Input queue text. */
	input: string;
}

export interface PseudoCode {
	/** Lines as printed, indentation included. */
	lines: readonly string[];
	/** iMem address → index into `lines`. */
	lineOf: Readonly<Record<number, number>>;
}

export interface TinyVmPreset extends Preset<TinyVmPresetValue> {
	/** A question the slide poses about the program. */
	question?: { text: string; answer: string };
	/** Pseudo-code printed beside the program, linked line by line. */
	pseudo?: PseudoCode;
}

/** Intro, slide 14, as printed. */
export const FACTORIAL_PROGRAM = `0:  IN    0, 0, 0
1:  JLE   0, 6(7)
2:  LDC   1, 1, 0
3:  LDC   2, 1, 0
4:  MUL   1, 1, 0
5:  SUB   0, 0, 2
6:  JNE   0, -3(7)
7:  OUT   1, 0, 0
8:  HALT`;

/** The pseudo-code beside it on the slide. */
export const FACTORIAL_PSEUDO: PseudoCode = {
	lines: [
		'r0 = read',
		'if 0 < r0 then',
		'  r1 = 1',
		'  r2 = 1',
		'* repeat',
		'    r1 = r1 * r0',
		'    r0 = r0 - r2',
		'  until r0 == 0',
		'  write r1',
		'halt'
	],
	lineOf: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9 }
};

const SUM_PROGRAM = `* Add the input values up to the first 0, then print the sum.
* dMem[0] holds the highest data address (1023); the sum is kept there.
0:  LD    6, 0(0)     reg[6] = dMem[0] = 1023
1:  ST    0, 0(6)     dMem[1023] = reg[0] = 0
2:  IN    1, 0, 0     read x into reg[1]
3:  JEQ   1, 4(7)     if x == 0, go to 8
4:  LD    2, 0(6)     reg[2] = sum
5:  ADD   2, 2, 1     sum = sum + x
6:  ST    2, 0(6)     dMem[1023] = sum
7:  LDA   7, -6(7)    go to 2
8:  LD    0, 0(6)     reg[0] = sum
9:  OUT   0, 0, 0     print the sum
10: HALT  0, 0, 0`;

const DIVIDE_PROGRAM = `* Read a and b, then print a / b.
0:  IN    0, 0, 0     read a into reg[0]
1:  IN    1, 0, 0     read b into reg[1]
2:  DIV   2, 0, 1     reg[2] = a / b
3:  OUT   2, 0, 0     print the quotient
4:  HALT  0, 0, 0`;

const MAX_PROGRAM = `* Read two numbers and print the larger one.
0:  IN    0, 0, 0     read a into reg[0]
1:  IN    1, 0, 0     read b into reg[1]
2:  SUB   2, 0, 1     reg[2] = a - b
3:  JGE   2, 1(7)     if a >= b, go to 5
4:  LDA   0, 0(1)     reg[0] = b
5:  OUT   0, 0, 0     print reg[0]
6:  HALT  0, 0, 0`;

export const presets: readonly TinyVmPreset[] = [
	{
		id: 'factorial',
		label: 'Factorial',
		description: 'The sample TINY program, with the pseudo-code printed beside it. Input 3.',
		cite: { deck: '00', slide: 14 },
		value: { program: FACTORIAL_PROGRAM, input: '3' },
		question: {
			text: 'What does this code do?',
			answer:
				'It reads n into r0 and, when n > 0, computes n! in r1 and prints it: input 3 prints 6. ' +
				'For n ≤ 0 the JLE at 1 jumps to the HALT at 8 (m = 6 + reg[7] = 6 + 2), so nothing is printed. ' +
				'The JNE at 6 jumps back to 4 (m = -3 + reg[7] = -3 + 7) until r0 reaches 0.'
		},
		pseudo: FACTORIAL_PSEUDO
	},
	{
		id: 'sum',
		label: 'Sum until 0',
		group: 'More programs',
		description:
			'Adds input values up to the first 0 and prints the sum, kept in dMem[1023] with LD and ST. Input 5 12 30 0.',
		value: { program: SUM_PROGRAM, input: '5 12 30 0' }
	},
	{
		id: 'divide',
		label: 'Division by zero',
		group: 'More programs',
		description: 'Prints a / b. With input 7 0, DIV returns srZERODIVIDE and the machine stops.',
		value: { program: DIVIDE_PROGRAM, input: '7 0' }
	},
	{
		id: 'max',
		label: 'Larger of two',
		group: 'More programs',
		description: 'Reads two numbers and prints the larger one, using SUB and JGE. Input 17 42.',
		value: { program: MAX_PROGRAM, input: '17 42' }
	}
];

export const DEFAULT_PRESET_ID = 'factorial';

export function presetById(id: string | null | undefined): TinyVmPreset | undefined {
	return id ? presets.find((p) => p.id === id) : undefined;
}
