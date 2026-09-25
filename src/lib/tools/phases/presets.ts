import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import type { View } from './groupings';
import type { Decl } from './semantic';

export interface PhasesPresetValue {
	source: string;
	decls: Decl[];
	view: View;
}

/** A question the slide asks, with the slide's answer. */
export interface SlideQuestion {
	prompt: string;
	answer: string;
	cite: Citation;
}

export type PhasesPreset = Preset<PhasesPresetValue> & {
	questions?: SlideQuestion[];
	/** The preset shows a semantic error on purpose. */
	semanticError?: boolean;
};

const int = (name: string): Decl => ({ name, type: 'int', value: '' });
const float = (name: string, value = ''): Decl => ({ name, type: 'float', value });

/** "Assume B1 is int, A and C are floats, & C is constant 2.3" (Intro (cont'd), slide 4). */
export const SLIDE_4_DECLS: readonly Decl[] = [float('A'), int('B1'), float('C', '2.3')];
const slide4 = () => SLIDE_4_DECLS.map((d) => ({ ...d }));

export const PRESETS: readonly PhasesPreset[] = [
	{
		id: 'seven-phases',
		label: 'A= B1   +C;',
		group: 'From the slides',
		description: 'Assume B1 is int, A and C are floats, and C is the constant 2.3.',
		cite: { deck: '01', slide: 4 },
		value: { source: 'A= B1   +C;', decls: slide4(), view: 'seven' }
	},
	{
		id: 'if-then-else',
		label: 'if x==y then z  =1; else z= 2  ;',
		group: 'From the slides',
		description:
			'Lexemes and tokens as on slide 5; the statement diagrammed as on slide 9. x, y and z are int.',
		cite: { deck: '03', slide: 5 },
		value: {
			source: 'if x==y then z  =1; else z= 2  ;',
			decls: [int('x'), int('y'), int('z')],
			view: 'five'
		},
		questions: [
			{
				prompt: 'Lexemes?',
				answer: 'if, x, ==, y, then, z, =, 1, ;, else, z, =, 2, ;',
				cite: { deck: '03', slide: 5 }
			},
			{
				prompt: 'Tokens?',
				answer: 'IF, ID, EQ, ID, THEN, ID, ASSIGN, ILIT, SEMI, ELSE, ID, ASSIGN, ILIT, SEMI',
				cite: { deck: '03', slide: 5 }
			},
			{
				prompt: 'Diagrammed?',
				answer:
					'x == y groups into equal, then predicate; z = 1 into assign, then then-stmt; z = 2 into assign, then else-stmt. The three join in if-then-else at the bottom.',
				cite: { deck: '03', slide: 9 }
			}
		]
	},
	{
		id: 'llvm',
		label: 'r = 3 * x + y;',
		group: 'From the slides',
		description:
			'The value the C function f (int x, int y) returns; the slide compiles it to LLVM IR with clang -S -emit-llvm.',
		cite: { deck: '01', slide: 7 },
		value: { source: 'r = 3 * x + y;', decls: [int('r'), int('x'), int('y')], view: 'seven' }
	},
	{
		id: 'times-zero',
		label: 'X = Y * 0;',
		group: 'From the slides',
		description: 'X and Y are float. The optimizer folds only operations on constants.',
		cite: { deck: '03', slide: 16 },
		value: { source: 'X = Y * 0;', decls: [float('X'), float('Y')], view: 'seven' },
		questions: [
			{
				prompt: 'X = Y * 0 is the same as X = 0?',
				answer:
					'No. If Y is a float that is infinite or NaN, Y * 0 is NaN, not 0. The optimizer here keeps the multiplication.',
				cite: { deck: '03', slide: 16 }
			}
		]
	},
	{
		id: 'undeclared',
		label: 'A = B1 + D;',
		group: 'Semantic errors',
		description: 'D is not in the declarations table; compilation stops at the semantic analyzer.',
		cite: { deck: '03', slide: 13 },
		value: { source: 'A = B1 + D;', decls: slide4(), view: 'seven' },
		semanticError: true
	},
	{
		id: 'float-to-int',
		label: 'B1 = A + C;',
		group: 'Semantic errors',
		description: 'B1 is int and A + C is float; compilation stops at the semantic analyzer.',
		cite: { deck: '03', slide: 13 },
		value: { source: 'B1 = A + C;', decls: slide4(), view: 'seven' },
		semanticError: true
	},
	{
		id: 'folding',
		label: 'A = (C + 1) * B1;',
		group: 'More examples',
		description: 'C is the constant 2.3: the optimizer propagates it and folds C + 1 to 3.3.',
		value: { source: 'A = (C + 1) * B1;', decls: slide4(), view: 'seven' }
	},
	{
		id: 'float-compare',
		label: 'if B1 < C then A = C; else A = B1;',
		group: 'More examples',
		description: 'An int compared with a float: B1 is converted before CMPF.',
		value: { source: 'if B1 < C then A = C; else A = B1;', decls: slide4(), view: 'seven' }
	},
	{
		id: 'no-else',
		label: 'if n > 0 then n = n - 1;',
		group: 'More examples',
		description:
			'No else part: the jump over it lands on the next instruction, and the peephole optimizer drops it.',
		value: { source: 'if n > 0 then n = n - 1;', decls: [int('n')], view: 'seven' }
	},
	{
		id: 'dangling-else',
		label: 'if a < b then if b < c then m = c; else m = b;',
		group: 'More examples',
		description: 'Nested if: the else belongs to the nearest if.',
		value: {
			source: 'if a < b then if b < c then m = c; else m = b;',
			decls: [int('a'), int('b'), int('c'), int('m')],
			view: 'seven'
		}
	}
];

export const DEFAULT_PRESET = PRESETS[0];

const declKey = (decls: readonly Decl[]) =>
	decls
		.filter((d) => d.name.trim() !== '')
		.map((d) => `${d.name.trim()}:${d.type}:${d.value.trim()}`)
		.join('|');

/** The preset whose source and declarations the state holds, if any. */
export function presetFor(state: { source: string; decls: readonly Decl[] }): PhasesPreset | null {
	const key = declKey(state.decls);
	return (
		PRESETS.find((p) => p.value.source === state.source && declKey(p.value.decls) === key) ?? null
	);
}
