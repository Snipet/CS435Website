/**
 * Presets of the Ambiguity and Precedence page: the grammars, strings and
 * declarations of the deck "Ambiguity, Precedence, Associativity & Top-Down
 * Parsing" (slides 3–18), with the questions those slides pose.
 */
import type { Preset } from '$lib/components/ui/types';
import type { Citation } from '$lib/lectures';
import { stateFromHash, type AmbiguityHash, type AmbiguityState } from './state';

/** A question posed on a slide, with its answer behind "Show answer". */
export interface SlideQuestion {
	prompt: string;
	answer: string;
	cite?: Citation;
}

export interface AmbiguityPreset extends Preset<AmbiguityHash> {
	description: string;
	cite: Citation;
	questions?: readonly SlideQuestion[];
}

/** Slide 3. */
export const AMBIGUOUS = 'E → E + E | E * E | ( E ) | int';
/** Slides 8 and 10. */
export const CASCADE = 'E → E + T | T\nT → T * F | F\nF → int | ( E )';
/** Slide 11. */
export const DANGLING_ELSE = `E → if E then E
    | if E then E else E
    | OTHER`;
/** Slide 13, with its comments. */
export const MATCHED_IF = `E → MIF                 /* all then are matched */
    | UIF               /* some then is unmatched */

MIF → if E then MIF else MIF
      | OTHER

UIF → if E then E
      | if E then MIF else UIF`;
/** Slide 17. */
export const ADDITION = 'E → E + E | int';
/** Slide 18. */
export const SUM_PRODUCT = 'E → E + E | E * E | int';

/** Slide 12: E₁ … E₄ are the four OTHER tokens. */
const NESTED_IF = 'if OTHER then if OTHER then OTHER else OTHER';

const EXPRESSIONS = 'Ambiguous expressions';
const REWRITE = 'Rewriting the grammar';
const DANGLING = 'The dangling else';
const DECLARATIONS = 'Declarations';

export const presets: readonly AmbiguityPreset[] = [
	{
		id: 'sum',
		label: 'int + int + int',
		group: EXPRESSIONS,
		description: 'Two parse trees: one nests to the left, one to the right.',
		cite: { deck: '10', slide: [3, 4] },
		value: { grammar: AMBIGUOUS, input: 'int + int + int', values: '1 2 3' },
		questions: [
			{
				prompt: 'int + int + int has two parse trees, which are ?',
				answer:
					'The left-nested tree, which groups the string as (int + int) + int, and the right-nested tree, which groups it as int + (int + int).'
			},
			{
				prompt: 'Which one do we want? Does it matter?',
				answer:
					'The left-nested tree: + is left-associative by convention. For + the two trees compute the same value (6 for the operand values 1 2 3). With - in place of + they do not: (5 - 3) - 2 = 0 and 5 - (3 - 2) = 4.'
			}
		]
	},
	{
		id: 'product-sum',
		label: 'int * int + int',
		group: EXPRESSIONS,
		description: 'Two parse trees: + at the root, or * at the root.',
		cite: { deck: '10', slide: 5 },
		value: { grammar: AMBIGUOUS, input: 'int * int + int', values: '2 3 4' },
		questions: [
			{
				prompt: 'Which one do we want?',
				answer:
					'The tree with + at the root, which groups the string as (int * int) + int: * has higher precedence than +. For the operand values 2 3 4 it computes 10; the tree with * at the root computes 14.'
			}
		]
	},
	{
		id: 'definition',
		label: 'Two leftmost derivations',
		group: EXPRESSIONS,
		description:
			'The two parse trees of int + int + int, each listed with its leftmost derivation.',
		cite: { deck: '10', slide: 6 },
		value: { grammar: AMBIGUOUS, input: 'int + int + int', derivations: true },
		questions: [
			{
				prompt:
					'A grammar is ambiguous if it has more than one parse tree for some string. Equivalently, there is more than one ?',
				answer:
					'Leftmost derivation for some string (or, just as well, more than one rightmost derivation). A parse tree has exactly one leftmost derivation, so two parse trees of a string are two leftmost derivations of it.'
			}
		]
	},
	{
		id: 'cascade',
		label: 'E, T, F: the precedence cascade',
		group: REWRITE,
		description:
			'The grammar rewritten with one non-terminal per precedence level. int * int + int has only one parse tree now; the tree with * at the root is crossed out.',
		cite: { deck: '10', slide: [7, 10] },
		value: {
			grammar: AMBIGUOUS,
			input: 'int * int + int',
			values: '2 3 4',
			tab: 'rewrite',
			rewrite: CASCADE
		},
		questions: [
			{
				prompt: 'E → E + E | E * E | ( E ) | int can be rewritten as ?',
				answer:
					'E → E + T | T, T → T * F | F, F → int | ( E ). The rewritten grammar enforces precedence of * over + (a precedence cascade) and left-associativity.'
			}
		]
	},
	{
		id: 'dangling-else',
		label: 'if E₁ then if E₂ then E₃ else E₄',
		group: DANGLING,
		description:
			'E₁ … E₄ stand for the four OTHER tokens. Two parse trees: the else belongs to the outer if, or to the inner if.',
		cite: { deck: '10', slide: [11, 12] },
		value: {
			grammar: DANGLING_ELSE,
			input: NESTED_IF,
			labels: 'OTHER = E',
			abbreviated: true
		},
		questions: [
			{
				prompt: 'Ambiguous?',
				answer: 'Yes: if E₁ then if E₂ then E₃ else E₄ has two parse trees.'
			},
			{
				prompt: 'Which one do we want?',
				answer:
					'The tree in which the else belongs to the inner if: an else matches the closest unmatched then.'
			}
		]
	},
	{
		id: 'matched-if',
		label: 'MIF and UIF',
		group: DANGLING,
		description:
			'The grammar rewritten so that an else matches the closest unmatched then. One parse tree remains; the tree with the else on the outer if is crossed out.',
		cite: { deck: '10', slide: [13, 14] },
		value: {
			grammar: DANGLING_ELSE,
			input: NESTED_IF,
			labels: 'OTHER = E',
			abbreviated: true,
			tab: 'rewrite',
			rewrite: MATCHED_IF
		},
		questions: [
			{
				prompt: 'Does this describe the same set of strings?',
				answer:
					'Yes. With MIF and UIF read as E, every production of the new grammar is a production of the old one (or E → E), so the new grammar generates no new string. And every string of the old grammar has a parse in which each else matches the closest unmatched then, which is a tree of the new grammar. The comparison under the rewritten grammar finds no string that only one of the two grammars generates, up to the length chosen there.'
			},
			{
				prompt: 'The tree that remains is a valid tree for ?',
				answer:
					'UIF. The outer if has no else, so it is UIF → if E then E, and the if-then-else inside it is a MIF.'
			},
			{
				prompt:
					'The crossed-out tree is invalid because the middle E, the one after then, is not ?',
				answer:
					'MIF. An if with an else is if E then MIF else …, and the middle E of that tree is if E₂ then E₃, which has an unmatched then.'
			}
		]
	},
	{
		id: 'left-assoc',
		label: '%left +',
		group: DECLARATIONS,
		description:
			'E → E + E | int is ambiguous: int + int + int has two parse trees. The left-associativity declaration %left + crosses out the right-nested tree.',
		cite: { deck: '10', slide: 17 },
		value: {
			grammar: ADDITION,
			input: 'int + int + int',
			values: '1 2 3',
			tab: 'declarations',
			decls: [{ assoc: 'left', ops: '+' }]
		}
	},
	{
		id: 'precedence',
		label: '%left + then %left *',
		group: DECLARATIONS,
		description:
			'Two declarations, lower precedence first: * binds tighter than +, so the tree of int + int * int with * at the root is crossed out.',
		cite: { deck: '10', slide: 18 },
		value: {
			grammar: SUM_PRODUCT,
			input: 'int + int * int',
			values: '2 3 4',
			tab: 'declarations',
			decls: [
				{ assoc: 'left', ops: '+' },
				{ assoc: 'left', ops: '*' }
			]
		}
	}
];

export const DEFAULT_PRESET_ID = 'product-sum';
export const DEFAULT_PRESET = presets.find((p) => p.id === DEFAULT_PRESET_ID)!;

/** The page as it first loads: int * int + int under the ambiguous expression grammar. */
export const DEFAULT_STATE: AmbiguityState = stateFromHash(DEFAULT_PRESET.value);

/** The state a preset loads. */
export function presetState(preset: AmbiguityPreset): AmbiguityState {
	return stateFromHash(preset.value);
}

const sameDeclarations = (a: AmbiguityState['decls'], b: AmbiguityState['decls']): boolean =>
	a.length === b.length &&
	a.every((d, i) => d.assoc === b[i].assoc && d.ops.trim() === b[i].ops.trim());

/**
 * The preset the page is showing: one with this grammar, string, rewritten
 * grammar and declarations. The other fields (tab, values, labels, the view
 * switches, the cascade builder, the compared length) may differ.
 *
 * Two presets share the grammar and the string of slides 3–4 and differ only
 * in whether the leftmost derivations are shown. `loaded` is the id of the
 * preset that was loaded last: while it still fits, it stays the one shown,
 * so turning a view switch does not move the page to the other preset.
 * Without it (a state from a link), the derivations switch decides.
 */
export function presetFor(
	state: AmbiguityState,
	loaded?: string | null
): AmbiguityPreset | undefined {
	const fitting = presets.filter((p) => {
		const v = presetState(p);
		return (
			v.grammar === state.grammar &&
			v.input === state.input &&
			v.rewrite === state.rewrite &&
			sameDeclarations(v.decls, state.decls)
		);
	});
	return (
		fitting.find((p) => p.id === loaded) ??
		fitting.find((p) => presetState(p).derivations === state.derivations) ??
		fitting[0]
	);
}
