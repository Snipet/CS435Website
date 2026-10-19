import { describe, expect, it } from 'vitest';
import { parseGrammar } from '$lib/theory/grammar/parse';
import { importBison } from './bison-import';
import { readPrecedenceText } from './precedence';

/** The text a diagnostic's span covers. */
const where = (text: string, d: { span?: { start: number; end: number } }) =>
	d.span ? text.slice(d.span.start, d.span.end) : null;

const CALC = `%{
#include <stdio.h>
int yylex (void);
%}

%define api.value.type {double}
%token NUM
%left '-' '+'
%left '*' '/'
%right '^'      /* exponentiation */

%% /* The grammar follows. */
input:
  %empty
| input line
;

line:
  '\\n'
| exp '\\n'      { printf ("%.10g\\n", $1); }
;

exp:
  NUM
| exp '+' exp   { $$ = $1 + $3; }
| exp '-' exp   { $$ = $1 - $3; }
| exp '*' exp   { $$ = $1 * $3; }
| exp '/' exp   { $$ = $1 / $3; }
| exp '^' exp   { $$ = pow ($1, $3); }
| '(' exp ')'   { $$ = $2; }
;
%%
int main (void) { return yyparse (); }
`;

describe('importBison', () => {
	it('reads the rules, the precedence lines and leaves out C code and actions', () => {
		const text = `%token INT
%left '+'
%left '*'
%%
exp : exp '+' exp  { $$ = $1 + $3; }
    | exp '*' exp  { $$ = $1 * $3; }
    | INT
    ;
%%
int main () { return yyparse (); }
`;
		const out = importBison(text);
		expect(out.grammar).toBe('exp → exp + exp | exp * exp | INT');
		expect(out.precedence).toBe("%left '+'\n%left '*'");
		expect(out.start).toBe('exp');
		expect(out.productions).toBe(3);
		expect(out.diagnostics).toEqual([]);
		// The result reads back in the lecture notation and as declarations.
		const g = parseGrammar(out.grammar).grammar!;
		expect(g.terminals).toEqual(['+', '*', 'INT']);
		expect(readPrecedenceText(out.precedence, g).diagnostics).toEqual([]);
	});

	it("reads bison's infix calculator", () => {
		const out = importBison(CALC);
		expect(out.grammar).toBe(
			[
				'input → ε | input line',
				'line → "\\n" | exp "\\n"',
				'exp → NUM | exp + exp | exp - exp | exp * exp | exp / exp | exp ^ exp | ( exp )'
			].join('\n')
		);
		expect(out.precedence).toBe("%left '-' '+'\n%left '*' '/'\n%right '^'");
		expect(out.diagnostics.map((d) => [d.severity, where(CALC, d)])).toEqual([
			['info', CALC.slice(0, CALC.indexOf('%}') + 2)],
			['info', '%define']
		]);
		const g = parseGrammar(out.grammar).grammar!;
		expect(g.productions).toHaveLength(11);
		expect(g.terminals).toContain('\\n');
	});

	it('takes %start as the start symbol', () => {
		const text = `%start s
%%
t : 'x' ;
s : t t | %empty ;`;
		const out = importBison(text);
		expect(out.grammar).toBe('s → t t | ε\nt → x');
		expect(out.start).toBe('s');
	});

	it('joins the rules of one non-terminal written apart, and reads a missing ; and |', () => {
		const text = `%%
a : b 'x'
b : 'y' |
a : 'z' ;`;
		const out = importBison(text);
		expect(out.grammar).toBe('a → b x | z\nb → y | ε');
		expect(out.diagnostics).toEqual([]);
	});

	it('reads a rules section without %% with a note', () => {
		const text = "exp: exp '+' term | term;\nterm: ID;";
		const out = importBison(text);
		expect(out.grammar).toBe('exp → exp + term | term\nterm → ID');
		expect(out.diagnostics.map((d) => [d.severity, d.message])).toEqual([
			['info', 'There is no %% line: the whole text is read as the rules section.'],
			['warning', 'ID is not declared with %token and has no rules: it is read as a terminal.']
		]);
	});

	it('names an aliased string token by its name, and reads an undeclared string as its text', () => {
		const text = `%token EQ "=="
%left EQ
%%
e : e "==" e | e "!=" e | 'a' ;`;
		const out = importBison(text);
		expect(out.grammar).toBe('e → e EQ e | e "!=" e | a');
		expect(out.precedence).toBe('%left EQ');
		expect(out.diagnostics.map((d) => [d.severity, where(text, d), d.message])).toEqual([
			['info', '"!="', '"!=" is not declared with %token NAME "!=": it is read as the terminal !=.']
		]);
	});

	it('reports %prec, mid-rule actions, %precedence and other parts it does not read', () => {
		const text = `%token NUM
%precedence NEG
%left '-'
%expect 0
%glr-parser
%%
exp : exp '-' exp
    | '-' exp %prec NEG
    | NUM { a (); } NUM { b (); }
    | exp[left] '+' NUM
    | error
    ;`;
		const out = importBison(text);
		expect(out.grammar).toBe('exp → exp - exp | - exp | NUM NUM | exp + NUM | error');
		expect(out.precedence).toBe("// %precedence NEG\n%left '-'");
		expect(out.diagnostics.map((d) => [d.severity, where(text, d)])).toEqual([
			['warning', '%precedence NEG'],
			['info', '%expect'],
			['info', '%glr-parser'],
			['warning', '%prec NEG'],
			['warning', '{ a (); }'],
			['info', '[left]'],
			['warning', 'error']
		]);
		const messages = out.diagnostics.map((d) => d.message);
		expect(messages).toContain(
			'%prec NEG is not read: the rule keeps the precedence of its last terminal, which can change how its conflicts are resolved.'
		);
		expect(messages).toContain(
			'A mid-rule action is left out: bison makes a new empty rule for it, which can add conflicts that the grammar here does not have.'
		);
		// The line turned off is read as off.
		expect(readPrecedenceText(out.precedence).lines.map((l) => l.on)).toEqual([true]);
	});

	it('reports text that is not a grammar, with its place', () => {
		expect(importBison('').diagnostics.map((d) => d.message)).toEqual([
			'Paste a bison grammar file: declarations, %%, the rules.'
		]);
		const text = '%token A\n%%\n: A ;\nx : A @ ;';
		const out = importBison(text);
		expect(out.grammar).toBe('x → A');
		expect(out.diagnostics.map((d) => [d.severity, where(text, d)])).toEqual([
			['error', ':'],
			['error', '@']
		]);
		const unclosed = importBison("%%\na : 'b' { c ;");
		expect(unclosed.diagnostics.map((d) => d.message)).toContain('The braces { } are not closed.');
		expect(importBison('%token A\n%%\n%%').diagnostics.map((d) => d.message)).toEqual([
			"No rule was found: write rules such as exp : exp '+' exp | INT ; after %%."
		]);
	});

	it('warns about a literal that names a non-terminal or the end marker', () => {
		const text = "%%\ns : 'a' '$' ;\na : 'x' ;";
		const out = importBison(text);
		expect(out.diagnostics.map((d) => [d.severity, where(text, d)])).toEqual([
			['warning', "'a'"],
			['warning', "'$'"]
		]);
	});
});
