import { describe, expect, it } from 'vitest';
import { parseEbnf, type EbnfGrammar } from '$lib/theory/grammar';
import { generateParser, knownToken, ruleComment } from './codegen';
import { sym } from './ebnf';
import { functionText, programText, type Program, type Stmt } from './program';

function ebnf(text: string): EbnfGrammar {
	const { grammar, diagnostics } = parseEbnf(text);
	if (!grammar) throw new Error(`grammar has errors: ${diagnostics.map((d) => d.message)}`);
	return grammar;
}

const code = (text: string): string => programText(generateParser(ebnf(text)));
const lines = (...rows: string[]) => rows.join('\n');

/** The function of one non-terminal, from its comment to its closing brace. */
function fn(program: Program, nonterminal: string): string {
	const index = program.functions.findIndex((f) => f.nonterminal === nonterminal);
	return functionText(program, index);
}

/** Top-Down Parsing, slide 37, with a space on both sides of every ==. */
const SLIDE_37 = lines(
	'main () {',
	'  // E $',
	'  E ();',
	"  if (token == '$')",
	"    match ('$');",
	'  else',
	'    error ("main");',
	'}',
	'',
	'// E -> T [ + E ]',
	'E () {',
	'  T ();',
	"  if (token == '+') {",
	"    match ('+');",
	'    E ();',
	'  }',
	'}',
	'',
	'// T -> ( E ) | int [ * T ]',
	'T () {',
	"  if (token == '(') {",
	"    match ('(');",
	'    E ();',
	"    match (')');",
	'  }',
	'  else if (isdigit (token)) {',
	'    match (token);',
	"    if (token == '*') {",
	"      match ('*');",
	'      T ();',
	'    }',
	'  }',
	'  else',
	'    error ("T");',
	'}'
);

describe('the parser of slide 37', () => {
	const program = generateParser(ebnf('E → T [ + E ]\nT → ( E ) | int [ * T ]'));

	it('is the code of the slide, line for line', () => {
		expect(programText(program).split('\n')).toEqual(SLIDE_37.split('\n'));
	});

	it('has main and one function per rule', () => {
		expect(program.kind).toBe('parser');
		expect(program.functions.map((f) => f.name)).toEqual(['main', 'E', 'T']);
		expect(program.functions.map((f) => f.nonterminal)).toEqual([null, 'E', 'T']);
		expect(program.main).toBe(0);
		expect(program.start).toBe(1);
	});

	it('knows the lines of every function', () => {
		const [main, e, t] = program.functions;
		expect([main.first, main.head, main.close]).toEqual([0, 0, 7]);
		expect([e.first, e.head, e.close]).toEqual([9, 10, 16]);
		expect([t.first, t.head, t.close]).toEqual([18, 19, 34]);
		expect(program.lines[8]).toEqual({ text: '', fn: null });
		expect(program.lines.slice(9, 17).every((line) => line.fn === 1)).toBe(true);
		expect(functionText(program, 1).split('\n')[0]).toBe('// E -> T [ + E ]');
	});

	it('keeps what each line does', () => {
		const [main, e, t] = program.functions;
		expect(main.body.map((s) => s.kind)).toEqual(['call', 'if']);
		expect(main.body[0]).toEqual({ kind: 'call', line: 2, fn: 1 });
		const guard = main.body[1] as Extract<Stmt, { kind: 'if' }>;
		expect(guard.arms).toHaveLength(1);
		expect(guard.arms[0]).toMatchObject({ tokens: ['$'], test: "token == '$'", line: 3 });
		expect(guard.arms[0].close).toBeNull();
		expect(guard.arms[0].body).toEqual([
			{ kind: 'match', line: 4, terminal: '$', certain: true, text: "match ('$')" }
		]);
		expect(guard.otherwise).toEqual({
			line: 5,
			body: [{ kind: 'error', line: 6, name: 'main' }],
			close: null
		});

		expect(e.body.map((s) => s.kind)).toEqual(['call', 'if']);
		const option = e.body[1] as Extract<Stmt, { kind: 'if' }>;
		expect(option.otherwise).toBeNull();
		expect(option.arms[0]).toMatchObject({ tokens: ['+'], line: 12, close: 15 });

		const choice = t.body[0] as Extract<Stmt, { kind: 'if' }>;
		expect(choice.arms.map((arm) => arm.tokens)).toEqual([['('], ['int']]);
		expect(choice.arms.map((arm) => arm.test)).toEqual(["token == '('", 'isdigit (token)']);
		// match (')') has no test before it; match (token) is certain after isdigit (token).
		expect(choice.arms[0].body[2]).toMatchObject({ kind: 'match', terminal: ')', certain: false });
		expect(choice.arms[1].body[0]).toMatchObject({
			kind: 'match',
			terminal: 'int',
			certain: true,
			text: 'match (token)'
		});
		expect(choice.otherwise?.body).toEqual([{ kind: 'error', line: 33, name: 'T' }]);
	});
});

describe('repetition becomes a loop (slide 38)', () => {
	const program = generateParser(ebnf('E → T { + T }\nT → F { * F }\nF → ( E ) | int'));

	it('writes { } as while', () => {
		expect(fn(program, 'E')).toBe(
			lines(
				'// E -> T { + T }',
				'E () {',
				'  T ();',
				"  while (token == '+') {",
				"    match ('+');",
				'    T ();',
				'  }',
				'}'
			)
		);
		expect(fn(program, 'T')).toBe(
			lines(
				'// T -> F { * F }',
				'T () {',
				'  F ();',
				"  while (token == '*') {",
				"    match ('*');",
				'    F ();',
				'  }',
				'}'
			)
		);
	});

	it('writes the alternatives of F as on slide 37', () => {
		expect(fn(program, 'F')).toBe(
			lines(
				'// F -> ( E ) | int',
				'F () {',
				"  if (token == '(') {",
				"    match ('(');",
				'    E ();',
				"    match (')');",
				'  }',
				'  else if (isdigit (token)) {',
				'    match (token);',
				'  }',
				'  else',
				'    error ("F");',
				'}'
			)
		);
	});

	it('keeps the loop with its test and its body', () => {
		const loop = program.functions[1].body[1] as Extract<Stmt, { kind: 'while' }>;
		expect(loop).toMatchObject({ kind: 'while', tokens: ['+'], test: "token == '+'" });
		expect(loop.body.map((s) => s.kind)).toEqual(['match', 'call']);
		expect(program.lines[loop.close].text).toBe('  }');
	});
});

describe('other grammars', () => {
	it('S → 1 { 0 } (slide 25)', () => {
		expect(code('S → 1 { 0 }')).toBe(
			lines(
				'main () {',
				'  // S $',
				'  S ();',
				"  if (token == '$')",
				"    match ('$');",
				'  else',
				'    error ("main");',
				'}',
				'',
				'// S -> 1 { 0 }',
				'S () {',
				"  match ('1');",
				"  while (token == '0') {",
				"    match ('0');",
				'  }',
				'}'
			)
		);
	});

	it('the alternative ε needs no code: S’ → 0 S’ | ε (slide 25)', () => {
		const program = generateParser(ebnf('S → 1 S’\nS’ → 0 S’ | ε'));
		expect(program.functions.map((f) => f.name)).toEqual(['main', 'S', 'S_']);
		expect(fn(program, 'S')).toBe(
			lines('// S -> 1 S’', 'S () {', "  match ('1');", '  S_ ();', '}')
		);
		expect(fn(program, 'S’')).toBe(
			lines(
				'// S’ -> 0 S’ | ε',
				'S_ () {',
				"  if (token == '0') {",
				"    match ('0');",
				'    S_ ();',
				'  }',
				'}'
			)
		);
	});

	it('an alternative that can derive ε is the last else', () => {
		const program = generateParser(ebnf('A → B c | d\nB → b | ε'));
		expect(fn(program, 'A')).toBe(
			lines(
				'// A -> B c | d',
				'A () {',
				// The tokens of a test are in the order of T: c, d, b.
				"  if (token == 'c' || token == 'b') {",
				'    B ();',
				"    match ('c');",
				'  }',
				"  else if (token == 'd') {",
				"    match ('d');",
				'  }',
				'  else',
				'    error ("A");',
				'}'
			)
		);
		const nullable = generateParser(ebnf('A → B C | d\nB → b | ε\nC → c | ε'));
		expect(fn(nullable, 'A')).toBe(
			lines(
				'// A -> B C | d',
				'A () {',
				"  if (token == 'd') {",
				"    match ('d');",
				'  }',
				'  else {',
				'    B ();',
				'    C ();',
				'  }',
				'}'
			)
		);
	});

	it('several alternatives inside brackets', () => {
		const program = generateParser(ebnf('E → T { + T | - T } [ ; | , ]\nT → int'));
		expect(fn(program, 'E')).toBe(
			lines(
				'// E -> T { + T | - T } [ ; | , ]',
				'E () {',
				'  T ();',
				"  while (token == '+' || token == '-') {",
				"    if (token == '+') {",
				"      match ('+');",
				'      T ();',
				'    }',
				"    else if (token == '-') {",
				"      match ('-');",
				'      T ();',
				'    }',
				'  }',
				"  if (token == ';') {",
				"    match (';');",
				'  }',
				"  else if (token == ',') {",
				"    match (',');",
				'  }',
				'}'
			)
		);
	});

	it('an int without a test before it gets one, as main tests for $', () => {
		const program = generateParser(ebnf('E → T { + T }\nT → int'));
		expect(fn(program, 'T')).toBe(
			lines(
				'// T -> int',
				'T () {',
				'  if (isdigit (token))',
				'    match (token);',
				'  else',
				'    error ("T");',
				'}'
			)
		);
		expect(code('L → ( int )').split('\n').slice(9)).toEqual([
			'// L -> ( int )',
			'L () {',
			"  match ('(');",
			'  if (isdigit (token))',
			'    match (token);',
			'  else',
			'    error ("L");',
			"  match (')');",
			'}'
		]);
	});

	it('terminals of several characters are upper-case token names', () => {
		const program = generateParser(
			ebnf('S → if E then S [ else S ] | other\nE → id { "==" id }\nA → X [ op A ]')
		);
		expect(fn(program, 'S')).toBe(
			lines(
				'// S -> if E then S [ else S ] | other',
				'S () {',
				'  if (token == IF) {',
				'    match (IF);',
				'    E ();',
				'    match (THEN);',
				'    S ();',
				'    if (token == ELSE) {',
				'      match (ELSE);',
				'      S ();',
				'    }',
				'  }',
				'  else if (token == OTHER) {',
				'    match (OTHER);',
				'  }',
				'  else',
				'    error ("S");',
				'}'
			)
		);
		expect(fn(program, 'E')).toBe(
			lines(
				'// E -> id { "==" id }',
				'E () {',
				'  match (ID);',
				'  while (token == EQ) {',
				'    match (EQ);',
				'    match (ID);',
				'  }',
				'}'
			)
		);
		// X has no rule, so it is a terminal (slide 39), and one character long.
		expect(fn(program, 'A')).toBe(
			lines(
				'// A -> X [ op A ]',
				'A () {',
				"  match ('X');",
				'  if (token == OP) {',
				'    match (OP);',
				'    A ();',
				'  }',
				'}'
			)
		);
	});

	it('gives functions and tokens names that C can use', () => {
		const program = generateParser(ebnf("main → if-stmt int\nif-stmt → if | \"the cat\" | '\\''"));
		expect(program.functions.map((f) => f.name)).toEqual(['main', 'main_', 'if_stmt']);
		expect(programText(program)).toContain('  main_ ();');
		expect(fn(program, 'if-stmt')).toBe(
			lines(
				'// if-stmt -> if | "the cat" | "\'"',
				'if_stmt () {',
				'  if (token == IF) {',
				'    match (IF);',
				'  }',
				'  else if (token == THE_CAT) {',
				'    match (THE_CAT);',
				'  }',
				"  else if (token == '\\'') {",
				"    match ('\\'');",
				'  }',
				'  else',
				'    error ("if-stmt");',
				'}'
			)
		);
	});

	it('still writes code for a grammar that is not suitable', () => {
		// Both alternatives of E start with T (slide 36): the first test is the one that holds.
		const program = generateParser(ebnf('E → T + E | T\nT → ( E ) | int | int * T'));
		expect(fn(program, 'E')).toBe(
			lines(
				'// E -> T + E | T',
				'E () {',
				"  if (token == '(' || isdigit (token)) {",
				'    T ();',
				"    match ('+');",
				'    E ();',
				'  }',
				"  else if (token == '(' || isdigit (token)) {",
				'    T ();',
				'  }',
				'  else',
				'    error ("E");',
				'}'
			)
		);
		// A left-recursive rule calls its own function first (slide 23).
		expect(fn(generateParser(ebnf('V → V a | b')), 'V')).toBe(
			lines(
				'// V -> V a | b',
				'V () {',
				"  if (token == 'b') {",
				'    V ();',
				"    match ('a');",
				'  }',
				"  else if (token == 'b') {",
				"    match ('b');",
				'  }',
				'  else',
				'    error ("V");',
				'}'
			)
		);
	});

	it('writes a rule that derives nothing', () => {
		expect(fn(generateParser(ebnf('A → A a | A b')), 'A')).toBe(
			lines('// A -> A a | A b', 'A () {', '  error ("A");', '}')
		);
		expect(fn(generateParser(ebnf('S → a A\nA → ε')), 'A')).toBe(lines('// A -> ε', 'A () {', '}'));
	});
});

describe('helpers', () => {
	it('ruleComment writes -> for the arrow', () => {
		expect(ruleComment('E', [[sym('T'), { kind: 'opt', alts: [[sym('+'), sym('E')]] }]])).toBe(
			'// E -> T [ + E ]'
		);
		expect(ruleComment('S’', [[sym('0'), sym('S’')], []])).toBe('// S’ -> 0 S’ | ε');
	});

	it('knownToken: the one token of a test, when the alternative starts with it', () => {
		expect(knownToken([sym('int'), sym('x')], ['int'])).toBe('int');
		expect(knownToken([sym('T')], ['int'])).toBeNull();
		expect(knownToken([sym('('), sym('E')], ['(', 'int'])).toBeNull();
		expect(knownToken([], [])).toBeNull();
	});
});
