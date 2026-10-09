import { describe, expect, it } from 'vitest';
import { ebnfToGrammar, parseEbnf, parseGrammar, recognizes, type Grammar } from '../grammar';
import {
	allNodes,
	astLines,
	childrenOf,
	findNode,
	isArithOp,
	isRelOp,
	nodeAt,
	numberNodes,
	printAst,
	printExpr,
	type Expr,
	type FunDecl,
	type Node,
	type Stmt
} from './ast';
import {
	CMINUS_BNF,
	CMINUS_EBNF,
	MAX_NESTING,
	MAX_SYNTAX_ERRORS,
	MAX_TREE_DEPTH,
	parse,
	parseSource
} from './parser';
import { SAMPLES } from './samples';
import { scan } from './scanner';
import { random } from './test-helpers';
import { spellingOf, type Token } from './tokens';

/** Fully parenthesized: shows exactly how the operators grouped. */
function shape(e: Expr): string {
	switch (e.kind) {
		case 'Num':
			return e.text;
		case 'Var':
			return e.name;
		case 'Index':
			return `${e.name}[${shape(e.index)}]`;
		case 'Call':
			return `${e.name}(${e.args.map(shape).join(', ')})`;
		case 'Assign':
			return `(${shape(e.target)} = ${shape(e.value)})`;
		case 'Binary':
			return `(${shape(e.left)} ${e.op} ${shape(e.right)})`;
	}
}

const inMain = (body: string) => `void main(void) { ${body} }`;

/** The statements of main's body. */
function statements(body: string): Stmt[] {
	const r = parseSource(inMain(body));
	expect(r.diagnostics).toEqual([]);
	return (r.program.decls[0] as FunDecl).body.body;
}

/** The expression of the statement `text;`, fully parenthesized. */
function expr(text: string): string {
	const [s] = statements(`${text};`);
	if (s.kind !== 'ExprStmt' || !s.expr) throw new Error('not an expression statement');
	return shape(s.expr);
}

const messages = (source: string) => parseSource(source).diagnostics.map((d) => d.message);

describe('declarations (rules 1–9)', () => {
	it('a program is a list of declarations', () => {
		const r = parseSource('int x; int y[10]; void main(void) { }');
		expect(r.ok).toBe(true);
		expect(printAst(r.program)).toBe(
			[
				'Program',
				'  VarDecl int x',
				'  VarDecl int y[10]',
				'  FunDecl void main',
				'    Compound'
			].join('\n')
		);
	});

	it('var-declaration: a simple variable and an array', () => {
		const r = parseSource('int x; int a[25]; void v; void main(void) { }');
		expect(r.program.decls.slice(0, 3)).toMatchObject([
			{ kind: 'VarDecl', typeSpec: 'int', name: 'x', size: null, sizeSpan: null },
			{ kind: 'VarDecl', typeSpec: 'int', name: 'a', size: 25, sizeSpan: { start: 13, end: 15 } },
			{ kind: 'VarDecl', typeSpec: 'void', name: 'v', size: null }
		]);
	});

	it('fun-declaration with a void parameter list', () => {
		const r = parseSource('int f(void) { return 1; }');
		expect(r.ok).toBe(true);
		expect(r.program.decls[0]).toMatchObject({
			kind: 'FunDecl',
			returnType: 'int',
			name: 'f',
			params: [],
			headSpan: { start: 0, end: 11 }
		});
	});

	it('param-list: int and array parameters', () => {
		const r = parseSource('void f(int a, int b[], int c) { }');
		expect(r.ok).toBe(true);
		expect((r.program.decls[0] as FunDecl).params).toMatchObject([
			{ kind: 'Param', typeSpec: 'int', name: 'a', isArray: false },
			{ kind: 'Param', typeSpec: 'int', name: 'b', isArray: true },
			{ kind: 'Param', typeSpec: 'int', name: 'c', isArray: false }
		]);
		expect(printAst(r.program)).toContain('    Param int b[]');
	});

	it('a void parameter with a name is a parameter (the analyzer rejects its type)', () => {
		const r = parseSource('void f(void x) { }');
		expect(r.ok).toBe(true);
		expect((r.program.decls[0] as FunDecl).params).toMatchObject([
			{ typeSpec: 'void', name: 'x', isArray: false }
		]);
	});

	it('an empty parameter list needs void', () => {
		expect(messages('int f() { return 1; }')).toEqual([
			'Expected the parameters, or "void" for none, found ")".'
		]);
	});

	it('an empty program is an error', () => {
		expect(messages('')).toEqual(['Expected a declaration: a program is a list of declarations.']);
		expect(messages('/* nothing */')).toHaveLength(1);
		expect(parseSource('').program.decls).toEqual([]);
	});

	it('a statement outside a function is an error', () => {
		expect(messages('x = 1;')).toEqual([
			'Expected "int" or "void" at the start of a declaration, found "x".'
		]);
	});

	it('the token after the name decides between variable and function', () => {
		expect(messages('int x void main(void) { }')[0]).toBe(
			'Expected ";", "[" or "(" after the name x, found "void".'
		);
		expect(messages('int x[]; void main(void) { }')[0]).toBe(
			'Expected a number for the size of the array, found "]".'
		);
		expect(messages('int 3;')[0]).toBe('Expected an identifier after "int", found "3".');
	});
});

describe('statements (rules 10–17)', () => {
	it('compound-stmt: local declarations, then statements', () => {
		const r = parseSource('void main(void) { int a; int b[3]; a = 1; ; { } }');
		expect(r.ok).toBe(true);
		expect(printAst(r.program)).toBe(
			[
				'Program',
				'  FunDecl void main',
				'    Compound',
				'      VarDecl int a',
				'      VarDecl int b[3]',
				'      ExprStmt',
				'        Assign =',
				'          Var a',
				'          Num 1',
				'      ExprStmt ;',
				'      Compound'
			].join('\n')
		);
	});

	it('a declaration after a statement is an error, and parsing goes on', () => {
		const r = parseSource('void main(void) { int a; a = 1; int b; b = 2; }');
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			'The declarations of a block come before its statements.'
		]);
		expect((r.program.decls[0] as FunDecl).body.body).toHaveLength(2);
	});

	it('a function cannot be declared in a block', () => {
		expect(messages('void main(void) { int f(void) { } }')[0]).toBe(
			'A function cannot be declared inside a function.'
		);
	});

	it('selection-stmt with and without else', () => {
		const body = 'if (x) y = 1; if (x) y = 1; else y = 2;';
		const [a, b] = statements(body);
		expect(a).toMatchObject({ kind: 'If', else: null, elseSpan: null });
		expect(b).toMatchObject({ kind: 'If', else: { kind: 'ExprStmt' } });
		const at = inMain(body).indexOf('else');
		expect(b.kind === 'If' && b.elseSpan).toMatchObject({ start: at, end: at + 4 });
		expect(a.kind === 'If' && a.headSpan).toMatchObject({ start: 18, end: 24 });
	});

	it('an if prints its condition, its statement and its else part as children', () => {
		const r = parseSource(inMain('if (a) x = 1; else x = 2;'));
		expect(printAst(r.program).split('\n').slice(3)).toEqual([
			'      If',
			'        Var a',
			'        ExprStmt',
			'          Assign =',
			'            Var x',
			'            Num 1',
			'        ExprStmt',
			'          Assign =',
			'            Var x',
			'            Num 2'
		]);
	});

	it('an else belongs to the nearest if', () => {
		const [outer] = statements('if (a) if (b) x = 1; else x = 2;');
		expect(outer).toMatchObject({
			kind: 'If',
			else: null,
			then: { kind: 'If', else: { kind: 'ExprStmt' } }
		});
		const [braced] = statements('if (a) { if (b) x = 1; } else x = 2;');
		expect(braced).toMatchObject({
			kind: 'If',
			then: { kind: 'Compound' },
			else: { kind: 'ExprStmt' }
		});
		const [three] = statements('if (a) if (b) if (c) x = 1; else x = 2; else x = 3;');
		expect(three).toMatchObject({
			else: null,
			then: { else: { kind: 'ExprStmt' }, then: { else: { kind: 'ExprStmt' } } }
		});
	});

	it('iteration-stmt', () => {
		const [w] = statements('while (i < 10) { i = i + 1; }');
		expect(w).toMatchObject({
			kind: 'While',
			test: { kind: 'Binary', op: '<' },
			body: { kind: 'Compound' },
			headSpan: { start: 18, end: 32 }
		});
	});

	it('return-stmt with and without a value', () => {
		const [a, b] = statements('return; return x + 1;');
		expect(a).toMatchObject({ kind: 'Return', value: null });
		expect(b).toMatchObject({ kind: 'Return', value: { kind: 'Binary', op: '+' } });
	});

	it('expression-stmt: an expression, or nothing', () => {
		const [a, b] = statements('f(1); ;');
		expect(a).toMatchObject({ kind: 'ExprStmt', expr: { kind: 'Call', name: 'f' } });
		expect(b).toMatchObject({ kind: 'ExprStmt', expr: null });
	});

	it('an else without an if', () => {
		expect(messages(inMain('else x = 1;'))).toEqual(['This "else" has no "if" before it.']);
	});
});

describe('expressions (rules 18–29)', () => {
	it('+ and - associate to the left', () => {
		expect(expr('a - b - c')).toBe('((a - b) - c)');
		expect(expr('a + b - c + d')).toBe('(((a + b) - c) + d)');
	});

	it('* and / associate to the left', () => {
		expect(expr('a / b / c')).toBe('((a / b) / c)');
		expect(expr('a * b / c * d')).toBe('(((a * b) / c) * d)');
		expect(expr('u - u / v * v')).toBe('(u - ((u / v) * v))');
	});

	it('* and / bind tighter than + and -', () => {
		expect(expr('a + b * c')).toBe('(a + (b * c))');
		expect(expr('a * b + c')).toBe('((a * b) + c)');
		expect(expr('a + b * c - d / e')).toBe('((a + (b * c)) - (d / e))');
	});

	it('a relational operator binds loosest of the operators', () => {
		expect(expr('a + 1 < b * 2')).toBe('((a + 1) < (b * 2))');
		for (const op of ['<=', '<', '>', '>=', '==', '!=']) {
			expect(expr(`a ${op} b`)).toBe(`(a ${op} b)`);
		}
	});

	it('parentheses group and leave no node', () => {
		expect(expr('(a + b) * c')).toBe('((a + b) * c)');
		expect(expr('a - (b - c)')).toBe('(a - (b - c))');
		expect(expr('((a))')).toBe('a');
		expect(expr('(a < b) < c')).toBe('((a < b) < c)');
		expect(expr('(a < b) + (c == d)')).toBe('((a < b) + (c == d))');
	});

	it('assignment associates to the right and has the lowest precedence', () => {
		expect(expr('a = b = 3')).toBe('(a = (b = 3))');
		expect(expr('a = b + 1')).toBe('(a = (b + 1))');
		expect(expr('a = b < c')).toBe('(a = (b < c))');
		expect(expr('a[i] = a[j] = 0')).toBe('(a[i] = (a[j] = 0))');
		expect(expr('x = y = z = w')).toBe('(x = (y = (z = w)))');
	});

	it('an assignment in parentheses is a factor', () => {
		expect(expr('(x = input()) != 0')).toBe('((x = input()) != 0)');
		expect(expr('a + (b = 2) * c')).toBe('(a + ((b = 2) * c))');
	});

	it('var: a name, or a name with a subscript', () => {
		expect(expr('a[i + 1]')).toBe('a[(i + 1)]');
		expect(expr('a[b[c[0]]]')).toBe('a[b[c[0]]]');
		expect(expr('a[i] + a[j] * 2')).toBe('(a[i] + (a[j] * 2))');
		expect(expr('a[i = 2]')).toBe('a[(i = 2)]');
	});

	it('a var that starts a simple-expression is its first factor', () => {
		expect(expr('a * b + c')).toBe('((a * b) + c)');
		expect(expr('a[1] * b < c')).toBe('((a[1] * b) < c)');
		expect(expr('a')).toBe('a');
		expect(expr('a[0]')).toBe('a[0]');
	});

	it('call: no, one and several arguments', () => {
		expect(expr('f()')).toBe('f()');
		expect(expr('f(x)')).toBe('f(x)');
		expect(expr('f(a, b + 1, g(c))')).toBe('f(a, (b + 1), g(c))');
		expect(expr('f(a = 1, b)')).toBe('f((a = 1), b)');
		expect(expr('f(x) + g(y) * 2')).toBe('(f(x) + (g(y) * 2))');
		expect(expr('output(f(g(x), h(y)))')).toBe('output(f(g(x), h(y)))');
	});

	it('NUM', () => {
		const [s] = statements('007;');
		expect(s).toMatchObject({ expr: { kind: 'Num', value: 7, text: '007' } });
	});

	it('a < b < c is a syntax error', () => {
		const r = parseSource(inMain('x = a < b < c;'));
		expect(r.ok).toBe(false);
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0]).toMatchObject({
			message: 'Relational operators do not associate: a < b < c is not an expression.',
			span: { start: 28, end: 29 }
		});
		expect(messages(inMain('a == b != c == d;'))).toHaveLength(1);
	});

	it('only a var can be assigned to', () => {
		const message = 'The left side of "=" must be a variable or an array element.';
		expect(messages(inMain('(a) = 3;'))).toEqual([message]);
		expect(messages(inMain('a + b = 3;'))).toEqual([message]);
		expect(messages(inMain('f(x) = 3;'))).toEqual([message]);
		expect(messages(inMain('3 = x;'))).toEqual([message]);
	});

	it('there is no unary minus', () => {
		expect(messages(inMain('x = -1;'))).toEqual(['C- has no unary minus: write 0 - x.']);
		expect(expr('0 - 1')).toBe('(0 - 1)');
	});

	it('printExpr writes the least parentheses that keep the tree', () => {
		const round = (text: string) => {
			const [s] = statements(`${text};`);
			if (s.kind !== 'ExprStmt' || !s.expr) throw new Error('not an expression');
			const printed = printExpr(s.expr);
			expect(expr(printed)).toBe(shape(s.expr));
			return printed;
		};
		expect(round('a - (b - c)')).toBe('a - (b - c)');
		expect(round('(a - b) - c')).toBe('a - b - c');
		expect(round('(a + b) * c')).toBe('(a + b) * c');
		expect(round('a + (b * c)')).toBe('a + b * c');
		expect(round('a / (b * c)')).toBe('a / (b * c)');
		expect(round('(a < b) < c')).toBe('(a < b) < c');
		expect(round('a < (b < c)')).toBe('a < (b < c)');
		expect(round('x = (y = 3)')).toBe('x = y = 3');
		expect(round('(x = 1) + 2')).toBe('(x = 1) + 2');
		expect(round('f(a[i + 1], (b = 2))')).toBe('f(a[i + 1], b = 2)');
	});
});

describe('syntax errors', () => {
	it('says what was expected and what was found', () => {
		expect(messages(inMain('x = 1'))).toEqual(['Expected ";" after the expression, found "}".']);
		expect(messages(inMain('x = 1 }'))).toEqual([
			'Expected ";" after the expression, found "}".',
			'Expected "int" or "void" at the start of a declaration, found "}".'
		]);
		expect(messages(inMain('x = (1 + 2;'))).toEqual([
			'Expected ")" after the expression, found ";".'
		]);
		expect(messages(inMain('if x) y = 1;'))).toEqual(['Expected "(" after "if", found "x".']);
		expect(messages(inMain('while (x y = 1;'))).toEqual([
			'Expected ")" after the condition, found "y".'
		]);
		expect(messages(inMain('x = a[1;'))).toEqual(['Expected "]" after the subscript, found ";".']);
		expect(messages(inMain('f(1, 2;'))).toEqual(['Expected ")" after the arguments, found ";".']);
		expect(messages(inMain('return 1'))).toEqual([
			'Expected ";" after the returned value, found "}".'
		]);
		expect(messages(inMain('x = ;'))).toEqual(['Expected an expression, found ";".']);
		expect(messages(inMain('x = 1 +;'))).toEqual(['Expected an expression, found ";".']);
	});

	it('points at the token found', () => {
		const r = parseSource('void main(void)\n{\n  x = 1\n}\n');
		expect(r.diagnostics[0].span).toMatchObject({ start: 26, end: 27, line: 4, column: 1 });
	});

	it('a block left open is reported once, at the end', () => {
		const r = parseSource('void main(void) { if (x) { while (y) { x = 1;');
		expect(r.diagnostics.map((d) => d.message)).toEqual([
			'Expected "}" at the end of the block, found the end of the program.'
		]);
	});

	it('recovers at ; and reports two separate errors in one program', () => {
		const r = parseSource(inMain('x = ; y = 2; z = 3 + ; w = 4;'));
		expect(r.diagnostics.map((d) => [d.message, d.span?.start])).toEqual([
			['Expected an expression, found ";".', 22],
			['Expected an expression, found ";".', 39]
		]);
		// The two statements without an error are in the tree.
		const body = (r.program.decls[0] as FunDecl).body.body;
		expect(body.map((s) => s.kind === 'ExprStmt' && s.expr && shape(s.expr))).toEqual([
			'(y = 2)',
			'(w = 4)'
		]);
	});

	it('recovers at } and goes on with the next declaration', () => {
		const r = parseSource(
			'int f(void) { return 1 + ; }\nint g(int) { }\nvoid main(void) { x = 1 }'
		);
		expect(r.diagnostics.map((d) => [d.message, d.span?.line])).toEqual([
			['Expected an expression, found ";".', 1],
			['Expected an identifier after "int", found ")".', 2],
			['Expected ";" after the expression, found "}".', 3]
		]);
		expect(r.program.decls.map((d) => d.name)).toEqual(['f', 'main']);
	});

	it('a bad declaration does not hide the ones after it', () => {
		const r = parseSource('int x int y; int z[; void main(void) { }');
		expect(r.diagnostics).toHaveLength(2);
		expect(r.program.decls.map((d) => d.name)).toEqual(['y', 'main']);
	});

	it('a missing ; costs the statement, not the rest of the block', () => {
		const r = parseSource(inMain('x = 1 y = 2; z = 3;'));
		expect(r.diagnostics).toHaveLength(1);
		const body = (r.program.decls[0] as FunDecl).body.body;
		expect(body).toHaveLength(1);
		expect(body[0]).toMatchObject({ expr: { target: { name: 'z' } } });
	});

	it('an error in a nested statement leaves the statements around it', () => {
		const r = parseSource(inMain('a = 1; if (a) { b = ; c = 3; } d = 4;'));
		expect(r.diagnostics).toHaveLength(1);
		expect(printAst(r.program)).toContain('Var c');
		expect(printAst(r.program)).toContain('Var d');
	});

	it('stops after MAX_SYNTAX_ERRORS errors', () => {
		const r = parseSource(inMain('x = ; '.repeat(200)));
		expect(r.diagnostics).toHaveLength(MAX_SYNTAX_ERRORS + 1);
		expect(r.diagnostics.at(-1)?.message).toBe(
			`Parsing stopped after ${MAX_SYNTAX_ERRORS} syntax errors.`
		);
	});

	it('scanner errors come first in parseSource', () => {
		const r = parseSource(inMain('x = 1 @ 2;'));
		expect(r.ok).toBe(false);
		expect(r.diagnostics[0].message).toBe('Illegal character "@": no token starts with it.');
	});

	it('names the end of the program and long lexemes sensibly', () => {
		expect(messages('int')).toEqual([
			'Expected an identifier after "int", found the end of the program.'
		]);
		const r = parse(scan(`void main(void) { x = /* ${'y'.repeat(100)}`).tokens);
		expect(r.diagnostics[0].message).toBe('Expected an expression, found "/* yyyyyyyyyyyyyyyyy…".');
	});
});

describe('limits', () => {
	it('deep nesting is an error, not a crash', () => {
		const deep = `x = ${'('.repeat(5000)}1${')'.repeat(5000)};`;
		const r = parseSource(inMain(deep));
		expect(r.ok).toBe(false);
		expect(r.diagnostics.at(-1)?.message).toBe(
			`This is nested more than ${MAX_NESTING} levels deep.`
		);
		const blocks = parseSource(inMain('{'.repeat(5000)));
		expect(blocks.ok).toBe(false);
		const ifs = parseSource(inMain(`${'if (x) '.repeat(5000)};`));
		expect(ifs.diagnostics.at(-1)?.message).toContain('nested more than');
	});

	it('a long chain of operators is an error, not a crash', () => {
		const chain = `x = 1${' + 1'.repeat(20000)};`;
		const r = parseSource(inMain(chain));
		expect(r.diagnostics.at(-1)?.message).toBe(
			`This is nested more than ${MAX_TREE_DEPTH} levels deep.`
		);
		const fine = parseSource(inMain(`x = 1${' + 1'.repeat(400)};`));
		expect(fine.ok).toBe(true);
	});

	it('nesting up to the limit parses', () => {
		const n = MAX_NESTING - 10;
		const r = parseSource(inMain(`x = ${'('.repeat(n)}1${')'.repeat(n)};`));
		expect(r.ok).toBe(true);
	});

	it('a long program parses', () => {
		const r = parseSource(inMain('x = x + 1; '.repeat(20000)));
		expect(r.ok).toBe(true);
		expect((r.program.decls[0] as FunDecl).body.body).toHaveLength(20000);
	});
});

describe('the tree', () => {
	const source = `int g;
int f(int a, int b[])
{
  if (a < 1) return b[0];
  while (a > 0) a = a - 1;
  return f(a, b) + (g = 2);
}
void main(void) { output(f(1, 2)); ; }`;
	const { program, ok } = parseSource(source);

	it('parses', () => {
		expect(ok).toBe(true);
	});

	it('ids are preorder numbers from 0', () => {
		const nodes = allNodes(program);
		expect(nodes.map((n) => n.id)).toEqual(nodes.map((_, i) => i));
		expect(program.id).toBe(0);
		// Parsing the same text again gives the same ids.
		expect(allNodes(parseSource(source).program).map((n) => `${n.id} ${n.kind}`)).toEqual(
			nodes.map((n) => `${n.id} ${n.kind}`)
		);
	});

	it('every node kind appears, and childrenOf lists each child once', () => {
		const kinds = new Set(allNodes(program).map((n) => n.kind));
		expect([...kinds].sort()).toEqual(
			[
				'Assign',
				'Binary',
				'Call',
				'Compound',
				'ExprStmt',
				'FunDecl',
				'If',
				'Index',
				'Num',
				'Param',
				'Program',
				'Return',
				'Var',
				'VarDecl',
				'While'
			].sort()
		);
		const count = (n: Node): number => 1 + childrenOf(n).reduce((s, c) => s + count(c), 0);
		expect(count(program)).toBe(allNodes(program).length);
	});

	it('a span covers the text of its node and of its children', () => {
		for (const node of allNodes(program)) {
			expect(node.span.end).toBeGreaterThan(node.span.start);
			for (const child of childrenOf(node)) {
				// Parentheses around a child belong to the parent's span.
				expect(child.span.start).toBeGreaterThanOrEqual(node.span.start);
				expect(child.span.end).toBeLessThanOrEqual(node.span.end);
			}
		}
		const text = (n: Node) => source.slice(n.span.start, n.span.end);
		const f = program.decls[1] as FunDecl;
		expect(text(program.decls[0])).toBe('int g;');
		expect(source.slice(f.headSpan.start, f.headSpan.end)).toBe('int f(int a, int b[])');
		expect(source.slice(f.nameSpan.start, f.nameSpan.end)).toBe('f');
		expect(text(f.params[1])).toBe('int b[]');
		expect(text(f.body.body[0])).toBe('if (a < 1) return b[0];');
		expect(text(f.body.body[1])).toBe('while (a > 0) a = a - 1;');
		const ret = f.body.body[2];
		expect(text(ret)).toBe('return f(a, b) + (g = 2);');
		// The parentheses of an operand are inside the operator's span.
		expect(ret.kind === 'Return' && ret.value && text(ret.value)).toBe('f(a, b) + (g = 2)');
		expect(source.slice(f.body.closeSpan.start, f.body.closeSpan.end)).toBe('}');
		expect(f.body.closeSpan.line).toBe(7);
	});

	it('spans carry line and column', () => {
		const f = program.decls[1] as FunDecl;
		expect(f.span).toMatchObject({ line: 2, column: 1 });
		expect(f.body.body[1].span).toMatchObject({ line: 5, column: 3 });
		expect(program.span).toMatchObject({ start: 0, end: source.length, line: 1, column: 1 });
	});

	it('prints as indented text, one node per line', () => {
		expect(printAst(program)).toBe(`Program
  VarDecl int g
  FunDecl int f
    Param int a
    Param int b[]
    Compound
      If
        Binary <
          Var a
          Num 1
        Return
          Index b
            Num 0
      While
        Binary >
          Var a
          Num 0
        ExprStmt
          Assign =
            Var a
            Binary -
              Var a
              Num 1
      Return
        Binary +
          Call f
            Var a
            Var b
          Assign =
            Var g
            Num 2
  FunDecl void main
    Compound
      ExprStmt
        Call output
          Call f
            Num 1
            Num 2
      ExprStmt ;`);
		expect(printAst(program, { indent: '\t' }).split('\n')[2]).toBe('\tFunDecl int f');
	});

	it('astLines gives the same lines with ids, depths and spans', () => {
		const lines = astLines(program);
		expect(lines.map((l) => l.id)).toEqual(lines.map((_, i) => i));
		expect(lines[3]).toEqual({
			id: 3,
			depth: 2,
			label: 'Param int a',
			span: findNode(program, 3)!.span
		});
		expect(lines.map((l) => '  '.repeat(l.depth) + l.label).join('\n')).toBe(printAst(program));
	});

	it('numberNodes numbers a subtree from any first id', () => {
		const copy = parseSource(source).program;
		const f = copy.decls[1];
		const next = numberNodes(f, 100);
		expect(f.id).toBe(100);
		expect(next).toBe(100 + allNodes(f).length);
		expect(allNodes(f).map((n) => n.id)).toEqual(allNodes(f).map((_, i) => 100 + i));
	});

	it('isArithOp and isRelOp split the ten operators', () => {
		const ops = ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!='] as const;
		expect(ops.filter((op) => isArithOp(op))).toEqual(['+', '-', '*', '/']);
		expect(ops.filter((op) => isRelOp(op))).toEqual(['<', '<=', '>', '>=', '==', '!=']);
		expect(isArithOp(':=')).toBe(false);
	});

	it('findNode and nodeAt', () => {
		expect(findNode(program, 0)).toBe(program);
		expect(findNode(program, 9999)).toBeNull();
		const at = (needle: string) => nodeAt(program, source.indexOf(needle));
		expect(at('g;')).toMatchObject({ kind: 'VarDecl', name: 'g' });
		expect(at('b[0]')).toMatchObject({ kind: 'Index', name: 'b' });
		expect(at('0];')).toMatchObject({ kind: 'Num', value: 0 });
		expect(at('< 1')).toMatchObject({ kind: 'Binary', op: '<' });
		expect(nodeAt(program, source.length + 5)).toBeNull();
	});
});

describe('the grammar texts', () => {
	const bnf = parseGrammar(CMINUS_BNF);
	const ebnf = parseEbnf(CMINUS_EBNF);

	/** A token list as terminals of the grammar: ID, NUM, or the token's spelling. */
	const terminals = (tokens: readonly Token[]) =>
		tokens.filter((t) => t.type !== 'ENDFILE').map((t) => spellingOf(t.type) ?? t.type);

	it('the BNF has the 29 rules of the language definition', () => {
		expect(bnf.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		const g = bnf.grammar!;
		expect(g.nonterminals).toHaveLength(29);
		expect(g.start).toBe('program');
		expect(CMINUS_BNF.split('\n')).toHaveLength(29);
		expect([...g.terminals].sort()).toEqual(
			[
				'ID',
				'NUM',
				'int',
				'void',
				'if',
				'else',
				'while',
				'return',
				...'+ - * / < <= > >= == != = ; , ( ) [ ] { }'.split(' ')
			].sort()
		);
	});

	it('the EBNF reads as a grammar over the same terminals', () => {
		expect(ebnf.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
		const g = ebnfToGrammar(ebnf.grammar!);
		expect([...g.terminals].sort()).toEqual([...bnf.grammar!.terminals].sort());
	});

	it('both grammars derive the sample programs', () => {
		const grammars: Grammar[] = [bnf.grammar!, ebnfToGrammar(ebnf.grammar!)];
		for (const s of SAMPLES.filter((s) => s.id === 'gcd' || s.id === 'undeclared')) {
			const tokens = terminals(scan(s.source).tokens);
			for (const g of grammars) expect(recognizes(g, tokens)).toBe(true);
			expect(parseSource(s.source).ok).toBe(true);
		}
	});

	it('every sample program parses', () => {
		for (const s of SAMPLES) expect(parseSource(s.source).diagnostics).toEqual([]);
	});

	const PIECES =
		'int void if else while return x y f 0 1 + - * / < <= > >= == != = ; , ( ) [ ] { }'.split(' ');

	it('accepts exactly the token strings the BNF derives (mutated programs)', () => {
		const g = bnf.grammar!;
		const base = scan(
			'int a[3]; int f(int n, int b[]) { int k; if (n < 1) return b[0]; else k = f(n - 1, b) * 2; while (k) k = k / 2; return k; } void main(void) { a[0] = 1; output(f(2, a)); }'
		).tokens.filter((t) => t.type !== 'ENDFILE');
		const rnd = random(435);
		let accepted = 0;
		let rejected = 0;
		for (let round = 0; round < 250; round++) {
			const words = base.map((t) => t.lexeme);
			// Up to three edits: delete, replace or insert a token.
			for (let edits = 1 + Math.floor(rnd() * 3); edits > 0; edits--) {
				const at = Math.floor(rnd() * words.length);
				const piece = PIECES[Math.floor(rnd() * PIECES.length)];
				const kind = rnd();
				if (kind < 0.34) words.splice(at, 1);
				else if (kind < 0.67) words[at] = piece;
				else words.splice(at, 0, piece);
			}
			const tokens = scan(words.join(' ')).tokens;
			const expected = recognizes(g, terminals(tokens));
			const result = parse(tokens);
			if (result.ok !== expected) {
				throw new Error(`parser says ${result.ok}, grammar says ${expected}: ${words.join(' ')}`);
			}
			if (expected) accepted++;
			else rejected++;
		}
		// The edits produce both kinds.
		expect(accepted).toBeGreaterThan(5);
		expect(rejected).toBeGreaterThan(100);
	});

	it('never hangs or throws on random token soup, and agrees with the grammar', () => {
		const g = bnf.grammar!;
		const rnd = random(2026);
		let errors = 0;
		for (let round = 0; round < 400; round++) {
			const length = Math.floor(rnd() * 60);
			const words: string[] = [];
			for (let i = 0; i < length; i++) words.push(PIECES[Math.floor(rnd() * PIECES.length)]);
			const tokens = scan(words.join(' ')).tokens;
			const result = parse(tokens);
			expect(result.program.kind).toBe('Program');
			expect(result.ok).toBe(recognizes(g, terminals(tokens)));
			errors += result.diagnostics.length;
			// The tree is numbered and printable whatever was dropped.
			expect(printAst(result.program).split('\n')).toHaveLength(allNodes(result.program).length);
		}
		expect(errors).toBeGreaterThan(400);
	});

	it('long soups of one token end too', () => {
		for (const piece of PIECES) {
			const tokens = scan(`${piece} `.repeat(3000)).tokens;
			const result = parse(tokens);
			expect(result.ok).toBe(false);
			expect(result.diagnostics.length).toBeLessThanOrEqual(MAX_SYNTAX_ERRORS + 1);
		}
	});

	it('takes a token list without ENDFILE', () => {
		const tokens = scan('void main(void) { }').tokens.slice(0, -1);
		expect(parse(tokens).ok).toBe(true);
		expect(parse([]).ok).toBe(false);
	});
});
