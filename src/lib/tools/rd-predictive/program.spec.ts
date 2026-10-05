import { describe, expect, it } from 'vitest';
import {
	INT,
	Names,
	Writer,
	characterLiteral,
	functionText,
	isCharacter,
	programText,
	writeError,
	writeGuard,
	writeIf,
	writeMatch,
	writeWhile,
	type Program,
	type Stmt
} from './program';

const text = (w: Writer): string[] => w.lines.map((line) => line.text);

describe('names', () => {
	const names = new Names(
		['E', 'E’', 'if-stmt', 'main', 'ID', '9lives'],
		['+', 'int', 'id', '==', '<=', 'the cat', 'x_y', '$', "'", '\\', '≠', '+=+', '42']
	);

	it('gives every non-terminal a C identifier', () => {
		expect([...names.functions]).toEqual([
			['E', 'E'],
			['E’', 'E_'],
			['if-stmt', 'if_stmt'],
			// main is the parser's own function, and ID is taken by a non-terminal.
			['main', 'main_'],
			['ID', 'ID'],
			['9lives', '_9lives']
		]);
	});

	it('gives terminals of several characters an upper-case token name', () => {
		expect([...names.tokens]).toEqual([
			['id', 'ID_'],
			['==', 'EQ'],
			['<=', 'LE'],
			['the cat', 'THE_CAT'],
			['x_y', 'X_Y'],
			['+=+', 'PLUS_ASSIGN_PLUS'],
			['42', 'T_42']
		]);
	});

	it('writes a terminal of one character as a character literal', () => {
		expect(names.literal('+')).toBe("'+'");
		expect(names.literal('$')).toBe("'$'");
		expect(names.literal("'")).toBe("'\\''");
		expect(names.literal('\\')).toBe("'\\\\'");
		expect(names.literal('≠')).toBe("'≠'");
		expect(names.literal('==')).toBe('EQ');
		expect(characterLiteral('a')).toBe("'a'");
		expect(isCharacter('+')).toBe(true);
		expect(isCharacter('≠')).toBe(true);
		expect(isCharacter('==')).toBe(false);
	});

	it('tests an int with isdigit (token) and matches it with match (token)', () => {
		expect(INT).toBe('int');
		expect(names.test(['int'])).toBe('isdigit (token)');
		expect(names.test(['+'])).toBe("token == '+'");
		expect(names.test(['(', 'int', '=='])).toBe("token == '(' || isdigit (token) || token == EQ");
		expect(names.argument('int', true)).toBe('token');
		expect(names.argument('+', true)).toBe("'+'");
		expect(names.argument('==', false)).toBe('EQ');
	});

	it('names the variable of an operator node after the operator', () => {
		const none = new Set<string>();
		expect(names.variable('+', none)).toBe('plus');
		expect(names.variable('*', none)).toBe('times');
		expect(names.variable('-', none)).toBe('minus');
		expect(names.variable('op', none)).toBe('op');
		expect(names.variable('==', none)).toBe('node');
		// Not a name the code uses itself, and not one that is in use.
		expect(names.variable('tree', none)).toBe('node');
		expect(names.variable('int', none)).toBe('node');
		expect(names.variable('+', new Set(['plus']))).toBe('plus_');
		expect(new Names(['plus'], ['+']).variable('+', none)).toBe('node');
		expect(new Names(['node'], ['==']).variable('==', none)).toBe('node_');
	});

	it('unique adds underscores until the name is free', () => {
		const fresh = new Names([], []);
		expect(fresh.unique('token')).toBe('token_');
		expect(fresh.unique('token')).toBe('token__');
		expect(fresh.unique('x')).toBe('x');
		expect(fresh.unique('x')).toBe('x_');
	});
});

describe('writing lines', () => {
	const names = new Names(['E', 'T'], ['+', 'int', '(', ')']);

	it('indents by two spaces and remembers the function of each line', () => {
		const w = new Writer();
		w.fn = 3;
		expect(w.line(0, 'E () {')).toBe(0);
		expect(w.line(2, 'T ();')).toBe(1);
		w.blank();
		expect(w.lines).toEqual([
			{ text: 'E () {', fn: 3 },
			{ text: '    T ();', fn: 3 },
			{ text: '', fn: null }
		]);
	});

	it('writeMatch', () => {
		const w = new Writer();
		expect(writeMatch(w, 1, names, '+', false)).toEqual({
			kind: 'match',
			line: 0,
			terminal: '+',
			certain: false,
			text: "match ('+')"
		});
		expect(writeMatch(w, 1, names, 'int', true)).toMatchObject({
			text: 'match (token)',
			certain: true
		});
		expect(text(w)).toEqual(["  match ('+');", '  match (token);']);
	});

	it('writeError escapes the name inside the string', () => {
		const w = new Writer();
		expect(writeError(w, 1, 'T')).toEqual({ kind: 'error', line: 0, name: 'T' });
		expect(writeError(w, 0, 'a"b\\c')).toEqual({ kind: 'error', line: 1, name: 'a"b\\c' });
		expect(text(w)).toEqual(['  error ("T");', 'error ("a\\"b\\\\c");']);
	});

	it('writeIf: the layout of slide 37', () => {
		const w = new Writer();
		const stmt = writeIf(
			w,
			1,
			[
				{
					tokens: ['('],
					test: names.test(['(']),
					write: (d) => [writeMatch(w, d, names, '(', true)]
				},
				{
					tokens: ['int'],
					test: names.test(['int']),
					write: (d) => [writeMatch(w, d, names, 'int', true)]
				}
			],
			{ error: 'T' }
		) as Extract<Stmt, { kind: 'if' }>;
		expect(text(w)).toEqual([
			"  if (token == '(') {",
			"    match ('(');",
			'  }',
			'  else if (isdigit (token)) {',
			'    match (token);',
			'  }',
			'  else',
			'    error ("T");'
		]);
		expect(stmt.arms.map((arm) => [arm.line, arm.close])).toEqual([
			[0, 2],
			[3, 5]
		]);
		expect(stmt.otherwise).toEqual({
			line: 6,
			body: [{ kind: 'error', line: 7, name: 'T' }],
			close: null
		});
	});

	it('writeIf: without an else, or with statements in it', () => {
		const w = new Writer();
		const branch = {
			tokens: ['+'],
			test: names.test(['+']),
			write: (d: number) => [writeMatch(w, d, names, '+', true)]
		};
		expect(writeIf(w, 0, [branch], null)).toMatchObject({ kind: 'if', otherwise: null });
		const stmt = writeIf(w, 0, [branch], {
			write: (d) => [writeMatch(w, d, names, ')', false)]
		}) as Extract<Stmt, { kind: 'if' }>;
		expect(text(w)).toEqual([
			"if (token == '+') {",
			"  match ('+');",
			'}',
			"if (token == '+') {",
			"  match ('+');",
			'}',
			'else {',
			"  match (')');",
			'}'
		]);
		expect(stmt.otherwise).toMatchObject({ line: 6, close: 8 });
	});

	it('writeGuard: one statement each, without braces, as in main', () => {
		const w = new Writer();
		const stmt = writeGuard(
			w,
			1,
			{
				tokens: ['$'],
				test: names.test(['$']),
				write: (d) => [writeMatch(w, d, names, '$', true)]
			},
			'main'
		) as Extract<Stmt, { kind: 'if' }>;
		expect(text(w)).toEqual([
			"  if (token == '$')",
			"    match ('$');",
			'  else',
			'    error ("main");'
		]);
		expect(stmt.arms[0].close).toBeNull();
		expect(stmt.otherwise?.close).toBeNull();
	});

	it('writeWhile', () => {
		const w = new Writer();
		const stmt = writeWhile(w, 1, {
			tokens: ['+'],
			test: names.test(['+']),
			write: (d) => [writeMatch(w, d, names, '+', true)]
		});
		expect(text(w)).toEqual(["  while (token == '+') {", "    match ('+');", '  }']);
		expect(stmt).toMatchObject({ kind: 'while', line: 0, close: 2, tokens: ['+'] });
	});
});

describe('the text of a program', () => {
	const program: Program = {
		kind: 'parser',
		lines: [
			{ text: 'main () {', fn: 0 },
			{ text: '}', fn: 0 },
			{ text: '', fn: null },
			{ text: '// E -> a', fn: 1 },
			{ text: 'E () {', fn: 1 },
			{ text: '}', fn: 1 }
		],
		functions: [
			{ name: 'main', nonterminal: null, first: 0, head: 0, close: 1, body: [] },
			{ name: 'E', nonterminal: 'E', first: 3, head: 4, close: 5, body: [] }
		],
		main: 0,
		start: 1
	};

	it('programText joins the lines', () => {
		expect(programText(program)).toBe('main () {\n}\n\n// E -> a\nE () {\n}');
	});

	it('functionText is one function, from its first line to its closing brace', () => {
		expect(functionText(program, 0)).toBe('main () {\n}');
		expect(functionText(program, 1)).toBe('// E -> a\nE () {\n}');
	});
});
