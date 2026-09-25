/**
 * Presets from the lecture slides. Each cites its slide; questions the slides
 * pose come with their answers (shown behind "Show answer").
 */
import type { Preset } from '$lib/components/ui/types';
import type { RuleState } from '$lib/tools/links';
import type { LexerSetup } from './state';

export interface PresetQuestion {
	text: string;
	answer: string;
}

/**
 * A follow-up the preset note offers, e.g. another input or the Error rule.
 * Once applied, the note offers to go back to the preset's own value.
 */
export interface PresetTry {
	label: string;
	input?: string;
	errorRule?: boolean;
}

export interface LexerPreset extends Preset<LexerSetup> {
	question?: PresetQuestion;
	tries?: PresetTry[];
}

/** Lexical Analysis, slides 27 and 29. */
export const DIGIT_LETTER = [
	"digit = '0' | '1' | '2' | … | '9'",
	"letter = 'A' | … | 'Z' | 'a' | … | 'z'"
].join('\n');

/** Lexical Analysis, slide 30. */
const WS = "(' ' | '\\t' | '\\r' | '\\n')+";
const IDENT = 'letter (letter | digit)*';

const rule = (name: string, re: string, drop = false): RuleState =>
	drop ? { name, re, drop: true } : { name, re };

/** R = Whitespace | Integer | Identifier | '+' (Lexical Analysis II, slides 7, 9, 12). */
const R05 = (dropWhitespace: boolean): RuleState[] => [
	rule('Whitespace', "' '+", dropWhitespace),
	rule('Integer', 'digit+'),
	rule('Identifier', IDENT),
	rule('Plus', "'+'")
];

const LOOKAHEAD_RULES: RuleState[] = [
	rule('WS', "' '+", true),
	rule('IF', "'if'"),
	rule('IFFY', "'iffy'"),
	rule('ID', IDENT),
	rule('EQ3', "'==='"),
	rule('EQ2', "'=='"),
	rule('ASSIGN', "'='")
];

const TINY_PROGRAM = [
	'{ factorial }',
	'read x;',
	'if 0 < x then',
	'  fact := 1;',
	'  repeat',
	'    fact := fact * x;',
	'    x := x - 1',
	'  until x = 0;',
	'  write fact',
	'end'
].join('\n');

const GROUP_05 = 'Using regular expressions';
const GROUP_PAIRS = 'Token–lexeme pairs';
const GROUP_04 = 'Lookahead and whitespace';

export const DEFAULT_PRESET_ID = 'f-plus-3';

export const presets: readonly LexerPreset[] = [
	{
		id: 'f-plus-3',
		label: 'f+3  +g',
		group: GROUP_05,
		description:
			'R = Whitespace | Integer | Identifier | \'+\'. The slide lists (Whitespace, " "); maximal munch matches both spaces.',
		cite: { deck: '05', slide: 7 },
		value: { defs: DIGIT_LETTER, rules: R05(false), input: 'f+3  +g' },
		question: {
			text: 'Token tuples are ?',
			answer:
				'(Identifier, "f"), (Plus, "+"), (Integer, "3"), (Whitespace, "  "), (Plus, "+"), (Identifier, "g"). The slide writes (Whitespace, " ") for the two spaces.'
		}
	},
	{
		id: 'drop-whitespace',
		label: 'f+3  +g with Whitespace dropped',
		group: GROUP_05,
		description: 'After matching Whitespace, matching continues; no token is reported for it.',
		cite: { deck: '05', slide: 8 },
		value: { defs: DIGIT_LETTER, rules: R05(true), input: 'f+3  +g' }
	},
	{
		id: 'foo-plus-3',
		label: 'foo+3',
		group: GROUP_05,
		description: '"f" matches R, but so do "fo" and "foo"; "foo+" does not.',
		cite: { deck: '05', slide: [9, 10] },
		value: { defs: DIGIT_LETTER, rules: R05(true), input: 'foo+3' },
		question: {
			text: 'How much input is used?',
			answer:
				'The principle of maximal munch: if x1…xi ∈ L(R) and also x1…xk ∈ L(R), use max(i, k), the longest prefix that matches R. Here that is "foo" → (Identifier, "foo").'
		}
	},
	{
		id: 'new-foo',
		label: 'new foo',
		group: GROUP_05,
		description: "R = Whitespace | 'new' | Integer | Identifier.",
		cite: { deck: '05', slide: 11 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('Whitespace', "' '+", true),
				rule('New', "'new'"),
				rule('Integer', 'digit+'),
				rule('Identifier', IDENT)
			],
			input: 'new foo'
		},
		question: {
			text: '"new" matches \'new\' but also Identifier. Which one do we pick?',
			answer:
				'\'new\' (R2). If x1…xi ∈ L(Rj) and x1…xi ∈ L(Rk), use min(j, k): the rule listed first. Rule order only decides between prefixes of the same length: in "newer foo" only Identifier matches "newer", so the longest match is (Identifier, "newer").'
		},
		tries: [{ label: 'Try "newer foo"', input: 'newer foo' }]
	},
	{
		id: 'equals-56',
		label: '=56',
		group: GROUP_05,
		description: "R = Whitespace | Integer | Identifier | '+', first without an Error rule.",
		cite: { deck: '05', slide: 12 },
		value: { defs: DIGIT_LETTER, rules: R05(true), input: '=56', errorRule: false },
		question: {
			text: 'Problem?',
			answer:
				'No prefix of "=56" matches R, so the scanner is stuck at position 0. Add a rule that matches all "bad" strings and put it last: R = R1 | … | Rn | Error. With an Error rule that matches any one character, the output is (Error, "="), (Integer, "56").'
		},
		tries: [{ label: 'Turn on the Error rule', errorRule: true }]
	},
	{
		id: 'lexical-spec',
		label: 'Number, Keyword, Identifier, OpenPar',
		group: GROUP_05,
		description:
			'The token REs of steps 1–2 in the order of the slide. The input is not from the slide.',
		cite: { deck: '05', slide: 4 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('Number', 'digit+'),
				rule('Keyword', "'if' | 'else'"),
				rule('Identifier', IDENT),
				rule('OpenPar', "'('")
			],
			input: 'if(iffy(42'
		}
	},
	{
		id: 'if-i-j',
		label: 'if (i == j) … else …',
		group: GROUP_PAIRS,
		description:
			'The slide lists the first five pairs, then "…". Whitespace (spaces, tabs, newlines) is dropped.',
		cite: { deck: '04', slide: 11 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('Whitespace', WS, true),
				rule('Keyword', "'if' | 'else'"),
				rule('OpenPar', "'('"),
				rule('ClosePar', "')'"),
				rule('Identifier', IDENT),
				rule('Relation', "'=='"),
				rule('Assign', "'='"),
				rule('Integer', 'digit+'),
				rule('Semicolon', "';'")
			],
			input: '\tif (i == j)\n\t\tz = 0;\n\telse\n\t\tz = 1;'
		}
	},
	{
		id: 'if-x-y',
		label: 'if x==y then z  =1; else z= 2  ;',
		group: GROUP_PAIRS,
		description: 'Lexemes and their tokens: IF, ID, EQ, ID, THEN, ID, ASSIGN, ILIT, SEMI, …',
		cite: { deck: '03', slide: 5 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('WS', WS, true),
				rule('IF', "'if'"),
				rule('THEN', "'then'"),
				rule('ELSE', "'else'"),
				rule('ID', IDENT),
				rule('EQ', "'=='"),
				rule('ASSIGN', "'='"),
				rule('ILIT', 'digit+'),
				rule('SEMI', "';'")
			],
			input: 'if x==y then z  =1; else z= 2  ;'
		},
		question: {
			text: 'Lexemes?',
			answer:
				'if, x, ==, y, then, z, =, 1, ;, else, z, =, 2, ; with the tokens IF, ID, EQ, ID, THEN, ID, ASSIGN, ILIT, SEMI, ELSE, ID, ASSIGN, ILIT, SEMI. The spacing does not change the lexemes.'
		}
	},
	{
		id: 'a-b1-c',
		label: 'A= B1   +C;',
		group: GROUP_PAIRS,
		description:
			"The scanner row of the seven-phase table: tokens and their attributes, <ID,'A'>, …",
		cite: { deck: '01', slide: 4 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('WS', "' '+", true),
				rule('ID', IDENT),
				rule('ASSIGN', "'='"),
				rule('PLUS', "'+'"),
				rule('SEMI', "';'")
			],
			input: 'A= B1   +C;',
			format: 'angle'
		}
	},
	{
		id: 'tiny',
		label: 'TINY token types',
		group: GROUP_PAIRS,
		description:
			'Reserved words IF … WRITE are listed before ID. Comments { … } and whitespace are dropped. The special-symbol lexemes and the program are TINY’s, not from the slide.',
		cite: { deck: '04', slide: 6 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('WS', WS, true),
				rule('COMMENT', "'{' [^}]* '}'", true),
				rule('IF', "'if'"),
				rule('THEN', "'then'"),
				rule('ELSE', "'else'"),
				rule('END', "'end'"),
				rule('REPEAT', "'repeat'"),
				rule('UNTIL', "'until'"),
				rule('READ', "'read'"),
				rule('WRITE', "'write'"),
				rule('ID', 'letter+'),
				rule('NUM', 'digit+'),
				rule('ASSIGN', "':='"),
				rule('EQ', "'='"),
				rule('LT', "'<'"),
				rule('PLUS', "'+'"),
				rule('MINUS', "'-'"),
				rule('TIMES', "'*'"),
				rule('OVER', "'/'"),
				rule('LPAREN', "'('"),
				rule('RPAREN', "')'"),
				rule('SEMI', "';'")
			],
			input: TINY_PROGRAM,
			format: 'angle'
		}
	},
	{
		id: 'strip-comment',
		label: 'int a/*hi*/2 = 3;',
		group: GROUP_04,
		description:
			'C-like rules with a dropped comment rule; compares scanning with stripping first.',
		cite: { deck: '04', slide: 12 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('Whitespace', WS, true),
				rule('Comment', "'/' '*' ([^*] | '*'+ [^*/])* '*'+ '/'", true),
				rule('Keyword', "'int'"),
				rule('Identifier', IDENT),
				rule('Integer', 'digit+'),
				rule('Assign', "'='"),
				rule('Semicolon', "';'")
			],
			input: 'int a/*hi*/2 = 3;',
			tab: 'strip',
			strip: true
		},
		question: {
			text: 'What happens if we remove all whitespace and all comments prior to lexing?',
			answer:
				'The text becomes "inta2=3;", and int, a and 2 fuse into one identifier, inta2. The comment and the spaces separated those tokens, so they are dropped during scanning, once the token boundaries are known.'
		}
	},
	{
		id: 'lookahead-iffy',
		label: 'i if iffy',
		group: GROUP_04,
		description: 'After "if", IFFY can still match, so the scanner reads on before it decides.',
		cite: { deck: '04', slide: 13 },
		value: { defs: DIGIT_LETTER, rules: LOOKAHEAD_RULES, input: 'i if iffy', tab: 'lookahead' }
	},
	{
		id: 'lookahead-eq',
		label: '= == ===',
		group: GROUP_04,
		description: 'After "=", EQ2 and EQ3 can still match; after "==", EQ3 can.',
		cite: { deck: '04', slide: 13 },
		value: { defs: DIGIT_LETTER, rules: LOOKAHEAD_RULES, input: '= == ===', tab: 'lookahead' }
	},
	{
		id: 'templates',
		label: 'vector<queue<int>>',
		group: GROUP_04,
		description:
			"With SHR = '>>' and GT = '>', maximal munch reads \">>\" as one token, not two closing brackets.",
		cite: { deck: '04', slide: 16 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('WS', "' '+", true),
				rule('ID', IDENT),
				rule('LT', "'<'"),
				rule('SHR', "'>>'"),
				rule('GT', "'>'")
			],
			input: 'vector<queue<int>>'
		},
		tries: [{ label: 'Try "vector<queue<int> >"', input: 'vector<queue<int> >' }]
	},
	{
		id: 'fortran-do',
		label: 'DO 15 I = 1.100',
		group: GROUP_04,
		description:
			'A period typed for a comma. Fortran ignores spaces, which is scanning after stripping them.',
		cite: { deck: '02', slide: 28 },
		value: {
			defs: DIGIT_LETTER,
			rules: [
				rule('WS', "' '+", true),
				rule('DO', "'DO'"),
				rule('ID', IDENT),
				rule('INT', 'digit+'),
				rule('REAL', "digit+ '.' digit+"),
				rule('ASSIGN', "'='"),
				rule('COMMA', "','")
			],
			input: 'DO 15 I = 1.100',
			tab: 'strip',
			strip: true
		},
		question: {
			text: 'Is this a syntax error?',
			answer:
				'No. Because Fortran ignores spaces, the compiler reads DO15I=1.100: an assignment of 1.100 to a variable named DO15I. The intended statement was DO 15 I = 1,100.'
		},
		tries: [{ label: 'Try "DO 15 I = 1,100"', input: 'DO 15 I = 1,100' }]
	}
];

export function presetById(id: string | null | undefined): LexerPreset | undefined {
	return presets.find((p) => p.id === id);
}
