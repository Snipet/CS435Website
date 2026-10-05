/**
 * Presets for the Context-Free Grammars tool: the grammars of Introduction to
 * Parsing (slides 12–30) with the strings and questions of their slides, and
 * the unambiguous expression grammar of Ambiguity, Precedence, Associativity &
 * Top-Down Parsing (slide 8).
 */
import type { Preset } from '$lib/components/ui/types';
import { blankState, type GrammarToolState, type ReplaceOrder, type StepPair } from './state';

export interface GrammarPresetValue {
	grammar: string;
	/** Token string of the Membership panel. */
	input?: string;
	tests?: string[];
	/** The derivation loaded in the builder. */
	steps?: StepPair[];
	order?: ReplaceOrder;
	/** Seed of the random sentence shown. */
	seed?: number;
}

/** A question a slide asks about the grammar, with its answer. */
export interface SlideQuestion {
	question: string;
	/** `^{i}` writes a superscript. */
	answer: string;
	/** The answer is notation (shown in the monospace font). */
	formal?: boolean;
	/** A line printed on the slide next to the question. */
	note?: string;
	/** A regular expression the answer gives, in lecture notation. */
	re?: string;
}

export interface GrammarPreset extends Preset<GrammarPresetValue> {
	questions?: SlideQuestion[];
}

/** Introduction to Parsing, slides 12, 13 and 15: one production per line. */
export const ARITHMETIC = `E → int
E → E + E
E → E * E
E → ( E )`;

/** Introduction to Parsing, slide 28: written tight, with ∗ for the product. */
export const ARITHMETIC_ID = 'E → E+E | E ∗ E | (E) | id';

/** Introduction to Parsing, slides 29–30. */
export const COOL = `EXPR → if EXPR then EXPR else EXPR fi
     | while EXPR loop EXPR pool
     | id`;

/** Introduction to Parsing, slide 25. */
export const ENGLISH = `Sentence → NounPhrase VerbPhrase
NounPhrase → Noun | Noun PrepositionalPhrase
VerbPhrase → Verb | Verb NounPhrase
PrepositionalPhrase → Preposition NounPhrase

Noun → "the cat" | "the mat" | "the floor"
Verb → "sat" | "saw"
Preposition → "on" | "under"`;

/** Ambiguity, Precedence, Associativity & Top-Down Parsing, slide 8. */
export const CASCADE = `E → E + T | T
T → T * F | F
F → int | ( E )`;

/**
 * Slide 12: E → E * E → ( E ) * E → ( E + E ) * E → … → ( int + int ) * int.
 * The slide leaves out the three steps E → int; here they replace the
 * leftmost E first.
 */
const REWRITE_CHAIN: StepPair[] = [
	[0, 2],
	[0, 3],
	[1, 1],
	[1, 0],
	[3, 0],
	[6, 0]
];

/** The leftmost derivation of int * int + int in CASCADE (the tree of slide 10). */
const CASCADE_LEFTMOST: StepPair[] = [
	[0, 0],
	[0, 1],
	[0, 2],
	[0, 3],
	[0, 4],
	[2, 4],
	[4, 3],
	[4, 4]
];

const EXPRESSIONS = 'Arithmetic expressions';
const LANGUAGES = 'What language? R.E.?';
const MORE = 'Other grammars';

export const presets: GrammarPreset[] = [
	{
		id: 'rewrite-rules',
		group: EXPRESSIONS,
		label: 'Rewrite rules for ( int + int ) * int',
		description:
			'The productions viewed as rewrite rules: E → E * E → ( E ) * E → ( E + E ) * E → … → ( int + int ) * int. The builder holds the whole chain; the slide leaves out the three steps E → int.',
		cite: { deck: '09', slide: 12 },
		value: {
			grammar: ARITHMETIC,
			input: '( int + int ) * int',
			tests: ['int', 'int + int', '( int + int ) * int'],
			steps: REWRITE_CHAIN
		}
	},
	{
		id: 'cannot-obtain',
		group: EXPRESSIONS,
		label: '( int ) ) cannot be obtained',
		description: 'Any sequence of replacements forms a valid arithmetic expression.',
		cite: { deck: '09', slide: 13 },
		value: {
			grammar: ARITHMETIC,
			input: '( int ) )',
			tests: ['( int ) )', '( int )']
		},
		questions: [
			{
				question: 'We cannot obtain ( int ) ) by any sequence of replacements. Why?',
				answer:
					'E → ( E ) is the only production with parentheses, and it adds one ( together with one ). Every sentential form therefore has as many ( as ), and ( int ) ) has one ( and two ).'
			}
		]
	},
	{
		id: 'four-tuple',
		group: EXPRESSIONS,
		label: 'N ? T ? S ?',
		description: 'The parts of the four-tuple for the arithmetic grammar.',
		cite: { deck: '09', slide: 15 },
		value: { grammar: ARITHMETIC },
		questions: [
			{
				question: 'N ? T ? S ?',
				answer: 'N = { E }, T = { int, +, *, (, ) }, S = E',
				formal: true
			}
		]
	},
	{
		id: 'arithmetic-id',
		group: EXPRESSIONS,
		label: 'E → E+E | E ∗ E | (E) | id',
		description: 'Simple arithmetic expressions over id.',
		cite: { deck: '09', slide: 28 },
		value: {
			grammar: ARITHMETIC_ID,
			input: '(id) ∗ id',
			tests: ['id', '(id)', '(id) ∗ id', 'id + id', 'id ∗ id', 'id ∗ (id)']
		},
		questions: [
			{
				question: 'Some elements of the language?',
				answer: 'id, (id), (id) ∗ id, id + id, id ∗ id, id ∗ (id)',
				formal: true
			}
		]
	},
	{
		id: 'zero-or-one',
		group: LANGUAGES,
		label: 'S → 0 | 1',
		description: 'S → 0 and S → 1, also written as S → 0 | 1.',
		cite: { deck: '09', slide: 26 },
		value: { grammar: 'S → 0 | 1', input: '0', tests: ['0', '1', '0 1'] },
		questions: [
			{
				question: 'What language does this grammar generate?',
				answer: 'L(G) = { "0", "1" }',
				formal: true
			}
		]
	},
	{
		id: 'one-then-bit',
		group: LANGUAGES,
		label: 'S → 1 A, A → 0 | 1',
		description: 'A second grammar with a finite language.',
		cite: { deck: '09', slide: 26 },
		value: { grammar: 'S → 1 A\nA → 0 | 1', input: '1 0', tests: ['1 0', '1 1', '0 1'] },
		questions: [
			{
				question: 'What language does this grammar generate?',
				answer: 'L(G) = { "10", "11" }',
				formal: true
			},
			{
				question: 'R.E.-s for these languages?',
				answer: '0 | 1 for S → 0 | 1, and 1 (0 | 1) for this grammar.',
				note: 'All finite languages are regular!',
				re: '1 (0 | 1)'
			}
		]
	},
	{
		id: 'ones-then-zero',
		group: LANGUAGES,
		label: 'S → 1 A, A → 0 | 1 A',
		description: 'A can be replaced by 1 A any number of times.',
		cite: { deck: '09', slide: 27 },
		value: {
			grammar: 'S → 1 A\nA → 0 | 1 A',
			input: '1 1 1 0',
			tests: ['1 0', '1 1 1 0', '0', '1 1']
		},
		questions: [{ question: 'R.E.?', answer: '11*0', formal: true, re: '11*0' }]
	},
	{
		id: 'balanced',
		group: LANGUAGES,
		label: 'S → ε | ( S )',
		description: 'Parentheses nested to any depth.',
		cite: { deck: '09', slide: 27 },
		value: {
			grammar: 'S → ε | ( S )',
			input: '( ( ) )',
			tests: ['', '( )', '( ( ) )', '( ( )', '( ) ( )']
		},
		questions: [
			{
				question: 'R.E.?',
				answer:
					'None. L(G) = { (^{i} )^{i} | i ≥ 0 }, the language of balanced parentheses, is not regular (slide 4): a finite automaton cannot count, except up to a finite limit.'
			}
		]
	},
	{
		id: 'cool',
		group: MORE,
		label: 'A fragment of COOL',
		description: 'if, while and id expressions, with the five strings of slide 30.',
		cite: { deck: '09', slide: [29, 30] },
		value: {
			grammar: COOL,
			input: 'if while id loop id pool then id else id fi',
			tests: [
				'id',
				'if id then id else id fi',
				'while id loop id pool',
				'if while id loop id pool then id else id fi',
				'if if id then id else id fi then id else id fi'
			]
		},
		questions: [
			{
				question: 'Which are elements of the language?',
				answer: 'All five strings are elements of the language.'
			}
		]
	},
	{
		id: 'english',
		group: MORE,
		label: 'Recursion in English',
		description:
			'A NounPhrase may hold a PrepositionalPhrase, which holds a NounPhrase again. The Language panel draws random sentences.',
		cite: { deck: '09', slide: 25 },
		value: {
			grammar: ENGLISH,
			// Every terminal in quotes, as the slide writes them.
			input: '"the cat" "on" "the mat" "sat"',
			tests: [
				'"the cat" "sat"',
				'"the cat" "on" "the mat" "saw" "the floor"',
				'"the cat" "sat" "on" "the mat"'
			],
			seed: 2
		}
	},
	{
		id: 'cascade',
		group: MORE,
		label: 'E → E + T | T, T → T * F | F, F → int | ( E )',
		description:
			'The expression grammar rewritten without ambiguity, with the leftmost derivation of int * int + int.',
		cite: { deck: '10', slide: 8 },
		value: {
			grammar: CASCADE,
			input: 'int * int + int',
			tests: ['int * int + int', 'int + int * int', '( int + int ) * int'],
			steps: CASCADE_LEFTMOST,
			order: 'leftmost'
		}
	}
];

/** Loaded on a first visit. */
export const DEFAULT_PRESET_ID = 'rewrite-rules';

export function presetById(id: string | null): GrammarPreset | undefined {
	return id === null ? undefined : presets.find((p) => p.id === id);
}

/** The state a preset loads; the length of the sentence list is kept. */
export function applyPreset(
	preset: GrammarPreset,
	current: Pick<GrammarToolState, 'maxLength'>
): GrammarToolState {
	const v = preset.value;
	return {
		...blankState(),
		grammar: v.grammar,
		input: v.input ?? '',
		tests: [...(v.tests ?? [])],
		order: v.order ?? 'any',
		steps: (v.steps ?? []).map(([index, production]): StepPair => [index, production]),
		maxLength: current.maxLength,
		seed: v.seed ?? null,
		preset: preset.id
	};
}

/** The preset that was loaded, for as long as its grammar is the one in the editor. */
export function activePreset(
	state: Pick<GrammarToolState, 'preset' | 'grammar'>
): GrammarPreset | undefined {
	const preset = presetById(state.preset);
	return preset && preset.value.grammar === state.grammar ? preset : undefined;
}

export interface RichPart {
	text: string;
	/** Drawn as a superscript. */
	sup: boolean;
}

/** Splits `^{…}` superscripts out of an answer: `(^{i}` is `(` followed by a raised `i`. */
export function richText(text: string): RichPart[] {
	const parts: RichPart[] = [];
	let at = 0;
	for (const m of text.matchAll(/\^\{([^}]*)\}/g)) {
		if (m.index > at) parts.push({ text: text.slice(at, m.index), sup: false });
		parts.push({ text: m[1], sup: true });
		at = m.index + m[0].length;
	}
	if (at < text.length) parts.push({ text: text.slice(at), sup: false });
	return parts;
}
