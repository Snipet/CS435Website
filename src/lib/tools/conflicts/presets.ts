/**
 * Presets from Bottom-up Parsing III, slides 17–25: the shift/reduce
 * conflicts of the dangling else and of E → E + E | E * E | int, bison's
 * precedence declarations that settle them, and the reduce/reduce conflict
 * of S → ε | id | id S with its rewrite. Presets beyond the slides (%right,
 * %nonassoc, a grammar that is LR(1) but not LALR(1), the C- grammar) cite
 * nothing, or only the slide that names what they show. Questions the slides
 * pose are kept as questions, with the answer behind "Show answer".
 */
import type { Citation } from '$lib/lectures';
import type { Preset } from '$lib/components/ui/types';
import { CMINUS_BNF } from '$lib/theory/cminus/parser';
import {
	DEFAULT_GRAMMAR,
	DEFAULT_PRECEDENCE,
	DEFAULT_STATE,
	type ConflictsState,
	type ItemsView
} from './state';

export interface ConflictsPresetValue {
	grammar: string;
	input: string;
	precedence?: string;
	items?: ItemsView;
	/** Actions chosen for the other parse: [conflict, action]. */
	choices?: [number, 0 | 1][];
}

/** A question posed on a slide. */
export interface SlideQuestion {
	/** The slide's words. */
	prompt: string;
	/** The answer in words. */
	answer: string;
	cite: Citation;
}

export interface ConflictsPreset extends Preset<ConflictsPresetValue> {
	questions?: readonly SlideQuestion[];
}

/** Slide 17. E has no productions, so it is a terminal, like OTHER. */
export const DANGLING_ELSE = 'S → if E then S | if E then S else S | OTHER';
/** Slide 24. */
export const ID_SEQUENCE = 'S → ε | id | id S';
/** Slide 25. */
export const ID_SEQUENCE_FIXED = 'S → ε | id S';
/** A grammar that is LR(1) but not LALR(1): merging the states after c makes two reduces meet. */
export const NOT_LALR = 'S → a A d | b B d | a B e | b A e\nA → c\nB → c';

const SHIFT_REDUCE = 'Shift/reduce conflicts';
const REDUCE_REDUCE = 'Reduce/reduce conflicts';
const BEYOND = 'Beyond the slides';

export const presets: readonly ConflictsPreset[] = [
	{
		id: 'ambiguous',
		label: 'E → E + E | E * E | int',
		group: SHIFT_REDUCE,
		description:
			'An ambiguous grammar without declarations. States 5 and 6 each have two shift/reduce conflicts; slides 18 and 21 show the two on input +. bison shifts by default, so int * int + int parses as int * (int + int). The other parse reduces E → E * E on + instead.',
		cite: { deck: '15', slide: [18, 21] },
		value: { grammar: DEFAULT_GRAMMAR, input: 'int * int + int', choices: [[2, 1]] },
		questions: [
			{
				prompt: 'We have a shift/reduce on input +. Do we want a shift or reduce?',
				answer:
					'Reduce, when * binds tighter than +: E * E is then a complete operand of +. Slide 20 makes the parser choose it by declaring the precedences.',
				cite: { deck: '15', slide: 18 }
			}
		]
	},
	{
		id: 'precedence',
		label: "%left '+' then %left '*'",
		group: SHIFT_REDUCE,
		description:
			'The same grammar with bison’s declarations. A later line binds tighter, and the precedence of a rule is that of its last terminal. All four conflicts are resolved by precedence, and int + int * int parses as int + (int * int).',
		cite: { deck: '15', slide: [19, 21] },
		value: { grammar: DEFAULT_GRAMMAR, input: 'int + int * int', precedence: DEFAULT_PRECEDENCE },
		questions: [
			{
				prompt: 'Will choose to ?',
				answer:
					'reduce because precedence of rule E → E * E is higher than that of terminal + (the conflict in state 6 on +).',
				cite: { deck: '15', slide: 20 }
			},
			{
				prompt: 'Now we also have a shift/reduce on input +. Which is chosen?',
				answer:
					'Reduce (state 5 on +): the rule E → E + E has the precedence of +, the same as the terminal +, and + is declared %left. None of the three conditions for a shift holds, so + groups to the left.',
				cite: { deck: '15', slide: 21 }
			}
		]
	},
	{
		id: 'dangling-else',
		label: 'Dangling else',
		group: SHIFT_REDUCE,
		description:
			'The classic example. In the state with [S → if E then S •, else] and [S → if E then S • else S, else], else can be shifted or S → if E then S reduced. With no declaration bison shifts, so the else attaches to the nearest if. The other parse reduces and gives the else to the outer if.',
		cite: { deck: '15', slide: 17 },
		value: {
			grammar: DANGLING_ELSE,
			input: 'if E then if E then OTHER else OTHER',
			choices: [[0, 1]]
		},
		questions: [
			{
				prompt: 'If else follows then we can shift or reduce. Which do we want?',
				answer:
					'The shift: the else then belongs to the nearest if, the inner one. Reducing first closes the inner if, and the else goes to the outer one.',
				cite: { deck: '15', slide: 17 }
			},
			{
				prompt: 'Can eliminate conflict by ?',
				answer:
					'declaring else with higher precedence than then (or just rely on the default shift action).',
				cite: { deck: '15', slide: 22 }
			}
		]
	},
	{
		id: 'dangling-else-precedence',
		label: 'Dangling else, else above then',
		group: SHIFT_REDUCE,
		description:
			'else is declared with higher precedence than then, the last terminal of S → if E then S. The terminal has the higher precedence, so the conflict is resolved with a shift by precedence, and bison no longer reports it. The parse is the same as with the default shift.',
		cite: { deck: '15', slide: 22 },
		value: {
			grammar: DANGLING_ELSE,
			input: 'if E then if E then OTHER else OTHER',
			precedence: '%left then\n%left else'
		}
	},
	{
		id: 'id-sequence',
		label: 'S → ε | id | id S',
		group: REDUCE_REDUCE,
		description:
			'A sequence of identifiers. There are two parse trees for the string id: S → id, and S → id S → id. After id, with $ next, the parser can reduce S → id or S → ε: a reduce/reduce conflict on input $. bison takes the earlier rule, S → ε, and reports S → id as useless in the parser. The other parse reduces S → id.',
		cite: { deck: '15', slide: [24, 25] },
		value: { grammar: ID_SEQUENCE, input: 'id', items: 'full', choices: [[0, 1]] },
		questions: [
			{
				prompt: 'How does this confuse the parser?',
				answer:
					'After id it cannot tell S’ → S → id from S’ → S → id S → id: both reduce S → id and reduce S → ε apply on $.',
				cite: { deck: '15', slide: 25 }
			}
		]
	},
	{
		id: 'id-sequence-fixed',
		label: 'S → ε | id S',
		group: REDUCE_REDUCE,
		description:
			'Better rewrite the grammar. After id the state has [S → id • S, $], [S → •, $] and [S → • id S, $]: it reduces S → ε on $ and shifts on id, and the table has no conflicts.',
		cite: { deck: '15', slide: 25 },
		value: { grammar: ID_SEQUENCE_FIXED, input: 'id id', items: 'full' }
	},
	{
		id: 'swapped',
		label: "%left '*' then %left '+'",
		group: BEYOND,
		description:
			'The declarations of slide 19 in the other order: + now binds tighter than *, and int + int * int parses as (int + int) * int. Declarations settle conflicts whichever way they are written; overusing them gives unexpected parse trees.',
		cite: { deck: '15', slide: 22 },
		value: {
			grammar: DEFAULT_GRAMMAR,
			input: 'int + int * int',
			precedence: "%left '*'\n%left '+'"
		}
	},
	{
		id: 'right',
		label: "%right '^'",
		group: BEYOND,
		description:
			'%right makes an operator right associative: a conflict between E → E ^ E and the terminal ^, which have the same precedence, is resolved with a shift. int ^ int ^ int + int parses as (int ^ (int ^ int)) + int.',
		value: {
			grammar: 'E → E + E | E ^ E | int',
			input: 'int ^ int ^ int + int',
			precedence: "%left '+'\n%right '^'"
		}
	},
	{
		id: 'nonassoc',
		label: "%nonassoc '<'",
		group: BEYOND,
		description:
			'%nonassoc, bison’s third declaration: when the rule and the terminal have the same precedence, the table entry becomes an error, so int < int < int is rejected. int < int + int still parses, as int < (int + int).',
		value: {
			grammar: 'E → E < E | E + E | int',
			input: 'int < int < int',
			precedence: "%nonassoc '<'\n%left '+'"
		}
	},
	{
		id: 'not-lalr',
		label: 'LR(1) but not LALR(1)',
		group: BEYOND,
		description:
			'The LR(1) table has no conflicts. bison builds LALR(1) states: it merges the two LR(1) states reached on c, and the merged state reduces both A → c and B → c on d and on e. Parser.output lists the two reduce/reduce conflicts.',
		value: { grammar: NOT_LALR, input: 'a c d' }
	},
	{
		id: 'cminus',
		label: 'C- grammar',
		group: BEYOND,
		description:
			'The 29 rules of C-. The LR(1) automaton has 372 states and one conflict, the dangling else of selection-stmt, which bison resolves with a shift. bison’s LALR(1) automaton has 115 states.',
		value: {
			grammar: CMINUS_BNF,
			input: 'void ID ( void ) { if ( ID ) if ( ID ) ID = NUM ; else ID = NUM ; }'
		}
	}
];

export const DEFAULT_PRESET_ID = 'precedence';

/** The state a preset opens with. */
export function presetState(p: Pick<ConflictsPreset, 'value'>): ConflictsState {
	return {
		...DEFAULT_STATE,
		grammar: p.value.grammar,
		input: p.value.input,
		precedence: p.value.precedence ?? '',
		items: p.value.items ?? 'partial',
		choices: (p.value.choices ?? []).map(([c, a]) => [c, a])
	};
}

const squash = (text: string): string =>
	text
		.split('\n')
		.map((line) => line.trim().replace(/[ \t]+/g, ' '))
		.filter((line) => line !== '')
		.join('\n');

/**
 * The preset the state is, if any: the same grammar, token string and
 * declarations. `loaded` is the id of the preset loaded last; it is taken
 * when it fits, since two presets may fit one state.
 */
export function presetFor(
	state: Pick<ConflictsState, 'grammar' | 'input' | 'precedence'>,
	loaded: string | null = null
): ConflictsPreset | undefined {
	const fits = presets.filter(
		(p) =>
			squash(p.value.grammar) === squash(state.grammar) &&
			squash(p.value.input) === squash(state.input) &&
			squash(p.value.precedence ?? '') === squash(state.precedence)
	);
	return fits.find((p) => p.id === loaded) ?? fits[0];
}
