import { describe, expect, it } from 'vitest';
import { allNodes, type Node } from './ast';
import { parseSource } from './parser';
import { SAMPLES, UNDECLARED_SOURCE } from './samples';
import {
	analyze,
	typeText,
	visibleSymbols,
	type SemanticResult,
	type SymbolInfo
} from './semantic';

function check(source: string): SemanticResult & { source: string; nodes: Node[] } {
	const parsed = parseSource(source);
	expect(parsed.diagnostics).toEqual([]);
	return { ...analyze(parsed.program), source, nodes: allNodes(parsed.program) };
}

const errors = (source: string) =>
	check(source)
		.diagnostics.filter((d) => d.severity === 'error')
		.map((d) => d.message);
const warnings = (source: string) =>
	check(source)
		.diagnostics.filter((d) => d.severity === 'warning')
		.map((d) => d.message);
/** Messages with the source text each one points at. */
const located = (source: string) =>
	check(source).diagnostics.map((d) => [d.message, source.slice(d.span!.start, d.span!.end)]);

const inMain = (body: string) => `void main(void) { ${body} }`;
const symbol = (r: SemanticResult, name: string, nth = 0): SymbolInfo =>
	r.symbols.filter((s) => s.name === name)[nth];

describe('a correct program', () => {
	it('has no diagnostics', () => {
		for (const s of SAMPLES.filter((s) => s.id !== 'undeclared')) {
			const r = check(s.source);
			expect(r.diagnostics).toEqual([]);
			expect(r.ok).toBe(true);
		}
	});

	it('an int function whose result is not used is fine', () => {
		expect(
			check('int f(void) { return 1; } void main(void) { f(); input(); }').diagnostics
		).toEqual([]);
	});

	it('a function may call itself', () => {
		expect(
			check('int f(int n) { if (n < 1) return 0; return f(n - 1); } void main(void) { f(3); }')
				.diagnostics
		).toEqual([]);
	});

	it('main may call itself, and a local may be named like a function', () => {
		expect(check('void main(void) { main(); }').ok).toBe(true);
		expect(check('int f(void) { return 1; } void main(void) { int f; f = 2; }').ok).toBe(true);
		expect(check('void main(void) { int output; output = 2; }').ok).toBe(true);
	});
});

describe('undeclared identifiers', () => {
	it('the program of the lecture deck: exactly y and z', () => {
		const r = check(UNDECLARED_SOURCE);
		expect(r.diagnostics.map((d) => [d.severity, d.message])).toEqual([
			['error', 'y is not declared.'],
			['error', 'z is not declared.']
		]);
		expect(r.diagnostics.map((d) => d.span)).toEqual([
			{ start: 26, end: 27, line: 1, column: 27, source: null },
			{ start: 48, end: 49, line: 1, column: 49, source: null }
		]);
		expect(r.ok).toBe(false);
	});

	it('a variable, an array and a function', () => {
		expect(located(inMain('x = 1; a[0] = 2; f(3);'))).toEqual([
			['x is not declared.', 'x'],
			['a is not declared.', 'a'],
			['f is not declared.', 'f']
		]);
	});

	it('reports once per use', () => {
		expect(errors(inMain('x = x + x;'))).toEqual([
			'x is not declared.',
			'x is not declared.',
			'x is not declared.'
		]);
	});

	it('does not cascade into further errors', () => {
		// Each line would be a second error if the undeclared name had a type.
		expect(errors(inMain('int a[2]; a[u] = 1;'))).toEqual(['u is not declared.']);
		expect(errors(inMain('int x; x = u + 1;'))).toEqual(['u is not declared.']);
		expect(errors(inMain('int x; x = u[2] * 3;'))).toEqual(['u is not declared.']);
		expect(errors(inMain('int x; x = u(1, 2);'))).toEqual(['u is not declared.']);
		expect(errors(inMain('output(u); if (u) ; while (u(1)) ;'))).toEqual([
			'u is not declared.',
			'u is not declared.',
			'u is not declared.'
		]);
		expect(errors('int f(int a[]) { return 1; } void main(void) { f(u); }')).toEqual([
			'u is not declared.'
		]);
		expect(errors('int f(void) { return u; } void main(void) { }')).toEqual(['u is not declared.']);
	});

	it('a name is declared before it is used', () => {
		expect(located('void main(void) { x = 1; } int x;')).toEqual([
			['main must be the last declaration of the program.', 'main'],
			['x is not declared.', 'x']
		]);
		expect(
			errors('int f(void) { return g(); } int g(void) { return 1; } void main(void) { }')
		).toEqual(['g is not declared.']);
	});

	it('a local is not visible after its block', () => {
		expect(errors(inMain('{ int x; x = 1; } x = 2;'))).toEqual(['x is not declared.']);
		expect(errors('void f(int p) { } void main(void) { p = 1; }')).toEqual(['p is not declared.']);
	});
});

describe('redeclaration', () => {
	it('in the global scope', () => {
		expect(located('int x;\nint x;\nvoid main(void) { }')).toEqual([
			['x is already declared in this scope (line 1).', 'x']
		]);
		expect(errors('int f;\nint f(void) { return 1; }\nvoid main(void) { }')).toEqual([
			'f is already declared in this scope (line 1).'
		]);
	});

	it('a parameter and a local of the body share one scope', () => {
		expect(errors('void f(int a) { int a; }\nvoid main(void) { }')).toEqual([
			'a is already declared in this scope (line 1).'
		]);
		expect(errors('void f(int a, int a) { } void main(void) { }')).toHaveLength(1);
		expect(errors(inMain('int a; int b; int a[3];'))).toHaveLength(1);
	});

	it('a nested block may declare the name again', () => {
		expect(errors(inMain('int a; { int a; { int a; } }'))).toEqual([]);
		expect(errors('int a; void f(int a) { { int a; } } void main(void) { int a; }')).toEqual([]);
	});

	it('input and output are already declared in the global scope', () => {
		expect(errors('int input; void main(void) { }')).toEqual([
			'input is a predefined function; it cannot be declared again.'
		]);
		expect(errors('void output(int x) { } void main(void) { }')).toEqual([
			'output is a predefined function; it cannot be declared again.'
		]);
	});

	it('the later declaration is the one used afterwards', () => {
		expect(errors(inMain('int a; int a[3]; a[0] = 1;'))).toEqual([
			'a is already declared in this scope (line 1).'
		]);
	});
});

describe('void variables and parameters', () => {
	it('a void variable, global or local', () => {
		expect(located('void x; void main(void) { void y; }')).toEqual([
			['A variable cannot have the type void.', 'void x;'],
			['A variable cannot have the type void.', 'void y;']
		]);
		expect(errors('void a[3]; void main(void) { }')).toEqual([
			'A variable cannot have the type void.'
		]);
	});

	it('a void parameter', () => {
		expect(located('int f(void x, void y[]) { return 1; } void main(void) { }')).toEqual([
			['A parameter cannot have the type void.', 'void x'],
			['A parameter cannot have the type void.', 'void y[]']
		]);
	});
});

describe('main', () => {
	it('missing', () => {
		expect(located('int x; int f(void) { return 1; }')).toEqual([
			['The program has no main: its last declaration must be void main(void).', 'f']
		]);
	});

	it('not last', () => {
		expect(located('void main(void) { } int x;')).toEqual([
			['main must be the last declaration of the program.', 'main']
		]);
		expect(errors('void main(void) { } void f(void) { }')).toEqual([
			'main must be the last declaration of the program.'
		]);
	});

	it('not void main(void)', () => {
		expect(located('int main(void) { return 0; }')).toEqual([
			['main must be declared void main(void).', 'int main(void)']
		]);
		expect(errors('void main(int n) { }')).toEqual(['main must be declared void main(void).']);
		expect(errors('void main(int a[]) { }')).toEqual(['main must be declared void main(void).']);
		expect(errors('int main;')).toEqual(['main must be a function, declared void main(void).']);
	});

	it('a main in the middle with the wrong type gets both messages', () => {
		expect(errors('int main(void) { return 0; } int x;')).toEqual([
			'main must be declared void main(void).',
			'main must be the last declaration of the program.'
		]);
	});
});

describe('calls', () => {
	const f = 'int f(int a, int b[]) { return a; } int v; int arr[4]; void p(void) { } ';

	it('calling something that is not a function', () => {
		expect(located(f + inMain('v(1); arr(2);'))).toEqual([
			['v is not a function, so it cannot be called.', 'v'],
			['arr is not a function, so it cannot be called.', 'arr']
		]);
		expect(errors(inMain('int output; output(1);'))).toEqual([
			'output is not a function, so it cannot be called.'
		]);
	});

	it('wrong number of arguments', () => {
		expect(located(f + inMain('f(1); f(1, arr, 3); p(1); output(); input(5);'))).toEqual([
			['f takes 2 arguments, but 1 is given.', 'f(1)'],
			['f takes 2 arguments, but 3 are given.', 'f(1, arr, 3)'],
			['p takes no arguments, but 1 is given.', 'p(1)'],
			['output takes 1 argument, but 0 are given.', 'output()'],
			['input takes no arguments, but 1 is given.', 'input(5)']
		]);
	});

	it('an array where an int parameter is', () => {
		expect(located(f + inMain('f(arr, arr); output(arr);'))).toEqual([
			['The array arr cannot be used as argument 1 of f: use one element, as in arr[0].', 'arr'],
			[
				'The array arr cannot be used as argument 1 of output: use one element, as in arr[0].',
				'arr'
			]
		]);
	});

	it('an int where an array parameter is', () => {
		const message = 'Argument 2 of f must be an array: its parameter is declared with [ ].';
		expect(located(f + inMain('f(1, v); f(1, arr[0]); f(1, 2 + 3); f(1, p());'))).toEqual([
			[message, 'v'],
			[message, 'arr[0]'],
			[message, '2 + 3'],
			[message, 'p()']
		]);
	});

	it('a void call as an argument', () => {
		expect(errors(f + inMain('output(p());'))).toEqual([
			'p returns void, so its call cannot be used as argument 1 of output.'
		]);
	});

	it('an array parameter may be passed on, and an element is an int', () => {
		expect(
			errors(
				'int g(int b[]) { return b[0]; } int f(int a[]) { return g(a) + f(a); } int arr[2]; void main(void) { f(arr); output(arr[1]); }'
			)
		).toEqual([]);
	});
});

describe('an int is needed', () => {
	const decls = 'int a[3]; int x; void p(void) { } int f(void) { return 1; } ';

	it('an array as an operand', () => {
		expect(located(decls + inMain('x = a + 1; x = 2 * a; x = a < a;'))).toEqual([
			['The array a cannot be used as an operand of +: use one element, as in a[0].', 'a'],
			['The array a cannot be used as an operand of *: use one element, as in a[0].', 'a'],
			['The array a cannot be used as an operand of <: use one element, as in a[0].', 'a'],
			['The array a cannot be used as an operand of <: use one element, as in a[0].', 'a']
		]);
	});

	it('a void call as an operand', () => {
		expect(located(decls + inMain('x = p() + 1; x = 1 - p();'))).toEqual([
			['p returns void, so its call cannot be used as an operand of +.', 'p()'],
			['p returns void, so its call cannot be used as an operand of -.', 'p()']
		]);
		expect(errors(inMain('int x; x = output(1) * 2;'))).toEqual([
			'output returns void, so its call cannot be used as an operand of *.'
		]);
	});

	it('as a condition', () => {
		expect(errors(decls + inMain('if (a) ; while (p()) ; if (f) ;'))).toEqual([
			'The array a cannot be used as a condition: use one element, as in a[0].',
			'p returns void, so its call cannot be used as a condition.',
			'f is a function: it cannot be used as a condition without being called.'
		]);
	});

	it('on the right of an assignment', () => {
		expect(errors(decls + inMain('x = a; x = p(); x = f; a[0] = a;'))).toEqual([
			'The array a cannot be used as the right side of =: use one element, as in a[0].',
			'p returns void, so its call cannot be used as the right side of =.',
			'f is a function: it cannot be used as the right side of = without being called.',
			'The array a cannot be used as the right side of =: use one element, as in a[0].'
		]);
	});

	it('as a returned value', () => {
		expect(
			errors(`${decls}int g(void) { return a; } int h(void) { return p(); } ${inMain('')}`)
		).toEqual([
			'The array a cannot be used as a returned value: use one element, as in a[0].',
			'p returns void, so its call cannot be used as a returned value.'
		]);
	});

	it('as a statement: a whole array or a function name', () => {
		expect(errors(decls + inMain('a; f; x; a[0]; f(); p();'))).toEqual([
			'The array a cannot be used as a statement: use one element, as in a[0].',
			'f is a function: it cannot be used as a statement without being called.'
		]);
	});

	it('a number that does not fit', () => {
		expect(located(inMain('output(2147483647); output(2147483648);'))).toEqual([
			['2147483648 does not fit in an int (32 bits).', '2147483648']
		]);
		expect(errors(inMain(`output(${'9'.repeat(400)});`))).toHaveLength(1);
	});
});

describe('subscripts', () => {
	const decls = 'int a[3]; int b[3]; int x; void p(void) { } int f(void) { return 1; } ';

	it('indexing something that is not an array', () => {
		expect(located(decls + inMain('x[0] = 1; output(f[1]); x = x[x];'))).toEqual([
			['x is not an array, so it cannot be indexed.', 'x'],
			['f is not an array, so it cannot be indexed.', 'f'],
			['x is not an array, so it cannot be indexed.', 'x']
		]);
		expect(errors('void f(int n) { n[0] = 1; } void main(void) { }')).toHaveLength(1);
	});

	it('a subscript that is not an int', () => {
		expect(located(decls + inMain('a[b] = 1; x = a[p()]; x = a[f];'))).toEqual([
			['The array b cannot be used as a subscript: use one element, as in b[0].', 'b'],
			['p returns void, so its call cannot be used as a subscript.', 'p()'],
			['f is a function: it cannot be used as a subscript without being called.', 'f']
		]);
	});

	it('any int expression is a subscript', () => {
		expect(errors(decls + inMain('a[b[0]] = a[x + 1] + a[f()] + a[x = 2];'))).toEqual([]);
	});

	it('an array needs at least one element, and a size that fits', () => {
		expect(located('int a[0]; void main(void) { int b[0]; }')).toEqual([
			['An array needs at least one element.', '0'],
			['An array needs at least one element.', '0']
		]);
		expect(errors('int a[2147483648]; void main(void) { }')).toEqual([
			'This array size does not fit in an int (32 bits).'
		]);
		expect(errors('int a[1]; void main(void) { }')).toEqual([]);
	});
});

describe('assignment targets', () => {
	it('an array', () => {
		expect(located('int a[3]; int b[3]; void main(void) { a = 1; a = b; }')).toEqual([
			['Cannot assign to the array a: assign to an element, as in a[0] = …', 'a'],
			['Cannot assign to the array a: assign to an element, as in a[0] = …', 'a'],
			['The array b cannot be used as the right side of =: use one element, as in b[0].', 'b']
		]);
		expect(errors('void f(int p[]) { p = 1; } void main(void) { }')).toEqual([
			'Cannot assign to the array p: assign to an element, as in p[0] = …'
		]);
	});

	it('a function name', () => {
		expect(
			located('int f(void) { return 1; } void main(void) { f = 2; main = 3; input = 4; }')
		).toEqual([
			['Cannot assign to the function f.', 'f'],
			['Cannot assign to the function main.', 'main'],
			['Cannot assign to the function input.', 'input']
		]);
	});

	it('an assignment has the type int', () => {
		expect(errors(inMain('int x; int y; int a[2]; x = y = a[0] = 3; output(x = 1);'))).toEqual([]);
	});
});

describe('return', () => {
	it('a value in a void function', () => {
		expect(located('void f(void) { return 1; } void main(void) { return 2 + 3; }')).toEqual([
			['f returns void, so its return cannot have a value.', 'return 1;'],
			['main returns void, so its return cannot have a value.', 'return 2 + 3;']
		]);
	});

	it('no value in an int function', () => {
		expect(located('int f(void) { return; } void main(void) { }')).toEqual([
			['f returns int, so its return needs a value.', 'return;']
		]);
	});

	it('a void function returns with return; or at its end', () => {
		expect(
			check('void f(int n) { if (n) return; output(n); } void main(void) { return; }').diagnostics
		).toEqual([]);
	});

	it('warns when an int function may reach its end', () => {
		const source = 'int f(int n) { if (n) return 1; }\nvoid main(void) { }';
		const r = check(source);
		expect(r.diagnostics).toEqual([
			{
				severity: 'warning',
				message: 'f returns int, but it may reach the end of its body without returning a value.',
				span: { start: 32, end: 33, line: 1, column: 33, source: null }
			}
		]);
		// A warning does not stop the compilation.
		expect(r.ok).toBe(true);
		expect(warnings('int f(void) { } void main(void) { }')).toHaveLength(1);
		expect(warnings('int f(int n) { while (n) return 1; } void main(void) { }')).toHaveLength(1);
		expect(
			warnings('int f(int n) { if (n) return 1; else output(n); } void main(void) { }')
		).toHaveLength(1);
	});

	it('does not warn when every path returns', () => {
		for (const body of [
			'return 1;',
			'if (n) return 1; else return 2;',
			'if (n) { return 1; } else { if (n < 2) return 2; else return 3; }',
			'if (n) return 1; return 2;',
			'{ { return n; } }',
			'while (n) n = n - 1; return n;'
		]) {
			expect(warnings(`int f(int n) { ${body} } void main(void) { }`)).toEqual([]);
		}
	});
});

describe('diagnostics', () => {
	it('come in source order', () => {
		const r = check('int x;\nint x;\nvoid f(void) { return 1; }\nvoid main(void) { y = 2; f(3); }');
		expect(r.diagnostics.map((d) => d.span!.line)).toEqual([2, 3, 4, 4]);
	});

	it('every one has a span with a line and a column', () => {
		const r = check('void v; int main(int a) { u = 1; return; } int z;');
		expect(r.diagnostics.length).toBeGreaterThan(3);
		for (const d of r.diagnostics) {
			expect(d.span).toBeDefined();
			expect(d.span!.end).toBeGreaterThan(d.span!.start);
			expect(d.span!.line).toBe(1);
			expect(d.span!.column).toBe(d.span!.start + 1);
		}
	});
});

describe('scopes and symbols', () => {
	const source = `int g;
int table[5];
int sum(int a[], int n)
{
  int total;
  total = 0;
  while (n > 0) {
    int last;
    last = a[n - 1];
    total = total + last;
    n = n - 1;
  }
  return total + g;
}
void main(void)
{
  int g;
  g = 3;
  { int deep; deep = g; { int deeper; deeper = deep; } }
  { int other; other = 1; }
  output(sum(table, g));
}`;
	const r = check(source);

	it('lists the scopes: global, one per function, one per nested block', () => {
		expect(r.scopes.map((s) => [s.id, s.kind, s.name, s.depth, s.parent])).toEqual([
			[0, 'global', 'global', 0, null],
			[1, 'function', 'sum', 1, 0],
			[2, 'block', 'sum.1', 2, 1],
			[3, 'function', 'main', 1, 0],
			[4, 'block', 'main.1', 2, 3],
			[5, 'block', 'main.1.1', 3, 4],
			[6, 'block', 'main.2', 2, 3]
		]);
		expect(r.scopes[0].children).toEqual([1, 3]);
		expect(r.scopes[3].children).toEqual([4, 6]);
		expect(r.scopes[5].function).toBe(symbol(r, 'main').id);
		expect(r.scopes[0].function).toBeNull();
	});

	it('the global scope starts with input and output', () => {
		expect(r.scopes[0].symbols.map((id) => r.symbols[id].name)).toEqual([
			'input',
			'output',
			'g',
			'table',
			'sum',
			'main'
		]);
		expect(symbol(r, 'input')).toMatchObject({
			kind: 'function',
			builtin: true,
			declSpan: null,
			node: null,
			params: [],
			depth: 0
		});
		expect(typeText(symbol(r, 'input').type)).toBe('(void) → int');
		expect(typeText(symbol(r, 'output').type)).toBe('(int) → void');
		expect(symbol(r, 'output').params).toEqual([{ name: 'x', type: 'int' }]);
	});

	it('parameters and the locals of the body are in the function scope', () => {
		expect(r.scopes[1].symbols.map((id) => r.symbols[id])).toMatchObject([
			{ name: 'a', kind: 'array-parameter', depth: 1, scope: 1 },
			{ name: 'n', kind: 'parameter', depth: 1, scope: 1 },
			{ name: 'total', kind: 'variable', depth: 1, scope: 1 }
		]);
		expect(r.scopes[2].symbols.map((id) => r.symbols[id])).toMatchObject([
			{ name: 'last', kind: 'variable', depth: 2, scope: 2 }
		]);
	});

	it('symbols[id].id is id', () => {
		r.symbols.forEach((s, i) => expect(s.id).toBe(i));
		r.scopes.forEach((s, i) => expect(s.id).toBe(i));
	});

	it('records kind, type, size and parameters', () => {
		expect(symbol(r, 'g')).toMatchObject({
			kind: 'variable',
			size: null,
			params: null,
			builtin: false
		});
		expect(symbol(r, 'table')).toMatchObject({ kind: 'array', size: 5 });
		expect(typeText(symbol(r, 'table').type)).toBe('int[]');
		expect(typeText(symbol(r, 'g').type)).toBe('int');
		expect(symbol(r, 'sum')).toMatchObject({
			kind: 'function',
			params: [
				{ name: 'a', type: 'array' },
				{ name: 'n', type: 'int' }
			]
		});
		expect(typeText(symbol(r, 'sum').type)).toBe('(int[], int) → int');
		expect(typeText(symbol(r, 'main').type)).toBe('(void) → void');
	});

	it('records where a symbol is declared and every use', () => {
		const text = (s: { start: number; end: number }) => source.slice(s.start, s.end);
		const total = symbol(r, 'total');
		expect(total.declSpan).toMatchObject({ line: 5, column: 7 });
		expect(text(total.declSpan!)).toBe('total');
		expect(total.uses.map((u) => u.line)).toEqual([6, 10, 10, 13]);
		expect(symbol(r, 'n').uses.map((u) => [u.line, u.column])).toEqual([
			[7, 10],
			[9, 14],
			[11, 5],
			[11, 9]
		]);
		expect(symbol(r, 'sum').uses.map((u) => u.line)).toEqual([21]);
		expect(symbol(r, 'output').uses).toHaveLength(1);
		expect(symbol(r, 'input').uses).toEqual([]);
		expect(symbol(r, 'other').uses).toHaveLength(1);
	});

	it('a use refers to the innermost declaration', () => {
		const [globalG, mainG] = r.symbols.filter((s) => s.name === 'g');
		expect(globalG.depth).toBe(0);
		expect(mainG.depth).toBe(1);
		// The g in sum is the global; every g in main is main's own.
		expect(globalG.uses.map((u) => u.line)).toEqual([13]);
		expect(mainG.uses.map((u) => u.line)).toEqual([18, 19, 21]);
	});

	it('refs links declarations and uses to symbols', () => {
		for (const node of r.nodes) {
			const id = r.refs.get(node.id);
			if (node.kind === 'VarDecl' || node.kind === 'Param' || node.kind === 'FunDecl') {
				expect(r.symbols[id!]).toMatchObject({ name: node.name, node: node.id });
			} else if (node.kind === 'Var' || node.kind === 'Index' || node.kind === 'Call') {
				expect(r.symbols[id!].name).toBe(node.name);
			} else {
				expect(id).toBeUndefined();
			}
		}
	});

	it('functions lists parameters, locals and the size of the record', () => {
		expect(
			r.functions.map((f) => [f.name, f.returns, f.params.length, f.locals.length, f.frameSize])
		).toEqual([
			['sum', 'int', 2, 2, 6],
			['main', 'void', 0, 4, 6]
		]);
		expect(r.functions[1].locals.map((id) => r.symbols[id].name)).toEqual([
			'g',
			'deep',
			'deeper',
			'other'
		]);
		expect(r.functions[0].symbol).toBe(symbol(r, 'sum').id);
		expect(r.functions[0].scope).toBe(1);
	});

	it('gives every variable its place', () => {
		const at = (name: string, nth = 0) => symbol(r, name, nth).location;
		// Globals from 0(gp) down; element 0 of an array is its lowest cell.
		expect(at('g')).toEqual({ base: 'gp', offset: 0 });
		expect(at('table')).toEqual({ base: 'gp', offset: -5 });
		expect(r.globalsSize).toBe(6);
		// Parameters from -2(fp), then the locals.
		expect(at('a')).toEqual({ base: 'fp', offset: -2 });
		expect(at('n')).toEqual({ base: 'fp', offset: -3 });
		expect(at('total')).toEqual({ base: 'fp', offset: -4 });
		expect(at('last')).toEqual({ base: 'fp', offset: -5 });
		expect(at('g', 1)).toEqual({ base: 'fp', offset: -2 });
		expect(at('other')).toEqual({ base: 'fp', offset: -5 });
		expect(at('sum')).toBeNull();
		expect(at('input')).toBeNull();
	});

	it('local arrays take one cell per element', () => {
		const q = check('void main(void) { int a; int b[4]; int c; int d[2]; }');
		expect(q.symbols.slice(3).map((s) => [s.name, s.location?.offset])).toEqual([
			['a', -2],
			['b', -6],
			['c', -7],
			['d', -9]
		]);
		expect(q.functions[0].frameSize).toBe(10);
	});

	it('visibleSymbols lists what a scope can see, innermost first', () => {
		const names = (scope: number) => visibleSymbols(r, scope).map((s) => `${s.name}@${s.depth}`);
		expect(names(5)).toEqual([
			'deeper@3',
			'deep@2',
			'g@1',
			'main@0',
			'sum@0',
			'table@0',
			'output@0',
			'input@0'
		]);
		expect(names(2)).toEqual([
			'last@2',
			'total@1',
			'n@1',
			'a@1',
			'main@0',
			'sum@0',
			'table@0',
			'g@0',
			'output@0',
			'input@0'
		]);
	});
});

describe('types', () => {
	it('attaches a type to every expression node', () => {
		const source =
			'int a[3]; int f(int b[], int n) { return b[n]; } void p(void) { } void main(void) { int x; x = f(a, 2) + a[1] * (x = 3); p(); if (x < 1) output(x); }';
		const r = check(source);
		expect(r.diagnostics).toEqual([]);
		const typed = r.nodes.filter((n) =>
			['Assign', 'Binary', 'Var', 'Index', 'Call', 'Num'].includes(n.kind)
		);
		for (const n of typed) expect(r.types.has(n.id)).toBe(true);
		expect(r.types.size).toBe(typed.length);
		const typeOf = (text: string, kind: Node['kind']) => {
			const node = r.nodes.find(
				(n) => n.kind === kind && source.slice(n.span.start, n.span.end) === text
			);
			return typeText(r.types.get(node!.id)!);
		};
		expect(typeOf('f(a, 2)', 'Call')).toBe('int');
		expect(typeOf('p()', 'Call')).toBe('void');
		expect(typeOf('output(x)', 'Call')).toBe('void');
		expect(typeOf('a', 'Var')).toBe('int[]');
		expect(typeOf('b[n]', 'Index')).toBe('int');
		expect(typeOf('x = 3', 'Assign')).toBe('int');
		expect(typeOf('x < 1', 'Binary')).toBe('int');
		expect(typeOf('2', 'Num')).toBe('int');
	});

	it('an undeclared name has the type error; what contains it keeps its own type', () => {
		const source = 'void main(void) { int x; x = u + 1; v(2); w[0]; }';
		const r = check(source);
		const typeAt = (text: string) => {
			const node = r.nodes.find(
				(n) => source.slice(n.span.start, n.span.end) === text && n.kind !== 'ExprStmt'
			);
			return typeText(r.types.get(node!.id)!);
		};
		expect(typeAt('u')).toBe('error');
		expect(typeAt('u + 1')).toBe('int');
		expect(typeAt('v(2)')).toBe('error');
		expect(typeAt('w[0]')).toBe('error');
	});

	it('a function name alone has its function type', () => {
		const source = 'int f(int a, int b[]) { return 1; } void main(void) { f; }';
		const r = check(source);
		const node = r.nodes.find((n) => n.kind === 'Var' && n.name === 'f')!;
		expect(typeText(r.types.get(node.id)!)).toBe('(int, int[]) → int');
	});

	it('typeText', () => {
		expect(typeText({ kind: 'int' })).toBe('int');
		expect(typeText({ kind: 'void' })).toBe('void');
		expect(typeText({ kind: 'array' })).toBe('int[]');
		expect(typeText({ kind: 'error' })).toBe('error');
		expect(typeText({ kind: 'function', returns: 'void', params: [] })).toBe('(void) → void');
	});
});
