/**
 * Flex Playground presets. Examples 1–3 are the specs on Lexical Analysis III
 * (cont’d), slides 8–10, with straight quotes where the slides print curly
 * ones. Expected outputs were checked with flex 2.6.4.
 */
import type { Preset } from '$lib/components/ui/types';

export interface SampleInput {
	/** The data.txt contents. */
	value: string;
	/** Expected stdout, for tests. */
	stdout: string;
	/** What `wc` reports (lines, words, characters), for the word-count presets. */
	wc?: [number, number, number];
	/** Short note shown with the sample. */
	note?: string;
}

export interface FlexPresetValue {
	spec: string;
	/** Sample inputs; the first one is loaded with the preset. */
	inputs: SampleInput[];
}

export type FlexPreset = Preset<FlexPresetValue>;

const EXAMPLE_1 = `%top{
  #include <stdio.h>
}

%%

[0-9]+  { printf ("%s\\n", yytext); }

.|\\n    { }

%%

int main()
{
  yylex ();
  return 0;
}
`;

const EXAMPLE_2 = `%top{
  // This spec does NOT work
  #include <stdio.h>
  int ch = 0, wd = 0, nl = 0;
}

/* C-style comments allowed */
DELIM     [ \\t]+

%%

\\n        { ++ch; ++wd; ++nl; }
^{DELIM}  { ch += yyleng; }
{DELIM}   { ch += yyleng; ++wd; }
.         { ++ch; }

%%

int main ()
{ yylex ();
  printf ("%8d%8d%8d\\n", nl, wd, ch); return 0;
}
`;

const EXAMPLE_3 = `%top{
  #include <stdio.h>
}

DIGIT     [0-9]
LETTER    [A-Za-z]
ID        {LETTER}({LETTER}|{DIGIT})*

%%

{DIGIT}+  { printf ("number: %s\\n", yytext); }

{ID}      { printf ("ident: %s\\n", yytext); }

.         { printf ("other: %s\\n", yytext); }

%%

int main ()
{ yylex (); return 0;
}
`;

const TOKENS = `%{
#include <stdio.h>

#define NUMBER  258
#define IDENT   259
#define ASSIGN  260
#define EQ      261

int line = 1;
%}

DIGIT     [0-9]
LETTER    [A-Za-z_]

%%

[ \\t]+                        { /* skip blanks */ }
\\n                            { line++; }
{DIGIT}+                      { return NUMBER; }
{LETTER}({LETTER}|{DIGIT})*   { return IDENT; }
"=="                          { return EQ; }
"="                           { return ASSIGN; }
.                             { return yytext[0]; }

%%

const char *name(int tok)
{
  switch (tok) {
  case NUMBER: return "NUMBER";
  case IDENT:  return "IDENT";
  case ASSIGN: return "ASSIGN";
  case EQ:     return "EQ";
  }
  return "CHAR";
}

int main()
{
  int tok;
  while ((tok = yylex()) != 0)
    printf("line %d: %-6s %3d  \\"%s\\"\\n", line, name(tok), tok, yytext);
  return 0;
}
`;

const COMMENTS = `%{
#include <stdio.h>
int comments = 0;
%}

%x COMMENT

%%

"/*"              { BEGIN(COMMENT); comments++; }
<COMMENT>"*/"     { BEGIN(INITIAL); }
<COMMENT>.|\\n     { /* inside a comment: skip */ }
<COMMENT><<EOF>>  { fprintf(stderr, "error: comment is never closed\\n"); yyterminate(); }
.|\\n              { ECHO; }

%%

int main()
{
  yylex();
  fprintf(stderr, "%d comment(s) removed\\n", comments);
  return 0;
}
`;

export const presets: FlexPreset[] = [
	{
		id: 'example-1',
		label: 'Example 1: print every number',
		group: 'Lecture examples',
		description: 'Prints each run of digits on its own line and discards everything else.',
		cite: { deck: '07', slide: 8 },
		value: {
			spec: EXAMPLE_1,
			inputs: [{ value: 'abc 123 x45 7.5\n6', stdout: '123\n45\n7\n5\n6\n' }]
		}
	},
	{
		id: 'example-2',
		label: 'Example 2: count lines, words, characters',
		group: 'Lecture examples',
		description: 'The word counter the slide marks “This spec does NOT work”.',
		cite: { deck: '07', slide: 9 },
		value: {
			spec: EXAMPLE_2,
			inputs: [
				{
					value: 'hello world\n',
					stdout: '       1       2      12\n',
					wc: [1, 2, 12],
					note: 'Agrees with wc.'
				},
				{
					value: 'hello world \n',
					stdout: '       1       3      13\n',
					wc: [1, 2, 13],
					note: 'A blank before the newline adds a word.'
				},
				{
					value: 'hi\n\n',
					stdout: '       2       2       4\n',
					wc: [2, 1, 4],
					note: 'An empty line adds a word.'
				},
				{
					value: 'one two',
					stdout: '       0       1       7\n',
					wc: [0, 2, 7],
					note: 'The last word is not counted without a final newline.'
				},
				{
					value: '  hi\n',
					stdout: '       1       1       5\n',
					wc: [1, 1, 5],
					note: 'Leading blanks match ^{DELIM}, which does not count a word.'
				},
				{
					value: 'a\tb  c\n',
					stdout: '       1       3       7\n',
					wc: [1, 3, 7],
					note: 'Agrees with wc.'
				}
			]
		}
	},
	{
		id: 'example-3',
		label: 'Example 3: numbers, identifiers, other',
		group: 'Lecture examples',
		description: 'Classifies the input with the regular definitions DIGIT, LETTER, and ID.',
		cite: { deck: '07', slide: 10 },
		value: {
			spec: EXAMPLE_3,
			inputs: [
				{
					value: 'count = count + 10;\n',
					stdout:
						'ident: count\nother:  \nother: =\nother:  \nident: count\nother:  \nother: +\nother:  \nnumber: 10\nother: ;\n\n',
					note: 'No rule matches the newline, so the default rule copies it to the output.'
				},
				{
					value: 'abc123 123abc x_1\n',
					stdout:
						'ident: abc123\nother:  \nnumber: 123\nident: abc\nother:  \nident: x\nother: _\nnumber: 1\n\n',
					note: 'The longest match wins: abc123 is one identifier; 123abc is a number, then an identifier.'
				}
			]
		}
	},
	{
		id: 'tokens',
		label: 'Token codes returned to main',
		group: 'More examples',
		description:
			'Actions return #define’d token codes; main calls yylex() in a loop and prints each token.',
		value: {
			spec: TOKENS,
			inputs: [
				{
					value: 'x = 42;\nif (x == y1) x = x + 1;\n',
					stdout: [
						'line 1: IDENT  259  "x"',
						'line 1: ASSIGN 260  "="',
						'line 1: NUMBER 258  "42"',
						'line 1: CHAR    59  ";"',
						'line 2: IDENT  259  "if"',
						'line 2: CHAR    40  "("',
						'line 2: IDENT  259  "x"',
						'line 2: EQ     261  "=="',
						'line 2: IDENT  259  "y1"',
						'line 2: CHAR    41  ")"',
						'line 2: IDENT  259  "x"',
						'line 2: ASSIGN 260  "="',
						'line 2: IDENT  259  "x"',
						'line 2: CHAR    43  "+"',
						'line 2: NUMBER 258  "1"',
						'line 2: CHAR    59  ";"',
						''
					].join('\n')
				}
			]
		}
	},
	{
		id: 'comments',
		label: 'Start condition: remove /* */ comments',
		group: 'More examples',
		description:
			'BEGIN(COMMENT) switches to an exclusive start condition that skips everything up to */.',
		value: {
			spec: COMMENTS,
			inputs: [
				{
					value: 'int x; /* a counter */\nx = 1; /* two\n  lines */ x++;\n',
					stdout: 'int x; \nx = 1;  x++;\n'
				},
				{
					value: 'a /* never closed\n',
					stdout: 'a ',
					note: 'The <<EOF>> rule for COMMENT reports the open comment.'
				}
			]
		}
	}
];

export const DEFAULT_PRESET_ID = 'example-3';

export function presetById(id: string | null | undefined): FlexPreset | undefined {
	return presets.find((p) => p.id === id);
}
